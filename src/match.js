// Answer normalization, autocomplete suggestions and fuzzy acceptance.
import { countries } from "./data.js";

export function norm(s) {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Levenshtein distance capped at `max` (returns max+1 if exceeded).
function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

let COUNTRY_INDEX = null; // [{display, norm, country}]
let CAPITAL_INDEX = null;

function build() {
  if (COUNTRY_INDEX) return;
  COUNTRY_INDEX = [];
  CAPITAL_INDEX = [];
  for (const c of countries()) {
    COUNTRY_INDEX.push({ display: c.name, norm: norm(c.name), country: c });
    CAPITAL_INDEX.push({ display: c.capital, norm: norm(c.capital), country: c });
  }
  COUNTRY_INDEX.sort((a, b) => a.display.localeCompare(b.display));
  CAPITAL_INDEX.sort((a, b) => a.display.localeCompare(b.display));
}

// suggestions for the autocomplete dropdown (prefix hits first, then contains).
// `exclude` is a Set of normalized answers already tried this question.
export function suggest(query, kind, limit = 6, exclude = null) {
  build();
  const q = norm(query);
  if (!q) return [];
  const index = kind === "capital" ? CAPITAL_INDEX : COUNTRY_INDEX;
  const starts = [];
  const contains = [];
  const fuzzy = []; // typo tolerance for whole-word-ish queries (e.g. "ottowa")
  for (const item of index) {
    if (exclude && exclude.has(item.norm)) continue;
    if (item.norm.startsWith(q)) starts.push(item);
    else if (item.norm.includes(q)) contains.push(item);
    else if (q.length >= 4 && editDistance(q, item.norm, 2) <= 2) fuzzy.push(item);
  }
  return [...starts, ...contains, ...fuzzy].slice(0, limit);
}

// does `input` name this country (kind='country') or its capital (kind='capital')?
export function accepts(input, country, kind) {
  const q = norm(input);
  if (!q) return false;
  if (kind === "capital") {
    const target = norm(country.capital);
    if (q === target) return true;
    // accept dropping a trailing "city" and tolerate a 1-char typo on longer names
    if (q === target.replace(/city$/, "")) return true;
    return target.length >= 5 && editDistance(q, target, 1) <= 1;
  }
  if (country.aliasSet.has(q)) return true;
  const nm = norm(country.name);
  return nm.length >= 5 && editDistance(q, nm, 1) <= 1;
}
