// Builds the question stream. Three underlying types (country / capital / locate);
// the country type shows a flag, a shape, or the country lit on the globe.
// Arcade can be filtered to a single category (flags-only, shapes-only, …).
import { tierPool, countries } from "./data.js";
import { pick, weightedPick, shuffle } from "./rng.js";
import { t, countryOf, countryArt } from "./i18n.js";

let uid = 0;

const TYPE_WEIGHTS = [
  { value: "country", weight: 0.45 },
  { value: "capital", weight: 0.3 },
  { value: "locate", weight: 0.25 },
];

// arcade categories -> how to build each question
// Labels are resolved at call time, not module load, so switching language
// rebuilds them without a reload.
export const CATEGORIES = {
  mixed: { key: "mixed", emoji: "🌐" },
  flag: { key: "flag", emoji: "🏳️" },
  shape: { key: "shape", emoji: "🗺️" },
  capital: { key: "capital", emoji: "🏛️" },
  locate: { key: "locate", emoji: "📍" },
};
export const categoryLabel = (k) => t(`cat.${k}`);
export const categoryBlurb = (k) => t(`cat.${k}Blurb`);

// Picks a country honouring the tier weights, the category filter, and the set
// of countries already used this run.
//
// The exclusion is applied by filtering the pool rather than by retrying random
// draws. Retrying was only best-effort: as the used set grew the odds of landing
// on a fresh country fell, and after a fixed number of attempts it gave up and
// returned a random country, which is exactly when a repeat was most likely.
//
// Returns null when nothing is left, so the caller can decide what that means.
function pickCountry(rng, { tierWeights, exclude, filter } = {}) {
  const usable = (arr) => {
    const a = filter ? arr.filter(filter) : arr;
    return exclude && exclude.size ? a.filter((c) => !exclude.has(c.ccn3)) : a;
  };
  const all = usable(countries());
  if (!all.length) return null;

  const pools = {
    easy: usable(tierPool("easy")),
    medium: usable(tierPool("medium")),
    hard: usable(tierPool("hard")),
  };
  // only weight tiers that still have someone left in them
  const weights = ["easy", "medium", "hard"]
    .filter((t) => pools[t].length)
    .map((t) => ({ value: t, weight: tierWeights[t] }));
  if (!weights.length) return pick(all, rng);

  const tier = weightedPick(weights, rng);
  return pick(pools[tier], rng);
}

function buildQuestion(type, country, rng, forceClue = null) {
  const q = { id: ++uid, type, country };
  if (type === "country") {
    let mode = forceClue;
    if (!mode) {
      const modes = [
        { value: "flag", weight: 0.45 },
        { value: "position", weight: 0.25 },
      ];
      if (country.shapeClue && country.feature) modes.push({ value: "shape", weight: 0.3 });
      mode = weightedPick(modes, rng);
    }
    q.clueMode = mode;
    q.prompt = t("game.promptCountry");
    q.answerKind = "country";
  } else if (type === "capital") {
    q.prompt = t("game.promptCapital", { country: country.name, countryOf: countryOf(country) });
    q.answerKind = "capital";
  } else {
    q.prompt = t("game.promptLocate", { country: country.name, countryArt: countryArt(country) });
    q.answerKind = "locate";
  }
  return q;
}

// how a category maps to (question type, forced clue, country-pool filter)
function categorySpec(category, rng) {
  switch (category) {
    case "flag":
      return { type: "country", forceClue: "flag", filter: null };
    case "shape":
      return { type: "country", forceClue: "shape", filter: (c) => c.shapeClue && c.feature };
    case "capital":
      return { type: "capital", forceClue: null, filter: null };
    case "locate":
      return { type: "locate", forceClue: null, filter: null };
    default:
      return { type: weightedPick(TYPE_WEIGHTS, rng), forceClue: null, filter: null };
  }
}

// Endless arcade: difficulty ramps as the run goes on. `category` restricts the type.
export function arcadeGenerator(rng, category = "mixed") {
  // Every country seen this run, not a sliding window: a country asked once
  // does not come back until the player starts a new match. Shared across
  // question types, so being shown France's flag also retires France as a
  // capital or locate question for the rest of the run.
  const used = new Set();
  return function next(index) {
    const tierWeights = {
      easy: Math.max(0.5, 6 - index * 0.25),
      medium: 2.5 + index * 0.15,
      hard: Math.max(0.3, index * 0.22 - 0.8),
    };
    const spec = categorySpec(category, rng);
    let country = pickCountry(rng, { tierWeights, exclude: used, filter: spec.filter });
    if (!country) {
      // Arcade is endless, so a long enough run can exhaust the pool. Nobody is
      // getting through 194 questions on three lives, but the run must keep
      // going rather than break, so start a fresh cycle.
      used.clear();
      country = pickCountry(rng, { tierWeights, filter: spec.filter });
    }
    used.add(country.ccn3);
    return buildQuestion(spec.type, country, rng, spec.forceClue);
  };
}

// Daily: a fixed, seeded set — same for everyone that day (always mixed).
export function dailyQueue(rng, n = 10) {
  const plan = [
    ...Array(4).fill("easy"),
    ...Array(4).fill("medium"),
    ...Array(2).fill("hard"),
  ].slice(0, n);
  const used = new Set();
  const items = plan.map((tier) => {
    const weights = { easy: 0, medium: 0, hard: 0 };
    weights[tier] = 1;
    const spec = categorySpec("mixed", rng);
    const country = pickCountry(rng, { tierWeights: weights, exclude: used, filter: spec.filter });
    used.add(country.ccn3);
    return buildQuestion(spec.type, country, rng, spec.forceClue);
  });
  return shuffle(items, rng);
}
