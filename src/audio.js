// WebAudio SFX engine — fully synthesized (no audio files, works offline).
// A small master bus (compressor + generated reverb) plus layered, envelope-
// shaped voices give the game punchy, musical feedback. Mutable via toggle().

let ctx = null;
let master = null; // dry sum -> compressor -> destination
let reverb = null; // wet send (convolver)
let muted = localStorage.getItem("aa_muted") === "1";

// ---- graph setup (lazy; created on first sound after a user gesture) ----
function ac() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  ctx = new (window.AudioContext || window.webkitAudioContext)();

  // master bus: everything -> masterGain -> soft compressor -> speakers
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 24;
  comp.ratio.value = 3;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  masterGain.connect(comp).connect(ctx.destination);
  master = masterGain;

  // a short algorithmic reverb (decaying-noise impulse) on a parallel send
  const conv = ctx.createConvolver();
  conv.buffer = impulse(1.1, 2.6);
  const wet = ctx.createGain();
  wet.gain.value = 1;
  conv.connect(wet).connect(masterGain);
  reverb = conv;

  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// generate a decaying stereo noise impulse response for the convolver reverb
function impulse(seconds, decay) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

const now = () => ctx.currentTime;

// semitone offset from A4 (440Hz) -> frequency
const note = (semis) => 440 * Math.pow(2, semis / 12);

// one enveloped voice: layered detuned oscillators through an optional filter,
// with ADSR-ish gain (linear attack avoids clicks, exponential release is smooth)
function voice(opts) {
  if (muted) return;
  try {
    const c = ac();
    const {
      freq,
      dur = 0.2,
      type = "triangle",
      gain = 0.2,
      attack = 0.008,
      slideTo = null,
      detune = 0, // cents of spread between the two layers
      filter = null, // { type, freq, q, sweepTo }
      reverbSend = 0.14,
      pan = 0,
      at = 0, // start offset in seconds
    } = opts;

    const t0 = now() + at;
    const t1 = t0 + dur;

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);

    let outNode = g;
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = filter.type || "lowpass";
      f.frequency.setValueAtTime(filter.freq, t0);
      if (filter.sweepTo)
        f.frequency.exponentialRampToValueAtTime(filter.sweepTo, t1);
      f.Q.value = filter.q ?? 0.7;
      g.connect(f);
      outNode = f;
    }

    // stereo placement + parallel reverb send
    const panner = c.createStereoPanner ? c.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = pan;
      outNode.connect(panner);
      panner.connect(master);
      if (reverbSend > 0) {
        const s = c.createGain();
        s.gain.value = reverbSend;
        panner.connect(s).connect(reverb);
      }
    } else {
      outNode.connect(master);
      if (reverbSend > 0) {
        const s = c.createGain();
        s.gain.value = reverbSend;
        outNode.connect(s).connect(reverb);
      }
    }

    // two slightly detuned layers for warmth/thickness
    const layers = detune ? [-detune / 2, detune / 2] : [0];
    for (const d of layers) {
      const o = c.createOscillator();
      o.type = type;
      o.detune.value = d;
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t1);
      o.connect(g);
      o.start(t0);
      o.stop(t1 + 0.03);
    }
  } catch (_) {}
}

// a filtered noise burst — used for soft percussion / "reveal" shimmer
function noise(opts) {
  if (muted) return;
  try {
    const c = ac();
    const {
      dur = 0.2,
      gain = 0.15,
      attack = 0.005,
      filter = { type: "bandpass", freq: 1200, q: 1, sweepTo: null },
      reverbSend = 0.12,
      at = 0,
    } = opts;
    const t0 = now() + at;
    const t1 = t0 + dur;

    const src = c.createBufferSource();
    const len = Math.floor(dur * c.sampleRate) + 1;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    src.buffer = buf;

    const f = c.createBiquadFilter();
    f.type = filter.type;
    f.frequency.setValueAtTime(filter.freq, t0);
    if (filter.sweepTo) f.frequency.exponentialRampToValueAtTime(filter.sweepTo, t1);
    f.Q.value = filter.q ?? 1;

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);

    src.connect(f).connect(g).connect(master);
    if (reverbSend > 0) {
      const s = c.createGain();
      s.gain.value = reverbSend;
      g.connect(s).connect(reverb);
    }
    src.start(t0);
    src.stop(t1 + 0.03);
  } catch (_) {}
}

// play a sequence of notes (semitone offsets) as a quick arpeggio
function arp(semis, { step = 0.075, ...rest }) {
  semis.forEach((s, i) => voice({ freq: note(s), at: i * step, ...rest }));
}

// major pentatonic ladder (in semitones from A) for pleasant combo climbs
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export const sfx = {
  // satisfying rising major triad "ding" with a bell-like sparkle on top
  correct() {
    arp([3, 7, 10], {
      dur: 0.34,
      type: "triangle",
      gain: 0.22,
      detune: 8,
      filter: { type: "lowpass", freq: 3200, q: 0.6 },
      reverbSend: 0.22,
      step: 0.07,
    });
    voice({
      freq: note(22),
      at: 0.14,
      dur: 0.5,
      type: "sine",
      gain: 0.12,
      reverbSend: 0.3,
    });
  },

  // gentle, non-punishing "womp" — soft descending tone + a little body thud
  wrong() {
    voice({
      freq: note(-2),
      slideTo: note(-14),
      dur: 0.34,
      type: "sawtooth",
      gain: 0.16,
      detune: 12,
      filter: { type: "lowpass", freq: 1400, sweepTo: 320, q: 1.2 },
      reverbSend: 0.1,
    });
    noise({
      dur: 0.14,
      gain: 0.08,
      filter: { type: "lowpass", freq: 500, q: 0.8 },
      reverbSend: 0.05,
    });
  },

  // brighter sparkle that climbs with the combo count (musical, capped)
  combo(n) {
    const base = PENTA[Math.min(n, PENTA.length - 1)];
    arp([base + 12, base + 16, base + 19], {
      dur: 0.24,
      type: "triangle",
      gain: 0.16,
      detune: 6,
      filter: { type: "highpass", freq: 500, q: 0.6 },
      reverbSend: 0.26,
      step: 0.055,
    });
  },

  // soft airy "reveal" shimmer for revealing a hint
  hint() {
    noise({
      dur: 0.32,
      gain: 0.09,
      filter: { type: "bandpass", freq: 700, sweepTo: 4200, q: 1.4 },
      reverbSend: 0.24,
    });
    voice({ freq: note(12), dur: 0.22, type: "sine", gain: 0.06, reverbSend: 0.2 });
  },

  // confident ascending fanfare when a run starts
  start() {
    arp([0, 4, 7, 12], {
      dur: 0.3,
      type: "triangle",
      gain: 0.18,
      detune: 7,
      filter: { type: "lowpass", freq: 3600, q: 0.5 },
      reverbSend: 0.22,
      step: 0.1,
    });
  },

  // warm descending motif on game over
  gameover() {
    arp([7, 3, 0, -5], {
      dur: 0.5,
      type: "triangle",
      gain: 0.18,
      detune: 10,
      filter: { type: "lowpass", freq: 2200, sweepTo: 700, q: 0.8 },
      reverbSend: 0.32,
      step: 0.16,
    });
  },

  // tiny UI tick (kept subtle)
  tick() {
    voice({ freq: note(24), dur: 0.04, type: "square", gain: 0.05, reverbSend: 0 });
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
