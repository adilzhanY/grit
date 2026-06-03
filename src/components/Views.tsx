"use client";

import { useState } from "react";
import type { ListType, Task } from "@/lib/types";
import { LIST_META } from "@/lib/types";
import { LIST_TINT } from "@/lib/tint";
import { importantTasks, myDayTasks } from "@/lib/schedule";
import { useNow, useStore } from "@/lib/store";
import { parseListView, useUi } from "@/lib/ui";
import { XpHero } from "./XpHero";
import { useConfirm } from "./ConfirmDialog";
import { TaskCard } from "./TaskCard";
import { BadCard } from "./BadCard";
import { AddTask } from "./AddTask";
import { Icon } from "./Icon";

/** Render a task with the card that matches its list type. */
function TaskByType({ task, mustBadge = false }: { task: Task; mustBadge?: boolean }) {
  return task.listType === "bad" ? (
    <BadCard task={task} />
  ) : (
    <TaskCard task={task} showMustBadge={mustBadge} />
  );
}

function ListHeader({
  listType,
  count,
}: {
  listType: ListType;
  count: string;
}) {
  const meta = LIST_META[listType];
  const tint = LIST_TINT[listType];
  return (
    <div
      className="flex items-center gap-4 p-5 clay sm:col-span-2 2xl:col-span-3"
      style={{ background: tint.surf }}
    >
      <div
        className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white"
        style={{ background: tint.acc }}
      >
        <Icon name={meta.icon} className="h-7 w-7" />
      </div>
      <div className="flex-1">
        <h1 className="text-2xl font-extrabold tracking-tight">{meta.label}</h1>
        <p className="text-sm font-medium text-ink-soft">{meta.blurb}</p>
      </div>
      <span className="text-sm font-bold text-ink-soft">{count}</span>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-black/10 p-6 text-center text-sm font-medium text-ink-faint sm:col-span-2 2xl:col-span-3">
      {text}
    </div>
  );
}

// Single-column rows: one task per row (flex makes the col-span-* utilities no-ops).
const grid = "flex flex-col gap-4";

/** Today's date + a live countdown to local midnight. */
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
    <div
      className="rounded-2xl px-5 py-2.5 text-center clay-inset"
      style={{ background: "var(--page-2)" }}
    >
      <p className="text-xs font-bold uppercase tracking-widest text-ink-soft">
        {d.toLocaleDateString(undefined, {
          weekday: "short",
          month: "long",
          day: "numeric",
        })}
      </p>
      <p className="text-3xl font-extrabold leading-tight tabular-nums text-primary">
        {left}
      </p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
        left today
      </p>
    </div>
  );
}

function MyDay() {
  const { tasks, today, completedToday } = useStore();
  const all = myDayTasks(tasks, today);
  // Must tasks are "done" when completed today; one-shot tasks when archived.
  const isDone = (t: Task) =>
    t.listType === "must" ? completedToday.has(t.id) : t.archived;
  const active = all.filter((t) => !isDone(t));
  const done = all.filter(isDone);

  return (
    <div className={grid}>
      <div className="sm:col-span-2 2xl:col-span-3">
        <XpHero />
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-4 p-5 clay sm:col-span-2 2xl:col-span-3"
        style={{ background: "var(--surface)" }}
      >
        <h1 className="text-2xl font-extrabold tracking-tight">My Day</h1>
        <TimeLeftBadge />
        <div className="text-right">
          <p className="text-3xl font-extrabold tabular-nums text-primary">
            {done.length}
            <span className="text-ink-faint">/{all.length}</span>
          </p>
          <p className="text-xs font-semibold text-ink-soft">done today</p>
        </div>
      </div>

      <div className="sm:col-span-2 2xl:col-span-3">
        <AddTask listType="custom" myDay />
      </div>

      {all.length === 0 && (
        <EmptyHint text="Nothing in My Day yet. Add a task above, or pin one with the sun." />
      )}
      {active.map((t) => (
        <TaskByType key={t.id} task={t} mustBadge />
      ))}

      {done.length > 0 && (
        <>
          <h2 className="mt-2 px-1 text-sm font-bold uppercase tracking-wider text-ink-faint sm:col-span-2 2xl:col-span-3">
            Done
          </h2>
          {done.map((t) => (
            <TaskByType key={t.id} task={t} mustBadge />
          ))}
        </>
      )}
    </div>
  );
}

function ImportantList() {
  const { tasks } = useStore();
  const important = importantTasks(tasks);

  return (
    <div className={grid}>
      <div
        className="flex items-center gap-4 p-5 clay sm:col-span-2 2xl:col-span-3"
        style={{ background: "var(--surface)" }}
      >
        <div
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white"
          style={{ background: "var(--primary)" }}
        >
          <Icon name="Star" className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight">Important</h1>
          <p className="text-sm font-medium text-ink-soft">
            Everything you starred.
          </p>
        </div>
        <span className="text-sm font-bold text-ink-soft">
          {important.length}
        </span>
      </div>

      {important.length === 0 && (
        <EmptyHint text="No important tasks yet. Star any task to pin it here." />
      )}
      {important.map((t) => (
        <TaskByType key={t.id} task={t} />
      ))}
    </div>
  );
}

function PositiveList({ listType }: { listType: ListType }) {
  const { tasks } = useStore();
  const all = tasks.filter((t) => t.listType === listType);
  const active = all.filter((t) => !t.archived);
  const achieved = all.filter((t) => t.archived);

  return (
    <div className={grid}>
      <ListHeader
        listType={listType}
        count={
          listType === "must"
            ? `${active.length} habits`
            : `${achieved.length}/${all.length} achieved`
        }
      />
      <div className="sm:col-span-2 2xl:col-span-3">
        <AddTask listType={listType} />
      </div>

      {active.length === 0 && achieved.length === 0 && (
        <EmptyHint text="Nothing here yet — add your first one above." />
      )}

      {active.map((t) => (
        <TaskCard key={t.id} task={t} />
      ))}

      {achieved.length > 0 && (
        <>
          <h2 className="mt-2 px-1 text-sm font-bold uppercase tracking-wider text-ink-faint sm:col-span-2 2xl:col-span-3">
            Achieved
          </h2>
          {achieved.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </>
      )}
    </div>
  );
}

function BadList() {
  const { tasks } = useStore();
  const bad = tasks.filter((t) => t.listType === "bad" && !t.archived);
  return (
    <div className={grid}>
      <ListHeader listType="bad" count={`${bad.length} tracked`} />
      <div className="sm:col-span-2 2xl:col-span-3">
        <AddTask listType="bad" />
      </div>
      {bad.length === 0 && (
        <EmptyHint text="Add the habits you want to quit. Each clean streak earns milestone XP." />
      )}
      {bad.map((t: Task) => (
        <BadCard key={t.id} task={t} />
      ))}
    </div>
  );
}

function CustomListView({ listId }: { listId: string }) {
  const { lists, tasks, renameList, removeList } = useStore();
  const { setView } = useUi();
  const confirm = useConfirm();
  const list = lists.find((l) => l.id === listId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  // List was deleted out from under us — bounce to My Day.
  if (!list) {
    return (
      <EmptyHint text="This list no longer exists." />
    );
  }

  const all = tasks.filter((t) => t.listId === listId);
  const active = all.filter((t) => !t.archived);
  const done = all.filter((t) => t.archived);

  const startEdit = () => {
    setDraft(list.name);
    setEditing(true);
  };
  const commitEdit = () => {
    if (draft.trim()) renameList(list.id, draft);
    setEditing(false);
  };

  return (
    <div className={grid}>
      <div
        className="flex items-center gap-4 p-5 clay sm:col-span-2 2xl:col-span-3"
        style={{ background: "var(--surface)" }}
      >
        <div
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white"
          style={{ background: "var(--primary)" }}
        >
          <Icon name="ListChecks" className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-full bg-transparent text-2xl font-extrabold tracking-tight outline-none"
              aria-label="List name"
            />
          ) : (
            <button
              onClick={startEdit}
              className="block max-w-full truncate text-left text-2xl font-extrabold tracking-tight"
              style={{ cursor: "text" }}
              title="Rename list"
            >
              {list.name}
            </button>
          )}
          <p className="text-sm font-medium text-ink-soft">
            {active.length} {active.length === 1 ? "task" : "tasks"}
          </p>
        </div>
        <button
          onClick={async () => {
            if (
              await confirm({
                title: `Delete list "${list.name}"?`,
                message: "Its tasks will be deleted too.",
                confirmLabel: "Delete",
              })
            ) {
              removeList(list.id);
              setView("myday");
            }
          }}
          aria-label="Delete list"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-black/5"
          style={{ cursor: "pointer" }}
        >
          <Icon name="Trash2" className="h-5 w-5" />
        </button>
      </div>

      <div className="sm:col-span-2 2xl:col-span-3">
        <AddTask listType="custom" listId={listId} />
      </div>

      {active.length === 0 && done.length === 0 && (
        <EmptyHint text="Nothing here yet — add your first task above." />
      )}

      {active.map((t) => (
        <TaskCard key={t.id} task={t} />
      ))}

      {done.length > 0 && (
        <>
          <h2 className="mt-2 px-1 text-sm font-bold uppercase tracking-wider text-ink-faint sm:col-span-2 2xl:col-span-3">
            Done
          </h2>
          {done.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </>
      )}
    </div>
  );
}

export function Views() {
  const { view } = useUi();
  const listId = parseListView(view);
  if (listId) return <CustomListView listId={listId} />;

  switch (view) {
    case "myday":
      return <MyDay />;
    case "important":
      return <ImportantList />;
    case "bad":
      return <BadList />;
    case "must":
    case "cool":
    case "impossible":
      return <PositiveList listType={view} />;
  }
}
