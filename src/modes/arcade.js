// Arcade mode: 3 lives, endless, difficulty ramps, combo multiplier.
import { Engine } from "../engine.js";
import { makeRng } from "../rng.js";
import { arcadeGenerator } from "../questions.js";

// Every round is a finite 15 so it has a finish and a score. Endless is opted
// into from the victory screen instead of being the default, which means a run
// that goes on forever is a choice rather than just what happens.
export const ROUND_LENGTH = 15;
export const EASY_LENGTH = ROUND_LENGTH; // kept: the difficulty note reads it

export const DIFFICULTY_RULES = {
  easy:   { lives: null, total: ROUND_LENGTH, hints: true },
  normal: { lives: 3,    total: ROUND_LENGTH, hints: true },
  hard:   { lives: 3,    total: ROUND_LENGTH, hints: false },
};

export function startArcade(view, onEnd, category = "mixed", difficulty = "normal") {
  const rules = DIFFICULTY_RULES[difficulty] || DIFFICULTY_RULES.normal;
  const rng = makeRng();
  const next = arcadeGenerator(rng, category, difficulty);
  const engine = new Engine(view, {
    mode: "arcade",
    category,
    difficulty,
    lives: rules.lives,
    total: rules.total,
    hints: rules.hints,
    next,
    onEnd,
  });
  engine.start();
  return engine;
}

// High scores are per difficulty: an easy run of 15 questions is not comparable
// to an endless hard run, so one shared number would be meaningless.
const HS_KEY = "aa_arcade_best";
const key = (difficulty) => (difficulty && difficulty !== "normal" ? `${HS_KEY}_${difficulty}` : HS_KEY);
export const arcadeBest = (difficulty = "normal") => Number(localStorage.getItem(key(difficulty)) || 0);
export function recordArcade(score, difficulty = "normal") {
  const best = arcadeBest(difficulty);
  if (score > best) {
    localStorage.setItem(key(difficulty), String(score));
    return true;
  }
  return false;
}
