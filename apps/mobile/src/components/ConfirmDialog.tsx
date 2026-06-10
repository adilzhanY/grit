import React, { createContext, useContext, useRef, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { C, R, clay } from "../theme";
import { PopIn } from "./anim";
import { Txt } from "./ui";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const v = useContext(Ctx);
  if (!v) throw new Error("useConfirm must be used within ConfirmProvider");
  return v;
}

/** Promise-based confirm modal, styled + animated like the website. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm: ConfirmFn = (opts) =>
    new Promise<boolean>((resolve) => {
      resolver.current?.(false);
      resolver.current = resolve;
      setReq(opts);
    });

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setReq(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Modal visible={!!req} transparent animationType="fade" onRequestClose={() => settle(false)}>
        <Pressable
          onPress={() => settle(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <PopIn>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={[{ width: "100%", maxWidth: 360, backgroundColor: C.surface, borderRadius: R.md, padding: 22 }, clay()]}
            >
              <Txt size={18} weight="extrabold">{req?.title}</Txt>
              {req?.message ? (
                <Txt size={13} weight="medium" color={C.inkSoft} style={{ marginTop: 6 }}>
                  {req.message}
                </Txt>
              ) : null}
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                <Pressable onPress={() => settle(false)} style={{ borderRadius: R.sm, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: C.page2 }}>
                  <Txt weight="bold" size={13} color={C.inkSoft}>Cancel</Txt>
                </Pressable>
                <Pressable onPress={() => settle(true)} style={{ borderRadius: R.sm, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: C.badAcc }}>
                  <Txt weight="bold" size={13} color="#fff">{req?.confirmLabel ?? "Confirm"}</Txt>
                </Pressable>
              </View>
            </Pressable>
          </PopIn>
        </Pressable>
      </Modal>
    </Ctx.Provider>
  );
}
