"use client";

import type { ListType, Task } from "@/lib/types";
import { LIST_META } from "@/lib/types";
import { LIST_TINT } from "@/lib/tint";
import { myDayTasks } from "@/lib/schedule";
import { useStore } from "@/lib/store";
import { useUi } from "@/lib/ui";
import { XpHero } from "./XpHero";
import { TaskCard } from "./TaskCard";
import { BadCard } from "./BadCard";
import { AddTask } from "./AddTask";
import { Icon } from "./Icon";

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

const grid = "grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3";

function MyDay() {
  const { tasks, today, completedToday } = useStore();
  const due = myDayTasks(tasks, today);
  const doneCount = due.filter((t) => completedToday.has(t.id)).length;

  return (
    <div className={grid}>
      <div className="sm:col-span-2 2xl:col-span-3">
        <XpHero />
      </div>

      <div
        className="flex items-center justify-between p-5 clay sm:col-span-2 2xl:col-span-3"
        style={{ background: "var(--surface)" }}
      >
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">My Day</h1>
          <p className="text-sm font-medium text-ink-soft">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-extrabold tabular-nums text-primary">
            {doneCount}
            <span className="text-ink-faint">/{due.length}</span>
          </p>
          <p className="text-xs font-semibold text-ink-soft">done today</p>
        </div>
      </div>

      {due.length === 0 && (
        <EmptyHint text="No Must tasks scheduled for today. Add some in the Must list." />
      )}
      {due.map((t) => (
        <TaskCard key={t.id} task={t} />
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
        <TaskCard key={t.id} task={t} showStar={listType === "must"} />
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

export function Views() {
  const { view } = useUi();
  switch (view) {
    case "myday":
      return <MyDay />;
    case "bad":
      return <BadList />;
    case "must":
    case "cool":
    case "impossible":
      return <PositiveList listType={view} />;
  }
}
