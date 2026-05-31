"use client";

import { useStore } from "@/lib/store";
import { Icon } from "./Icon";

export function XpHero({ compact = false }: { compact?: boolean }) {
  const { level, todayXp } = useStore();
  const pct = Math.round(level.progress * 100);

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg font-extrabold text-white"
          style={{ background: "linear-gradient(135deg, #14b8a6, #0b7a70)" }}
        >
          {level.level}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between text-xs font-semibold text-ink-soft">
            <span>Level {level.level}</span>
            <span className="tabular-nums">
              {level.xpIntoLevel} / {level.xpForThisLevel} XP
            </span>
          </div>
          <div
            className="mt-1 h-2.5 w-full overflow-hidden rounded-full clay-inset"
            style={{ background: "var(--surface)" }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg, #14b8a6, #f97316)",
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden p-6 text-white clay sm:p-8"
      style={{
        background:
          "radial-gradient(700px 300px at 90% -30%, #2dd4bf 0%, transparent 60%), linear-gradient(135deg, #14b8a6 0%, #0b7a70 100%)",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-white/70">
            Level
          </p>
          <p className="text-7xl font-extrabold leading-none sm:text-8xl">
            {level.level}
          </p>
        </div>
        <div className="rounded-full bg-white/15 px-4 py-2 text-right backdrop-blur">
          <div className="flex items-center gap-1.5 text-sm font-bold">
            <Icon name="Zap" className="h-4 w-4" />
            {todayXp >= 0 ? "+" : ""}
            {todayXp} today
          </div>
          <div className="text-xs text-white/70 tabular-nums">
            {level.totalXp.toLocaleString()} total XP
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-1.5 flex items-baseline justify-between text-sm font-semibold text-white/80">
          <span>Progress to Level {level.level + 1}</span>
          <span className="tabular-nums">
            {level.xpIntoLevel.toLocaleString()} /{" "}
            {level.xpForThisLevel.toLocaleString()} XP
          </span>
        </div>
        <div className="h-4 w-full overflow-hidden rounded-full bg-black/20">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg, #fde68a, #f97316)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
