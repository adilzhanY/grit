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

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

export function unlockAudio() {
  if (modeSet) return;
  modeSet = true;
  // Let short effects play even when the ringer is on silent.
  void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
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
