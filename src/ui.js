// UI controller: owns the DOM, the globe and the autocomplete, and implements the
// `view` interface the engine drives.
import { Globe } from "./globe.js";
import { Autocomplete } from "./input.js";
import { drawSilhouette } from "./silhouette.js";
import { featureFor } from "./data.js";
import { formatTime } from "./scoring.js";

const $ = (id) => document.getElementById(id);

function blobRadius(country) {
  const f = featureFor(country);
  if (!f) return 4;
  const [[w, s], [e, n]] = d3.geoBounds(f);
  const span = Math.max(Math.abs(e - w), Math.abs(n - s));
  return Math.max(3.5, Math.min(12, span / 3.5));
}

export function createUI() {
  const els = {
    screens: {
      menu: $("screen-menu"),
      arcade: $("screen-arcade"),
      game: $("screen-game"),
      results: $("screen-results"),
    },
    score: $("hud-score"),
    lives: $("hud-lives"),
    combo: $("hud-combo"),
    mult: $("hud-mult"),
    progress: $("hud-progress"),
    clueMedia: $("clue-media"),
    flag: $("clue-flag"),
    shape: $("clue-shape"),
    prompt: $("prompt"),
    hintLog: $("hint-log"),
    hintCount: $("hint-count"),
    btnHint: $("btn-hint"),
    btnSkip: $("btn-skip"),
    stopwatch: $("stopwatch"),
    pointsChip: $("points-chip"),
    guesses: $("guesses"),
    globeLabel: $("globe-label"),
    locateBadge: $("locate-badge"),
    reveal: $("reveal"),
    revealMark: $("reveal-mark"),
    revealText: $("reveal-text"),
    revealPoints: $("reveal-points"),
    revealContinue: $("reveal-continue"),
    toast: $("toast"),
  };

  const globe = new Globe($("globe"), {
    onPick: (p) => cbs.locate && cbs.locate(p),
  });
  globe.start();

  const ac = new Autocomplete($("answer"), $("suggestions"), {
    onSubmit: (v) => cbs.answer && cbs.answer(v),
  });

  const cbs = {};
  els.btnHint.addEventListener("click", () => cbs.hint && cbs.hint());
  els.btnSkip.addEventListener("click", () => cbs.skip && cbs.skip());
  window.addEventListener("resize", () => globe.resize());

  function showScreen(name) {
    for (const [k, el] of Object.entries(els.screens)) el.classList.toggle("active", k === name);
    if (name === "game") requestAnimationFrame(() => globe.resize());
  }

  function placeLabel(point, text) {
    const { x, y, visible } = globe.projectPoint(point);
    if (!visible) {
      els.globeLabel.hidden = true;
      return;
    }
    els.globeLabel.textContent = text;
    els.globeLabel.style.left = globe.canvas.offsetLeft + x + "px";
    els.globeLabel.style.top = globe.canvas.offsetTop + y + "px";
    els.globeLabel.hidden = false;
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (els.toast.hidden = true), 1400);
  }

  // SVGElement has no HTML `hidden` property, so toggle via attribute for the shape.
  const setHidden = (el, h) => (h ? el.setAttribute("hidden", "") : el.removeAttribute("hidden"));

  // Transparent 1x1 fallback so a missing flag SVG shows nothing rather than a
  // broken-image icon mid-game.
  const FLAG_FALLBACK =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
  function setFlagSrc(img, cca2) {
    img.onerror = () => {
      img.onerror = null;
      img.src = FLAG_FALLBACK;
    };
    img.src = `./assets/flags/${cca2}.svg`;
  }

  function showFlag(country) {
    setFlagSrc(els.flag, country.cca2);
    els.flag.hidden = false;
    setHidden(els.shape, true);
    els.clueMedia.hidden = false;
  }
  function showShape(country) {
    drawSilhouette(els.shape, country, { color: "#8a7bd8" });
    setHidden(els.shape, false);
    els.flag.hidden = true;
    els.clueMedia.hidden = false;
  }
  function hideMedia() {
    els.clueMedia.hidden = true;
    els.flag.hidden = true;
    setHidden(els.shape, true);
  }

  const view = {
    onAnswer: (cb) => (cbs.answer = cb),
    onLocate: (cb) => (cbs.locate = cb),
    onHint: (cb) => (cbs.hint = cb),
    onSkip: (cb) => (cbs.skip = cb),

    showClue(q) {
      els.reveal.hidden = true;
      els.globeLabel.hidden = true;
      els.hintLog.innerHTML = "";
      hideMedia();
      globe.clearAll();
      globe.disablePick();
      els.locateBadge.hidden = true;
      this.setPrompt(q.prompt);
      const c = q.country;

      if (q.type === "country") {
        if (q.clueMode === "flag") {
          showFlag(c);
          globe.setIdle(true);
        } else if (q.clueMode === "shape") {
          showShape(c);
          globe.setIdle(true);
        } else {
          globe.setIdle(false);
          globe.rotateTo(c.ll, 700).then(() => {
            globe.highlight(c);
            globe.setMarker(c.ll); // pin so even tiny countries are visible
          });
        }
      } else if (q.type === "capital") {
        globe.setIdle(false);
        globe.rotateTo(c.ll, 700).then(() => {
          globe.highlight(c, "#ffe0a3");
          globe.setBlob(c.cap, blobRadius(c));
        });
      } else {
        // locate — do NOT rotate to the answer
        globe.setIdle(false);
      }
    },

    setPrompt(text) {
      els.prompt.textContent = text;
    },

    setHintCount(n) {
      els.hintCount.textContent = n > 0 ? n : "";
      els.btnHint.disabled = n <= 0;
    },

    // Hints render in their own tray — they never replace the main clue
    // (the shape / flag / prompt stays exactly where it is).
    applyHint(q, hint) {
      const c = q.country;
      const chip = document.createElement("span");
      chip.className = "hint";

      if (hint.kind === "flag") {
        chip.classList.add("hint-media");
        const img = document.createElement("img");
        img.className = "hint-flag";
        setFlagSrc(img, c.cca2);
        img.alt = "flag";
        chip.appendChild(img);
        chip.append(" Flag");
      } else if (hint.kind === "shape") {
        chip.classList.add("hint-media");
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "hint-shape");
        svg.setAttribute("viewBox", "0 0 80 80");
        drawSilhouette(svg, c, { size: 80 });
        chip.appendChild(svg);
        chip.append(" Shape");
      } else {
        if (hint.kind === "length") chip.classList.add("mono");
        chip.textContent = hint.label;
        if (hint.kind === "position") {
          globe.setIdle(false);
          globe.rotateTo(c.ll, 600).then(() => {
            globe.highlight(c);
            globe.setMarker(c.ll);
          });
        }
      }
      els.hintLog.appendChild(chip);
    },

    enableAnswer(q) {
      els.btnSkip.disabled = false;
      if (q.type === "locate") {
        ac.disable();
        els.locateBadge.hidden = false;
        globe.enablePick();
        globe.setIdle(false);
      } else {
        ac.setKind(q.answerKind);
        ac.enable(q.answerKind === "capital" ? "Name the capital…" : "Name the country…");
        globe.disablePick();
        setTimeout(() => ac.focus(), 60);
      }
    },

    disableAnswer() {
      ac.disable();
      globe.disablePick();
      els.locateBadge.hidden = true;
      els.btnHint.disabled = true;
      els.btnSkip.disabled = true;
    },

    flashWrong(value) {
      els.prompt.animate(
        [{ transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }],
        { duration: 220 }
      );
    },

    setStopwatch(ms) {
      els.stopwatch.textContent = "⏱ " + formatTime(ms);
    },
    setPoints(pts) {
      if (pts == null) {
        els.pointsChip.textContent = "";
        els.pointsChip.hidden = true;
      } else {
        els.pointsChip.hidden = false;
        els.pointsChip.textContent = pts.toLocaleString() + " pts";
      }
    },
    setGuesses(list, normSet) {
      ac.setExclude(normSet || new Set());
      els.guesses.replaceChildren(
        ...(list || []).map((v) => {
          // textContent (not innerHTML): guesses are raw user input, never trust them.
          const span = document.createElement("span");
          span.className = "guess";
          span.textContent = "✗ " + v;
          return span;
        })
      );
    },
    refocusAnswer() {
      ac.refocus();
    },

    updateHud(h) {
      els.score.textContent = h.score.toLocaleString();
      if (h.mode === "arcade") {
        const total = 3;
        let s = "";
        // plain glyphs (not emoji) so the theme's --accent/ink colors apply
        for (let i = 0; i < total; i++)
          s += i < h.lives ? "◆" : `<span class="dead">◇</span>`;
        els.lives.innerHTML = s;
        els.lives.hidden = false;
        els.progress.hidden = true;
      } else {
        els.lives.hidden = true;
        els.progress.hidden = false;
        els.progress.textContent = `${Math.min(h.index + 1, h.total)} / ${h.total}`;
      }
      if (h.multiplier > 1) {
        els.mult.textContent = "x" + h.multiplier;
        els.combo.hidden = false;
      } else {
        els.combo.hidden = true;
      }
    },

    reveal(q, res) {
      return new Promise((resolve) => {
        const c = q.country;
        hideMedia();
        els.locateBadge.hidden = true;
        // fly the globe to the answer and label it so the player sees where it is
        globe.setIdle(false);
        globe.rotateTo(c.ll, 700).then(() => {
          globe.highlight(c, res.correct ? "#9be3b4" : "#ffb3bf");
          const markers = [{ point: c.cap, color: "#ff3d71" }];
          if (res.guess) markers.push({ point: res.guess, color: "#4aa8ff" });
          globe.setMarkers(markers);
          placeLabel(c.ll, `${c.name} · ${c.capital}`);
        });

        const answer = q.answerKind === "capital" ? c.capital : c.name;
        els.reveal.className = "reveal " + (res.correct ? "ok" : "bad");
        els.revealMark.textContent = res.correct ? "✓" : "✕";
        if (q.type === "locate") {
          els.revealText.innerHTML = `<b>${c.name}</b>`;
        } else if (res.correct) {
          els.revealText.innerHTML = `<b>${answer}</b>`;
        } else {
          // on a miss, spell out what it was (with its country for capitals)
          els.revealText.innerHTML =
            q.answerKind === "capital"
              ? `It was <b>${answer}</b>, ${c.name}`
              : `It was <b>${answer}</b>`;
        }

        const ptsEl = els.revealPoints;
        const t = res.timeMs != null ? formatTime(res.timeMs) : "";
        if (res.points > 0) {
          const dist = q.type === "locate" && res.distanceKm != null
            ? `${Math.round(res.distanceKm).toLocaleString()} km · ` : "";
          ptsEl.textContent = `${dist}+${res.points.toLocaleString()}${res.multiplier > 1 ? " (x" + res.multiplier + ")" : ""}${t ? " · " + t : ""}`;
          ptsEl.className = "reveal-points plus";
        } else {
          const dist = q.type === "locate" && res.distanceKm != null
            ? `${Math.round(res.distanceKm).toLocaleString()} km away · ` : "";
          ptsEl.textContent = (dist || (res.skipped ? "skipped · " : "")) + (t || "");
          ptsEl.className = "reveal-points";
        }

        els.reveal.hidden = false;

        // always wait for the player to press Continue before the next question
        els.revealContinue.hidden = false;
        const go = () => {
          els.revealContinue.removeEventListener("click", go);
          resolve();
        };
        els.revealContinue.addEventListener("click", go);
      });
    },

    toast,
  };

  return { view, globe, ac, els, showScreen, toast };
}
