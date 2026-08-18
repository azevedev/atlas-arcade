// Register the service worker for offline play + instant repeat loads.
// Kept out of main.js so a load failure never blocks the game, and kept out of
// index.html so the page carries no inline script — that lets the Content
// Security Policy use a plain `script-src 'self'` with no hash to maintain.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
