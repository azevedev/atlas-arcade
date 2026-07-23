// Bootstrap: load data, build the UI, wire the menu + results screens.
import { loadData } from "./data.js";
import { createUI } from "./ui.js";
import { startArcade, arcadeBest, recordArcade } from "./modes/arcade.js";
import { CATEGORIES } from "./questions.js";
import {
  startDaily,
  recordDaily,
  dailyStreak,
  dailyKey,
  dailyPlayed,
} from "./modes/daily.js";
import { buildShareText, copyShare } from "./share.js";
import { toggleMute, isMuted } from "./audio.js";

const $ = (id) => document.getElementById(id);

function resolveTheme() {
  const saved = localStorage.getItem("aa_theme");
  if (saved) return saved;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
}
applyTheme(resolveTheme());

function hideBoot() {
  const boot = $("boot");
  if (boot) {
    boot.classList.add("boot-hide");
    setTimeout(() => boot.remove(), 400);
  }
}

async function boot() {
  try {
    await loadData();
  } catch (e) {
    const boot = $("boot");
    if (boot) {
      boot.innerHTML =
        `<div class="boot-error"><div class="boot-globe">🌐</div>` +
        `<p><b>Couldn't load the game.</b></p>` +
        `<p>Check your connection and refresh. If you're opening the file directly, ` +
        `run a local server first (<code>python3 -m http.server</code>).</p></div>`;
    }
    console.error("Atlas Arcade failed to load:", e);
    return;
  }

  const ui = createUI();
  let engine = null;
  let currentMode = "arcade";
  let currentCategory = "mixed";
  let lastDaily = null;

  // build the arcade category buttons
  const catWrap = $("arcade-cats");
  for (const [key, c] of Object.entries(CATEGORIES)) {
    const b = document.createElement("button");
    b.className = "btn cat-btn" + (key === "mixed" ? " btn-primary" : "");
    b.innerHTML =
      `<span class="btn-emoji">${c.emoji}</span>` +
      `<span class="btn-labels"><b>${c.label}</b><small>${c.blurb}</small></span>`;
    b.onclick = () => begin("arcade", key);
    catWrap.appendChild(b);
  }

  function refreshMenu() {
    $("best-chip").textContent = "🏆 Best: " + arcadeBest().toLocaleString();
    $("streak-chip").textContent = "🔥 Streak: " + dailyStreak();
    $("daily-sub").textContent = dailyPlayed()
      ? "played today · replay for fun"
      : "10 puzzles · new every day";
    $("mute-toggle").textContent = isMuted() ? "🔇 Muted" : "🔊 Sound";
    $("theme-toggle").textContent =
      document.documentElement.dataset.theme === "dark" ? "☀️ Light" : "🌙 Dark";
  }

  function begin(mode, category = "mixed") {
    currentMode = mode;
    currentCategory = category;
    ui.showScreen("game");
    engine =
      mode === "arcade"
        ? startArcade(ui.view, onEnd, category)
        : startDaily(ui.view, onEnd);
  }

  function onEnd(summary) {
    const isDaily = summary.mode === "daily";
    const correct = summary.results.filter((r) => r.correct).length;
    const total = summary.results.length;

    $("results-title").textContent = isDaily
      ? "Daily complete!"
      : summary.gameOver
      ? "Run over!"
      : "Nice run!";
    $("results-score").textContent = summary.score.toLocaleString();

    let stats = `<span>✓ <b>${correct}/${total}</b> correct</span>`;
    if (!isDaily) {
      const best = recordArcade(summary.score);
      stats += `<span>🏆 <b>${arcadeBest().toLocaleString()}</b> best</span>`;
      if (best) stats += `<span>🎉 <b>New record!</b></span>`;
    }

    const shareEl = $("share-grid");
    const shareBtn = $("share-btn");
    if (isDaily) {
      if (!lastDaily || lastDaily !== dailyKey()) {
        if (!dailyPlayed()) {
          const streak = recordDaily(summary);
          stats += `<span>🔥 <b>${streak}</b> day streak</span>`;
        }
        lastDaily = dailyKey();
      }
      const text = buildShareText(summary.results, dailyKey(), summary.score);
      shareEl.textContent = text;
      shareEl.hidden = false;
      shareBtn.hidden = false;
      shareBtn.onclick = async () => {
        const ok = await copyShare(text);
        ui.toast(ok ? "Copied to clipboard!" : "Copy failed");
      };
    } else {
      shareEl.hidden = true;
      shareBtn.hidden = true;
    }

    $("results-stats").innerHTML = stats;
    ui.showScreen("results");
  }

  // ---- menu wiring ----
  $("play-arcade").onclick = () => ui.showScreen("arcade");
  $("arcade-back").onclick = () => ui.showScreen("menu");
  $("play-daily").onclick = () => begin("daily");
  $("again-btn").onclick = () => begin(currentMode, currentCategory);
  $("menu-btn").onclick = () => {
    ui.showScreen("menu");
    refreshMenu();
  };
  $("hud-back").onclick = () => {
    if (engine) engine.stop();
    ui.showScreen(currentMode === "arcade" ? "arcade" : "menu");
    refreshMenu();
  };
  $("mute-toggle").onclick = () => {
    toggleMute();
    refreshMenu();
  };
  $("theme-toggle").onclick = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("aa_theme", next);
    ui.globe.render(true);
    refreshMenu();
  };

  refreshMenu();
  hideBoot();
}

boot();
