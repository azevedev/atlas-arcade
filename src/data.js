// Loads the country dataset + world geometry and builds the lookups the game needs.
// Depends on global `topojson` (vendor/topojson-client) loaded in index.html.
//
// Two resolutions: 110m (light) drives the spinning globe base so it stays smooth;
// 50m (detailed) provides per-country features for highlights and shape silhouettes.

let DATA = null;
let FEATURES = null; // Map ccn3 -> detailed (50m) GeoJSON feature
let byCcn3 = null;
let globe = null; // { land, borders } from 110m for fast rendering

export async function loadData() {
  const [cj, t50, t110] = await Promise.all([
    fetch("./assets/data/countries.json").then((r) => r.json()),
    fetch("./assets/geo/countries-50m.json").then((r) => r.json()),
    fetch("./assets/geo/countries-110m.json").then((r) => r.json()),
  ]);
  DATA = cj;

  const fc = topojson.feature(t50, t50.objects.countries);
  FEATURES = new Map();
  for (const f of fc.features) FEATURES.set(String(f.id), f);

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
