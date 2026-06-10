import { useEffect } from "react";
import { Modal, Pressable, View } from "react-native";
import { useStore } from "../lib/store";
import { C, R, clay } from "../theme";
import { Celebrate, PopIn } from "./anim";
import { Icon } from "./Icon";
import { Txt } from "./ui";

export function Celebration() {
  const { celebration, dismissCelebration } = useStore();

  useEffect(() => {
    if (celebration?.kind === "milestone") {
      const id = setTimeout(dismissCelebration, 4000);
      return () => clearTimeout(id);
    }
  }, [celebration, dismissCelebration]);

  if (!celebration) return null;

  if (celebration.kind === "milestone") {
    return (
      <Modal transparent animationType="fade" onRequestClose={dismissCelebration}>
        <View style={{ flex: 1, alignItems: "center", paddingTop: 60 }} pointerEvents="box-none">
          <PopIn>
            <Pressable
              onPress={dismissCelebration}
              style={[{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.surface, borderRadius: R.md, paddingHorizontal: 18, paddingVertical: 12 }, clay()]}
            >
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" }}>
                <Icon name="Trophy" color="#fff" size={20} />
              </View>
              <View>
                <Txt weight="bold" size={15}>{celebration.label} clean! 🛡️</Txt>
                <Txt weight="semibold" size={13} color={C.coolAcc}>+{celebration.xp} XP · {celebration.title}</Txt>
              </View>
            </Pressable>
          </PopIn>
        </View>
      </Modal>
    );
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={dismissCelebration}>
      <Pressable
        onPress={dismissCelebration}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 24 }}
      >
        <Celebrate>
          <View style={[{ maxWidth: 340, alignItems: "center", borderRadius: R.lg, padding: 36, backgroundColor: C.primary }, clay()]}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
              <Icon name="Trophy" color="#fff" size={40} />
            </View>
            <Txt size={12} weight="bold" color="rgba(255,255,255,0.7)" style={{ marginTop: 18, textTransform: "uppercase", letterSpacing: 2 }}>
              Level up
            </Txt>
            <Txt size={72} weight="extrabold" color="#fff" style={{ lineHeight: 78 }}>
              {celebration.level}
            </Txt>
            <Txt size={16} weight="semibold" color="#fff" style={{ marginTop: 10 }}>
              Ты ебошишь! Keep going. 🔥
            </Txt>
            <Txt size={12} weight="medium" color="rgba(255,255,255,0.7)" style={{ marginTop: 8 }}>
              Tap anywhere to continue
            </Txt>
          </View>
        </Celebrate>
      </Pressable>
    </Modal>
  );
}
