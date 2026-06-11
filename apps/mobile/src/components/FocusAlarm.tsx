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

export function FocusAlarm() {
  const { activeFocus, now, finishFocusSession, continueFocusSession, cancelFocusSession } = useStore();

  useEffect(() => {
    void configureNotifications();
  }, []);

  const a = activeFocus;
  const elapsed = !!a && focusElapsed(a, now);
  // Only reconcile notifications when the session actually changes — the
  // native chronometer ticks on its own, so no per-second churn.
  const notifKey = a ? `${a.phase}:${a.startedAt}:${a.pausedAt ?? "run"}` : "none";

  useEffect(() => {
    (async () => {
      if (!a) {
        await clearOngoing();
        await cancelAlarm();
        return;
      }
      const isFocus = a.phase === "focus";
      const title = a.label ?? (isFocus ? "Pomo Focus" : "Break");
      const endAt = focusPhaseEnd(a);
      // Already finished (e.g. reopened after the alarm fired): the elapsed
      // effect rings/clears — don't post a stale 0:00 chronometer.
      if (a.pausedAt == null && Date.now() >= endAt) {
        await clearOngoing();
        await cancelAlarm();
        return;
      }
      if (a.pausedAt != null) {
        await showOngoing({ title, endAt, paused: true, remainingMs: focusRemainingMs(a, a.pausedAt) });
        await cancelAlarm();
      } else {
        await showOngoing({ title, endAt, paused: false });
        await scheduleAlarm(
          endAt,
          isFocus ? "Focus complete" : "Break’s over",
          isFocus ? "Time for a break." : "Ready to get back to it?",
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifKey]);

  // When the phase runs out: drop the ongoing, ring the in-app chime.
  useEffect(() => {
    if (elapsed && a) {
      void clearOngoing();
      void cancelAlarm();
      startAlarm(a.phase === "focus" ? "focusEnd" : "restEnd");
    } else {
      stopAlarm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed]);

  if (!a || !elapsed) return null;

  const isFocus = a.phase === "focus";
  const color = isFocus ? C.accent : C.coolAcc;
  const label = a.label;

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
                {a.restMin > 0 ? (
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
