"use client";

import { useEffect, useRef } from "react";
import { focusElapsed } from "@/lib/daylog";
import { useNow, useStore } from "@/lib/store";
import { play } from "@/lib/sounds";
import { Icon } from "./Icon";

/**
 * Full-screen "alarm" shown the moment a focus or rest phase runs out. The
 * timer never auto-advances — the user decides here, like a native alarm.
 * Rings a repeating chime while open.
 */
export function FocusAlarm() {
  const {
    activeFocus,
    finishFocusSession,
    continueFocusSession,
    cancelFocusSession,
  } = useStore();
  const now = useNow(500);
  const ringing = !!activeFocus && focusElapsed(activeFocus, now);
  const isFocus = activeFocus?.phase === "focus";

  // Repeating chime while the alarm is up.
  const lastRing = useRef(0);
  useEffect(() => {
    if (!ringing) {
      lastRing.current = 0;
      return;
    }
    play(isFocus ? "focusEnd" : "restEnd");
    const id = setInterval(() => play(isFocus ? "focusEnd" : "restEnd"), 3000);
    return () => clearInterval(id);
  }, [ringing, isFocus]);

  if (!ringing || !activeFocus) return null;

  const color = isFocus ? "var(--accent)" : "var(--cool-acc)";
  const label = activeFocus.label;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/55 px-6 backdrop-blur-sm">
      <div
        className="animate-pop flex w-full max-w-sm flex-col items-center gap-5 p-8 clay text-center"
        style={{ background: "var(--surface)" }}
      >
        <span
          className="grid h-16 w-16 animate-bounce place-items-center rounded-full text-white"
          style={{ background: color }}
        >
          <Icon name="BellRing" className="h-8 w-8" />
        </span>

        <div className="flex flex-col gap-1">
          <p className="text-2xl font-extrabold tracking-tight">
            {isFocus ? "Focus complete!" : "Break’s over"}
          </p>
          <p className="text-sm font-semibold text-ink-soft">
            {isFocus
              ? `Nice work${label ? ` on ${label}` : ""} — time for a break.`
              : "Ready to get back to it?"}
          </p>
        </div>

        {isFocus ? (
          <div className="flex w-full flex-col gap-2">
            {activeFocus.restMin > 0 && (
              <button
                onClick={() => finishFocusSession(true)}
                className="clay-press flex items-center justify-center gap-2 py-3 text-sm font-bold text-white"
                style={{ background: "var(--cool-acc)", cursor: "pointer" }}
              >
                <Icon name="Coffee" className="h-4 w-4" />
                Start break
              </button>
            )}
            <button
              onClick={() => finishFocusSession(false)}
              className="clay-press flex items-center justify-center gap-2 py-3 text-sm font-bold text-white"
              style={{ background: "var(--primary)", cursor: "pointer" }}
            >
              <Icon name="Check" className="h-4 w-4" />
              Save &amp; finish
            </button>
            <button
              onClick={() => cancelFocusSession()}
              className="py-2 text-sm font-bold text-ink-faint hover:text-ink-soft"
              style={{ cursor: "pointer" }}
            >
              Discard
            </button>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2">
            <button
              onClick={() => continueFocusSession()}
              className="clay-press flex items-center justify-center gap-2 py-3 text-sm font-bold text-white"
              style={{ background: "var(--accent)", cursor: "pointer" }}
            >
              <Icon name="Timer" className="h-4 w-4" />
              Start focus
            </button>
            <button
              onClick={() => cancelFocusSession()}
              className="clay-press flex items-center justify-center gap-2 py-3 text-sm font-bold text-white"
              style={{ background: "var(--primary)", cursor: "pointer" }}
            >
              <Icon name="Check" className="h-4 w-4" />
              Finish
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
