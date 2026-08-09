/**
 * grit design tokens for mobile — "Night Arcade": a dark, gamified take on
 * the clay/bento system. Near-black OLED surfaces, neon list accents, and
 * glow shadows instead of clay elevation. Shapes and radii stay from the
 * clay system so components keep their geometry.
 */
import { Platform, type ViewStyle } from "react-native";

export const C = {
  page: "#0c0e0d",
  page2: "#1b1f1d",
  surface: "#151816",
  ink: "#f2f4f2",
  inkSoft: "#b7c1bb",
  inkFaint: "#8f9a94",

  primary: "#1e2220",
  primaryDeep: "#101312",
  accent: "#ff7a1a",

  mustSurf: "#151816",
  mustAcc: "#ffb02e",
  badSurf: "#151816",
  badAcc: "#ff4d57",
  coolSurf: "#151816",
  coolAcc: "#2dd4bf",
  impSurf: "#151816",
  impAcc: "#8b6cff",
  gold: "#ffcf3f",

  // Chart palette
  chart1: "#ff7a1a",
  chart2: "#2dd4bf",
  chart3: "#ffb02e",
  chart4: "#8b6cff",
  chart5: "#ff4d57",
} as const;

/** Hairline edge that separates dark surfaces from the near-black page. */
export const EDGE = "rgba(255,255,255,0.07)";

export const R = { lg: 28, md: 22, sm: 16, pill: 999 } as const;

/**
 * The floating top bar is gone (profile and stats live in the dock now), so
 * screens no longer need to clear it. Kept at 0 so the screens' shared
 * `TOP_BAR_SPACE + padding` sums keep working unchanged.
 */
export const TOP_BAR_SPACE = 0;

export const FONT = {
  regular: "BricolageGrotesque_400Regular",
  medium: "BricolageGrotesque_500Medium",
  semibold: "BricolageGrotesque_600SemiBold",
  bold: "BricolageGrotesque_700Bold",
  extrabold: "BricolageGrotesque_800ExtraBold",
} as const;

/** Per-list tint: surface + accent. On dark, the surface is shared and the
 * accent carries the identity (edge bars, badges, glows). */
export const LIST_TINT: Record<
  "must" | "bad" | "cool" | "impossible" | "custom",
  { surf: string; acc: string }
> = {
  must: { surf: C.mustSurf, acc: C.mustAcc },
  bad: { surf: C.badSurf, acc: C.badAcc },
  cool: { surf: C.coolSurf, acc: C.coolAcc },
  impossible: { surf: C.impSurf, acc: C.impAcc },
  custom: { surf: C.surface, acc: C.accent },
};

/** Soft raised shadow — on the dark page this reads as depth, not clay. */
export function clay(): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.5,
      shadowRadius: 16,
    },
    android: { elevation: 6 },
    default: {},
  })!;
}

/** Smaller shadow for chips/buttons. */
export function claySm(): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
    },
    android: { elevation: 3 },
    default: {},
  })!;
}

/** Neon glow around an element (checkboxes, the FAB, active nav). */
export function glow(color: string, radius = 10): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: color,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.55,
      shadowRadius: radius,
    },
    // Android can't do colored soft shadows on plain Views; the hairline
    // edge + accent fills carry the look there.
    android: {},
    default: {},
  })!;
}
