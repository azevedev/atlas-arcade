// Bootstrap: load data, build the UI, wire the menu + results screens.
import { loadData } from "./data.js";
import { createUI } from "./ui.js";
import { startArcade, arcadeBest, recordArcade, EASY_LENGTH } from "./modes/arcade.js";
import { CATEGORIES, categoryLabel, categoryBlurb, poolSize } from "./questions.js";
import { startWorldCup, worldCupBest, recordWorldCup } from "./modes/worldcup.js";
import {
  startDaily,
  recordDaily,
  dailyStreak,
  dailyKey,
  dailyPlayed,
  dailyStats,
  DAILY_N,
} from "./modes/daily.js";
import { buildShare, copyShare } from "./share.js";
import { toggleMute, isMuted } from "./audio.js";
import { track, endingOf } from "./analytics.js";
import { t, getLang, setLang, applyStaticText } from "./i18n.js";
import { icon } from "./icons.js";

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
        `<div class="boot-error"><div class="boot-globe">${icon("globe")}</div>` +
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
        `<span class="btn-icon">${icon(c.icon)}</span>` +
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
    // innerHTML, not textContent: every chip carries an icon. The only
    // interpolations are translated strings and numbers we produced ourselves.
    $("best-chip").innerHTML =
      `${icon("trophy")} ${t("menu.best")}: ` + arcadeBest(currentDifficulty).toLocaleString();
    $("streak-chip").innerHTML = `${icon("fire")} ${t("menu.streak")}: ` + dailyStreak();
    $("daily-sub").textContent = t(dailyPlayed() ? "menu.dailyPlayed" : "menu.dailyNew");
    $("mute-toggle").innerHTML = isMuted()
      ? `${icon("muted")} ${t("menu.muted")}`
      : `${icon("sound")} ${t("menu.sound")}`;
    $("theme-toggle").innerHTML =
      document.documentElement.dataset.theme === "dark"
        ? `${icon("light")} ${t("menu.light")}`
        : `${icon("dark")} ${t("menu.dark")}`;
    const lang = $("lang-toggle");
    lang.innerHTML = `${icon("language")} ` + t("menu.language");
    $("stats-toggle").innerHTML = `${icon("stats")} ` + t("menu.stats");
    lang.setAttribute("aria-label", t("menu.languageAria"));
  }

  function begin(mode, category = "mixed") {
    currentMode = mode;
    currentCategory = category;
    // The Daily picks its own questions, so a category here would be a fiction.
    track("run_start", {
      mode,
      category: mode === "daily" ? null : category,
      difficulty: mode === "arcade" ? currentDifficulty : null,
    });
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

    // Note this can fire more than once per run_start: carrying on into endless
    // ends the run a second time. That is the honest shape of the mode, and the
    // `ending` breakdown is what separates the two.
    track("run_end", {
      mode: summary.mode,
      category: isDaily ? null : summary.category,
      difficulty: summary.mode === "arcade" ? summary.difficulty : null,
      ending: endingOf(summary),
      score: summary.score,
      correct,
      total,
      hints: summary.results.reduce((n, r) => n + (r.hints || 0), 0),
    });

    // Four endings, and they should not look alike: ran out of lives, finished
    // the 15, finished the Daily, or answered every country the mode had left.
    const card = $("results-card");
    const mark = $("triumph-mark");
    const sub = $("results-sub");
    const endless = $("endless-btn");
    card.classList.toggle("results-triumph", !!summary.exhausted);
    mark.hidden = !summary.exhausted;
    endless.hidden = !summary.canContinue;

    let titleKey = "results.nice";
    if (isDaily) titleKey = "results.daily";
    else if (summary.gameOver) titleKey = "results.over";
    else if (summary.exhausted) titleKey = "results.world";
    else if (summary.completed) titleKey = "results.victory";
    $("results-title").textContent = t(titleKey);

    if (summary.exhausted) {
      const n =
        summary.mode === "worldcup"
          ? poolSize(summary.category, "normal", (c) => c.worldCup)
          : poolSize(summary.category, summary.difficulty);
      sub.textContent = t("results.worldSub", { n });
      sub.hidden = false;
    } else if (summary.canContinue) {
      sub.textContent = t("results.endlessSub");
      sub.hidden = false;
    } else {
      sub.hidden = true;
    }
    $("results-score").textContent = summary.score.toLocaleString();

    let stats = `<span>${icon("check")} <b>${correct}/${total}</b> ${t("results.correct")}</span>`;
    if (!isDaily) {
      const wc = summary.mode === "worldcup";
      const best = wc ? recordWorldCup(summary.score) : recordArcade(summary.score, summary.difficulty);
      const top = wc ? worldCupBest() : arcadeBest(summary.difficulty);
      stats += `<span>${icon("trophy")} <b>${top.toLocaleString()}</b> ${t("results.best")}</span>`;
      if (best) stats += `<span>${icon("record")} <b>${t("results.record")}</b></span>`;
    }

    const shareEl = $("share-grid");
    const shareHead = $("share-head");
    const shareBtn = $("share-btn");
    if (isDaily) {
      if (!lastDaily || lastDaily !== dailyKey()) {
        if (!dailyPlayed()) {
          const streak = recordDaily(summary);
          stats += `<span>${icon("fire")} <b>${streak}</b> ${t(streak === 1 ? "results.streakOne" : "results.streak")}</span>`;
        }
        lastDaily = dailyKey();
      }
      const share = buildShare(summary.results, dailyKey(), summary.score);
      shareEl.textContent = share.grid;
      shareEl.hidden = false;
      shareHead.innerHTML = `<span>${share.head}</span><span>${share.meta}</span>`;
      shareHead.hidden = false;
      shareBtn.hidden = false;
      shareBtn.onclick = async () => {
        const ok = await copyShare(share.text);
        // Tracked on the outcome, not the click: a copy that failed is not a share.
        if (ok) track("daily_share", { correct, score: summary.score });
        ui.toast(t(ok ? "results.copied" : "results.copyFailed"));
      };
    } else {
      shareEl.hidden = true;
      shareHead.hidden = true;
      shareBtn.hidden = true;
    }

    $("results-stats").innerHTML = stats;
    ui.showScreen("results");
    // Wordle shows the stats the moment the puzzle ends; that is the loop.
    if (isDaily) setTimeout(() => openStats(correct), 650);
  }

  // ---- statistics ----
  // One series (how often each score happened), so: one hue, no legend, bars
  // anchored at zero. The only second colour marks the run you just finished,
  // and that row is also bolded so the highlight is never colour alone.
  const statsModal = $("stats-modal");
  function renderStats(highlight = null) {
    const st = dailyStats(DAILY_N);
    $("stats-tiles").innerHTML = [
      [st.played, t("stats.played")],
      [st.withDistribution ? st.perfectPct + "%" : "-", t("stats.perfect")],
      [st.streak, t("stats.streak")],
      [st.maxStreak, t("stats.maxStreak")],
    ].map(([v, k]) => `<div class="stat-tile"><b>${v}</b><span>${k}</span></div>`).join("");

    const dist = $("stats-dist");
    if (!st.withDistribution) {
      dist.innerHTML = `<p class="stats-note">${t("stats.empty")}</p>`;
      return;
    }
    const peak = Math.max(...st.dist, 1);
    dist.innerHTML = st.dist.map((n, i) => {
      const on = highlight === i;
      // zero-count rows keep a sliver so the row still reads as a row
      const pct = n ? Math.max(8, Math.round((n / peak) * 100)) : 0;
      return `<div class="dist-row${on ? " on" : ""}">
        <span class="dist-key">${i}</span>
        <span class="dist-track"><span class="dist-bar" style="width:${pct}%"></span></span>
        <span class="dist-val">${n}</span>
      </div>`;
    }).join("");
    dist.setAttribute("aria-label", `${t("stats.distribution")}: ` +
      st.dist.map((n, i) => `${i}: ${n}`).join(", "));
  }
  function openStats(highlight = null) {
    renderStats(highlight);
    statsModal.hidden = false;
    $("stats-close").focus();
  }
  const closeStats = () => { statsModal.hidden = true; };
  $("stats-toggle").onclick = () => openStats();
  $("stats-close").onclick = closeStats;
  statsModal.addEventListener("click", (e) => { if (e.target === statsModal) closeStats(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeStats(); });

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
  // Endless carries the same run on rather than restarting it: same score, same
  // lives, same countries already asked.
  $("endless-btn").onclick = () => {
    if (!engine || !engine.resumeEndless()) return;
    track("endless_start", { mode: currentMode, category: currentCategory });
    ui.showScreen("game");
  };
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
