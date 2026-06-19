/**
 * Centered, non-blocking confirmation that pops up when an entry is logged
 * (food, weight, sleep, steps, reading, focus) and fades out on its own. An
 * absolute overlay with pointerEvents="none", so it never swallows a tap.
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { onToast, type ToastData } from "../lib/toast";
import { C, R, clay } from "../theme";
import { PopIn } from "./anim";
import { Icon } from "./Icon";
import { Txt } from "./ui";

export function Toast() {
  const [toast, setToast] = useState<ToastData | null>(null);

  useEffect(() => onToast(setToast), []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(id);
  }, [toast]);

  if (!toast) return null;
  const { xp } = toast;

  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}
    >
      <PopIn key={toast.id}>
        <View
          style={[
            { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.surface, borderRadius: R.md, paddingHorizontal: 18, paddingVertical: 12 },
            clay(),
          ]}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" }}>
            <Icon name={toast.icon} color="#fff" size={20} />
          </View>
          <View>
            <Txt weight="bold" size={15}>
              {toast.title}
            </Txt>
            {xp !== 0 ? (
              <Txt weight="semibold" size={13} color={xp > 0 ? C.coolAcc : C.badAcc}>
                {xp > 0 ? `+${xp}` : xp} XP
              </Txt>
            ) : null}
          </View>
        </View>
      </PopIn>
    </View>
  );
}
