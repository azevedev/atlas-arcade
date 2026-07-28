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

function pickCountry(rng, { tierWeights, exclude, filter } = {}) {
  const pool = (tier) => {
    const p = tierPool(tier);
    return filter ? p.filter(filter) : p;
  };
  const pools = { easy: pool("easy"), medium: pool("medium"), hard: pool("hard") };
  const all = filter ? countries().filter(filter) : countries();
  for (let attempt = 0; attempt < 12; attempt++) {
    const tier = weightedPick(
      [
        { value: "easy", weight: tierWeights.easy },
        { value: "medium", weight: tierWeights.medium },
        { value: "hard", weight: tierWeights.hard },
      ],
      rng
    );
    const p = pools[tier].length ? pools[tier] : all;
    const c = pick(p, rng);
    if (!exclude || !exclude.has(c.ccn3)) return c;
  }
  return pick(all, rng);
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
  const recent = [];
  const remember = (c) => {
    recent.push(c.ccn3);
    if (recent.length > 12) recent.shift();
  };
  return function next(index) {
    const tierWeights = {
      easy: Math.max(0.5, 6 - index * 0.25),
      medium: 2.5 + index * 0.15,
      hard: Math.max(0.3, index * 0.22 - 0.8),
    };
    const spec = categorySpec(category, rng);
    const country = pickCountry(rng, {
      tierWeights,
      exclude: new Set(recent),
      filter: spec.filter,
    });
    remember(country);
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
