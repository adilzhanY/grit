"use client";

import { useEffect, useState } from "react";
import { onToast, type ToastData } from "@/lib/toast";
import { Icon } from "./Icon";

/**
 * Centered, non-blocking confirmation that pops up when an entry is logged
 * (food, weight, sleep, steps, reading, focus) and fades out on its own. Sits
 * above content but ignores pointer events, so it never interrupts a tap.
 */
export function Toast() {
  const [toast, setToast] = useState<ToastData | null>(null);

  useEffect(() => onToast(setToast), []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1600);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!toast) return null;
  const { xp } = toast;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] grid place-items-center px-6">
      <div
        key={toast.id}
        className="animate-pop flex items-center gap-3 px-5 py-3 clay"
        style={{ background: "var(--surface)" }}
      >
        <div
          className="grid h-11 w-11 place-items-center rounded-full text-white"
          style={{ background: "linear-gradient(135deg,#3a423c,#171b18)" }}
        >
          <Icon name={toast.icon} className="h-5 w-5" />
        </div>
        <div>
          <p className="font-bold">{toast.title}</p>
          {xp !== 0 && (
            <p
              className="text-sm font-semibold"
              style={{ color: xp > 0 ? "var(--cool-acc)" : "var(--bad-acc)" }}
            >
              {xp > 0 ? `+${xp}` : xp} XP
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
