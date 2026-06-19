/** Shared Vim-style list motions. Returns the new index, or null if not a motion. */
import type { Key } from "ink";

export function applyMotion(
  input: string,
  key: Key,
  index: number,
  len: number,
  page = 5,
): number | null {
  if (len === 0) return null;
  const clamp = (n: number) => Math.max(0, Math.min(len - 1, n));
  if (key.downArrow || input === "j") return clamp(index + 1);
  if (key.upArrow || input === "k") return clamp(index - 1);
  if (input === "g") return 0;
  if (input === "G") return len - 1;
  if (key.ctrl && input === "d") return clamp(index + page);
  if (key.ctrl && input === "u") return clamp(index - page);
  return null;
}
