/**
 * Sound pack via expo-audio (part of the Expo SDK, so it works in Expo Go —
 * no third-party native module). The WAVs are pre-rendered from the web's
 * Web-Audio synth by scripts/gen-sounds.mjs, so the chimes match the website.
 */
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

export type SoundKind =
  | "good"
  | "cool"
  | "epic"
  | "bad"
  | "milestone"
  | "levelup"
  | "focusStart"
  | "focusEnd"
  | "restEnd";

const FILES: Record<SoundKind, number> = {
  good: require("../../assets/sounds/good.wav"),
  cool: require("../../assets/sounds/cool.wav"),
  epic: require("../../assets/sounds/epic.wav"),
  bad: require("../../assets/sounds/bad.wav"),
  milestone: require("../../assets/sounds/milestone.wav"),
  levelup: require("../../assets/sounds/levelup.wav"),
  focusStart: require("../../assets/sounds/focusStart.wav"),
  focusEnd: require("../../assets/sounds/focusEnd.wav"),
  restEnd: require("../../assets/sounds/restEnd.wav"),
};

let enabled = true;
let modeSet = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const players = new Map<SoundKind, any>();

/**
 * Configure the shared audio session ONCE so our short effects play *alongside*
 * whatever else is going (music, a podcast) instead of grabbing audio focus and
 * pausing it. Without an interruption mode the chime takes full focus and stops
 * the user's media — the bug this fixes.
 */
function configureAudio() {
  if (modeSet) return;
  modeSet = true;
  void setAudioModeAsync({
    // Let short effects play even when the ringer is on silent (iOS).
    playsInSilentMode: true,
    // iOS: overlay our chimes without pausing or ducking other audio.
    interruptionMode: "mixWithOthers",
    // Android: the lightest non-interrupting option — briefly duck other audio
    // for the chime, then restore it. ('doNotMix' would pause the music.)
    interruptionModeAndroid: "duckOthers",
  }).catch(() => {});
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  // Set the mixing session at startup (settings load before the first tap), so
  // even the very first sound never interrupts already-playing media.
  if (on) configureAudio();
}

export function unlockAudio() {
  configureAudio();
}

export function play(kind: SoundKind) {
  if (!enabled) return;
  try {
    let p = players.get(kind);
    if (!p) {
      p = createAudioPlayer(FILES[kind]);
      players.set(kind, p);
    }
    p.seekTo(0);
    p.play();
  } catch {
    // Audio must never break the UI.
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let alarmPlayer: any = null;

/** Loop a chime until stopAlarm() — used while the focus/rest alarm is ringing. */
export function startAlarm(kind: "focusEnd" | "restEnd") {
  if (!enabled) return;
  try {
    stopAlarm();
    alarmPlayer = createAudioPlayer(FILES[kind]);
    alarmPlayer.loop = true;
    alarmPlayer.seekTo(0);
    alarmPlayer.play();
  } catch {
    // ignore
  }
}

export function stopAlarm() {
  try {
    if (alarmPlayer) {
      alarmPlayer.pause();
      alarmPlayer.remove?.();
      alarmPlayer = null;
    }
  } catch {
    // ignore
  }
}
