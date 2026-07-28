// Answer normalization, autocomplete suggestions and fuzzy acceptance.
import { countries } from "./data.js";
import { countryName, capitalName, getLang } from "./i18n.js";

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
let INDEX_LANG = null; // the language the cached index was built for

function build() {
  // Rebuild when the language changes: the cache is keyed on display names, so
  // a stale index would keep suggesting the previous language's spellings.
  if (COUNTRY_INDEX && INDEX_LANG === getLang()) return;
  INDEX_LANG = getLang();
  COUNTRY_INDEX = [];
  CAPITAL_INDEX = [];
  for (const c of countries()) {
    const n = countryName(c), cap = capitalName(c);
    COUNTRY_INDEX.push({ display: n, norm: norm(n), country: c });
    CAPITAL_INDEX.push({ display: cap, norm: norm(cap), country: c });
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
    // Both spellings are accepted whichever language is active, so knowing a
    // capital as "Beijing" is never wrong while playing in Portuguese.
    for (const target of new Set([norm(country.capital), norm(country.capitalPt)])) {
      if (!target) continue;
      if (q === target) return true;
      // accept dropping a trailing "city" and tolerate a 1-char typo on longer names
      if (q === target.replace(/city$/, "")) return true;
      if (target.length >= 5 && editDistance(q, target, 1) <= 1) return true;
    }
    return false;
  }
  // aliasSet already holds both languages (see scripts/build_data.py)
  if (country.aliasSet.has(q)) return true;
  for (const nm of new Set([norm(country.name), norm(country.namePt)])) {
    if (nm.length >= 5 && editDistance(q, nm, 1) <= 1) return true;
  }
  return false;
}
