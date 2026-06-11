"use client";

import { useRef, useState } from "react";
import type { Subtask, Task } from "@/lib/types";
import { LIST_TINT } from "@/lib/tint";
import { recurrenceLabel } from "@/lib/schedule";
import { subtaskDone, subtaskShares } from "@/lib/repository";
import { useStore } from "@/lib/store";
import { useConfirm } from "./ConfirmDialog";
import { Icon } from "./Icon";

const THREAD_LINE = "rgba(20, 26, 24, 0.12)";

/** Curved Reddit-style connector linking a thread row up to its parent. */
function Connector({ isLast }: { isLast: boolean }) {
  return (
    <>
      {/* vertical drop from above + curve into this row */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-6 -top-2 bottom-1/2 w-4 rounded-bl-xl border-b-2 border-l-2"
        style={{ borderColor: THREAD_LINE }}
      />
      {/* continuation down to the next row */}
      {!isLast && (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-6 top-1/2 -bottom-2 w-px"
          style={{ background: THREAD_LINE }}
        />
      )}
    </>
  );
}

function SubtaskRow({
  task,
  sub,
  share,
  done,
  parentDone,
  isLast,
}: {
  task: Task;
  sub: Subtask;
  /** XP this subtask awarded (if done) or would award (if not). */
  share: number;
  done: boolean;
  /** Parent is done: thread is read-only (no delete). */
  parentDone: boolean;
  isLast: boolean;
}) {
  const { toggleSubtask, removeSubtask, editSubtask } = useStore();
  const tint = LIST_TINT[task.listType];
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(sub.title);
  const [xpDraft, setXpDraft] = useState(String(share));

  const startEdit = () => {
    setTitleDraft(sub.title);
    setXpDraft(String(share));
    setEditing(true);
  };
  const commitEdit = () => {
    const title = titleDraft.trim();
    if (title) {
      const xpVal = Math.max(0, Math.round(Number(xpDraft) || 0));
      // Only pin the XP if it actually changed — a plain rename leaves an
      // auto-split subtask auto.
      void editSubtask(task, sub.id, { title, ...(xpVal !== share ? { xp: xpVal } : {}) });
    }
    setEditing(false);
  };

  return (
    <div className="group/sub relative flex items-center gap-3">
      <Connector isLast={isLast} />
      <button
        onClick={() => toggleSubtask(task, sub.id)}
        aria-label={done ? `Mark ${sub.title} not done` : `Complete ${sub.title}`}
        aria-pressed={done}
        className="clay-press grid h-8 w-8 shrink-0 place-items-center"
        style={{
          background: done ? tint.acc : "var(--surface)",
          color: done ? "#fff" : "rgba(20,26,24,0.22)",
          cursor: "pointer",
        }}
      >
        <Icon name="Check" className="h-4 w-4" strokeWidth={3.2} />
      </button>

      {editing ? (
        <>
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="min-w-0 flex-1 rounded-lg bg-page-2 px-2 py-1 text-sm font-medium text-ink outline-none"
            aria-label="Subtask name"
          />
          {!done && (
            <span className="flex shrink-0 items-center gap-1 rounded-lg bg-page-2 px-2 py-1">
              <input
                type="number"
                min={0}
                value={xpDraft}
                onChange={(e) => setXpDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") setEditing(false);
                }}
                className="w-12 bg-transparent text-right text-sm font-extrabold text-ink outline-none"
                aria-label="Subtask XP"
              />
              <span className="text-xs font-bold text-ink-faint">XP</span>
            </span>
          )}
          <button
            onClick={commitEdit}
            aria-label="Save subtask"
            className="clay-press grid h-7 w-7 shrink-0 place-items-center rounded-full text-white"
            style={{ background: tint.acc, cursor: "pointer" }}
          >
            <Icon name="Check" className="h-3.5 w-3.5" strokeWidth={3} />
          </button>
        </>
      ) : (
        <>
          <p
            className="min-w-0 flex-1 break-words text-sm font-medium"
            style={{
              color: "var(--ink)",
              textDecoration: done ? "line-through" : "none",
              opacity: done ? 0.55 : 1,
            }}
          >
            {sub.title}
          </p>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-xs font-extrabold"
            style={{ background: "var(--surface)", color: tint.acc }}
          >
            +{share}
          </span>
          {!parentDone && (
            <button
              onClick={startEdit}
              aria-label={`Edit subtask ${sub.title}`}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint opacity-0 transition-opacity hover:bg-black/5 focus-visible:opacity-100 group-hover/sub:opacity-100"
              style={{ cursor: "pointer" }}
            >
              <Icon name="Pencil" className="h-3.5 w-3.5" />
            </button>
          )}
          {!parentDone && (
            <button
              onClick={() => removeSubtask(task, sub.id)}
              aria-label={`Delete subtask ${sub.title}`}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint opacity-0 transition-opacity hover:bg-black/5 focus-visible:opacity-100 group-hover/sub:opacity-100"
              style={{ cursor: "pointer" }}
            >
              <Icon name="Trash2" className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Card for a positive task (Must / Cool / Impossible / custom). Reads store. */
export function TaskCard({
  task,
  className = "",
  showMustBadge = false,
  showListName = false,
  forDay,
}: {
  task: Task;
  className?: string;
  /** Show a "Must" pill next to the title (used on My Day). */
  showMustBadge?: boolean;
  /** Show the custom list's name in the meta row (My Day / Important). */
  showListName?: boolean;
  /** Recurring done/toggle apply to this day instead of today (Planned view). */
  forDay?: string;
}) {
  const {
    completedOn,
    today,
    lists,
    toggleMust,
    achieve,
    unachieve,
    toggleMyDay,
    toggleImportant,
    removeTask,
    updateTask,
    addSubtask,
    setAllSubtasks,
  } = useStore();
  const confirm = useConfirm();
  const tint = LIST_TINT[task.listType];
  const [float, setFloat] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [pointsDraft, setPointsDraft] = useState("");

  const subs = task.subtasks ?? [];
  const hasSubs = subs.length > 0;
  const isSubDone = (s: Subtask) => subtaskDone(task, s, today);
  const doneCount = subs.filter(isSubDone).length;
  const shares = subtaskShares(task, today);

  const day = forDay ?? today;
  const done = task.recurrence
    ? completedOn.has(`${task.id}:${day}`)
    : task.archived;

  const listName = showListName
    ? lists.find((l) => l.id === task.listId)?.name
    : undefined;

  // What the parent check awards: remaining pool when subtasks carry the XP.
  const floatXp = hasSubs
    ? subs
        .filter((s) => !isSubDone(s))
        .reduce((sum, s) => sum + (shares.get(s.id) ?? 0), 0)
    : task.points;

  // On a future day (Planned), subtask state is meaningless — only the
  // day-keyed parent completion applies.
  const future = day !== today;

  const onToggle = () => {
    if (hasSubs && !future) return setAllSubtasks(task, !done);
    if (task.recurrence) return toggleMust(task, day);
    return task.archived ? unachieve(task) : achieve(task);
  };

  const handle = () => {
    if (!done) {
      setFloat(Date.now());
      window.setTimeout(() => setFloat(null), 1000);
    }
    onToggle();
  };

  const startAdd = () => {
    setAdding(true);
    setExpanded(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const startEdit = () => {
    setTitleDraft(task.title);
    setPointsDraft(String(task.points));
    setEditing(true);
  };
  const commitEdit = () => {
    const title = titleDraft.trim();
    const points = Math.max(0, Math.round(Number(pointsDraft)));
    void updateTask(task.id, {
      ...(title ? { title } : {}),
      ...(Number.isFinite(points) ? { points } : {}),
    });
    setEditing(false);
  };
  const editKeys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") setEditing(false);
  };

  const submitSub = async () => {
    const t = draft.trim();
    if (!t) return;
    await addSubtask(task, t);
    setDraft("");
    inputRef.current?.focus();
  };

  const open = (expanded && hasSubs) || adding;
  const showInput = !done && (adding || (expanded && hasSubs));
  const partial = hasSubs && !done && doneCount > 0;

  return (
    <div className={className}>
      <div
        className="group relative flex items-center gap-3 p-3 clay"
        style={{ background: tint.surf }}
      >
        {/* Complete / achieve toggle (with subtasks: complete/un-check all) */}
        <button
          onClick={handle}
          aria-label={done ? `Mark ${task.title} not done` : `Complete ${task.title}`}
          aria-pressed={done}
          className="clay-press relative grid h-10 w-10 shrink-0 place-items-center"
          style={{
            background: done ? tint.acc : "var(--surface)",
            color: done ? "#fff" : "rgba(20,26,24,0.22)",
            cursor: "pointer",
            // Partial ring: some subtasks done, not all.
            outline: partial ? `3px solid ${tint.acc}` : undefined,
            outlineOffset: partial ? "-3px" : undefined,
          }}
        >
          <Icon name="Check" className="h-5 w-5" strokeWidth={3.2} />
          {float !== null && (
            <span
              key={float}
              className="animate-float-up pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 text-base font-extrabold"
              style={{ color: tint.acc }}
            >
              +{floatXp}
            </span>
          )}
        </button>

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={editKeys}
              aria-label="Task name"
              className="w-full bg-transparent text-sm font-semibold outline-none sm:text-base"
              style={{ color: "var(--ink)" }}
            />
          ) : (
          <p
            className="text-sm font-semibold break-words sm:text-base"
            style={{
              color: "var(--ink)",
              textDecoration: done ? "line-through" : "none",
              opacity: done ? 0.55 : 1,
            }}
          >
            {task.title}
            {showMustBadge && task.listType === "must" && (
              <span
                className="ml-2 inline-block translate-y-[-1px] rounded-full px-2 py-0.5 align-middle text-[10px] font-extrabold uppercase tracking-wider"
                style={{ background: "var(--surface)", color: "var(--must-acc)" }}
              >
                Must
              </span>
            )}
          </p>
          )}
          <div className="mt-0.5 flex items-center gap-2 text-[11px] font-medium text-ink-soft">
            {hasSubs && !future && (
              <button
                onClick={() => setExpanded((e) => !e)}
                aria-expanded={open}
                aria-label="Toggle subtasks"
                className="-ml-1 flex items-center gap-1 rounded-full px-1.5 py-0.5 font-bold hover:bg-black/5"
                style={{ color: tint.acc, cursor: "pointer" }}
              >
                <Icon
                  name="ChevronRight"
                  className={`h-3.5 w-3.5 transition-transform duration-300 ${open ? "rotate-90" : ""}`}
                />
                {doneCount}/{subs.length}
              </button>
            )}
            {task.recurrence && <span>{recurrenceLabel(task)}</span>}
            {!task.recurrence && task.archived && <span>Achieved</span>}
            {listName && (
              <span className="flex min-w-0 items-center gap-1 text-ink-faint">
                <Icon name="ListChecks" className="h-3 w-3 shrink-0" />
                <span className="truncate">{listName}</span>
              </span>
            )}
          </div>
        </div>

        {/* Points badge */}
        {editing ? (
          <label
            className="flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-extrabold"
            style={{ background: "var(--surface)", color: tint.acc }}
          >
            +
            <input
              type="number"
              min={0}
              value={pointsDraft}
              onChange={(e) => setPointsDraft(e.target.value)}
              onKeyDown={editKeys}
              aria-label="Task XP"
              className="w-12 bg-transparent text-xs font-extrabold outline-none"
              style={{ color: tint.acc }}
            />
          </label>
        ) : (
          <span
            className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-extrabold"
            style={{ background: "var(--surface)", color: tint.acc }}
          >
            +{task.points}
          </span>
        )}

        {/* Inline save while editing (overlay is hidden so it can't cover the XP input) */}
        {editing && (
          <button
            onClick={commitEdit}
            aria-label={`Save ${task.title}`}
            className="clay-press grid h-8 w-8 shrink-0 place-items-center"
            style={{ background: tint.acc, color: "#fff", cursor: "pointer" }}
          >
            <Icon name="Check" className="h-4 w-4" strokeWidth={3} />
          </button>
        )}

        {/* Hover actions — overlaid so they don't steal title width */}
        {!editing && (
        <div
          className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-full p-1 shadow-sm group-hover:flex focus-within:flex"
          style={{ background: tint.surf }}
        >
          <button
            onClick={startEdit}
            aria-label={`Edit ${task.title}`}
            className="grid h-8 w-8 place-items-center rounded-full text-ink-faint hover:bg-black/5"
            style={{ cursor: "pointer" }}
          >
            <Icon name="Pencil" className="h-4 w-4" />
          </button>
          {!done && !future && (
            <button
              onClick={startAdd}
              aria-label={`Add subtask to ${task.title}`}
              className="grid h-8 w-8 place-items-center rounded-full text-ink-faint hover:bg-black/5"
              style={{ cursor: "pointer" }}
            >
              <Icon name="ListPlus" className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={() => toggleImportant(task)}
            aria-label={task.important ? "Unmark important" : "Mark important"}
            aria-pressed={!!task.important}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/5"
            style={{
              cursor: "pointer",
              color: task.important ? tint.acc : "var(--ink-faint)",
            }}
          >
            <Icon name="Star" className="h-5 w-5" />
          </button>
          <button
            onClick={() => toggleMyDay(task)}
            aria-label={task.starredMyDay ? "Remove from My Day" : "Add to My Day"}
            aria-pressed={!!task.starredMyDay}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/5"
            style={{
              cursor: "pointer",
              color: task.starredMyDay ? tint.acc : "var(--ink-faint)",
            }}
          >
            <Icon name="Sun" className="h-5 w-5" />
          </button>
          <button
            onClick={async () => {
              if (
                await confirm({
                  title: `Delete "${task.title}"?`,
                  confirmLabel: "Delete",
                })
              )
                removeTask(task.id);
            }}
            aria-label={`Delete ${task.title}`}
            className="grid h-8 w-8 place-items-center rounded-full text-ink-faint hover:bg-black/5"
            style={{ cursor: "pointer" }}
          >
            <Icon name="Trash2" className="h-4 w-4" />
          </button>
        </div>
        )}
      </div>

      {/* Subtask thread — FAQ-style smooth collapse via grid-template-rows */}
      {(hasSubs || adding) && !future && (
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-in-out"
          style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-2 py-2 pl-10 pr-2">
              {subs.map((s, i) => (
                <SubtaskRow
                  key={s.id}
                  task={task}
                  sub={s}
                  share={shares.get(s.id) ?? 0}
                  done={isSubDone(s)}
                  parentDone={done}
                  isLast={i === subs.length - 1 && !showInput}
                />
              ))}
              {showInput && (
                <div className="relative flex items-center gap-2">
                  <Connector isLast />
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitSub();
                      if (e.key === "Escape") {
                        setAdding(false);
                        setDraft("");
                      }
                    }}
                    onBlur={() => {
                      if (!draft.trim()) setAdding(false);
                    }}
                    placeholder="Add a subtask…"
                    aria-label={`Add subtask to ${task.title}`}
                    className="clay-inset min-w-0 flex-1 rounded-xl px-3 py-2 text-sm font-medium outline-none placeholder:text-ink-faint"
                    style={{ color: "var(--ink)" }}
                  />
                  <button
                    onClick={() => void submitSub()}
                    disabled={!draft.trim()}
                    aria-label="Add subtask"
                    className="clay-press grid h-9 w-9 shrink-0 place-items-center disabled:opacity-40"
                    style={{
                      background: tint.acc,
                      color: "#fff",
                      cursor: draft.trim() ? "pointer" : "not-allowed",
                    }}
                  >
                    <Icon name="Plus" className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
