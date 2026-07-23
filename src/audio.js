// Tiny WebAudio SFX — synthesized, no asset files. Mutable via toggle().
let ctx = null;
let muted = localStorage.getItem("aa_muted") === "1";

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function blip(freq, dur, type = "sine", gain = 0.15, slideTo = null) {
  if (muted) return;
  try {
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  } catch (_) {}
}

export const sfx = {
  correct() {
    blip(660, 0.12, "triangle", 0.18);
    setTimeout(() => blip(990, 0.16, "triangle", 0.16), 90);
  },
  wrong() {
    blip(200, 0.25, "sawtooth", 0.14, 120);
  },
  tick() {
    blip(1200, 0.03, "square", 0.05);
  },
  combo(n) {
    blip(520 + n * 80, 0.14, "triangle", 0.16, 900 + n * 100);
  },
  hint() {
    blip(440, 0.1, "sine", 0.1);
  },
  start() {
    blip(440, 0.1, "triangle", 0.14);
    setTimeout(() => blip(660, 0.12, "triangle", 0.14), 100);
    setTimeout(() => blip(880, 0.16, "triangle", 0.14), 210);
  },
  gameover() {
    blip(400, 0.2, "sawtooth", 0.14, 200);
    setTimeout(() => blip(300, 0.3, "sawtooth", 0.14, 120), 160);
  },
};

export function toggleMute() {
  muted = !muted;
  localStorage.setItem("aa_muted", muted ? "1" : "0");
  return muted;
}
export function isMuted() {
  return muted;
}
