import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUi, type Tab } from "../lib/ui";
import { C, claySm } from "../theme";
import { Icon } from "./Icon";
import { Txt } from "./ui";

const ITEMS: { tab: Tab; label: string; icon: string }[] = [
  { tab: "today", label: "Today", icon: "Sun" },
  { tab: "planned", label: "Planned", icon: "CalendarDays" },
  { tab: "habits", label: "Habits", icon: "Flame" },
  { tab: "log", label: "Log", icon: "NotebookPen" },
  { tab: "focus", label: "Focus", icon: "Timer" },
];

export function BottomNav() {
  const { tab, setTab } = useUi();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          flexDirection: "row",
          backgroundColor: C.surface,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 10),
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
        },
        claySm(),
      ]}
    >
      {ITEMS.map((it) => {
        const on = tab === it.tab;
        return (
          <Pressable key={it.tab} onPress={() => setTab(it.tab)} style={{ flex: 1, alignItems: "center", gap: 3 }}>
            <Icon name={it.icon} size={22} color={on ? C.primary : C.inkFaint} />
            <Txt size={10} weight={on ? "bold" : "medium"} color={on ? C.primary : C.inkFaint}>
              {it.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
