// Escalating hint plans. Each hint the player reveals costs points, so a hint
// that restates something already on screen is worse than no hint at all.
//
// The plan is therefore built from what the question is NOT already showing.
// "Name this country" with the country lit up on the globe does not offer
// "Region: Asia", and "What is the capital of France?" does not offer
// "Located in Western Europe": in both cases the player can already see it.
import { continentOf } from "./geo.js";
import { makeRng, shuffle } from "./rng.js";
import { t, tRegion, regionIn, countryName, capitalName, getLang } from "./i18n.js";

// The answer in the language being played, so the letter hints spell the word
// the player is actually being asked for.
function answerText(q) {
  return q.answerKind === "capital" ? capitalName(q.country) : countryName(q.country);
}

function firstLetter(q) {
  const t = (answerText(q) || "").trim();
  return t ? t[0].toUpperCase() : "?";
}

function lengthPattern(q) {
  const t = answerText(q);
  return t
    .split("")
    .map((ch, i) => (i === 0 ? ch.toUpperCase() : ch === " " ? "  " : "_"))
    .join(" ");
}

const LETTER = /[a-zà-öø-ÿ]/i;

// Same skeleton as the pattern, with some letters filled in.
//
// Two rules keep this from handing over the answer. Revealed letters are picked
// at random rather than by class: revealing every vowel gave away far too much,
// since "Bissau" is four sixths vowel. And the total revealed, first letter
// included, is capped at half the letters, rounded down.
//
// The pick is seeded from the answer itself, so it is stable for a given word
// and every player sees the same letters in the Daily Challenge.
function revealPattern(q) {
  const word = answerText(q);
  const chars = word.split("");

  const letterIdx = [];
  for (let i = 0; i < chars.length; i++) {
    if (LETTER.test(chars[i])) letterIdx.push(i);
  }
  if (!letterIdx.length) return lengthPattern(q);

  const firstIdx = letterIdx[0];
  const budget = Math.max(1, Math.floor(letterIdx.length / 2)); // never past half
  const rest = shuffle(letterIdx.slice(1), makeRng(`reveal:${getLang()}:${word}`));
  const show = new Set(rest.slice(0, budget - 1));
  show.add(firstIdx);

  return chars
    .map((ch, i) => {
      if (ch === " ") return "  ";
      if (!LETTER.test(ch)) return ch; // hyphens and apostrophes are structure
      if (i === firstIdx) return ch.toUpperCase();
      return show.has(i) ? ch.toLowerCase() : "_";
    })
    .join(" ");
}

// Facts the question puts on screen for free, before any hint is spent.
function shownByClue(q) {
  const shown = new Set();

  if (q.type === "country") {
    if (q.clueMode === "flag") shown.add("flag");
    else if (q.clueMode === "shape") shown.add("shape");
    else if (q.clueMode === "position") {
      // the globe rotates to the country and highlights it, so both the exact
      // position and the region it sits in are already visible
      shown.add("position");
      shown.add("region");
    }
  } else if (q.type === "capital") {
    // the prompt names the country, and the globe flies to it and blobs the
    // capital's rough area: continent and region are already answered
    shown.add("position");
    shown.add("region");
    shown.add("continent");
  }

  // "locate" shows nothing: the globe is free and the country is only named.
  return shown;
}

export function hintPlan(q) {
  const c = q.country;
  const shown = shownByClue(q);
  const canShape = !!(c.shapeClue && c.feature);

  const hints = {
    shape: { kind: "shape", label: t("hint.shape") },
    flag: { kind: "flag", label: t("hint.flag") },
    region: { kind: "region", scope: "region", label: t("hint.region", { region: tRegion(c.region) }) },
    continent: { kind: "region", scope: "subregion", label: t("hint.continent", { region: tRegion(continentOf(c)), regionIn: regionIn(continentOf(c)) }) },
    first: { kind: "first", label: t("hint.first", { letter: firstLetter(q) }) },
    length: { kind: "length", label: t("hint.pattern", { pattern: lengthPattern(q) }) },
    reveal: { kind: "length", label: t("hint.letters", { pattern: revealPattern(q) }) },
    position: { kind: "position", label: t("hint.position") },
  };

  // Ordered weakest to strongest. Broad location always precedes exact location,
  // so revealing one can never make a later hint in the same plan redundant.
  let order;
  if (q.type === "country") {
    order = ["shape", "flag", "region", "first", "length", "position"];
  } else if (q.type === "capital") {
    // Every location hint is dead here: the prompt names the country and the
    // globe already flew to it, and knowing exactly where a capital sits still
    // does not tell you its name. So the whole ladder is lexical, escalating
    // from one letter, to the shape of the word, to half of its letters.
    order = ["first", "length", "reveal"];
  } else {
    order = ["region", "continent", "shape", "flag"];
  }

  return order
    .filter((k) => !shown.has(k))
    .filter((k) => (k === "shape" ? canShape : true))
    .map((k) => hints[k]);
}
