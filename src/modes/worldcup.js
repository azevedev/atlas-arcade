// World Cup mode: the arcade stream restricted to countries that have played in
// a FIFA World Cup final tournament (74 of the 194). No difficulty choice, so it
// runs on the normal rules: 3 lives, hints on, and the same 15-question round.
// Answering all 74 is the special ending here.
import { Engine } from "../engine.js";
import { makeRng } from "../rng.js";
import { worldCupGenerator } from "../questions.js";
import { ROUND_LENGTH } from "./arcade.js";

export function startWorldCup(view, onEnd, category = "mixed") {
  const rng = makeRng();
  const next = worldCupGenerator(rng, category);
  const engine = new Engine(view, {
    mode: "worldcup",
    category,
    difficulty: "normal",
    lives: 3,
    total: ROUND_LENGTH,
    hints: true,
    next,
    onEnd,
  });
  engine.start();
  return engine;
}

const HS_KEY = "aa_worldcup_best";
export const worldCupBest = () => Number(localStorage.getItem(HS_KEY) || 0);
export function recordWorldCup(score) {
  if (score > worldCupBest()) {
    localStorage.setItem(HS_KEY, String(score));
    return true;
  }
  return false;
}
