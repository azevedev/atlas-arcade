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
  localStorage.setItem(key(), JSON.stringify({ score: summary.score }));
  // streak
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(
    y.getDate()
  ).padStart(2, "0")}`;
  const prev = JSON.parse(localStorage.getItem("aa_daily_streak") || '{"last":null,"n":0}');
  let n = 1;
  if (prev.last === yKey) n = prev.n + 1;
  else if (prev.last === dailyKey()) n = prev.n;
  localStorage.setItem("aa_daily_streak", JSON.stringify({ last: dailyKey(), n }));
  return n;
}

export function dailyStreak() {
  try {
    return JSON.parse(localStorage.getItem("aa_daily_streak") || '{"n":0}').n || 0;
  } catch {
    return 0;
  }
}
