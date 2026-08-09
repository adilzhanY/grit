/**
 * Bottom dock — ported from torq's "Five, spelled out" design (fixed equal
 * slots, every tab carries its name, the active tab is accent-colored with a
 * short rail at the top edge; the rail is the only thing that animates, and
 * it animates in place). Grit fits six slots: its five tabs plus You, which
 * used to live in the (now removed) top bar. Profile is the only slot that
 * opens an overlay rather than switching tabs, so it never takes the active
 * state.
 */
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUi, type Tab } from "../lib/ui";
import { C, EDGE, R, clay } from "../theme";
import { Icon } from "./Icon";
import { Txt } from "./ui";

const ITEMS: { tab: Tab; label: string; icon: string }[] = [
  { tab: "today", label: "Today", icon: "Sun" },
  { tab: "planned", label: "Planned", icon: "CalendarDays" },
  { tab: "habits", label: "Habits", icon: "Flame" },
  { tab: "log", label: "Log", icon: "NotebookPen" },
  { tab: "focus", label: "Focus", icon: "Timer" },
];

const IDLE = "rgba(255,255,255,0.6)";

/** Shared shell so every slot measures identically. */
function Slot({
  active,
  onPress,
  label,
  children,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const v = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: active ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      // Only scaleX and opacity — both native-drivable; nothing touches layout.
      useNativeDriver: true,
    }).start();
  }, [active, v]);

  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 4 }}
    >
      {/* The rail sits on the dock's top edge, above the icon. */}
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          width: 26,
          height: 3,
          borderBottomLeftRadius: 3,
          borderBottomRightRadius: 3,
          backgroundColor: C.accent,
          transform: [{ scaleX: v }],
          opacity: v,
        }}
      />
      {children}
      <Txt size={10} weight="bold" color={active ? C.accent : IDLE} numberOfLines={1}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function BottomNav({ onProfile }: { onProfile: () => void }) {
  const { tab, setTab } = useUi();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        {
          position: "absolute",
          left: 14,
          right: 14,
          // The root SafeAreaView only reserves the top inset, so the dock
          // dodges the navigation bar itself.
          bottom: Math.max(insets.bottom, 8) + 8,
          height: 64,
          borderRadius: R.lg,
          backgroundColor: "rgba(21,24,22,0.94)",
          borderWidth: 1,
          borderColor: EDGE,
          flexDirection: "row",
          paddingHorizontal: 4,
          overflow: "hidden",
        },
        clay(),
      ]}
    >
      {ITEMS.map((it) => {
        const active = tab === it.tab;
        return (
          <Slot key={it.tab} active={active} label={it.label} onPress={() => setTab(it.tab)}>
            <Icon name={it.icon} size={21} color={active ? C.accent : IDLE} />
          </Slot>
        );
      })}

      <Slot active={false} label="You" onPress={onProfile}>
        <Icon name="UserCircle" size={22} color={IDLE} />
      </Slot>
    </View>
  );
}
