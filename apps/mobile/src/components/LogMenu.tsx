import { Modal, Pressable, View } from "react-native";
import type { DayLogKind } from "@grit/core";
import { useUi } from "../lib/ui";
import { C, R, clay } from "../theme";
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

export function LogMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { openLog, setTab } = useUi();
  const choose = (k: DayLogKind | "focus") => {
    onClose();
    if (k === "focus") setTab("focus");
    else openLog(k);
  };
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            { backgroundColor: C.page, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, padding: 20, paddingBottom: 36, gap: 14 },
            clay(),
          ]}
        >
          <Txt size={18} weight="extrabold">What do you want to log?</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {OPTIONS.map((o) => (
              <Pressable
                key={o.kind}
                onPress={() => choose(o.kind)}
                style={{ width: "30%", alignItems: "center", gap: 8, backgroundColor: C.surface, borderRadius: R.md, paddingVertical: 16 }}
              >
                <View style={{ width: 44, height: 44, borderRadius: R.sm, backgroundColor: o.acc, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={o.icon} color="#fff" size={22} />
                </View>
                <Txt weight="bold" size={13}>{o.label}</Txt>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
