"use client";

import { db } from "./db";
import { addTask } from "./repository";

/** Populate example tasks the first time grit runs, so the loop is alive immediately. */
export async function seedIfEmpty(): Promise<void> {
  const count = await db().tasks.count();
  if (count > 0) return;

  // Must — daily non-negotiables
  await addTask({ listType: "must", title: "Drink 3L of water" });
  await addTask({ listType: "must", title: "Train / workout" });
  await addTask({ listType: "must", title: "Study German 30 min" });
  await addTask({ listType: "must", title: "Read 10 pages" });
  await addTask({
    listType: "must",
    title: "Deep work 2h",
    recurrence: { type: "weekly", weekdays: [1, 3, 5] },
  });

  // Bad — keep the streak alive
  await addTask({ listType: "bad", title: "Watch porn", slipPenalty: 100, rewardMultiplier: 1.5 });
  await addTask({ listType: "bad", title: "Drink alcohol", slipPenalty: 100 });
  await addTask({ listType: "bad", title: "Doomscroll 1h+", slipPenalty: 50 });

  // Cool — big wins
  await addTask({ listType: "cool", title: "Reach 95 kg" });
  await addTask({ listType: "cool", title: "Pass B1 German exam", points: 150 });

  // Impossible — life milestones
  await addTask({ listType: "impossible", title: "Get a job" });
  await addTask({ listType: "impossible", title: "Run first marathon" });
  await addTask({ listType: "impossible", title: "Reach 10k followers" });
}
