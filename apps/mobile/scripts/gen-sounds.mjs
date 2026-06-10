/**
 * Offline renderer: bakes the web's Web-Audio synth into WAV files so the
 * mobile app can play the SAME sounds via expo-audio (which works in Expo Go),
 * with no native audio module. Run: node scripts/gen-sounds.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const MASTER = 0.5;

/** A render buffer of `dur` seconds. */
function makeBuf(dur) {
  return new Float32Array(Math.ceil(dur * SR));
}

function osc(type, freqAt, t) {
  const ph = 2 * Math.PI * freqAt * t;
  switch (type) {
    case "square": return Math.sin(ph) >= 0 ? 1 : -1;
    case "sawtooth": return 2 * ((freqAt * t) % 1) - 1;
    case "triangle": return 2 * Math.abs(2 * ((freqAt * t) % 1) - 1) - 1;
    default: return Math.sin(ph);
  }
}

// gain: 0.0001 -> peak over 0.01s, then exp decay to 0.0001 over d.
function env(t, d, peak) {
  if (t < 0 || t > d) return 0;
  if (t < 0.01) return peak * (t / 0.01);
  const k = Math.log(peak / 0.0001) / Math.max(0.001, d - 0.01);
  return Math.max(0, peak * Math.exp(-k * (t - 0.01)));
}

function tone(buf, n) {
  const { f, t: at, d, type = "sine", g = 0.6 } = n;
  const start = Math.floor(at * SR);
  const len = Math.ceil(d * SR);
  for (let i = 0; i < len; i++) {
    const idx = start + i;
    if (idx >= buf.length) break;
    const t = i / SR;
    buf[idx] += osc(type, f, t) * env(t, d, g) * MASTER;
  }
}

function slide(buf, from, to, at, d, type = "sine") {
  const start = Math.floor(at * SR);
  const len = Math.ceil(d * SR);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const idx = start + i;
    if (idx >= buf.length) break;
    const t = i / SR;
    // exponential frequency sweep
    const freq = from * Math.pow(to / from, t / d);
    phase += (2 * Math.PI * freq) / SR;
    let s;
    if (type === "triangle") s = (2 / Math.PI) * Math.asin(Math.sin(phase));
    else s = Math.sin(phase);
    // gain: ->0.5 over 0.02 then exp decay to 0.0001 over d
    let gain;
    if (t < 0.02) gain = 0.5 * (t / 0.02);
    else {
      const k = Math.log(0.5 / 0.0001) / Math.max(0.001, d - 0.02);
      gain = 0.5 * Math.exp(-k * (t - 0.02));
    }
    buf[idx] += s * gain * MASTER;
  }
}

const SOUNDS = {
  good: (b) => { tone(b, { f: 880, t: 0, d: 0.09, type: "triangle", g: 0.5 }); slide(b, 700, 1300, 0.02, 0.16, "sine"); },
  cool: (b) => [523, 659, 784, 1047].forEach((f, i) => tone(b, { f, t: i * 0.08, d: 0.18, type: "triangle", g: 0.45 })),
  epic: (b) => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(b, { f, t: i * 0.05, d: 0.7, type: "sawtooth", g: 0.22 })); slide(b, 523, 1568, 0.05, 0.6, "triangle"); },
  levelup: (b) => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(b, { f, t: i * 0.1, d: 0.3, type: "triangle", g: 0.4 })); tone(b, { f: 1047, t: 0.5, d: 0.8, type: "sawtooth", g: 0.25 }); },
  milestone: (b) => [1047, 1319, 1568].forEach((f, i) => tone(b, { f, t: i * 0.07, d: 0.5, type: "sine", g: 0.4 })),
  focusStart: (b) => { tone(b, { f: 587, t: 0, d: 0.08, type: "triangle", g: 0.4 }); tone(b, { f: 587, t: 0.14, d: 0.08, type: "triangle", g: 0.4 }); slide(b, 660, 1175, 0.28, 0.22, "sine"); },
  focusEnd: (b) => { tone(b, { f: 1319, t: 0, d: 0.5, type: "sine", g: 0.45 }); tone(b, { f: 1047, t: 0.18, d: 0.7, type: "sine", g: 0.4 }); tone(b, { f: 523, t: 0.18, d: 0.7, type: "triangle", g: 0.2 }); },
  restEnd: (b) => { tone(b, { f: 440, t: 0, d: 0.1, type: "square", g: 0.18 }); tone(b, { f: 440, t: 0.16, d: 0.1, type: "square", g: 0.18 }); slide(b, 523, 880, 0.32, 0.2, "triangle"); },
  bad: (b) => { slide(b, 320, 90, 0, 0.45, "sawtooth"); tone(b, { f: 140, t: 0, d: 0.4, type: "square", g: 0.3 }); },
};

const DUR = { good: 0.3, cool: 0.5, epic: 0.9, levelup: 1.5, milestone: 0.7, focusStart: 0.6, focusEnd: 1.0, restEnd: 0.6, bad: 0.5 };

function toWav(buf) {
  const n = buf.length;
  const bytes = 44 + n * 2;
  const ab = new ArrayBuffer(bytes);
  const dv = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); ws(8, "WAVE");
  ws(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  ws(36, "data"); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, buf[i]));
    dv.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return Buffer.from(ab);
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "sounds");
mkdirSync(outDir, { recursive: true });
for (const [kind, render] of Object.entries(SOUNDS)) {
  const buf = makeBuf(DUR[kind]);
  render(buf);
  writeFileSync(join(outDir, `${kind}.wav`), toWav(buf));
  console.log("wrote", `${kind}.wav`);
}
console.log("done →", outDir);
