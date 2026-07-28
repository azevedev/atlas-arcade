// Loads the country dataset + world geometry and builds the lookups the game needs.
// Depends on global `topojson` (vendor/topojson-client) loaded in index.html.
//
// Two resolutions: 110m (light) drives the spinning globe base so it stays smooth;
// 50m (detailed) provides per-country features for highlights and shape silhouettes.

let DATA = null;
let FEATURES = null; // Map ccn3 -> detailed (50m) GeoJSON feature
let byCcn3 = null;
let globe = null; // { land, borders } from 110m for fast rendering

// Spherical area of a feature, guarding against inverted winding reporting the
// complement (nearly the whole sphere) instead of the polygon itself.
function sphericalArea(feature) {
  const a = d3.geoArea(feature);
  return a > 2 * Math.PI ? 4 * Math.PI - a : a;
}

export async function loadData() {
  const [cj, t50, t110] = await Promise.all([
    fetch("./assets/data/countries.json").then((r) => r.json()),
    fetch("./assets/geo/countries-50m.json").then((r) => r.json()),
    fetch("./assets/geo/countries-110m.json").then((r) => r.json()),
  ]);
  DATA = cj;

  const fc = topojson.feature(t50, t50.objects.countries);
  FEATURES = new Map();
  // A few ids are reused in the 50m file: 036 is both Australia and its external
  // territory "Ashmore and Cartier Is.". A plain set() lets the last one win, which
  // hands Australia a 5-point rectangle in the Timor Sea as its shape, highlight
  // and blob. On a collision, keep the larger landmass.
  for (const f of fc.features) {
    const id = String(f.id);
    const prev = FEATURES.get(id);
    if (!prev || sphericalArea(f) > sphericalArea(prev)) FEATURES.set(id, f);
  }

  globe = {
    land: topojson.feature(t110, t110.objects.land),
    borders: topojson.mesh(t110, t110.objects.countries, (a, b) => a !== b),
  };

  byCcn3 = new Map();
  for (const c of cj.countries) {
    c.feature = FEATURES.get(c.ccn3) || null;
    c.aliasSet = new Set(c.aliases);
    byCcn3.set(c.ccn3, c);
  }
  return cj;
}

export const meta = () => ({ count: DATA.count, tiers: DATA.tiers });
export const countries = () => DATA.countries;
export const countryByCcn3 = (id) => byCcn3.get(String(id));
export const featureFor = (country) => (country ? FEATURES.get(country.ccn3) : null);

// light geometry for the globe base
export const globeLand = () => globe.land;
export const globeBorders = () => globe.borders;

export function tierPool(tier) {
  return DATA.countries.filter((c) => c.tier === tier);
}

// Center + spread of a region/subregion, derived from its member countries, so
// a hint can point the globe at that area and blob it. Depends on global d3.
// `scope` is "region" | "subregion"; `value` is e.g. "Asia" / "Southern Asia".
export function regionArea(scope, value) {
  if (!DATA || !value) return null;
  const pts = DATA.countries.filter((c) => c[scope] === value).map((c) => c.ll);
  if (!pts.length) return null;
  // spherical mean of the member points (average of unit vectors)
  let x = 0, y = 0, z = 0;
  for (const [lng, lat] of pts) {
    const la = (lat * Math.PI) / 180, lo = (lng * Math.PI) / 180;
    x += Math.cos(la) * Math.cos(lo);
    y += Math.cos(la) * Math.sin(lo);
    z += Math.sin(la);
  }
  const center = [
    (Math.atan2(y, x) * 180) / Math.PI,
    (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI,
  ];
  // radius ≈ how far the members spread from that center (degrees, clamped)
  let maxRad = 0;
  for (const p of pts) maxRad = Math.max(maxRad, d3.geoDistance(p, center));
  const radiusDeg = Math.min(42, Math.max(9, (maxRad * 180) / Math.PI * 0.85));
  return { point: center, radiusDeg };
}

// Which country (if any) contains a [lng, lat] point — used to tell the player
// which country they actually tapped in "locate" mode. Depends on global d3.
export function countryAtPoint(point) {
  if (!DATA || !point) return null;
  for (const c of DATA.countries) {
    if (c.feature && d3.geoContains(c.feature, point)) return c;
  }
  return null;
}
