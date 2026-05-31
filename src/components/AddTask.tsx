"use client";

import { useState } from "react";
import type { ListType } from "@/lib/types";
import { DEFAULT_POINTS, DEFAULT_SLIP_PENALTY } from "@/lib/types";
import { LIST_TINT } from "@/lib/tint";
import { useStore } from "@/lib/store";
import { Icon } from "./Icon";

const WD = ["S", "M", "T", "W", "T", "F", "S"];

export function AddTask({ listType }: { listType: ListType }) {
  const { addTask } = useStore();
  const tint = LIST_TINT[listType];
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [points, setPoints] = useState(DEFAULT_POINTS[listType]);
  const [penalty, setPenalty] = useState(DEFAULT_SLIP_PENALTY);
  const [mult, setMult] = useState(1);

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    await addTask({
      listType,
      title: t,
      points: listType === "bad" ? 0 : points,
      recurrence:
        listType === "must"
          ? weekdays.length === 0 || weekdays.length === 7
            ? { type: "daily", weekdays: [] }
            : { type: "weekly", weekdays }
          : undefined,
      slipPenalty: listType === "bad" ? penalty : undefined,
      rewardMultiplier: listType === "bad" ? mult : undefined,
    });
    setTitle("");
    setWeekdays([]);
    setPoints(DEFAULT_POINTS[listType]);
    setPenalty(DEFAULT_SLIP_PENALTY);
    setMult(1);
    setOpen(false);
  };

  const toggleDay = (d: number) =>
    setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]));

  return (
    <div className="clay p-3 sm:p-4" style={{ background: "var(--surface)" }}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Task options"
          aria-expanded={open}
          className="clay-press grid h-11 w-11 shrink-0 place-items-center"
          style={{ background: tint.surf, color: tint.acc, cursor: "pointer" }}
        >
          <Icon name="Plus" className="h-5 w-5" />
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={`Add to ${listType}…`}
          aria-label={`Add a ${listType} task`}
          className="min-w-0 flex-1 bg-transparent px-2 text-base font-medium outline-none placeholder:text-ink-faint"
        />
        <button
          onClick={submit}
          disabled={!title.trim()}
          className="clay-press px-4 py-2 text-sm font-bold disabled:opacity-40"
          style={{
            background: tint.acc,
            color: "#fff",
            cursor: title.trim() ? "pointer" : "not-allowed",
          }}
        >
          Add
        </button>
      </div>

      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-black/5 pt-3 text-sm">
          {listType === "must" && (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink-soft">Days:</span>
              <div className="flex gap-1">
                {WD.map((w, d) => {
                  const on = weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      onClick={() => toggleDay(d)}
                      aria-pressed={on}
                      aria-label={`Toggle day ${d}`}
                      className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold"
                      style={{
                        background: on ? tint.acc : "var(--page-2)",
                        color: on ? "#fff" : "var(--ink-soft)",
                        cursor: "pointer",
                      }}
                    >
                      {w}
                    </button>
                  );
                })}
              </div>
              <span className="text-xs text-ink-faint">
                {weekdays.length === 0 ? "(every day)" : ""}
              </span>
            </div>
          )}

          {(listType === "cool" || listType === "impossible") && (
            <label className="flex items-center gap-2 font-semibold text-ink-soft">
              XP reward:
              <input
                type="number"
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                className="w-24 rounded-lg bg-page-2 px-2 py-1 text-ink outline-none"
              />
            </label>
          )}

          {listType === "bad" && (
            <>
              <label className="flex items-center gap-2 font-semibold text-ink-soft">
                Slip penalty:
                <input
                  type="number"
                  value={penalty}
                  onChange={(e) => setPenalty(Number(e.target.value))}
                  className="w-20 rounded-lg bg-page-2 px-2 py-1 text-ink outline-none"
                />
              </label>
              <label className="flex items-center gap-2 font-semibold text-ink-soft">
                Reward ×:
                <input
                  type="number"
                  step="0.1"
                  value={mult}
                  onChange={(e) => setMult(Number(e.target.value))}
                  className="w-16 rounded-lg bg-page-2 px-2 py-1 text-ink outline-none"
                />
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}
