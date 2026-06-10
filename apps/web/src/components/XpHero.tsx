"use client";

import type { Task } from "@/lib/types";
import { myDayTasks } from "@/lib/schedule";
import { useNow, useStore } from "@/lib/store";
import { useConfirm } from "./ConfirmDialog";
import { Icon } from "./Icon";

/** Today's date + a live countdown to local midnight, styled for the charcoal hero. */
function TimeLeftBadge() {
  const now = useNow(1000);
  const d = new Date(now);
  const midnight = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + 1,
  ).getTime();
  const totalSec = Math.max(0, Math.floor((midnight - now) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const left = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  return (
    <div className="rounded-2xl bg-white/15 px-4 py-2 text-center backdrop-blur">
      <p className="text-xs font-bold uppercase tracking-widest text-white/70">
        {d.toLocaleDateString(undefined, {
          weekday: "short",
          month: "long",
          day: "numeric",
        })}
      </p>
      <p className="text-2xl font-extrabold leading-tight tabular-nums">
        {left}
      </p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">
        left today
      </p>
    </div>
  );
}

export function XpHero({ compact = false }: { compact?: boolean }) {
  const { level, todayXp, resetXp, tasks, today, completedToday } = useStore();
  const confirm = useConfirm();
  const pct = Math.round(level.progress * 100);

  // My Day progress — must tasks are "done" when completed today; one-shot tasks when archived.
  const myDay = myDayTasks(tasks, today);
  const isDone = (t: Task) =>
    t.listType === "must" ? completedToday.has(t.id) : t.archived;
  const doneCount = myDay.filter(isDone).length;

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg font-extrabold text-white"
          style={{ background: "linear-gradient(135deg, #3a423c, #171b18)" }}
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
                background: "linear-gradient(90deg, #272d29, #f97316)",
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden p-5 text-white clay sm:p-6"
      style={{
        background:
          "radial-gradient(700px 300px at 90% -30%, #525c55 0%, transparent 60%), linear-gradient(135deg, #3a423c 0%, #171b18 100%)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-white/70">
            Level
          </p>
          <p className="text-5xl font-extrabold leading-none sm:text-6xl">
            {level.level}
          </p>
        </div>
        <TimeLeftBadge />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="rounded-full bg-white/15 px-4 py-2 text-right backdrop-blur">
            <div className="flex items-center gap-1.5 text-sm font-bold tabular-nums">
              <Icon name="CheckCheck" className="h-4 w-4" />
              {doneCount}/{myDay.length} done
            </div>
            <div className="text-xs text-white/70">today</div>
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
          <button
            onClick={async () => {
              if (
                await confirm({
                  title: "Reset XP to 0?",
                  message: "Tasks and streaks are kept.",
                  confirmLabel: "Reset",
                })
              ) {
                void resetXp();
              }
            }}
            className="clay-press rounded-full px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-white"
            style={{ background: "var(--bad-acc)", cursor: "pointer" }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="mt-4">
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
