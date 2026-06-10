import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { useStore } from "../lib/store";
import { C, R } from "../theme";
import { Card, Txt } from "./ui";
import { Icon } from "./Icon";

export function XpHero() {
  const { level, xpToday } = useStore();
  // Smoothly grow/shrink the progress bar when XP changes (like the web).
  const anim = useRef(new Animated.Value(level.progress)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: level.progress,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [level.progress, anim]);
  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  return (
    <Card background={C.primary}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: R.sm,
              backgroundColor: "rgba(255,255,255,0.12)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="Flame" color={C.accent} size={24} />
          </View>
          <View>
            <Txt size={12} weight="bold" color="rgba(255,255,255,0.6)">
              LEVEL
            </Txt>
            <Txt size={28} weight="extrabold" color="#fff">
              {level.level}
            </Txt>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Txt size={12} weight="bold" color="rgba(255,255,255,0.6)">
            TODAY
          </Txt>
          <Txt size={22} weight="extrabold" color={xpToday >= 0 ? "#fff" : C.badAcc}>
            {xpToday >= 0 ? "+" : ""}
            {xpToday} XP
          </Txt>
        </View>
      </View>

      <View style={{ marginTop: 14, gap: 6 }}>
        <View
          style={{ height: 10, borderRadius: R.pill, backgroundColor: "rgba(255,255,255,0.14)", overflow: "hidden" }}
        >
          <Animated.View
            style={{
              height: "100%",
              width,
              backgroundColor: C.accent,
              borderRadius: R.pill,
            }}
          />
        </View>
        <Txt size={12} weight="semibold" color="rgba(255,255,255,0.7)">
          {level.xpIntoLevel} / {level.xpForThisLevel} XP to level {level.level + 1}
        </Txt>
      </View>
    </Card>
  );
}
