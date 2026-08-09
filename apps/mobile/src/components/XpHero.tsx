/**
 * Night Arcade hero: a glowing radial XP ring with the level in the center,
 * today's XP beside it, and streak/focus chips so Home finally surfaces
 * streaks. The ring sweep animates on progress changes.
 */
import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { formatStreak, streakMs } from "@grit/core";
import { useStore } from "../lib/store";
import { C, R, glow } from "../theme";
import { Txt } from "./ui";
import { Icon } from "./Icon";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING = 108;
const STROKE = 9;
const RADIUS = (RING - STROKE) / 2;
const CIRCUM = 2 * Math.PI * RADIUS;

function Chip({ icon, color, label }: { icon: string; color: string; label: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        borderRadius: R.pill,
        borderWidth: 1,
        borderColor: color + "66",
        backgroundColor: color + "1a",
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Icon name={icon} size={13} color={color} />
      <Txt size={11.5} weight="semibold" color={color}>
        {label}
      </Txt>
    </View>
  );
}

export function XpHero() {
  const { level, xpToday, tasks, dayLogs, today, now } = useStore();

  // Best live clean streak across bad tasks — the thing worth bragging about.
  const cleanMs = tasks
    .filter((t) => t.listType === "bad" && !t.archived)
    .reduce((best, t) => Math.max(best, streakMs(now, t.lastSlipAt, t.createdAt)), 0);
  const focusMin = dayLogs
    .filter((l) => l.kind === "focus" && l.date === today)
    .reduce((sum, l) => sum + (l.minutes ?? 0), 0);

  // Sweep the ring smoothly when XP changes (mirrors the old bar timing).
  const anim = useRef(new Animated.Value(level.progress)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: level.progress,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [level.progress, anim]);
  const dashOffset = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUM, 0],
    extrapolate: "clamp",
  });

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 18, paddingHorizontal: 4, paddingVertical: 8 }}>
      <View style={[{ width: RING, height: RING }, glow(C.accent, 14)]}>
        <Svg width={RING} height={RING}>
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            stroke="rgba(255,255,255,0.09)"
            strokeWidth={STROKE}
            fill="none"
          />
          <AnimatedCircle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            stroke={C.accent}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${CIRCUM} ${CIRCUM}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        </Svg>
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
          <Txt size={10} weight="semibold" color={C.inkFaint} style={{ letterSpacing: 2 }}>
            LEVEL
          </Txt>
          <Txt size={30} weight="bold" color={C.ink} style={{ lineHeight: 32 }}>
            {level.level}
          </Txt>
        </View>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Txt
          size={24}
          weight="bold"
          color={xpToday >= 0 ? C.accent : C.badAcc}
          style={{
            textShadowColor: (xpToday >= 0 ? C.accent : C.badAcc) + "8c",
            textShadowRadius: 14,
            textShadowOffset: { width: 0, height: 0 },
          }}
        >
          {xpToday >= 0 ? "+" : ""}
          {xpToday} XP
        </Txt>
        <Txt size={12} weight="medium" color={C.inkFaint}>
          {level.xpIntoLevel} / {level.xpForThisLevel} into level {level.level + 1}
        </Txt>
        {cleanMs > 0 || focusMin > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 }}>
            {cleanMs > 0 ? <Chip icon="Flame" color={C.accent} label={`${formatStreak(cleanMs)} clean`} /> : null}
            {focusMin > 0 ? <Chip icon="Timer" color={C.coolAcc} label={`${focusMin}m focus`} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
