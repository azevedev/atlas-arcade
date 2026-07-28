// Escalating hint plans. Each hint the player reveals costs points, so a hint
// that restates something already on screen is worse than no hint at all.
//
// The plan is therefore built from what the question is NOT already showing.
// "Name this country" with the country lit up on the globe does not offer
// "Region: Asia", and "What is the capital of France?" does not offer
// "Located in Western Europe": in both cases the player can already see it.
import { continentOf } from "./geo.js";

function answerText(q) {
  return q.answerKind === "capital" ? q.country.capital : q.country.name;
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

// Same skeleton as the pattern, with the vowels filled in. For a capital this is
// the strongest hint available: location tells you nothing about the *name*,
// but vowel positions narrow a half-remembered word down fast.
const VOWEL = /[aeiouyáàâäãéèêëíìîïóòôöõúùûü]/i;
function vowelPattern(q) {
  const t = answerText(q);
  return t
    .split("")
    .map((ch, i) => {
      if (ch === " ") return "  ";
      if (i === 0) return ch.toUpperCase();
      return VOWEL.test(ch) ? ch.toLowerCase() : "_";
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
    shape: { kind: "shape", label: "Shape revealed" },
    flag: { kind: "flag", label: "Flag revealed" },
    region: { kind: "region", scope: "region", label: `Region: ${c.region || "unknown"}` },
    continent: { kind: "region", scope: "subregion", label: `Located in ${continentOf(c)}` },
    first: { kind: "first", label: `Starts with “${firstLetter(q)}”` },
    length: { kind: "length", label: `Pattern: ${lengthPattern(q)}` },
    vowels: { kind: "length", label: `Vowels: ${vowelPattern(q)}` },
    position: { kind: "position", label: "Location revealed on the globe" },
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
    // from one letter, to the shape of the word, to its vowels.
    order = ["first", "length", "vowels"];
  } else {
    order = ["region", "continent", "shape", "flag"];
  }

  return order
    .filter((k) => !shown.has(k))
    .filter((k) => (k === "shape" ? canShape : true))
    .map((k) => hints[k]);
}
