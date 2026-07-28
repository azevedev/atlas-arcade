// Builds the shareable emoji grid for a Daily result.
import { starsFor } from "./scoring.js";
import { t } from "./i18n.js";
import { formatDay } from "./rng.js";

const chunk = (a, n) => {
  const out = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};

// The header and the grid are returned separately because they want different
// type sizes on screen: the emoji grid is the point and stays large, while the
// title and date are ordinary text that must be free to wrap. As one oversized
// preformatted block the header ran off the side of the card.
export function buildShare(results, dateKey, score) {
  const cells = results.map((r) => {
    if (!r.correct) return "⬜";
    const s = starsFor(r.basePoints);
    return s === 3 ? "🟩" : s === 2 ? "🟨" : "🟧";
  });
  const grid = chunk(cells, 5)
    .map((row) => row.join(""))
    .join("\n");
  const head = `Atlas Arcade · ${t("menu.daily")}`;
  const meta = `${formatDay(dateKey)} · ★ ${score.toLocaleString()} ${t("game.points")}`;
  return { head, meta, grid, text: `${head}\n${meta}\n${grid}` };
}

// kept for callers that only want the clipboard string
export const buildShareText = (results, dateKey, score) =>
  buildShare(results, dateKey, score).text;

export async function copyShare(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
