// Rotatable 3D globe (D3 orthographic, canvas). Smooth to spin: a light 110m base,
// simple lng/lat drag (trackpad-friendly) with inertia + keyboard control, a capped
// pixel ratio, and graticule dropped while moving. Detailed 50m features are only
// drawn for the (static) country highlight.
import { globeLand, globeBorders, featureFor } from "./data.js";

export const cssVar = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Zoom range. 1 = the whole disc fits the canvas (the fitExtent scale); above
// that the sphere overflows the canvas and is clipped, which is what makes a
// tiny country large enough to tap.
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

// Breathing room left around the canvas inside the stage, in px. Small on
// purpose: the globe is the game, so it should claim nearly all the space the
// HUD and panel leave behind.
const GLOBE_INSET = 6;

// ---------------------------------------------------------------------------
// Terrain
//
// Earth's land cover does not follow latitude: the Sahara and the Ganges plain
// sit at the same latitude and look nothing alike, so any banded approximation
// is wrong everywhere it matters. The only honest source is real land cover
// data, so we sample Natural Earth II (public domain, vendored as a 1024x512
// equirectangular JPEG) per screen pixel and reproject it onto the sphere.
//
// The sampling grid is deliberately coarser than the canvas: land cover is soft,
// low-frequency colour, so a small buffer scaled up looks right, and the crisp
// detail comes from the vector coastline and borders drawn over the top.
// ---------------------------------------------------------------------------
const TEXTURE_URL = "./assets/geo/earth-texture.jpg";
// Sampling buffer side. Reprojection cost is quadratic in this, so it drops
// while the globe is moving and sharpens once it settles: a drag frame has to
// fit in 16ms, but the frame you actually stop and read can afford detail.
const TERRAIN_SAMPLES_MOVING = 150;
const TERRAIN_SAMPLES_SETTLED = 300;
const DEG = 180 / Math.PI;

export class Globe {
  constructor(canvas, { onPick, onInteract, onZoom } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onPick = onPick;
    this.onInteract = onInteract; // fired when the player starts moving the globe
    this.onZoom = onZoom;
    this._zoom = 1;
    this._baseScale = 0;
    this.projection = d3.geoOrthographic().precision(0.5).rotate([-10, -25, 0]);
    this.path = d3.geoPath(this.projection, this.ctx);
    this.land = globeLand();
    this.borders = globeBorders();
    this.graticule = d3.geoGraticule10();
    this.sphere = { type: "Sphere" };
    this._initTerrain();

    this.highlightFeature = null;
    this.highlightColor = null;
    this.highlight2 = null; // secondary highlight (e.g. the country the player tapped)
    this.highlight2Color = null;
    this.arc = null; // connecting line { geometry, color }
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

  // ---------- terrain texture ----------
  _initTerrain() {
    this._tex = null; // { px: Uint32Array, w, h } source land cover
    this._terrainCanvas = document.createElement("canvas");
    this._terrainCtx = this._terrainCanvas.getContext("2d", { willReadFrequently: true });
    this._terrainN = 0;

    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const cx = c.getContext("2d", { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      const data = cx.getImageData(0, 0, c.width, c.height);
      this._tex = { px: new Uint32Array(data.data.buffer), w: c.width, h: c.height };
      this.render(true); // first paint before this resolved, so repaint with terrain
    };
    // A missing texture is not fatal: render() falls back to a flat land fill.
    img.onerror = () => { this._tex = null; };
    img.src = TEXTURE_URL;
  }

  // Reallocate the sampling buffer when the resolution changes. Only happens on
  // drag start / drag end, so twice a gesture.
  _ensureTerrainBuffer(n) {
    if (this._terrainN === n) return;
    this._terrainN = n;
    this._terrainCanvas.width = this._terrainCanvas.height = n;
    this._terrainImage = this._terrainCtx.createImageData(n, n);
    this._terrainPixels = new Uint32Array(this._terrainImage.data.buffer);
  }

  // Reproject the land cover texture onto the sphere, one sample per buffer
  // pixel. Returns false if the texture is not ready yet.
  _paintTerrain(cx, cy, rad, N) {
    const tex = this._tex;
    if (!tex) return false;

    this._ensureTerrainBuffer(N);
    const out = this._terrainPixels;
    const [rl, rp] = this.projection.rotate();
    // Projection centre in geographic coords (d3 rotate is the negated centre).
    const lc = -rl / DEG,
      pc = -rp / DEG;
    const cosP = Math.cos(pc), sinP = Math.sin(pc);
    const cosL = Math.cos(lc), sinL = Math.sin(lc);
    // View basis in the geographic frame: forward is toward the viewer, right is
    // screen-right, up is screen-up. A screen point (X, Y, Z) is then just
    // Z*forward + X*right + Y*up, which we convert straight back to lng/lat.
    const fx = cosP * cosL, fy = cosP * sinL, fz = sinP;
    const rx = -sinL, ry = cosL;
    const ux = -sinP * cosL, uy = -sinP * sinL, uz = cosP;

    const tw = tex.w, th = tex.h, tpx = tex.px;
    // canvas px per buffer px, so buffer (i,j) maps back to the right screen point
    const step = (this.canvas.clientWidth || N) / N;

    let k = 0;
    for (let j = 0; j < N; j++) {
      const Y = (cy - (j + 0.5) * step) / rad;
      const Y2 = Y * Y;
      for (let i = 0; i < N; i++, k++) {
        const X = ((i + 0.5) * step - cx) / rad;
        const r2 = X * X + Y2;
        if (r2 >= 1) { out[k] = 0; continue; } // outside the disc
        const Z = Math.sqrt(1 - r2);

        const gx = Z * fx + X * rx + Y * ux;
        const gy = Z * fy + X * ry + Y * uy;
        const gz = Z * fz + Y * uz;

        // lng/lat -> texture pixel
        let tu = ((Math.atan2(gy, gx) * DEG + 180) / 360) * tw;
        let tv = ((90 - Math.asin(gz) * DEG) / 180) * th;
        tu = tu < 0 ? 0 : tu >= tw ? tw - 1 : tu | 0;
        tv = tv < 0 ? 0 : tv >= th ? th - 1 : tv | 0;
        out[k] = tpx[tv * tw + tu];
      }
    }
    this._terrainCtx.putImageData(this._terrainImage, 0, 0);
    return true;
  }

  colors() {
    return {
      oceanDeep: cssVar("--globe-ocean-deep", "#245a70"),
      oceanShallow: cssVar("--globe-ocean-shallow", "#3f8ba4"),
      landFallback: cssVar("--globe-land-fallback", "#6f8a53"),
      atmosphere: cssVar("--globe-atmosphere", "#86bcd4"),
      glare: cssVar("--globe-glare", "rgba(255,252,240,0.85)"),
      limbLight: cssVar("--globe-limb-light", "#cfe6f0"),
      limbDark: cssVar("--globe-limb-dark", "#17384a"),
      border: cssVar("--globe-border", "rgba(24,44,34,0.45)"),
      graticule: cssVar("--globe-graticule", "rgba(233,240,226,0.5)"),
      highlight: cssVar("--globe-highlight", "#bb8588"),
      marker: cssVar("--globe-marker", "#9c6a6d"),
      blob: cssVar("--globe-blob", "#d8a48f"),
      shadeLight: cssVar("--globe-shade-light", "rgba(255,255,255,0.3)"),
      shadeDark: cssVar("--globe-shade-dark", "rgba(0,0,0,0.3)"),
      ink: cssVar("--line", "#33231c"),
      paper: cssVar("--card", "#efebce"),
    };
  }

  resize() {
    // Size the canvas from the stage box rather than from viewport units, so the
    // globe always takes the largest square that actually fits between the HUD
    // and the panel. Viewport units cannot know how tall those are.
    const wrap = this.canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    if (wrap) {
      const box = wrap.getBoundingClientRect();
      const side = Math.floor(Math.min(box.width, box.height)) - GLOBE_INSET;
      if (side > 20) {
        // Nothing actually changed: bail before re-fitting and repainting.
        // Mobile fires resize for the keyboard and the URL bar constantly, and
        // re-running this every time is what makes the globe visibly jump.
        if (side === this._side && dpr === this._dpr) return;
        this._side = side;
        this._dpr = dpr;
        this.canvas.style.width = side + "px";
        this.canvas.style.height = side + "px";
      }
    }
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return; // hidden / not laid out yet
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
    // fitExtent overwrites the scale, so remember the fitted size and put the
    // player's zoom back on top of it
    this._baseScale = this.projection.scale();
    this._applyZoom();
    this.render(true);
  }

  // ---------- zoom ----------
  _applyZoom() {
    if (this._baseScale) this.projection.scale(this._baseScale * this._zoom);
  }

  getZoom() {
    return this._zoom;
  }

  setZoom(z) {
    const next = clamp(z, MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(next - this._zoom) < 1e-4) return;
    this._zoom = next;
    this._applyZoom();
    this._lastInteract = performance.now();
    this.render(!this._moving);
    if (this.onZoom) this.onZoom(this._zoom);
  }

  zoomBy(factor) {
    this.setZoom(this._zoom * factor);
  }

  resetZoom() {
    this.setZoom(1);
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

    const cx = w / 2,
      cy = h / 2,
      rad = this.projection.scale();
    // One fixed key light, upper left. Everything below (ocean sheen, terminator,
    // glare, lit limb) is derived from this single direction so the shading agrees.
    const sunX = cx - rad * 0.42,
      sunY = cy - rad * 0.46;

    // atmosphere: a soft halo hugging the limb, which is what actually sells the
    // sphere as a planet rather than a filled circle
    // Kept tight and low-alpha on purpose: a wide blue halo turns muddy against
    // the warm page behind it, since the two are near-complementary.
    // Kept on during drags: measured at ~0ms, and dropping it would pop the
    // halo off the moment the player grabs the globe.
    const halo = ctx.createRadialGradient(cx, cy, rad * 0.97, cx, cy, rad * 1.09);
    halo.addColorStop(0, c.atmosphere);
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, rad * 1.09, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();

    // ocean, shading from a sunlit shallow tone toward deep water at the limb
    ctx.beginPath();
    path(this.sphere);
    ctx.save();
    ctx.clip();
    const sea = ctx.createRadialGradient(sunX, sunY, rad * 0.04, cx, cy, rad * 1.3);
    sea.addColorStop(0, c.oceanShallow);
    sea.addColorStop(1, c.oceanDeep);
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // graticule (only when settled)
    if (hi) {
      ctx.beginPath();
      path(this.graticule);
      ctx.strokeStyle = c.graticule;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Land. One path serves both the base fill and the clip for the land cover,
    // so the expensive land geometry is only walked once per frame. Clipping to
    // the vector coastline is what keeps the shoreline crisp while the colour
    // underneath is sampled at low resolution.
    ctx.beginPath();
    path(this.land);
    ctx.fillStyle = c.landFallback;
    ctx.fill();
    ctx.save();
    ctx.clip();
    const samples = hi ? TERRAIN_SAMPLES_SETTLED : TERRAIN_SAMPLES_MOVING;
    if (this._paintTerrain(cx, cy, rad, samples)) {
      const side = this.canvas.clientWidth;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(this._terrainCanvas, 0, 0, side, side);
    }
    ctx.restore();

    // borders
    ctx.beginPath();
    path(this.borders);
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.9;
    ctx.stroke();

    // highlighted country (detailed 50m)
    if (this.highlightFeature) {
      ctx.beginPath();
      path(this.highlightFeature);
      ctx.fillStyle = this.highlightColor || c.highlight;
      ctx.globalAlpha = 0.95;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // secondary highlight — the country the player tapped in locate mode
    if (this.highlight2) {
      ctx.beginPath();
      path(this.highlight2);
      ctx.fillStyle = this.highlight2Color || cssVar("--globe-tap", "#7d7d5c");
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // connecting arc — from the player's tap to the correct place
    if (this.arc) {
      ctx.beginPath();
      path(this.arc.geometry);
      ctx.strokeStyle = this.arc.color || "#888";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
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

    // ---- lighting, all clipped to the sphere ----
    ctx.save();
    ctx.beginPath();
    path(this.sphere);
    ctx.clip();

    // terminator: lit toward the sun, falling into shadow at the far limb
    const shade = ctx.createRadialGradient(sunX, sunY, rad * 0.03, cx, cy, rad * 1.34);
    shade.addColorStop(0, c.shadeLight);
    shade.addColorStop(0.45, "rgba(0,0,0,0)");
    shade.addColorStop(1, c.shadeDark);
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);

    // specular sun glare: water is reflective, so the highlight sits over the
    // sub-solar point and blooms out from it
    // Tight and restrained: the land cover underneath is real colour worth
    // seeing, and a broad glare just washes the whole hemisphere out.
    const glare = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, rad * 0.42);
    glare.addColorStop(0, c.glare);
    glare.addColorStop(0.3, "rgba(255,255,255,0.06)");
    glare.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = glare;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.restore();

    // limb: bright where the atmosphere catches the sun, dark on the night side
    const limb = ctx.createLinearGradient(
      cx - rad * 0.8, cy - rad * 0.8,
      cx + rad * 0.8, cy + rad * 0.8
    );
    limb.addColorStop(0, c.limbLight);
    limb.addColorStop(1, c.limbDark);
    ctx.beginPath();
    path(this.sphere);
    ctx.strokeStyle = limb;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // marker pins
    for (const m of this.markers) {
      if (!this._visible(m.point)) continue;
      const p = this.projection(m.point);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 8, 0, 2 * Math.PI);
      ctx.fillStyle = m.color || c.marker;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = c.ink;
      ctx.stroke();
    }
  }

  _visible(point) {
    const r = this.projection.rotate();
    return d3.geoDistance(point, [-r[0], -r[1]]) < Math.PI / 2;
  }

  // ---------- input: drag (lng/lat) + pinch zoom + inertia + keyboard ----------
  _initInput() {
    const cv = this.canvas;
    // every active pointer, so a second finger can be recognised as a pinch
    const pointers = new Map();
    let pinch = null; // { dist, zoom } captured when the second finger landed
    let down = false;
    let sx = 0,
      sy = 0,
      r0 = null,
      moved = 0,
      lastX = 0,
      lastY = 0,
      lastT = 0;

    const sens = () => 78 / this.projection.scale(); // deg per px, so drag slows as you zoom in

    // distance between the first two active pointers
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;
    };

    const noteInteract = () => {
      this._lastInteract = performance.now();
      if (this.onInteract) this.onInteract();
    };

    const beginDrag = (x, y) => {
      down = true;
      this._dragging = true;
      this._inertia = false;
      this._vel = [0, 0];
      sx = lastX = x;
      sy = lastY = y;
      lastT = performance.now();
      r0 = this.projection.rotate();
    };

    const onDown = (e) => {
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      noteInteract();

      if (pointers.size === 2) {
        // a second finger turns the gesture into a pinch, not a drag
        down = false;
        this._dragging = false;
        this._inertia = false;
        moved = 999; // so lifting off never counts as a tap-to-pick
        pinch = { dist: spread(), zoom: this._zoom };
        return;
      }
      if (pointers.size > 2) return;
      moved = 0;
      beginDrag(e.clientX, e.clientY);
    };

    const onMove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);

      if (pinch) {
        const d = spread();
        if (d > 0 && pinch.dist > 0) this.setZoom(pinch.zoom * (d / pinch.dist));
        return;
      }
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
      const hadPointer = pointers.delete(e.pointerId);
      try { cv.releasePointerCapture(e.pointerId); } catch (_) {}

      if (pinch) {
        if (pointers.size >= 2) return; // a third finger lifted, pinch continues
        pinch = null;
        this._moving = false;
        this.render(true);
        // one finger still down: carry on as a drag from where it now is
        const rest = [...pointers.values()][0];
        if (rest) beginDrag(rest[0], rest[1]);
        return;
      }
      if (!hadPointer || !down) return;

      down = false;
      this._dragging = false;
      this._lastInteract = performance.now();
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

    // trackpad / mouse wheel zoom (passive:false so the page does not scroll)
    cv.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        noteInteract();
        this.zoomBy(Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false }
    );

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
      else if (e.key === "+" || e.key === "=") { e.preventDefault(); noteInteract(); return this.zoomBy(1.3); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); noteInteract(); return this.zoomBy(1 / 1.3); }
      else if (e.key === "0") { e.preventDefault(); noteInteract(); return this.resetZoom(); }
      else return;
      e.preventDefault();
      noteInteract();
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
  highlightSecondary(country, color = null) {
    this.highlight2 = featureFor(country);
    this.highlight2Color = color;
    this.render(true);
  }
  setArc(a, b, color = null) {
    const interp = d3.geoInterpolate(a, b);
    const coords = [];
    for (let t = 0; t <= 1; t += 0.02) coords.push(interp(t));
    coords.push(interp(1));
    this.arc = { geometry: { type: "LineString", coordinates: coords }, color };
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
    this.highlight2 = null;
    this.arc = null;
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
