// Game engine: runs a sequence of questions, tracks score/lives/combo, applies
// hints, grades answers, and asks the `view` to present clues + reveals.
import { accepts, norm } from "./match.js";
import { countryAtPoint } from "./data.js";
import { hintPlan } from "./hints.js";
import {
  namePoints,
  locatePoints,
  distanceKm,
  comboMultiplier,
} from "./scoring.js";
import { sfx } from "./audio.js";

const LOCATE_GOOD = 500; // points needed for a locate to keep the combo

export class Engine {
  constructor(view, config) {
    this.view = view;
    this.cfg = config; // {mode, lives, total, next(index)|queue, onEnd}
    this.score = 0;
    this.lives = config.lives;
    this.streak = 0;
    this.index = 0;
    this.results = [];
    this.done = false;

    view.onAnswer((v) => this._answerName(v));
    view.onLocate((p) => this._answerLocate(p));
    view.onHint(() => this._revealHint());
    view.onSkip(() => this._skip());
  }

  start() {
    sfx.start();
    this._serve();
  }
  stop() {
    this.done = true;
    this._stopTimer();
  }

  _serve() {
    if (this.done) return;
    const q =
      this.cfg.queue !== undefined ? this.cfg.queue[this.index] : this.cfg.next(this.index);
    this.q = q;
    this.qStart = performance.now();
    this.hintsUsed = 0;
    this.wrongs = 0;
    this.plan = hintPlan(q);
    this.planPos = 0;
    this.guessNorms = new Set();
    this.guessList = [];

    this.view.updateHud(this._hud());
    this.view.showClue(q);
    this.view.setGuesses([], this.guessNorms);
    this.view.setHintCount(this.plan.length);
    this.view.setPoints(q.type === "locate" ? null : namePoints(0, 0));
    this.view.enableAnswer(q);
    this._startTimer();
  }

  _hud() {
    return {
      score: this.score,
      lives: this.lives,
      streak: this.streak,
      multiplier: comboMultiplier(this.streak),
      index: this.index,
      total: this.cfg.total,
      mode: this.cfg.mode,
    };
  }

  // count-up stopwatch (not a countdown)
  _startTimer() {
    this._stopTimer();
    this.view.setStopwatch(0);
    this._timer = setInterval(() => {
      this.view.setStopwatch(performance.now() - this.qStart);
    }, 100);
  }
  _stopTimer() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  _revealHint() {
    if (this.planPos >= this.plan.length) return;
    const hint = this.plan[this.planPos++];
    this.hintsUsed++;
    sfx.hint();
    this.view.applyHint(this.q, hint);
    this.view.setHintCount(this.plan.length - this.planPos);
    if (this.q.type !== "locate")
      this.view.setPoints(namePoints(this.hintsUsed, this.wrongs));
  }

  _answerName(value) {
    if (this.done || this.q.type === "locate") return;
    const n = norm(value);
    if (this.guessNorms.has(n)) return; // already tried
    if (accepts(value, this.q.country, this.q.answerKind)) {
      this._grade(true, namePoints(this.hintsUsed, this.wrongs));
    } else {
      this.wrongs++;
      this.lives -= 1;
      this.streak = 0;
      this.guessNorms.add(n);
      this.guessList.push(value);
      sfx.wrong();
      this.view.flashWrong(value);
      this.view.setGuesses(this.guessList, this.guessNorms);
      this.view.setPoints(namePoints(this.hintsUsed, this.wrongs));
      this.view.updateHud(this._hud());
      if (this.lives <= 0) this._grade(false, 0, { gameOver: true });
      else this.view.refocusAnswer();
    }
  }

  _answerLocate(point) {
    if (this.done || this.q.type !== "locate") return;
    const km = distanceKm(point, this.q.country.ll);

    // Tapping inside the country IS finding it. Grading on distance to the
    // centroid alone marked 24 of the 194 countries wrong for a tap well inside
    // their own borders: Indonesia reaches 2783km from its centroid, Canada
    // 2759km, Brazil 2470km, all against a ~1040km pass mark. Spending hints
    // tightened that radius further, so the bigger the country the more likely
    // the game was to reject a correct answer.
    const tapped = countryAtPoint(point);
    const onTarget = !!tapped && tapped.ccn3 === this.q.country.ccn3;

    const raw = locatePoints(km, this.hintsUsed);
    // a hit still scores by how central it was, but never drops below a pass
    const pts = onTarget ? Math.max(raw, LOCATE_GOOD) : raw;
    const good = onTarget || pts >= LOCATE_GOOD;

    // A locate resolves in one tap, so _grade never hears about the failure the
    // way a typed guess does. Without this, missing the globe by half a world
    // was the only wrong answer in the game that made no sound at all.
    if (!good) sfx.wrong();
    // `tapped` is passed on so the reveal does not repeat this point-in-polygon
    // scan over every country
    this._grade(good, pts, { distanceKm: km, guess: point, locate: true, tapped });
  }

  _skip() {
    if (this.done) return;
    this.streak = 0;
    if (this.cfg.mode === "arcade") this.lives -= 1;
    sfx.wrong();
    this._grade(false, 0, { skipped: true, gameOver: this.lives <= 0 });
  }

  async _grade(correct, points, extra = {}) {
    this._stopTimer();
    this.view.disableAnswer();
    const solveMs = performance.now() - this.qStart;

    const mult = comboMultiplier(this.streak);
    let awarded = 0;
    if (correct) {
      awarded = points * (mult > 1 ? mult : 1);
      this.score += awarded;
      this.streak += 1;
      sfx.correct();
      if (comboMultiplier(this.streak) > 1) sfx.combo(this.streak);
    }

    this.results.push({
      type: this.q.type,
      country: this.q.country.name,
      correct,
      points: awarded,
      basePoints: points,
      hints: this.hintsUsed,
      timeMs: solveMs,
      distanceKm: extra.distanceKm ?? null,
      skipped: !!extra.skipped,
    });

    this.view.updateHud(this._hud());
    await this.view.reveal(this.q, {
      correct,
      points: awarded,
      multiplier: mult,
      timeMs: solveMs,
      distanceKm: extra.distanceKm ?? null,
      guess: extra.guess ?? null,
      tapped: extra.tapped ?? null,
      skipped: !!extra.skipped,
    });
    if (this.done) return;

    this.index += 1;
    const finished =
      extra.gameOver ||
      (this.cfg.queue !== undefined && this.index >= this.cfg.queue.length);
    if (finished) this._end(!!extra.gameOver);
    else this._serve();
  }


  _end(gameOver) {
    this.done = true;
    this._stopTimer();
    if (gameOver) sfx.gameover();
    this.cfg.onEnd({
      mode: this.cfg.mode,
      score: this.score,
      results: this.results,
      gameOver,
    });
  }
}

