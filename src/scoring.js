// Scoring. Time is NOT a countdown — it's a stopwatch that just records how long a
// question took. Points start full and are reduced only by hints and wrong guesses.
import { haversineKm } from "./geo.js";

export const BASE = 1000;
export const FLOOR = 200;
export const HINT_PENALTY = 150;
export const WRONG_PENALTY = 80;

// points available for a name question given hints/wrongs used so far
export function namePoints(hintsUsed = 0, wrongs = 0) {
  return Math.max(FLOOR, BASE - hintsUsed * HINT_PENALTY - wrongs * WRONG_PENALTY);
}

// distance-based points for a locate question
export function locatePoints(distanceKm, hintsUsed = 0) {
  const raw = 1000 * Math.exp(-distanceKm / 1500);
  return Math.max(50, Math.round(raw) - hintsUsed * HINT_PENALTY);
}

export function distanceKm(a, b) {
  return haversineKm(a, b);
}

// combo multiplier grows every 3 correct answers, capped at x5
export function comboMultiplier(streak) {
  return Math.min(5, 1 + Math.floor(streak / 3));
}

// star rating for the daily share grid, from the fraction of max points earned
export function starsFor(points, max = BASE) {
  const f = points / max;
  if (f >= 0.75) return 3;
  if (f >= 0.4) return 2;
  return 1;
}

export function formatTime(ms) {
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + "s";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
