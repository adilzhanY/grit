/**
 * Home FAB + "jelly" log menu. The plus springs into an ✕ while a popover of
 * log options scales up from the bottom-right corner (adapted to grit's clay
 * design, built on RN Animated — no reanimated).
 */
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DayLogKind } from "@grit/core";
import { useUi } from "../lib/ui";
import { C, R, clay, claySm } from "../theme";
import { Icon } from "./Icon";
import { Txt } from "./ui";

const OPTIONS: { kind: DayLogKind | "focus"; label: string; icon: string; acc: string }[] = [
  { kind: "food", label: "Food", icon: "Flame", acc: C.mustAcc },
  { kind: "sleep", label: "Sleep", icon: "Moon", acc: C.impAcc },
  { kind: "steps", label: "Steps", icon: "Footprints", acc: C.coolAcc },
  { kind: "reading", label: "Reading", icon: "BookOpen", acc: C.primary },
  { kind: "weight", label: "Weight", icon: "Scale", acc: C.impAcc },
  { kind: "focus", label: "Focus", icon: "Timer", acc: C.accent },
];

const FAB_SIZE = 60;

export function LogFab() {
  const { openLog, setTab } = useUi();
  const insets = useSafeAreaInsets();
  // Sit clear above the navbar (its height grows with the safe-area inset).
  const fabBottom = 84 + Math.max(insets.bottom, 10);
  const [open, setOpen] = useState(false);
  // Jelly spring: stays mounted so the close animation can play out.
  const p = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      // Snappy spring: settles fast so the (native-driver) transformed hit area
      // reaches full size almost instantly — options are tappable right away,
      // while a touch of overshoot keeps the "jelly" bounce.
      Animated.spring(p, {
        toValue: 1,
        useNativeDriver: true,
        friction: 7,
        tension: 260,
      }).start();
    } else {
      Animated.timing(p, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [open, p]);

  const choose = (k: DayLogKind | "focus") => {
    setOpen(false);
    if (k === "focus") setTab("focus");
    else openLog(k);
  };

  // FAB icon: plus rotates into an ✕ with a mid-press scale dip (the "bounce").
  const fabStyle = {
    transform: [
      { rotate: p.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "135deg"] }) },
      { scale: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.82, 1] }) },
    ],
  };

  // Menu: springs up from the bottom-right corner (scale + slide, overshoot).
  // Start scale high (0.8, not 0.4) so the native-driven touch area is near
  // full size from the first frame — taps land immediately, not after settle.
  const menuStyle = {
    opacity: p.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
    transform: [
      { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
      { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
      { scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
    ],
  };

  return (
    <>
      {/* Dimmed tap-to-close backdrop */}
      <Animated.View
        pointerEvents={open ? "auto" : "none"}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.35)",
          opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} />
      </Animated.View>

      {/* Popover menu, anchored just above the FAB */}
      <Animated.View
        pointerEvents={open ? "auto" : "none"}
        style={[
          {
            position: "absolute",
            right: 20,
            bottom: fabBottom + FAB_SIZE + 14,
            width: 232,
            backgroundColor: C.surface,
            borderRadius: R.lg,
            padding: 8,
          },
          clay(),
          menuStyle,
        ]}
      >
        {OPTIONS.map((o) => (
          <Pressable
            key={o.kind}
            onPress={() => choose(o.kind)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 8,
              paddingHorizontal: 8,
              borderRadius: R.sm,
              backgroundColor: pressed ? C.page2 : "transparent",
            })}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: R.sm,
                backgroundColor: o.acc,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name={o.icon} color="#fff" size={21} />
            </View>
            <Txt weight="bold" size={15}>
              {o.label}
            </Txt>
          </Pressable>
        ))}
      </Animated.View>

      {/* The FAB itself */}
      <View style={{ position: "absolute", right: 20, bottom: fabBottom }}>
        <Pressable
          onPress={() => setOpen((o) => !o)}
          style={[
            {
              width: FAB_SIZE,
              height: FAB_SIZE,
              borderRadius: FAB_SIZE / 2,
              backgroundColor: C.accent,
              alignItems: "center",
              justifyContent: "center",
            },
            claySm(),
            {
              shadowColor: "#141a18",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.3,
              shadowRadius: 10,
              elevation: 8,
            },
          ]}
        >
          <Animated.View style={fabStyle}>
            <Icon name="Plus" color="#fff" size={28} strokeWidth={3} />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}
