"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { Icon } from "./Icon";

export function Celebration() {
  const { celebration, dismissCelebration } = useStore();

  useEffect(() => {
    if (celebration?.kind === "milestone") {
      const id = window.setTimeout(dismissCelebration, 4000);
      return () => window.clearTimeout(id);
    }
  }, [celebration, dismissCelebration]);

  if (!celebration) return null;

  if (celebration.kind === "milestone") {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4">
        <div
          className="animate-pop pointer-events-auto flex items-center gap-3 px-5 py-3 clay"
          style={{ background: "var(--surface)" }}
        >
          <div
            className="grid h-11 w-11 place-items-center rounded-full text-white"
            style={{ background: "linear-gradient(135deg,#3a423c,#171b18)" }}
          >
            <Icon name="Shield" className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold">{celebration.label} clean! 🛡️</p>
            <p className="text-sm font-semibold text-cool">
              +{celebration.xp} XP · {celebration.title}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={dismissCelebration}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-6 backdrop-blur-sm"
      aria-label="Dismiss celebration"
      style={{ cursor: "pointer" }}
    >
      <div
        className="animate-celebrate max-w-sm p-10 text-center text-white clay"
        style={{
          background:
            "radial-gradient(600px 280px at 50% -20%, #525c55 0%, transparent 60%), linear-gradient(135deg,#3a423c,#171b18)",
        }}
      >
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/15">
          <Icon name="Trophy" className="h-10 w-10" />
        </div>
        <p className="mt-5 text-sm font-bold uppercase tracking-widest text-white/70">
          Level up
        </p>
        <p className="text-7xl font-extrabold leading-none">
          {celebration.level}
        </p>
        <p className="mt-4 text-lg font-semibold">
          Ты ебошишь! Keep going. 🔥
        </p>
        <p className="mt-2 text-sm text-white/70">Tap anywhere to continue</p>
      </div>
    </button>
  );
}
