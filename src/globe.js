// Rotatable 3D globe (D3 orthographic, canvas). Smooth to spin: a light 110m base,
// simple lng/lat drag (trackpad-friendly) with inertia + keyboard control, a capped
// pixel ratio, and graticule dropped while moving. Detailed 50m features are only
// drawn for the (static) country highlight.
import { globeLand, globeBorders, featureFor } from "./data.js";

const cssVar = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Globe {
  constructor(canvas, { onPick } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onPick = onPick;
    this.projection = d3.geoOrthographic().precision(0.5).rotate([-10, -25, 0]);
    this.path = d3.geoPath(this.projection, this.ctx);
    this.land = globeLand();
    this.borders = globeBorders();
    this.graticule = d3.geoGraticule10();
    this.sphere = { type: "Sphere" };

    this.highlightFeature = null;
    this.highlightColor = null;
    this.markers = [];
    this.blob = null;
    this.pickEnabled = false;
    this.idle = true;
    this._moving = false; // drag or inertia in progress
    this._vel = [0, 0];
    this._lastInteract = 0;

    // Respect users who ask for less motion: no idle auto-spin, instant snaps.
    this.reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this._initInput();
    this._loop = this._loop.bind(this);
    this.resize();
  }

  colors() {
    return {
      ocean: cssVar("--globe-ocean", "#bfe3f5"),
      land: cssVar("--globe-land", "#ffe6b8"),
      border: cssVar("--globe-border", "#edc99a"),
      graticule: cssVar("--globe-graticule", "#ffffff"),
      highlight: cssVar("--globe-highlight", "#ff8fab"),
      marker: cssVar("--globe-marker", "#ff3d71"),
      blob: cssVar("--globe-blob", "#b794f6"),
      sphereLine: cssVar("--globe-sphere-line", "#9ccdec"),
      glow: cssVar("--globe-glow", "#00000018"),
    };
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return; // hidden / not laid out yet
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.projection
      .fitExtent(
        [
          [10, 10],
          [rect.width - 10, rect.height - 10],
        ],
        this.sphere
      )
      .translate([rect.width / 2, rect.height / 2]);
    this.render(true);
  }

  start() {
    if (this._raf) return;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }
  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }
  setIdle(v) {
    this.idle = v;
  }

  _loop(now) {
    const dt = Math.min(64, now - this._last);
    this._last = now;
    const r = this.projection.rotate();

    if (this._inertia) {
      r[0] += this._vel[0] * dt;
      r[1] = clamp(r[1] + this._vel[1] * dt, -90, 90);
      this.projection.rotate(r);
      this._vel[0] *= 0.94;
      this._vel[1] *= 0.94;
      this.render(false);
      if (Math.hypot(this._vel[0], this._vel[1]) < 0.002) {
        this._inertia = false;
        this._moving = false;
        this.render(true);
      }
    } else if (
      this.idle &&
      !this.reduceMotion &&
      !this._dragging &&
      !this._anim &&
      now - this._lastInteract > 2500
    ) {
      r[0] += dt * 0.0035; // gentle idle spin
      this.projection.rotate(r);
      this.render(false);
    }
    this._raf = requestAnimationFrame(this._loop);
  }

  render(hi = true) {
    const c = this.colors();
    const { ctx, path } = this;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.projection.scale() <= 0 || w < 20) return; // not sized yet
    ctx.clearRect(0, 0, w, h);

    // soft drop shadow / glow behind the disc
    const cx = w / 2,
      cy = h / 2,
      rad = this.projection.scale();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy + 6, rad, 0, 2 * Math.PI);
    ctx.fillStyle = c.glow;
    ctx.filter = "blur(10px)";
    ctx.fill();
    ctx.restore();

    // ocean
    ctx.beginPath();
    path(this.sphere);
    ctx.fillStyle = c.ocean;
    ctx.fill();

    // graticule (only when settled)
    if (hi) {
      ctx.beginPath();
      path(this.graticule);
      ctx.strokeStyle = c.graticule;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // land
    ctx.beginPath();
    path(this.land);
    ctx.fillStyle = c.land;
    ctx.fill();

    // borders
    ctx.beginPath();
    path(this.borders);
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // highlighted country (detailed 50m)
    if (this.highlightFeature) {
      ctx.beginPath();
      path(this.highlightFeature);
      ctx.fillStyle = this.highlightColor || c.highlight;
      ctx.globalAlpha = 0.95;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#00000022";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // region blob (capital hint)
    if (this.blob) {
      const circle = d3.geoCircle().center(this.blob.point).radius(this.blob.radiusDeg)();
      ctx.beginPath();
      path(circle);
      ctx.fillStyle = c.blob;
      ctx.globalAlpha = 0.4;
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = c.blob;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // sphere outline
    ctx.beginPath();
    path(this.sphere);
    ctx.strokeStyle = c.sphereLine;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // marker pins
    for (const m of this.markers) {
      if (!this._visible(m.point)) continue;
      const p = this.projection(m.point);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 7, 0, 2 * Math.PI);
      ctx.fillStyle = m.color || c.marker;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    }
  }

  _visible(point) {
    const r = this.projection.rotate();
    return d3.geoDistance(point, [-r[0], -r[1]]) < Math.PI / 2;
  }

  // ---------- input: drag (lng/lat) + inertia + keyboard ----------
  _initInput() {
    const cv = this.canvas;
    let down = false;
    let sx = 0,
      sy = 0,
      r0 = null,
      moved = 0,
      lastX = 0,
      lastY = 0,
      lastT = 0;

    const sens = () => 78 / this.projection.scale(); // deg per px

    const onDown = (e) => {
      down = true;
      this._dragging = true;
      this._inertia = false;
      this._vel = [0, 0];
      moved = 0;
      sx = lastX = e.clientX;
      sy = lastY = e.clientY;
      lastT = performance.now();
      r0 = this.projection.rotate();
      this._lastInteract = performance.now();
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    };
    const onMove = (e) => {
      if (!down) return;
      const k = sens();
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      this._vel = [((e.clientX - lastX) * k) / dt, ((e.clientY - lastY) * -k) / dt];
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = now;
      this.projection.rotate([r0[0] + dx * k, clamp(r0[1] - dy * k, -90, 90), 0]);
      this._moving = true;
      this.render(false);
    };
    const onUp = (e) => {
      if (!down) return;
      down = false;
      this._dragging = false;
      this._lastInteract = performance.now();
      try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
      // click-to-pick if it barely moved
      if (moved < 6) {
        if (this.pickEnabled && this.onPick) {
          const rect = cv.getBoundingClientRect();
          const p = this.projection.invert([e.clientX - rect.left, e.clientY - rect.top]);
          if (p && !isNaN(p[0])) this.onPick(p);
        }
        this._moving = false;
        this.render(true);
        return;
      }
      // inertia if flung
      if (Math.hypot(this._vel[0], this._vel[1]) > 0.01) {
        this._inertia = true;
        this._moving = true;
      } else {
        this._moving = false;
        this.render(true);
      }
    };

    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);

    // keyboard (when a control isn't focused)
    window.addEventListener("keydown", (e) => {
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const step = 12;
      const r = this.projection.rotate();
      if (e.key === "ArrowLeft") r[0] -= step;
      else if (e.key === "ArrowRight") r[0] += step;
      else if (e.key === "ArrowUp") r[1] = clamp(r[1] + step, -90, 90);
      else if (e.key === "ArrowDown") r[1] = clamp(r[1] - step, -90, 90);
      else return;
      e.preventDefault();
      this._lastInteract = performance.now();
      this.projection.rotate(r);
      this.render(true);
    });
  }

  enablePick() {
    this.pickEnabled = true;
    this.canvas.classList.add("pickable");
  }
  disablePick() {
    this.pickEnabled = false;
    this.canvas.classList.remove("pickable");
  }

  // ---------- state setters ----------
  highlight(country, color = null) {
    this.highlightFeature = featureFor(country);
    this.highlightColor = color;
    this.render(true);
  }
  clearHighlight() {
    this.highlightFeature = null;
    this.render(true);
  }
  setMarker(point, color = null) {
    this.markers = [{ point, color }];
    this.render(true);
  }
  setMarkers(list) {
    this.markers = list;
    this.render(true);
  }
  clearMarker() {
    this.markers = [];
    this.render(true);
  }
  setBlob(point, radiusDeg = 6) {
    this.blob = { point, radiusDeg };
    this.render(true);
  }
  clearBlob() {
    this.blob = null;
    this.render(true);
  }
  clearAll() {
    this.highlightFeature = null;
    this.markers = [];
    this.blob = null;
    this.render(true);
  }

  projectPoint(point) {
    const p = this.projection(point);
    return { x: p ? p[0] : 0, y: p ? p[1] : 0, visible: this._visible(point) };
  }

  // animate rotation so `point` faces the viewer
  rotateTo(point, ms = 850) {
    this._inertia = false;
    if (this.reduceMotion) ms = 0;
    return new Promise((resolve) => {
      const r0 = this.projection.rotate();
      let target = -point[0];
      // take the shortest way round in longitude
      while (target - r0[0] > 180) target -= 360;
      while (target - r0[0] < -180) target += 360;
      const r1 = [target, -point[1], 0];
      const iv = d3.interpolate(r0, r1);
      this._anim = true;
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        this.projection.rotate(iv(d3.easeCubicInOut(t)));
        this.render(t >= 1);
        if (t < 1) requestAnimationFrame(step);
        else {
          this._anim = false;
          this._lastInteract = performance.now();
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }
}
