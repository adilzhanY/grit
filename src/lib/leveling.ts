/**
 * Pure XP <-> level math. The level is NEVER stored — always derived from total XP,
 * so it can't drift. Levels can drop if XP drops (de-leveling is enabled).
 *
 * Cost to go from level L to L+1 = base * growth^L.
 * Cumulative XP required to REACH level L = base * (growth^L - 1) / (growth - 1).
 */

export interface LevelInfo {
  /** Current level (>= 0). */
  level: number;
  /** Total XP (floored at 0). */
  totalXp: number;
  /** XP accumulated inside the current level. */
  xpIntoLevel: number;
  /** XP span of the current level (cost from this level to the next). */
  xpForThisLevel: number;
  /** Fraction [0,1] of progress toward the next level. */
  progress: number;
  /** Total XP threshold at which the next level begins. */
  nextLevelAt: number;
}

/** Cumulative XP needed to reach a given level (level 0 = 0 XP). */
export function xpToReachLevel(
  level: number,
  base: number,
  growth: number,
): number {
  if (level <= 0) return 0;
  // Geometric series sum of base*growth^0 .. base*growth^(level-1).
  return Math.round((base * (Math.pow(growth, level) - 1)) / (growth - 1));
}

/** Cost of the single jump from `level` to `level + 1`. */
export function levelCost(level: number, base: number, growth: number): number {
  return Math.round(base * Math.pow(growth, level));
}

export function computeLevel(
  totalXpRaw: number,
  base: number,
  growth: number,
): LevelInfo {
  const totalXp = Math.max(0, Math.round(totalXpRaw));

  // Walk levels up until the next threshold exceeds totalXp.
  let level = 0;
  // Guard against pathological configs; 1000 levels is far beyond any real use.
  while (level < 1000 && xpToReachLevel(level + 1, base, growth) <= totalXp) {
    level++;
  }

  const thisLevelStart = xpToReachLevel(level, base, growth);
  const nextLevelAt = xpToReachLevel(level + 1, base, growth);
  const xpForThisLevel = nextLevelAt - thisLevelStart;
  const xpIntoLevel = totalXp - thisLevelStart;
  const progress =
    xpForThisLevel > 0 ? Math.min(1, xpIntoLevel / xpForThisLevel) : 0;

  return {
    level,
    totalXp,
    xpIntoLevel,
    xpForThisLevel,
    progress,
    nextLevelAt,
  };
}
