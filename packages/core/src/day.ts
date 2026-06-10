/** Calendar-day helpers, platform-agnostic (no DOM, no storage). */

/** Local calendar day (YYYY-MM-DD) for a timestamp. */
export function localDay(ts = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
