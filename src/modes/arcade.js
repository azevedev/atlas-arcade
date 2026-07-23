// Arcade mode: 3 lives, endless, difficulty ramps, combo multiplier.
import { Engine } from "../engine.js";
import { makeRng } from "../rng.js";
import { arcadeGenerator } from "../questions.js";

export function startArcade(view, onEnd, category = "mixed") {
  const rng = makeRng();
  const next = arcadeGenerator(rng, category);
  const engine = new Engine(view, {
    mode: "arcade",
    category,
    lives: 3,
    total: null,
    next,
    onEnd,
  });
  engine.start();
  return engine;
}

const HS_KEY = "aa_arcade_best";
export const arcadeBest = () => Number(localStorage.getItem(HS_KEY) || 0);
export function recordArcade(score) {
  const best = arcadeBest();
  if (score > best) {
    localStorage.setItem(HS_KEY, String(score));
    return true;
  }
  return false;
}
