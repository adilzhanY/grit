"use client";

/**
 * Curated sound pack. Implemented with Web Audio synthesis (zero files, instant, tweakable).
 *
 * To swap in real audio later: drop files in /public/sounds and set FILES[kind] to the path —
 * play() will prefer a file when present and fall back to synthesis otherwise.
 */

export type SoundKind =
  | "good" // Must task done
  | "cool" // Cool win
  | "epic" // Impossible win
  | "bad" // Bad slip
  | "milestone" // Streak milestone reached
  | "levelup"; // Level up

// Optional real-file overrides, e.g. { good: "/sounds/click.mp3" }.
const FILES: Partial<Record<SoundKind, string>> = {};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
const buffers = new Map<string, AudioBuffer>();

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

/** Call from a user gesture to unlock audio on mobile/Safari. */
export function unlockAudio() {
  const c = ac();
  if (c && c.state === "suspended") void c.resume();
}

type Note = { f: number; t: number; d: number; type?: OscillatorType; g?: number };

function tone(c: AudioContext, out: GainNode, n: Note) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = n.type ?? "sine";
  osc.frequency.value = n.f;
  const start = c.currentTime + n.t;
  const peak = n.g ?? 0.6;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + n.d);
  osc.connect(gain);
  gain.connect(out);
  osc.start(start);
  osc.stop(start + n.d + 0.02);
}

function slide(
  c: AudioContext,
  out: GainNode,
  from: number,
  to: number,
  at: number,
  d: number,
  type: OscillatorType = "sine",
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  const start = c.currentTime + at;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + d);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.5, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + d);
  osc.connect(gain);
  gain.connect(out);
  osc.start(start);
  osc.stop(start + d + 0.02);
}

function synth(kind: SoundKind, c: AudioContext, out: GainNode) {
  switch (kind) {
    case "good":
      // bright click + little upward whistle
      tone(c, out, { f: 880, t: 0, d: 0.09, type: "triangle", g: 0.5 });
      slide(c, out, 700, 1300, 0.02, 0.16, "sine");
      break;
    case "cool": {
      // ascending arpeggio
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) =>
        tone(c, out, { f, t: i * 0.08, d: 0.18, type: "triangle", g: 0.45 }),
      );
      break;
    }
    case "epic": {
      // big bright fanfare chord stack
      const chord = [392, 523, 659, 784, 1047];
      chord.forEach((f, i) =>
        tone(c, out, { f, t: i * 0.05, d: 0.7, type: "sawtooth", g: 0.22 }),
      );
      slide(c, out, 523, 1568, 0.05, 0.6, "triangle");
      break;
    }
    case "levelup": {
      const seq = [523, 659, 784, 1047, 1319];
      seq.forEach((f, i) =>
        tone(c, out, { f, t: i * 0.1, d: 0.3, type: "triangle", g: 0.4 }),
      );
      tone(c, out, { f: 1047, t: 0.5, d: 0.8, type: "sawtooth", g: 0.25 });
      break;
    }
    case "milestone": {
      const bells = [1047, 1319, 1568];
      bells.forEach((f, i) =>
        tone(c, out, { f, t: i * 0.07, d: 0.5, type: "sine", g: 0.4 }),
      );
      break;
    }
    case "bad":
      // harsh descending buzzer
      slide(c, out, 320, 90, 0, 0.45, "sawtooth");
      tone(c, out, { f: 140, t: 0, d: 0.4, type: "square", g: 0.3 });
      break;
  }
}

async function loadFile(c: AudioContext, url: string): Promise<AudioBuffer | null> {
  if (buffers.has(url)) return buffers.get(url)!;
  try {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buf = await c.decodeAudioData(arr);
    buffers.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}

export function play(kind: SoundKind) {
  if (!enabled) return;
  const c = ac();
  if (!c || !master) return;
  if (c.state === "suspended") void c.resume();

  const file = FILES[kind];
  if (file) {
    void loadFile(c, file).then((buf) => {
      if (!buf || !master) return synth(kind, c, master!);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(master);
      src.start();
    });
    return;
  }
  synth(kind, c, master);
}
