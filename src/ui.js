// UI controller: owns the DOM, the globe and the autocomplete, and implements the
// `view` interface the engine drives.
import { Globe, cssVar } from "./globe.js";
import { Autocomplete } from "./input.js";
import { drawSilhouette } from "./silhouette.js";
import { featureFor, countryAtPoint, regionArea } from "./data.js";
import { formatTime } from "./scoring.js";
import { t, countryName, capitalName } from "./i18n.js";
import { iconEl } from "./icons.js";

const $ = (id) => document.getElementById(id);

// Coarse pointer = an on-screen keyboard, which costs a viewport resize every
// time it opens. Used to decide when NOT to grab focus.
const isTouch = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(pointer: coarse)").matches;

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
    hudMode: $("hud-mode"),
    hudSub: $("hud-sub"),
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
    answerRow: $("answer-row"),
    globeLabel: $("globe-label"),
    locateBadge: $("locate-badge"),
    reveal: $("reveal"),
    revealMark: $("reveal-mark"),
    revealText: $("reveal-text"),
    revealPoints: $("reveal-points"),
    revealContinue: $("reveal-continue"),
    toast: $("toast"),
    zoomIn: $("zoom-in"),
    zoomOut: $("zoom-out"),
    zoomReset: $("zoom-reset"),
    lightbox: $("lightbox"),
    lightboxTitle: $("lightbox-title"),
    lightboxBody: $("lightbox-body"),
    lightboxClose: $("lightbox-close"),
  };

  const globe = new Globe($("globe"), {
    onPick: (p) => cbs.locate && cbs.locate(p),
    // the clue card sits over the globe, so step it aside as soon as the player
    // starts reading the globe underneath it
    onInteract: () => compactClue(true),
    onZoom: (z) => syncZoomControls(z),
  });
  globe.start();

  const ac = new Autocomplete($("answer"), $("suggestions"), {
    onSubmit: (v) => cbs.answer && cbs.answer(v),
  });

  const cbs = {};
  els.btnHint.addEventListener("click", () => cbs.hint && cbs.hint());
  els.btnSkip.addEventListener("click", () => cbs.skip && cbs.skip());
  // coalesce resize bursts (keyboard open, URL bar collapse, rotation) into one
  // measurement per frame
  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => globe.resize());
  });

  // ---------- globe zoom controls ----------
  function syncZoomControls(z) {
    els.zoomIn.disabled = z >= 7.99;
    els.zoomOut.disabled = z <= 1.001;
    els.zoomReset.hidden = z <= 1.001;
  }
  // using the controls counts as reading the globe, so the clue steps aside too
  els.zoomIn.addEventListener("click", () => { compactClue(true); globe.zoomBy(1.4); });
  els.zoomOut.addEventListener("click", () => { compactClue(true); globe.zoomBy(1 / 1.4); });
  els.zoomReset.addEventListener("click", () => { compactClue(true); globe.resetZoom(); });
  syncZoomControls(globe.getZoom());

  function showScreen(name) {
    for (const [k, el] of Object.entries(els.screens)) el.classList.toggle("active", k === name);
    if (name === "game") requestAnimationFrame(() => globe.resize());
  }

  function placeLabel(point, text, ok = false) {
    const { x, y, visible } = globe.projectPoint(point);
    // zoomed in, a point can face the viewer but still fall outside the canvas
    const inCanvas =
      x >= 0 && y >= 0 && x <= globe.canvas.clientWidth && y <= globe.canvas.clientHeight;
    if (!visible || !inCanvas) {
      els.globeLabel.hidden = true;
      return;
    }
    els.globeLabel.textContent = text;
    els.globeLabel.classList.toggle("ok", !!ok);
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
    // fill is overridden by CSS so the shape re-tints with the theme; the token
    // here is only the pre-paint value
    drawSilhouette(els.shape, country, { color: cssVar("--accent", "#bb8588") });
    setHidden(els.shape, false);
    els.flag.hidden = true;
    els.clueMedia.hidden = false;
  }
  function hideMedia() {
    els.clueMedia.hidden = true;
    els.flag.hidden = true;
    setHidden(els.shape, true);
    compactClue(false);
  }
  function compactClue(on) {
    els.clueMedia.classList.toggle("compact", !!on);
  }

  // ---------- clue lightbox ----------
  // A full-size look at a flag or a shape. Purely a view: the question stays
  // exactly as it was, and closing drops the player straight back into it.
  let lastLightboxTrigger = null;
  let currentCountry = null; // the country being asked about right now

  function openLightbox(title, build) {
    lastLightboxTrigger = document.activeElement;
    els.lightboxTitle.textContent = title;
    els.lightboxBody.replaceChildren(build());
    els.lightbox.hidden = false;
    els.lightboxClose.focus();
  }

  function closeLightbox() {
    if (els.lightbox.hidden) return;
    els.lightbox.hidden = true;
    els.lightboxBody.replaceChildren();
    // hand focus back so the keyboard player does not lose their place
    if (lastLightboxTrigger && document.contains(lastLightboxTrigger)) {
      lastLightboxTrigger.focus();
    } else {
      ac.refocus();
    }
    lastLightboxTrigger = null;
  }

  function flagNode(country) {
    const img = document.createElement("img");
    setFlagSrc(img, country.cca2);
    img.alt = t("clue.flagAlt");
    return img;
  }
  function shapeNode(country) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    drawSilhouette(svg, country, { size: 420 });
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", t("clue.shapeAlt"));
    return svg;
  }

  els.lightboxClose.addEventListener("click", closeLightbox);
  els.lightbox.addEventListener("click", (e) => {
    if (e.target === els.lightbox) closeLightbox(); // click the backdrop to dismiss
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
  });

  // the main clue card opens itself full size, in whichever state it is in
  els.clueMedia.addEventListener("click", () => {
    if (!currentCountry) return;
    if (!els.flag.hidden) openLightbox(t("clue.flag"), () => flagNode(currentCountry));
    else openLightbox(t("clue.shape"), () => shapeNode(currentCountry));
  });

  const view = {
    onAnswer: (cb) => (cbs.answer = cb),
    onLocate: (cb) => (cbs.locate = cb),
    onHint: (cb) => (cbs.hint = cb),
    onSkip: (cb) => (cbs.skip = cb),

    showClue(q) {
      els.reveal.hidden = true;
      els.globeLabel.hidden = true;
      els.hintLog.innerHTML = "";
      closeLightbox();
      hideMedia();
      globe.clearAll();
      globe.resetZoom(); // every question starts from the whole globe
      globe.disablePick();
      els.locateBadge.hidden = true;
      this.setPrompt(q.prompt);
      const c = q.country;
      currentCountry = c;

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
          globe.highlight(c, cssVar("--globe-capital", "#d6ce93"));
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
      // hide, not just empty: an empty .pill still paints as a stray blob
      els.hintCount.hidden = n <= 0;
      els.btnHint.disabled = n <= 0;
    },

    // Hints render in their own tray — they never replace the main clue
    // (the shape / flag / prompt stays exactly where it is).
    applyHint(q, hint) {
      const c = q.country;
      // media hints are buttons: the thumbnail is too small to read, so tapping
      // it opens the same full-size view as the main clue card
      const media = hint.kind === "flag" || hint.kind === "shape";
      const chip = document.createElement(media ? "button" : "span");
      chip.className = "hint";

      if (media) {
        chip.type = "button";
        chip.classList.add("hint-media");
      }

      if (hint.kind === "flag") {
        const img = document.createElement("img");
        img.className = "hint-flag";
        setFlagSrc(img, c.cca2);
        img.alt = "";
        chip.appendChild(img);
        chip.append(" " + t("clue.flag"));
        chip.setAttribute("aria-label", t("clue.flagHint"));
        chip.addEventListener("click", () => openLightbox(t("clue.flag"), () => flagNode(c)));
      } else if (hint.kind === "shape") {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "hint-shape");
        svg.setAttribute("viewBox", "0 0 80 80");
        drawSilhouette(svg, c, { size: 80 });
        chip.appendChild(svg);
        chip.append(" " + t("clue.shape"));
        chip.setAttribute("aria-label", t("clue.shapeHint"));
        chip.addEventListener("click", () => openLightbox(t("clue.shape"), () => shapeNode(c)));
      } else {
        if (hint.kind === "length") chip.classList.add("mono");
        chip.textContent = hint.label;
        if (hint.kind === "position") {
          globe.setIdle(false);
          globe.rotateTo(c.ll, 600).then(() => {
            globe.highlight(c);
            globe.setMarker(c.ll);
          });
        } else if (hint.kind === "region") {
          // point the globe at that region/subregion and blob the general area
          // (without revealing the exact country)
          const area = regionArea(hint.scope, c[hint.scope]);
          if (area) {
            globe.setIdle(false);
            globe.rotateTo(area.point, 600);
            globe.setBlob(area.point, area.radiusDeg);
          }
        }
      }
      els.hintLog.appendChild(chip);
    },

    enableAnswer(q) {
      els.btnSkip.disabled = false;
      // The answer field has no role in a locate: the answer is a tap on the
      // globe. Hiding it also hands its height back to the stage, so the globe
      // gets bigger exactly when the player needs to aim.
      const typing = q.type !== "locate";
      if (els.answerRow.hidden === typing) {
        els.answerRow.hidden = !typing;
        // the stage just changed height, and the canvas is sized from it
        requestAnimationFrame(() => globe.resize());
      }
      if (q.type === "locate") {
        ac.disable();
        els.locateBadge.hidden = false;
        globe.enablePick();
        globe.setIdle(false);
      } else {
        ac.setKind(q.answerKind);
        ac.enable(t(q.answerKind === "capital" ? "game.placeholderCapital" : "game.placeholderCountry"));
        globe.disablePick();
        // Only steal focus where a keyboard is already on screen. On touch,
        // autofocus throws the on-screen keyboard up on every single question,
        // which resizes the viewport twice per turn and buries the globe.
        if (!isTouch()) setTimeout(() => ac.focus(), 60);
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
      // the timer icon is a sibling in the markup, so this stays a pure text write
      els.stopwatch.textContent = formatTime(ms);
    },
    setPoints(pts) {
      if (pts == null) {
        els.pointsChip.textContent = "";
        els.pointsChip.hidden = true;
      } else {
        els.pointsChip.hidden = false;
        els.pointsChip.textContent = pts.toLocaleString() + " " + t("game.points");
      }
    },
    setGuesses(list, normSet) {
      ac.setExclude(normSet || new Set());
      els.guesses.replaceChildren(
        ...(list || []).map((v) => {
          // textContent on the name (not innerHTML): guesses are raw user input,
          // never trust them.
          const span = document.createElement("span");
          span.className = "guess";
          const name = document.createElement("span");
          name.className = "guess-name";
          name.textContent = v;
          span.append(iconEl("close"), name);
          return span;
        })
      );
    },
    refocusAnswer() {
      ac.refocus();
    },

    updateHud(h) {
      els.score.textContent = h.score.toLocaleString();

      // Mode on top, then what narrows it: the category, plus the difficulty
      // only where the player actually chose one (arcade). Daily is always the
      // same shape and World Cup has no difficulty, so neither shows one.
      els.hudMode.textContent = t(
        h.mode === "daily" ? "menu.daily" : h.mode === "worldcup" ? "menu.worldcup" : "menu.arcade"
      );
      const sub = [];
      if (h.category) sub.push(t(`cat.${h.category}`));
      if (h.mode === "arcade" && h.difficulty) sub.push(t(`diff.${h.difficulty}`));
      els.hudSub.textContent = sub.join(" · ");
      // Branch on the rules, not the mode: easy arcade has no lives but does
      // have a length, so it wants the daily's progress counter, and showing it
      // three empty life diamonds was just confusing.
      const hasLives = h.lives != null;
      const hasLength = h.total != null;
      if (hasLives) {
        const total = 3;
        let s = "";
        // plain glyphs (not emoji) so the theme's --accent/ink colors apply
        for (let i = 0; i < total; i++)
          s += i < h.lives ? "◆" : `<span class="dead">◇</span>`;
        els.lives.innerHTML = s;
      }
      els.lives.hidden = !hasLives;
      // Endless has no denominator, but "see how far you can go" is only a
      // challenge if the player can see how far they have got.
      els.progress.hidden = !hasLength && !h.endless;
      if (hasLength) els.progress.textContent = `${Math.min(h.index + 1, h.total)} / ${h.total}`;
      else if (h.endless) els.progress.textContent = `∞ ${h.index + 1}`;
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
        closeLightbox();
        hideMedia();
        els.locateBadge.hidden = true;
        globe.setIdle(false);
        globe.resetZoom(); // frame the whole answer, not whatever the player zoomed into
        if (q.type === "locate") globe.clearBlob(); // drop any leftover hint area
        // which country did the player actually tap? (null = open ocean)
        // resolved by the engine when it graded the tap; no second scan here
        const tapped = q.type === "locate" && res.guess && !res.correct ? res.tapped : null;
        // on a miss, frame the midpoint so BOTH the answer and the tap are visible
        const focus =
          q.type === "locate" && res.guess && !res.correct
            ? d3.geoInterpolate(res.guess, c.ll)(0.5)
            : c.ll;
        // answer = the rose accent; the player's tap = sage. Both are palette
        // colours, so the reveal never introduces an off-palette hue.
        const tapColor = cssVar("--globe-tap", "#7d7d5c");
        const tapPin = cssVar("--globe-tap-pin", "#d6ce93");
        globe.rotateTo(focus, 700).then(() => {
          // green when you got it, accent when you did not: the globe carries the
          // same right/wrong signal as the banner
          globe.highlight(c, res.correct ? cssVar("--globe-correct", "#8fae62") : null);
          const markers = [{
            point: c.cap,
            color: res.correct ? cssVar("--globe-correct", "#8fae62") : cssVar("--globe-marker", "#9c6a6d"),
          }];
          if (q.type === "locate" && res.guess && !res.correct) {
            if (tapped) globe.highlightSecondary(tapped, tapColor); // where you tapped
            globe.setArc(res.guess, c.ll, cssVar("--globe-arc", "#6b5548")); // line from tap to answer
            markers.push({ point: res.guess, color: tapPin });
          }
          globe.setMarkers(markers);
          placeLabel(c.ll, `${countryName(c)} · ${capitalName(c)}`, res.correct);
        });

        const answer = q.answerKind === "capital" ? capitalName(c) : countryName(c);
        els.reveal.className = "reveal " + (res.correct ? "ok" : "bad");
        els.revealMark.replaceChildren(iconEl(res.correct ? "check" : "close"));
        if (q.type === "locate") {
          els.revealText.innerHTML = res.correct
            ? `<b>${countryName(c)}</b>`
            : t("reveal.tapped", {
                country: countryName(c),
                tapped: tapped ? countryName(tapped) : t("reveal.ocean"),
              });
        } else if (res.correct) {
          els.revealText.innerHTML = `<b>${answer}</b>`;
        } else {
          // on a miss, spell out what it was (with its country for capitals)
          els.revealText.innerHTML =
            q.answerKind === "capital"
              ? t("reveal.wasCapital", { answer, country: countryName(c) })
              : t("reveal.was", { answer });
        }

        const ptsEl = els.revealPoints;
        const tm = res.timeMs != null ? formatTime(res.timeMs) : "";
        // at most one middle dot per line: distance keeps the separator, time reads "in 4.2s"
        if (res.points > 0) {
          const dist = q.type === "locate" && res.distanceKm != null
            ? `${t("reveal.away", { km: Math.round(res.distanceKm).toLocaleString() })} · ` : "";
          ptsEl.textContent = `${dist}+${res.points.toLocaleString()}${res.multiplier > 1 ? " (x" + res.multiplier + ")" : ""}${tm ? " " + t("reveal.in", { time: tm }) : ""}`;
          ptsEl.className = "reveal-points plus";
        } else {
          const dist = q.type === "locate" && res.distanceKm != null
            ? t("reveal.away", { km: Math.round(res.distanceKm).toLocaleString() }) : "";
          const lead = dist || (res.skipped ? t("reveal.skipped") : "");
          ptsEl.textContent = lead && tm ? `${lead} ${t("reveal.in", { time: tm })}` : lead || tm || "";
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
