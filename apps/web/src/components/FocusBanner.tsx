"use client";

import { useEffect } from "react";
import { useNow, useStore } from "@/lib/store";
import { useUi } from "@/lib/ui";
import { Icon } from "./Icon";

/** "13:05" for a timestamp. */
function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Floating mini pomodoro, bottom-right. Shows while a session runs anywhere
 * except the Focus panel itself (where the big ring is already on screen).
 * Slides in/out so leaving/returning to the panel feels like a hand-off.
 */
export function FocusBanner() {
  const { activeFocus, tickFocus } = useStore();
  const { view, dailyLogTab, setView, setDailyLogTab } = useUi();
  const now = useNow(1000);

  const onFocusPanel = view === "dailylog" && dailyLogTab === "focus";
  const show = !!activeFocus && !onFocusPanel;

  const isFocus = activeFocus?.phase === "focus";
  const phaseEnd = activeFocus
    ? activeFocus.startedAt +
      (isFocus ? activeFocus.focusMin : activeFocus.restMin) * 60_000
    : 0;

  // Keep phase transitions snappy even away from the panel.
  useEffect(() => {
    if (activeFocus && now >= phaseEnd) void tickFocus();
  }, [activeFocus, now, phaseEnd, tickFocus]);

  const leftMs = Math.max(0, phaseEnd - now);
  const leftMin = Math.floor(leftMs / 60_000);
  const leftSec = Math.floor((leftMs % 60_000) / 1000);
  const totalMs = activeFocus
    ? (isFocus ? activeFocus.focusMin : activeFocus.restMin) * 60_000
    : 1;
  const color = isFocus ? "var(--accent)" : "var(--cool-acc)";

  // Mini ring geometry.
  const R = 16;
  const C = 2 * Math.PI * R;

  return (
    <button
      onClick={() => {
        setView("dailylog");
        setDailyLogTab("focus");
      }}
      aria-label="Open the running pomodoro"
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      className="clay fixed bottom-5 right-5 z-40 flex items-center gap-3 p-3 pr-4 transition-all duration-300 ease-out"
      style={{
        background: "var(--surface)",
        cursor: "pointer",
        transform: show ? "translateY(0)" : "translateY(120%)",
        opacity: show ? 1 : 0,
        pointerEvents: show ? "auto" : "none",
      }}
    >
      {activeFocus && (
        <>
          <span className="relative grid h-11 w-11 place-items-center">
            <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
              <circle
                cx="20"
                cy="20"
                r={R}
                fill="none"
                stroke="var(--page-2)"
                strokeWidth="4"
              />
              <circle
                cx="20"
                cy="20"
                r={R}
                fill="none"
                stroke={color}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (leftMs / totalMs)}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <Icon
              name={isFocus ? "Timer" : "Coffee"}
              className="h-4 w-4"
              strokeWidth={2.6}
            />
          </span>
          <span className="flex flex-col items-start">
            <span className="font-mono text-base font-extrabold leading-tight tabular-nums">
              {leftMin}:{String(leftSec).padStart(2, "0")}
            </span>
            <span className="text-[11px] font-semibold leading-tight text-ink-faint">
              {isFocus ? "Focus" : "Rest"} · until {fmtClock(phaseEnd)}
            </span>
          </span>
        </>
      )}
    </button>
  );
}
