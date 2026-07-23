// Seedable PRNG + helpers. Used everywhere; the Daily mode seeds it from the date
// so every player gets the same puzzle, while Arcade seeds it from Math.random().

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// deterministic 32-bit hash of a string (for the daily seed)
export function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeRng(seed) {
  if (typeof seed === "string") seed = hashStr(seed);
  if (seed == null) seed = (Math.random() * 2 ** 32) >>> 0;
  return mulberry32(seed);
}

export const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// weighted pick: items = [{value, weight}]
export function weightedPick(items, rng) {
  const total = items.reduce((s, it) => s + it.weight, 0);
  let r = rng() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it.value;
  }
  return items[items.length - 1].value;
}

// today's date key in UTC -> "YYYY-MM-DD" so the Daily Challenge (and its share
// grid) is genuinely the same for everyone worldwide, not shifted by timezone.
export function todayKey(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
