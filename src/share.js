// Builds the shareable emoji grid for a Daily result.
import { starsFor } from "./scoring.js";

const chunk = (a, n) => {
  const out = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};

export function buildShareText(results, dateKey, score) {
  const cells = results.map((r) => {
    if (!r.correct) return "⬜";
    const s = starsFor(r.basePoints);
    return s === 3 ? "🟩" : s === 2 ? "🟨" : "🟧";
  });
  const grid = chunk(cells, 5)
    .map((row) => row.join(""))
    .join("\n");
  return `Atlas Arcade — Daily ${dateKey}\n★ ${score.toLocaleString()} pts\n${grid}`;
}

export async function copyShare(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
