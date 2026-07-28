// Bootstrap: load data, build the UI, wire the menu + results screens.
import { loadData } from "./data.js";
import { createUI } from "./ui.js";
import { startArcade, arcadeBest, recordArcade, EASY_LENGTH } from "./modes/arcade.js";
import { CATEGORIES, categoryLabel, categoryBlurb } from "./questions.js";
import { startWorldCup, worldCupBest, recordWorldCup } from "./modes/worldcup.js";
import {
  startDaily,
  recordDaily,
  dailyStreak,
  dailyKey,
  dailyPlayed,
} from "./modes/daily.js";
import { buildShareText, copyShare } from "./share.js";
import { toggleMute, isMuted } from "./audio.js";
import { t, getLang, setLang, applyStaticText } from "./i18n.js";

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
        `<p><b>${t("boot.failed")}</b></p>` +
        `<p>${t("boot.hint")} (<code>python3 -m http.server</code>).</p></div>`;
    }
    console.error("Atlas Arcade failed to load:", e);
    return;
  }

  const ui = createUI();
  let engine = null;
  let currentMode = "arcade";
  let currentCategory = "mixed";
  let currentDifficulty = localStorage.getItem("aa_difficulty") || "normal";
  let lastDaily = null;

  // build the arcade category buttons (re-run on language change)
  const catWrap = $("arcade-cats");
  function buildCategories() {
    catWrap.replaceChildren();
    for (const [key, c] of Object.entries(CATEGORIES)) {
      const b = document.createElement("button");
      b.className = "btn cat-btn" + (key === "mixed" ? " btn-primary" : "");
      b.innerHTML =
        `<span class="btn-emoji">${c.emoji}</span>` +
        `<span class="btn-labels"><b>${categoryLabel(key)}</b><small>${categoryBlurb(key)}</small></span>`;
        b.onclick = () => begin(currentMode === "worldcup" ? "worldcup" : "arcade", key);
      catWrap.appendChild(b);
    }
  }
  buildCategories();

  // ---- difficulty selector ----
  const diffNote = $("diff-note");
  function refreshDifficulty() {
    for (const b of document.querySelectorAll(".diff-btn")) {
      const on = b.dataset.diff === currentDifficulty;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    }
    diffNote.textContent = t(`diff.${currentDifficulty}Note`, { n: EASY_LENGTH });
  }
  for (const b of document.querySelectorAll(".diff-btn")) {
    b.onclick = () => {
      currentDifficulty = b.dataset.diff;
      localStorage.setItem("aa_difficulty", currentDifficulty);
      refreshDifficulty();
      refreshMenu();
    };
  }
  refreshDifficulty();

  function refreshMenu() {
    $("best-chip").textContent = `🏆 ${t("menu.best")}: ` + arcadeBest(currentDifficulty).toLocaleString();
    $("streak-chip").textContent = `🔥 ${t("menu.streak")}: ` + dailyStreak();
    $("daily-sub").textContent = t(dailyPlayed() ? "menu.dailyPlayed" : "menu.dailyNew");
    $("mute-toggle").textContent = isMuted() ? `🔇 ${t("menu.muted")}` : `🔊 ${t("menu.sound")}`;
    $("theme-toggle").textContent =
      document.documentElement.dataset.theme === "dark" ? `☀️ ${t("menu.light")}` : `🌙 ${t("menu.dark")}`;
    const lang = $("lang-toggle");
    lang.textContent = "🌐 " + t("menu.language");
    lang.setAttribute("aria-label", t("menu.languageAria"));
  }

  function begin(mode, category = "mixed") {
    currentMode = mode;
    currentCategory = category;
    ui.showScreen("game");
    engine =
      mode === "worldcup"
        ? startWorldCup(ui.view, onEnd, category)
        : mode === "arcade"
        ? startArcade(ui.view, onEnd, category, currentDifficulty)
        : startDaily(ui.view, onEnd);
  }

  function onEnd(summary) {
    const isDaily = summary.mode === "daily";
    const correct = summary.results.filter((r) => r.correct).length;
    const total = summary.results.length;

    $("results-title").textContent = t(
      isDaily ? "results.daily" : summary.gameOver ? "results.over" : "results.nice"
    );
    $("results-score").textContent = summary.score.toLocaleString();

    let stats = `<span>✓ <b>${correct}/${total}</b> ${t("results.correct")}</span>`;
    if (!isDaily) {
      const wc = summary.mode === "worldcup";
      const best = wc ? recordWorldCup(summary.score) : recordArcade(summary.score, summary.difficulty);
      const top = wc ? worldCupBest() : arcadeBest(summary.difficulty);
      stats += `<span>🏆 <b>${top.toLocaleString()}</b> ${t("results.best")}</span>`;
      if (best) stats += `<span>🎉 <b>${t("results.record")}</b></span>`;
    }

    const shareEl = $("share-grid");
    const shareBtn = $("share-btn");
    if (isDaily) {
      if (!lastDaily || lastDaily !== dailyKey()) {
        if (!dailyPlayed()) {
          const streak = recordDaily(summary);
          stats += `<span>🔥 <b>${streak}</b> ${t(streak === 1 ? "results.streakOne" : "results.streak")}</span>`;
        }
        lastDaily = dailyKey();
      }
      const text = buildShareText(summary.results, dailyKey(), summary.score);
      shareEl.textContent = text;
      shareEl.hidden = false;
      shareBtn.hidden = false;
      shareBtn.onclick = async () => {
        const ok = await copyShare(text);
        ui.toast(t(ok ? "results.copied" : "results.copyFailed"));
      };
    } else {
      shareEl.hidden = true;
      shareBtn.hidden = true;
    }

    $("results-stats").innerHTML = stats;
    ui.showScreen("results");
  }

  // ---- menu wiring ----
  // Both arcade and world cup use the category picker; only arcade offers a
  // difficulty, so the row is hidden for the themed mode.
  function openPicker(mode) {
    currentMode = mode;
    const isArcade = mode === "arcade";
    document.querySelector(".diff-row").hidden = !isArcade;
    $("diff-note").hidden = !isArcade;
    $("picker-title").textContent = t(isArcade ? "picker.title" : "picker.worldcup");
    $("picker-note").textContent = isArcade ? "" : t("picker.worldcupSub");
    $("picker-note").hidden = isArcade;
    ui.showScreen("arcade");
  }
  $("play-arcade").onclick = () => openPicker("arcade");
  $("play-worldcup").onclick = () => openPicker("worldcup");
  $("arcade-back").onclick = () => ui.showScreen("menu");
  $("play-daily").onclick = () => begin("daily");
  $("again-btn").onclick = () => begin(currentMode, currentCategory);
  $("menu-btn").onclick = () => {
    ui.showScreen("menu");
    refreshMenu();
  };
  $("hud-back").onclick = () => {
    if (engine) engine.stop();
    ui.showScreen(currentMode === "arcade" || currentMode === "worldcup" ? "arcade" : "menu");
    refreshMenu();
  };
  $("mute-toggle").onclick = () => {
    toggleMute();
    refreshMenu();
  };
  $("lang-toggle").onclick = () => {
    // Rebuilding is cheaper and far less bug-prone than trying to retranslate a
    // live game, and the menu is the only place the toggle exists anyway.
    if (!setLang(getLang() === "pt-BR" ? "en" : "pt-BR")) return;
    applyStaticText();
    buildCategories();

  // ---- difficulty selector ----
  const diffNote = $("diff-note");
  function refreshDifficulty() {
    for (const b of document.querySelectorAll(".diff-btn")) {
      const on = b.dataset.diff === currentDifficulty;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    }
    diffNote.textContent = t(`diff.${currentDifficulty}Note`, { n: EASY_LENGTH });
  }
  for (const b of document.querySelectorAll(".diff-btn")) {
    b.onclick = () => {
      currentDifficulty = b.dataset.diff;
      localStorage.setItem("aa_difficulty", currentDifficulty);
      refreshDifficulty();
      refreshMenu();
    };
  }
  refreshDifficulty();
    refreshMenu();
  };
  $("theme-toggle").onclick = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("aa_theme", next);
    ui.globe.render(true);
    refreshMenu();
  };

  applyStaticText();
  refreshMenu();
  hideBoot();
}

boot();
