"use client";

import { Children, useEffect, useState } from "react";
import type { ListType, Task } from "@/lib/types";
import { LIST_META } from "@/lib/types";
import { LIST_TINT } from "@/lib/tint";
import { byMyDayPriority, byXp, dayLabel, importantTasks, myDayTasks, plannedDays, showsInMyDayDone } from "@/lib/schedule";
import { useStore } from "@/lib/store";
import { parseListView, useUi } from "@/lib/ui";
import { XpHero } from "./XpHero";
import { useConfirm } from "./ConfirmDialog";
import { TaskCard } from "./TaskCard";
import { BadCard } from "./BadCard";
import { AddTask } from "./AddTask";
import { DailyLog } from "./DailyLog";
import { Analytics } from "./Analytics";
import { MustHeatmap } from "./MustHeatmap";
import { Icon } from "./Icon";

/** Render a task with the card that matches its list type. */
function TaskByType({
  task,
  mustBadge = false,
  forDay,
}: {
  task: Task;
  mustBadge?: boolean;
  forDay?: string;
}) {
  return task.listType === "bad" ? (
    <BadCard task={task} pinActions />
  ) : (
    <TaskCard task={task} showMustBadge={mustBadge} showListName forDay={forDay} />
  );
}

function ListHeader({
  listType,
  count,
  action,
}: {
  listType: ListType;
  count: string;
  /** Optional control rendered inside the card (e.g. the Must heatmap toggle). */
  action?: React.ReactNode;
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
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-extrabold tracking-tight">{meta.label}</h1>
        <p className="text-sm font-medium text-ink-soft">{meta.blurb}</p>
      </div>
      {action}
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

// Page shell: a vertical stack of full-width rows (hero, headers, add bar,
// section titles) interleaved with masonry card columns.
const grid = "flex flex-col gap-4";

/** Responsive masonry column count: 1 (phone) / 2 (sm+) / 3 (2xl+). */
function useColumnCount(): number {
  const get = () => {
    if (typeof window === "undefined") return 1;
    const w = window.innerWidth;
    if (w >= 1536) return 3;
    if (w >= 640) return 2;
    return 1;
  };
  const [n, setN] = useState(1); // start at 1 to match SSR, fix on mount
  useEffect(() => {
    const onResize = () => setN(get());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return n;
}

// Masonry via real flexbox columns (NOT CSS multi-column, which intermittently
// fails to paint hover overlays in Chrome). Cards are distributed round-robin
// into N flex columns, so a card with an expanded subtask thread only pushes
// the cards below it in its own column — neighbors keep their place.
function CardColumns({ children }: { children: React.ReactNode }) {
  const cols = useColumnCount();
  const items = Children.toArray(children);
  const buckets: React.ReactNode[][] = Array.from({ length: cols }, () => []);
  items.forEach((child, i) => buckets[i % cols].push(child));
  return (
    <div className="flex items-start gap-4">
      {buckets.map((bucket, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-4">
          {bucket}
        </div>
      ))}
    </div>
  );
}

function MyDay() {
  const { tasks, today, completedToday } = useStore();
  // My Day orders by its own priority ladder (Important → Repeated → Must → rest).
  const all = byMyDayPriority(myDayTasks(tasks, today));
  // Recurring tasks are "done" when completed today; one-shots when archived.
  const isDone = (t: Task) =>
    t.recurrence ? completedToday.has(t.id) : t.archived;
  const active = all.filter((t) => !isDone(t));
  // Done lists only what the day owns: Musts done today + My-Day-native one-shots
  // done today. Pinned Important/Impossible/Cool/custom-list tasks leave My Day
  // when done (they show on their own page), and yesterday's completions drop off.
  const done = all.filter((t) => isDone(t) && showsInMyDayDone(t, today));

  return (
    <div className={grid}>
      <div className="sm:col-span-2 2xl:col-span-3">
        <XpHero />
      </div>

      <h1 className="px-1 text-2xl font-extrabold tracking-tight sm:col-span-2 2xl:col-span-3">
        My Day
      </h1>

      <div className="sm:col-span-2 2xl:col-span-3">
        <AddTask listType="custom" myDay />
      </div>

      {all.length === 0 && (
        <EmptyHint text="Nothing in My Day yet. Add a task above, or pin one with the sun." />
      )}
      <CardColumns>
        {active.map((t) => (
          <TaskByType key={t.id} task={t} mustBadge />
        ))}
      </CardColumns>

      {done.length > 0 && (
        <>
          <h2 className="mt-2 px-1 text-sm font-bold uppercase tracking-wider text-ink-faint">
            Done
          </h2>
          <CardColumns>
            {done.map((t) => (
              <TaskByType key={t.id} task={t} mustBadge />
            ))}
          </CardColumns>
        </>
      )}
    </div>
  );
}

function ImportantList() {
  const { tasks } = useStore();
  const important = byXp(importantTasks(tasks));

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
      <CardColumns>
        {important.map((t) => (
          <TaskByType key={t.id} task={t} />
        ))}
      </CardColumns>
    </div>
  );
}

/** One collapsible day group in the Planned view. */
function PlannedDay({
  day,
  today,
  tasks,
}: {
  day: string;
  today: string;
  tasks: Task[];
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 px-1 text-left"
        style={{ cursor: "pointer" }}
      >
        <Icon
          name={open ? "ChevronDown" : "ChevronRight"}
          className="h-4 w-4 text-ink-faint"
        />
        <span className="text-sm font-bold">{dayLabel(day, today)}</span>
        <span className="text-sm font-bold text-ink-faint">{tasks.length}</span>
      </button>
      {open && (
        <CardColumns>
          {tasks.map((t) => (
            <TaskByType key={`${day}:${t.id}`} task={t} forDay={day} />
          ))}
        </CardColumns>
      )}
    </div>
  );
}

function PlannedList() {
  const { tasks, today } = useStore();
  const days = plannedDays(tasks, today);

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
          <Icon name="CalendarDays" className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight">Planned</h1>
          <p className="text-sm font-medium text-ink-soft">
            What&apos;s coming up over the next 10 days.
          </p>
        </div>
        <span className="text-sm font-bold text-ink-soft">
          {days.reduce((n, d) => n + d.tasks.length, 0)}
        </span>
      </div>

      {days.length === 0 && (
        <EmptyHint text="Nothing planned. Add a task in My Day with a future date, or set up recurring Must tasks." />
      )}
      {days.map((d) => (
        <PlannedDay key={d.day} day={d.day} today={today} tasks={byXp(d.tasks)} />
      ))}
    </div>
  );
}

/** Must page: switch between the task list and the completion heatmap. */
function HeatmapToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="clay-press flex shrink-0 items-center gap-2 px-3.5 py-2 text-sm font-bold"
      style={{
        background: on ? "var(--must-acc)" : "var(--surface)",
        color: on ? "#fff" : "var(--ink-soft)",
        cursor: "pointer",
      }}
    >
      <Icon name={on ? "ListChecks" : "Grid3x3"} className="h-4 w-4" />
      <span className="hidden sm:inline">{on ? "Tasks" : "Heatmap"}</span>
    </button>
  );
}

function PositiveList({ listType }: { listType: ListType }) {
  const { tasks } = useStore();
  const [heatmap, setHeatmap] = useState(false);
  const all = tasks.filter((t) => t.listType === listType);
  const active = byXp(all.filter((t) => !t.archived));
  const achieved = byXp(all.filter((t) => t.archived));

  if (listType === "must" && heatmap) {
    return (
      <div className={grid}>
        <ListHeader
          listType="must"
          count={`${active.length} habits`}
          action={<HeatmapToggle on onClick={() => setHeatmap(false)} />}
        />
        <MustHeatmap />
      </div>
    );
  }

  return (
    <div className={grid}>
      <ListHeader
        listType={listType}
        count={
          listType === "must"
            ? `${active.length} habits`
            : `${achieved.length}/${all.length} achieved`
        }
        action={
          listType === "must" ? (
            <HeatmapToggle on={false} onClick={() => setHeatmap(true)} />
          ) : undefined
        }
      />
      <div className="sm:col-span-2 2xl:col-span-3">
        <AddTask listType={listType} />
      </div>

      {active.length === 0 && achieved.length === 0 && (
        <EmptyHint text="Nothing here yet — add your first one above." />
      )}

      <CardColumns>
        {active.map((t) => (
          <TaskCard key={t.id} task={t} />
        ))}
      </CardColumns>

      {achieved.length > 0 && (
        <>
          <h2 className="mt-2 px-1 text-sm font-bold uppercase tracking-wider text-ink-faint">
            Achieved
          </h2>
          <CardColumns>
            {achieved.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </CardColumns>
        </>
      )}
    </div>
  );
}

function BadList() {
  const { tasks } = useStore();
  const bad = tasks.filter((t) => t.listType === "bad" && !t.archived);
  // Bad cards are compact tiles: 2-up on phones, 3-up from desktop.
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      <div className="col-span-full">
        <ListHeader listType="bad" count={`${bad.length} tracked`} />
      </div>
      <div className="col-span-full">
        <AddTask listType="bad" />
      </div>
      {bad.length === 0 && (
        <div className="col-span-full">
          <EmptyHint text="Add the habits you want to quit. Each clean streak earns milestone XP." />
        </div>
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
  const active = byXp(all.filter((t) => !t.archived));
  const done = byXp(all.filter((t) => t.archived));

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

      <CardColumns>
        {active.map((t) => (
          <TaskCard key={t.id} task={t} />
        ))}
      </CardColumns>

      {done.length > 0 && (
        <>
          <h2 className="mt-2 px-1 text-sm font-bold uppercase tracking-wider text-ink-faint">
            Done
          </h2>
          <CardColumns>
            {done.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </CardColumns>
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
    case "planned":
      return <PlannedList />;
    case "dailylog":
      return <DailyLog />;
    case "analytics":
      return <Analytics />;
    case "bad":
      return <BadList />;
    case "must":
    case "cool":
    case "impossible":
      return <PositiveList listType={view} />;
  }
}
