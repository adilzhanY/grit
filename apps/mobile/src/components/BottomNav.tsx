/**
 * Floating dock nav: a dark pill bar hovering above the bottom edge. The
 * active tab is a light capsule with icon + label; switching tabs morphs
 * every item's width/fill/label in parallel, so the capsule reads as
 * sliding to its new home (iOS-style morph).
 *
 * Motion is a short ease-out timing, NOT a spring: springs overshoot, and
 * an overshooting value fed into the flex interpolation makes the
 * deflating tab dip narrower than its neighbors and wobble back — it read
 * as the old icon "dragging". Every interpolation is clamped for the same
 * reason. Timing runs with useNativeDriver: false (flex is layout).
 */
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUi, type Tab } from "../lib/ui";
import { C, clay } from "../theme";
import { Icon } from "./Icon";
import { Txt } from "./ui";

const ITEMS: { tab: Tab; label: string; icon: string }[] = [
  { tab: "today", label: "Today", icon: "Sun" },
  { tab: "planned", label: "Planned", icon: "CalendarDays" },
  { tab: "habits", label: "Habits", icon: "Flame" },
  { tab: "log", label: "Log", icon: "NotebookPen" },
  { tab: "focus", label: "Focus", icon: "Timer" },
];

const IDLE_ICON = "rgba(255,255,255,0.68)";

function NavItem({
  item,
  active,
  onPress,
}: {
  item: (typeof ITEMS)[number];
  active: boolean;
  onPress: () => void;
}) {
  const v = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: active ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [active, v]);

  return (
    <Animated.View
      style={{
        flex: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6], extrapolate: "clamp" }),
      }}
    >
      <Pressable onPress={onPress} style={{ flex: 1 }} hitSlop={4}>
        <Animated.View
          style={{
            flex: 1,
            borderRadius: 999,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            backgroundColor: v.interpolate({
              inputRange: [0, 1],
              outputRange: ["rgba(250,249,245,0)", "rgba(250,249,245,1)"],
              extrapolate: "clamp",
            }),
          }}
        >
          {/* Idle and active icons stacked and crossfaded — a hard color
              flip on a still-fading capsule looked washed out. */}
          <View style={{ width: 21, height: 21 }}>
            <Animated.View
              style={{
                position: "absolute",
                opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: "clamp" }),
              }}
            >
              <Icon name={item.icon} size={21} color={IDLE_ICON} />
            </Animated.View>
            <Animated.View
              style={{
                opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }),
              }}
            >
              <Icon name={item.icon} size={21} color={C.primary} />
            </Animated.View>
          </View>
          {/* Collapses to zero width when idle so the lone icon stays centered;
              the label only fades in once the capsule is mostly open. */}
          <Animated.View
            style={{
              maxWidth: v.interpolate({ inputRange: [0, 1], outputRange: [0, 96], extrapolate: "clamp" }),
              opacity: v.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0, 1], extrapolate: "clamp" }),
              overflow: "hidden",
            }}
          >
            <Txt
              size={13}
              weight="bold"
              color={C.primary}
              numberOfLines={1}
              style={{ marginLeft: 7 }}
            >
              {item.label}
            </Txt>
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export function BottomNav() {
  const { tab, setTab } = useUi();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        {
          position: "absolute",
          left: 14,
          right: 14,
          bottom: Math.max(insets.bottom, 8) + 8,
          height: 62,
          borderRadius: 999,
          backgroundColor: C.primary,
          flexDirection: "row",
          padding: 6,
        },
        clay(),
      ]}
    >
      {ITEMS.map((it) => (
        <NavItem key={it.tab} item={it} active={tab === it.tab} onPress={() => setTab(it.tab)} />
      ))}
    </View>
  );
}
