// Escalating hint plans. Each hint the player reveals costs points. The engine/UI
// knows how to apply each `kind`; here we just describe the ordered stages.
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

export function hintPlan(q) {
  const region = { kind: "region", label: `Region: ${q.country.region || "—"}` };
  const continent = {
    kind: "region",
    label: `Located in ${continentOf(q.country)}`,
  };
  const first = { kind: "first", label: `Starts with “${firstLetter(q)}”` };
  const length = { kind: "length", label: `Pattern: ${lengthPattern(q)}` };
  const position = { kind: "position", label: "Location revealed on the globe" };
  const flag = { kind: "flag", label: "Flag revealed" };
  const shape = { kind: "shape", label: "Shape revealed" };

  const canShape = q.country.shapeClue && q.country.feature;

  if (q.type === "country") {
    if (q.clueMode === "flag") {
      // flag is the main clue → offer the shape (if any) + text + globe position
      return [...(canShape ? [shape] : []), region, first, length, position];
    }
    if (q.clueMode === "shape") {
      // shape is the main clue → offer the flag + text + globe position
      return [flag, region, first, length, position];
    }
    // position clue (globe) → offer flag/shape + text
    return [flag, ...(canShape ? [shape] : []), region, first, length];
  }

  if (q.type === "capital") {
    // the region blob is shown from the start; escalate with words + letters
    return [continent, first, length];
  }

  // locate: help the player aim
  return [region, continent, flag];
}
