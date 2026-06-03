import type { ListType } from "./types";

/** Per-list clay tint (CSS var references) for surfaces and accents. */
export const LIST_TINT: Record<ListType, { surf: string; acc: string }> = {
  must: { surf: "var(--must-surf)", acc: "var(--must-acc)" },
  bad: { surf: "var(--bad-surf)", acc: "var(--bad-acc)" },
  cool: { surf: "var(--cool-surf)", acc: "var(--cool-acc)" },
  impossible: { surf: "var(--imp-surf)", acc: "var(--imp-acc)" },
  custom: { surf: "var(--surface)", acc: "var(--primary)" },
};
