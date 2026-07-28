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
function pickCountry(rng, { tierWeights, exclude, filter, mode } = {}) {
  const usable = (arr) => {
    const a = filter ? arr.filter(filter) : arr;
    return exclude && exclude.size ? a.filter((c) => !exclude.has(c.ccn3)) : a;
  };
  const all = usable(countries());
  if (!all.length) return null;

  // Only the tiers this difficulty draws from. Iterating all three would let an
  // easy run fall through into hard-tier countries once easy and medium were
  // used up, which is not what "every country at this difficulty" means.
  const names = Object.keys(tierWeights);
  const pools = {};
  for (const t of names) pools[t] = usable(tierPool(t, mode));
  // weight > 0 as well as non-empty: a zero-weight tier is one this difficulty
  // does not use, and weightedPick would still return it if it were the only
  // candidate left
  const weights = names
    .filter((t) => pools[t].length && tierWeights[t] > 0)
    .map((t) => ({ value: t, weight: tierWeights[t] }));
  if (!weights.length) return null;

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
// `mode` is the difficulty dimension the question will test, which is not the
// same as the category: a mixed round asks a country question without knowing
// yet whether it will show a flag or a shape, so it falls back to the overall
// tier by leaving mode undefined.
function categorySpec(category, rng) {
  switch (category) {
    case "flag":
      return { type: "country", forceClue: "flag", filter: null, mode: "flag" };
    case "shape":
      return { type: "country", forceClue: "shape", filter: (c) => c.shapeClue && c.feature, mode: "shape" };
    case "capital":
      return { type: "capital", forceClue: null, filter: null, mode: "capital" };
    case "locate":
      return { type: "locate", forceClue: null, filter: null, mode: "locate" };
    default: {
      const type = weightedPick(TYPE_WEIGHTS, rng);
      const mode = type === "capital" ? "capital" : type === "locate" ? "locate" : undefined;
      return { type, forceClue: null, filter: null, mode };
    }
  }
}

// Endless arcade: difficulty ramps as the run goes on. `category` restricts the type.
// How each difficulty weights the tiers. Easy stays on countries a player is
// likely to know, hard drops the easy tier entirely, and normal keeps the
// original ramp that gets harder as the run goes on.
export const DIFFICULTIES = ["easy", "normal", "hard"];

// Which tiers a difficulty ever draws from. Declared rather than inferred from
// the weights, because "every country at this difficulty" has to mean exactly
// the same set to the picker and to the pool count. Easy never reaches the hard
// tier and hard never drops back to easy, so their worlds are genuinely smaller.
export const ACTIVE_TIERS = {
  easy: ["easy", "medium"],
  normal: ["easy", "medium", "hard"],
  hard: ["medium", "hard"],
};

function tierWeightsFor(difficulty, index) {
  if (difficulty === "easy") {
    return { easy: 8, medium: Math.min(2, 0.4 + index * 0.06) };
  }
  if (difficulty === "hard") {
    return { medium: Math.max(1, 4 - index * 0.12), hard: 2 + index * 0.18 };
  }
  return {
    easy: Math.max(0.5, 6 - index * 0.25),
    medium: 2.5 + index * 0.15,
    hard: Math.max(0.3, index * 0.22 - 0.8),
  };
}

// World Cup: the same endless stream, restricted to countries that have played
// in a World Cup final tournament. No difficulty choice, so the tier ramp is
// the normal one; the restricted pool is the theme, not the challenge.
export function worldCupGenerator(rng, category = "mixed") {
  const inner = arcadeGenerator(rng, category, "normal", (c) => c.worldCup);
  return inner;
}

// How many countries a category can ever offer, so the engine knows what
// "finished the world" means before the run starts.
export function poolSize(category, difficulty = "normal", poolFilter = null) {
  const tiers = ACTIVE_TIERS[difficulty] || ACTIVE_TIERS.normal;
  // A mixed round can reach a country through any of its three question types,
  // so its pool is the union: a country that is hard to name from its flag may
  // still be an easy capital. A single-category round has just the one mode.
  const specs = category === "mixed" ? MIXED_SPECS : [categorySpec(category, () => 0)];
  const reaches = (c, spec) => {
    if (spec.filter && !spec.filter(c)) return false;
    const tier = spec.mode && c.tiers ? c.tiers[spec.mode] : c.tier;
    return tiers.includes(tier);
  };
  return countries().filter(
    (c) => (!poolFilter || poolFilter(c)) && specs.some((spec) => reaches(c, spec))
  ).length;
}

// The three shapes a mixed question can take, in the order the fallback tries
// them. Mixed picks one at random per question; if that one has nobody left it
// falls through to the others rather than declaring the world finished while
// two thirds of it is still askable.
const MIXED_SPECS = [
  { type: "country", forceClue: null, filter: null, mode: undefined },
  { type: "capital", forceClue: null, filter: null, mode: "capital" },
  { type: "locate", forceClue: null, filter: null, mode: "locate" },
];

export function arcadeGenerator(rng, category = "mixed", difficulty = "normal", poolFilter = null) {
  // Every country seen this run, not a sliding window: a country asked once
  // does not come back until the player starts a new match. Shared across
  // question types, so being shown France's flag also retires France as a
  // capital or locate question for the rest of the run.
  const used = new Set();
  return function next(index) {
    const tierWeights = tierWeightsFor(difficulty, index);
    const first = categorySpec(category, rng);
    const order =
      category === "mixed"
        ? [first, ...MIXED_SPECS.filter((s) => s.type !== first.type)]
        : [first];
    for (const spec of order) {
      // the category filter and the pool filter both have to pass
      const filter = poolFilter
        ? (c) => poolFilter(c) && (!spec.filter || spec.filter(c))
        : spec.filter;
      const country = pickCountry(rng, { tierWeights, exclude: used, filter, mode: spec.mode });
      if (!country) continue;
      used.add(country.ccn3);
      return buildQuestion(spec.type, country, rng, spec.forceClue);
    }
    // Nothing left in any shape the category can take: the player has been asked
    // about every country it can offer. Returning null rather than recycling lets
    // the engine treat that as finishing the world, which is the whole point.
    return null;
  };
}

// Daily: a fixed, seeded set — same for everyone that day (always mixed).
// The Daily is always the easy tier: it is the one set everybody plays and
// compares, so it should be winnable rather than a test of obscure flags.
export function dailyQueue(rng, n = 10) {
  const plan = Array(n).fill("easy");
  const used = new Set();
  const items = plan.map((tier) => {
    const weights = { easy: 0, medium: 0, hard: 0 };
    weights[tier] = 1;
    const spec = categorySpec("mixed", rng);
    const country =
      pickCountry(rng, { tierWeights: weights, exclude: used, filter: spec.filter, mode: spec.mode }) ||
      pickCountry(rng, { tierWeights: { easy: 1, medium: 1, hard: 1 }, exclude: used, filter: spec.filter, mode: spec.mode });
    used.add(country.ccn3);
    return buildQuestion(spec.type, country, rng, spec.forceClue);
  });
  return shuffle(items, rng);
}
