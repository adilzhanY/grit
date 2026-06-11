/**
 * Global pomodoro alarm. When a focus or rest phase runs out it rings (looping
 * chime) and shows a full-screen alarm with the next actions — the timer never
 * silently auto-advances. Also drives the ongoing + scheduled notifications.
 */
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { focusElapsed, focusPhaseEnd, focusRemainingMs } from "@grit/core";
import { useStore } from "../lib/store";
import { C, R, clay } from "../theme";
import { startAlarm, stopAlarm } from "../lib/sounds";
import {
  configureNotifications,
  showOngoing,
  clearOngoing,
  scheduleAlarm,
  cancelAlarm,
} from "../lib/notify";
import { PopIn } from "./anim";
import { Icon } from "./Icon";
import { PrimaryButton, Txt } from "./ui";

const pad = (n: number) => String(n).padStart(2, "0");

export function FocusAlarm() {
  const { activeFocus, now, finishFocusSession, continueFocusSession, cancelFocusSession } = useStore();
  const scheduledKey = useRef<string | null>(null);

  useEffect(() => {
    void configureNotifications();
  }, []);

  // Drive notifications + the in-app ringing from the session state.
  useEffect(() => {
    const a = activeFocus;
    if (!a) {
      void clearOngoing();
      void cancelAlarm();
      stopAlarm();
      scheduledKey.current = null;
      return;
    }
    const isFocus = a.phase === "focus";
    const title = a.label ?? (isFocus ? "Pomo Focus" : "Break");

    if (focusElapsed(a, now)) {
      void clearOngoing();
      void cancelAlarm();
      startAlarm(isFocus ? "focusEnd" : "restEnd");
      scheduledKey.current = null;
      return;
    }

    stopAlarm();
    const left = focusRemainingMs(a, now);
    const body = `${a.pausedAt != null ? "Paused · " : ""}${Math.floor(left / 60_000)}:${pad(
      Math.floor((left % 60_000) / 1000),
    )}`;
    void showOngoing(title, body);

    const key = a.pausedAt != null ? null : `${a.phase}:${a.startedAt}`;
    if (key) {
      if (scheduledKey.current !== key) {
        scheduledKey.current = key;
        void scheduleAlarm(
          focusPhaseEnd(a),
          isFocus ? "Focus complete" : "Break’s over",
          isFocus ? "Time for a break." : "Ready to get back to it?",
        );
      }
    } else if (scheduledKey.current !== null) {
      void cancelAlarm();
      scheduledKey.current = null;
    }
  }, [activeFocus, now]);

  if (!activeFocus || !focusElapsed(activeFocus, now)) return null;

  const isFocus = activeFocus.phase === "focus";
  const color = isFocus ? C.accent : C.coolAcc;
  const label = activeFocus.label;

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.55)",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: 100,
      }}
    >
      <PopIn>
        <View style={[{ width: "100%", maxWidth: 360, backgroundColor: C.surface, borderRadius: R.lg, padding: 26, alignItems: "center", gap: 18 }, clay()]}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
            <Icon name="BellRing" color="#fff" size={30} />
          </View>
          <View style={{ alignItems: "center", gap: 4 }}>
            <Txt size={22} weight="extrabold">{isFocus ? "Focus complete!" : "Break’s over"}</Txt>
            <Txt size={13} weight="semibold" color={C.inkSoft} style={{ textAlign: "center" }}>
              {isFocus
                ? `Nice work${label ? ` on ${label}` : ""} — time for a break.`
                : "Ready to get back to it?"}
            </Txt>
          </View>

          <View style={{ width: "100%", gap: 10 }}>
            {isFocus ? (
              <>
                {activeFocus.restMin > 0 ? (
                  <PrimaryButton label="Start break" background={C.coolAcc} onPress={() => void finishFocusSession(true)} />
                ) : null}
                <PrimaryButton label="Save & finish" background={C.primary} onPress={() => void finishFocusSession(false)} />
                <PrimaryButton label="Discard" background={C.page2} color={C.inkSoft} onPress={() => void cancelFocusSession()} />
              </>
            ) : (
              <>
                <PrimaryButton label="Start focus" background={C.accent} onPress={() => void continueFocusSession()} />
                <PrimaryButton label="Finish" background={C.primary} onPress={() => void cancelFocusSession()} />
              </>
            )}
          </View>
        </View>
      </PopIn>
    </View>
  );
}
