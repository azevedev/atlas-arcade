// Renders a single country's outline (a "shape" clue) into an SVG element,
// fitted and centered. Depends on global `d3`.
//
// Key trick: many countries include far-flung territories (France's Réunion,
// the USA's Guam, Norway's Bouvet Island…). Fitting the whole set makes the main
// country a tiny dot / the projection clip a big square. So we keep only the
// "main cluster": the largest landmass plus any polygons near it, and drop
// distant territories. Archipelagos (Japan, Indonesia, Philippines) stay intact.

const CLUSTER_RADIUS = 0.9; // radians (~52°) around the largest landmass

function polygonsOf(feature) {
  const g = feature.geometry;
  if (!g) return [];
  if (g.type === "Polygon") return [g.coordinates];
  if (g.type === "MultiPolygon") return g.coordinates;
  return [];
}

function mainCluster(feature) {
  const polys = polygonsOf(feature);
  if (polys.length <= 1) return feature;

  // largest polygon by spherical area
  let largest = polys[0];
  let bestArea = -1;
  for (const coords of polys) {
    const a = d3.geoArea({ type: "Polygon", coordinates: coords });
    // guard against inverted winding reporting ~whole sphere
    const area = a > 2 * Math.PI ? 4 * Math.PI - a : a;
    if (area > bestArea) {
      bestArea = area;
      largest = coords;
    }
  }
  const center = d3.geoCentroid({ type: "Polygon", coordinates: largest });

  const kept = polys.filter((coords) => {
    const c = d3.geoCentroid({ type: "Polygon", coordinates: coords });
    return d3.geoDistance(c, center) <= CLUSTER_RADIUS;
  });

  return {
    type: "Feature",
    geometry: { type: "MultiPolygon", coordinates: kept.length ? kept : [largest] },
  };
}

export function drawSilhouette(svgEl, country, { size = 260, color = "#8a7bd8" } = {}) {
  const feature = country && country.feature;
  svgEl.innerHTML = "";
  if (!feature) return false;

  const shape = mainCluster(feature);
  const pad = 20;
  const center = d3.geoCentroid(shape);
  const projection = d3.geoAzimuthalEqualArea().rotate([-center[0], -center[1]]);
  const path = d3.geoPath(projection);
  projection.fitExtent(
    [
      [pad, pad],
      [size - pad, size - pad],
    ],
    shape
  );

  svgEl.setAttribute("viewBox", `0 0 ${size} ${size}`);
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", path(shape) || "");
  p.setAttribute("fill", color);
  p.setAttribute("stroke", "#ffffff");
  p.setAttribute("stroke-width", "2");
  p.setAttribute("stroke-linejoin", "round");
  svgEl.appendChild(p);
  return true;
}
