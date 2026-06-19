/**
 * One-off cloud repair for the milestone/slip corruption (see the sync fixes).
 * It fixes three things, all derived from the append-only ledger so it's safe:
 *
 *   1. Concurrent duplicate `streak_milestone` awards (same milestone awarded by
 *      two devices in the same run → double XP). Keeps the earliest, drops the
 *      rest. Re-earns after a slip (always ≥24h apart) are preserved.
 *   2. Clobbered slips: a bad task whose `lastSlipAt` is older than its latest
 *      `bad_slip` ledger entry had its slip reverted by the old bug — restore it.
 *   3. Bogus milestones: a `streak_milestone` granted during the current clean
 *      run before the run was actually long enough (the "clean 1 week but I
 *      slipped" XP) → drop it.
 *
 * Runs read-only by default. Re-run with `--apply` to write the fixes.
 *   npx tsx scripts/repair.ts                 # dry run (uses your saved TUI session)
 *   npx tsx scripts/repair.ts --apply
 *   GRIT_EMAIL=you@x.com GRIT_PASSWORD=… npx tsx scripts/repair.ts --apply
 */
import { MILESTONES, type LedgerEntry, type Task } from "@grit/core";
import { supabase } from "../src/supabase";
import { getSession, signIn } from "../src/data/auth";

const APPLY = process.argv.includes("--apply");
const argVal = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

// Smallest milestone is 24h, so a legitimate re-earn after a slip is always
// ≥24h after the previous award. Awards within this window of each other are
// the same award duplicated across devices.
const DUP_WINDOW_MS = 12 * 60 * 60 * 1000;

function milestoneMs(e: LedgerEntry): number | null {
  if (e.milestoneId) return MILESTONES.find((m) => m.id === e.milestoneId)?.ms ?? null;
  // Legacy entries: match the label embedded in meta ("… · 1 week clean").
  const m = MILESTONES.find((mm) => e.meta?.includes(mm.label));
  return m?.ms ?? null;
}
function milestoneKey(e: LedgerEntry): string {
  return `${e.taskId}::${e.milestoneId ?? MILESTONES.find((m) => e.meta?.includes(m.label))?.id ?? e.meta}`;
}

async function main() {
  const sb = supabase();
  if (!sb) {
    console.error("Supabase is not configured (no URL/key).");
    process.exit(1);
  }

  let session = await getSession();
  if (!session) {
    const email = argVal("--email") ?? process.env.GRIT_EMAIL;
    const password = argVal("--password") ?? process.env.GRIT_PASSWORD;
    if (!email || !password) {
      console.error(
        "No saved session. Sign into the TUI first, or pass --email and --password (or set GRIT_EMAIL/GRIT_PASSWORD).",
      );
      process.exit(1);
    }
    const { error } = await signIn(email, password);
    if (error) {
      console.error("Sign-in failed:", error);
      process.exit(1);
    }
    session = await getSession();
  }
  const userId = session!.user.id;
  console.log(`Signed in as ${session!.user.email}\n`);

  // ---- fetch ----
  const fetchTable = async (table: string) => {
    const { data, error } = await sb
      .from(table)
      .select("id,data,deleted")
      .eq("user_id", userId);
    if (error) throw error;
    return (data ?? []).filter((r) => !r.deleted);
  };
  const ledgerRows = await fetchTable("ledger");
  const taskRows = await fetchTable("tasks");
  const ledger: LedgerEntry[] = ledgerRows.map((r) => r.data as LedgerEntry);
  const tasks: Task[] = taskRows.map((r) => r.data as Task);

  const xpOf = (rows: LedgerEntry[]) =>
    rows.reduce((bal, e) => Math.max(0, bal + e.delta), 0);
  const before = xpOf([...ledger].sort((a, b) => a.timestamp - b.timestamp));

  const dropLedgerIds = new Set<string>();
  const fixTasks: Task[] = [];

  // ---- 1. concurrent duplicate milestone awards ----
  const byKey = new Map<string, LedgerEntry[]>();
  for (const e of ledger) {
    if (e.type !== "streak_milestone") continue;
    const k = milestoneKey(e);
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(e);
  }
  for (const [, group] of byKey) {
    group.sort((a, b) => a.timestamp - b.timestamp);
    let keptAt = -Infinity;
    for (const e of group) {
      if (e.timestamp - keptAt < DUP_WINDOW_MS) {
        dropLedgerIds.add(e.id); // duplicate of the award we just kept
      } else {
        keptAt = e.timestamp; // a new run's legitimate re-earn
      }
    }
  }

  // ---- 2 & 3. clobbered slips + bogus current-run milestones ----
  for (const task of tasks) {
    if (task.listType !== "bad") continue;
    const slips = ledger.filter((e) => e.type === "bad_slip" && e.taskId === task.id);
    const latestSlip = slips.reduce((mx, e) => Math.max(mx, e.timestamp), 0);
    const correctLastSlip = Math.max(task.lastSlipAt ?? 0, latestSlip);

    if (latestSlip > 0 && (task.lastSlipAt ?? 0) < latestSlip) {
      fixTasks.push({ ...task, lastSlipAt: correctLastSlip, awardedMilestoneIds: [] });
    }

    const runStart = correctLastSlip || task.createdAt;
    for (const e of ledger) {
      if (e.type !== "streak_milestone" || e.taskId !== task.id) continue;
      if (dropLedgerIds.has(e.id)) continue;
      if (e.timestamp < runStart) continue; // earned in a prior run — legit
      const need = milestoneMs(e);
      if (need != null && e.timestamp - runStart < need - 60_000) {
        dropLedgerIds.add(e.id); // current run wasn't long enough → bogus
      }
    }
  }

  // ---- report ----
  const droppedXp = ledger
    .filter((e) => dropLedgerIds.has(e.id))
    .reduce((s, e) => s + e.delta, 0);
  const after = xpOf(
    [...ledger].filter((e) => !dropLedgerIds.has(e.id)).sort((a, b) => a.timestamp - b.timestamp),
  );

  console.log(`Ledger entries: ${ledger.length}`);
  console.log(`Bad tasks: ${tasks.filter((t) => t.listType === "bad").length}\n`);
  console.log(`Duplicate / bogus milestone entries to remove: ${dropLedgerIds.size} (${droppedXp >= 0 ? "+" : ""}${droppedXp} XP)`);
  for (const e of ledger.filter((x) => dropLedgerIds.has(x.id))) {
    console.log(`  - [${new Date(e.timestamp).toISOString().slice(0, 10)}] ${e.meta} (+${e.delta})`);
  }
  console.log(`\nBad tasks with a reverted slip to restore: ${fixTasks.length}`);
  for (const t of fixTasks) {
    console.log(`  - ${t.title}: lastSlipAt -> ${new Date(t.lastSlipAt!).toISOString()}`);
  }
  console.log(`\nTotal XP: ${before} -> ${after}`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write these fixes.");
    process.exit(0);
  }

  // ---- apply ----
  const nowIso = new Date().toISOString();
  if (dropLedgerIds.size) {
    const payload = [...dropLedgerIds].map((id) => ({
      id,
      user_id: userId,
      data: {},
      updated_at: nowIso,
      deleted: true,
    }));
    const { error } = await sb.from("ledger").upsert(payload, { onConflict: "user_id,id" });
    if (error) throw error;
  }
  if (fixTasks.length) {
    const payload = fixTasks.map((t) => ({
      id: t.id,
      user_id: userId,
      data: t,
      updated_at: nowIso,
      deleted: false,
    }));
    const { error } = await sb.from("tasks").upsert(payload, { onConflict: "user_id,id" });
    if (error) throw error;
  }
  console.log("\n✓ Applied. Other devices will pull the corrected state on their next sync.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Repair failed:", err);
  process.exit(1);
});
