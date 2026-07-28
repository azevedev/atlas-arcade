// Daily Challenge: a fixed, date-seeded set of 10 — the same for everyone that day.
import { Engine } from "../engine.js";
import { makeRng, todayKey } from "../rng.js";
import { dailyQueue } from "../questions.js";

export const DAILY_N = 10;
export const dailyKey = () => todayKey();

export function startDaily(view, onEnd) {
  const rng = makeRng("atlas-arcade-" + dailyKey());
  const queue = dailyQueue(rng, DAILY_N);
  const engine = new Engine(view, {
    mode: "daily",
    lives: null, // no lives: everyone answers all 10, so the shared grid compares
    total: DAILY_N,
    queue,
    onEnd,
  });
  engine.start();
  return engine;
}

// --- persistence: has today been played? streak tracking ---
const key = () => "aa_daily_" + dailyKey();
export const dailyPlayed = () => localStorage.getItem(key()) !== null;
export const dailyResult = () => {
  try {
    return JSON.parse(localStorage.getItem(key()));
  } catch {
    return null;
  }
};

export function recordDaily(summary) {
  // Stored per day, not just the score: the distribution chart needs the
  // correct-answer count, and a histogram cannot be rebuilt after the fact.
  const correct = summary.results.filter((r) => r.correct).length;
  localStorage.setItem(key(), JSON.stringify({
    s: summary.score,
    c: correct,
    t: summary.results.length,
    h: summary.results.reduce((n, r) => n + (r.hints || 0), 0),
  }));
  // streak
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(
    y.getDate()
  ).padStart(2, "0")}`;
  const prev = JSON.parse(localStorage.getItem("aa_daily_streak") || '{"last":null,"n":0,"max":0}');
  let n = 1;
  if (prev.last === yKey) n = prev.n + 1;
  else if (prev.last === dailyKey()) n = prev.n;
  const max = Math.max(n, prev.max || 0);
  localStorage.setItem("aa_daily_streak", JSON.stringify({ last: dailyKey(), n, max }));
  return n;
}

export function dailyMaxStreak() {
  try {
    const v = JSON.parse(localStorage.getItem("aa_daily_streak") || "{}");
    return Math.max(v.max || 0, v.n || 0);
  } catch {
    return 0;
  }
}

// Wordle-style personal stats, read back out of the per-day records.
// Note the strict date pattern: a loose "aa_daily_" prefix would also match
// aa_daily_streak and count the streak object as a played day.
const DAY_KEY = /^aa_daily_(\d{4}-\d{2}-\d{2})$/;

export function dailyStats(total = DAILY_N) {
  const dist = new Array(total + 1).fill(0);
  let played = 0, perfect = 0, scored = 0, known = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!DAY_KEY.test(k)) continue;
    played++;
    let v;
    try { v = JSON.parse(localStorage.getItem(k)); } catch { continue; }
    if (!v) continue;
    scored += v.s || 0;
    // days recorded before the stats upgrade only stored a score, so they
    // count as played but cannot contribute to the distribution
    if (typeof v.c !== "number") continue;
    known++;
    const bin = Math.max(0, Math.min(total, v.c));
    dist[bin]++;
    if (v.c === (v.t || total)) perfect++;
  }
  return {
    played,
    perfect,
    perfectPct: known ? Math.round((perfect / known) * 100) : 0,
    totalScore: scored,
    dist,
    withDistribution: known,
    streak: dailyStreak(),
    maxStreak: dailyMaxStreak(),
  };
}

export function dailyStreak() {
  try {
    return JSON.parse(localStorage.getItem("aa_daily_streak") || '{"n":0}').n || 0;
  } catch {
    return 0;
  }
}
