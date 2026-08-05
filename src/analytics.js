// Analytics: a thin, optional wrapper around the Umami tracker.
//
// Every call site has to assume this does nothing, because often it does. The
// tracker is a cross-origin script, so an ad blocker, a strict privacy mode, a
// Do Not Track header or an offline PWA launch all leave `window.umami`
// undefined. Swallowing that here keeps the guard out of the game code, and
// means a blocked tracker can never take a run down with it.
//
// What we send is deliberately coarse: which mode/category/difficulty was
// played and how it ended. No country, no answer, no timing, nothing that
// describes a person. The Daily's personal stats stay in localStorage and are
// never uploaded — see modes/daily.js.

// Umami caps event names at 50 characters; ours are short on purpose so they
// stay readable in the dashboard's event list.
const EVENT_MAX = 50;

// The portfolio and the other games share this origin, so they share one Umami
// website too. Stamping the source on every event is what keeps them apart in
// a dashboard that sees all of azevedev.github.io at once.
const SITE = "atlas-arcade";

// Umami drops the whole payload if a value is undefined, so a mode that has no
// category (the Daily) would silently lose its other properties too.
function clean(data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) if (v != null) out[k] = v;
  return out;
}

export function track(event, data) {
  const um = typeof window !== "undefined" ? window.umami : null;
  if (!um || typeof um.track !== "function") return;
  try {
    const name = String(event).slice(0, EVENT_MAX);
    um.track(name, { site: SITE, ...clean(data || {}) });
  } catch {
    // Analytics is never worth an exception mid-run.
  }
}

// How a run finished, flattened into one low-cardinality property. The summary
// carries these as separate booleans, which would be four columns in the
// dashboard instead of one readable breakdown.
export function endingOf(summary) {
  if (summary.gameOver) return "game_over";
  if (summary.exhausted) return "exhausted";
  if (summary.completed) return "completed";
  return "quit";
}
