import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Share, TextInput, View } from "react-native";
import { useAuth } from "../lib/auth";
import { useStore } from "../lib/store";
import { C, FONT, R, claySm } from "../theme";
import { Divider, PrimaryButton, SectionTitle, Txt } from "./ui";
import { Icon } from "./Icon";
import { useConfirm } from "./ConfirmDialog";

export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { enabled, user, signIn, signUp, signOut } = useAuth();
  const { syncing, syncError, syncNow, exportBundle, importBundle, settings, setProfile, setSoundsEnabled } = useStore();
  const confirm = useConfirm();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);

  const submitAuth = async () => {
    setBusy(true);
    setErr(null);
    const fn = mode === "signin" ? signIn : signUp;
    const { error } = await fn(email, password);
    setBusy(false);
    if (error) return setErr(error);
    if (mode === "signup") {
      setErr("Account created. Check email if confirmation is on, then sign in.");
      setMode("signin");
      return;
    }
    setEmail("");
    setPassword("");
  };

  const doExport = async () => {
    try {
      const bundle = exportBundle();
      await Share.share({ message: JSON.stringify(bundle) });
    } catch {
      Alert.alert("Export failed", "Could not share the backup.");
    }
  };

  const doImport = async () => {
    if (!(await confirm({ title: "Replace all local data?", message: "This overwrites everything on this device with the backup.", confirmLabel: "Replace" })))
      return;
    try {
      const count = await importBundle(importText.trim());
      setImportText("");
      setShowImport(false);
      Alert.alert("Imported", `Restored ${count} records.`);
    } catch (e) {
      Alert.alert("Import failed", e instanceof Error ? e.message : "Invalid backup.");
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}>
        <View style={{ maxHeight: "88%", backgroundColor: C.page, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg }}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 36, gap: 16 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Txt size={20} weight="extrabold">Account & Sync</Txt>
              <Pressable onPress={onClose} style={{ padding: 6 }}><Icon name="X" size={22} color={C.inkSoft} /></Pressable>
            </View>

            {/* Name */}
            <View style={{ gap: 6 }}>
              <SectionTitle>Your name</SectionTitle>
              <TextInput
                value={settings.name}
                onChangeText={(v) => void setProfile({ name: v })}
                placeholder="Adilzhan"
                placeholderTextColor={C.inkFaint}
                style={inputStyle}
              />
            </View>

            {/* Auth / sync */}
            {!enabled ? (
              <View style={{ backgroundColor: C.surface, borderRadius: R.md, padding: 16 }}>
                <Txt weight="semibold" color={C.inkSoft} size={13}>
                  Cloud sync isn&apos;t configured. Add EXPO_PUBLIC_SUPABASE_URL and
                  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (same as the website) to apps/mobile/.env,
                  then rebuild.
                </Txt>
              </View>
            ) : user ? (
              <View style={[{ backgroundColor: C.surface, borderRadius: R.md, padding: 16, gap: 12 }, claySm()]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Icon name="Check" color={C.coolAcc} size={20} />
                  <Txt weight="bold" size={14} style={{ flex: 1 }} numberOfLines={1}>{user.email}</Txt>
                </View>
                <Txt size={12} weight="semibold" color={syncError ? C.badAcc : C.inkFaint}>
                  {syncError ? `Sync failed: ${syncError}` : syncing ? "Syncing…" : "Synced. Your data flows to every device."}
                </Txt>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <PrimaryButton label={syncing ? "Syncing…" : "Sync now"} onPress={() => void syncNow()} disabled={syncing} />
                  <PrimaryButton label="Sign out" background={C.page2} color={C.ink} onPress={() => void signOut()} />
                </View>
              </View>
            ) : (
              <View style={[{ backgroundColor: C.surface, borderRadius: R.md, padding: 16, gap: 10 }, claySm()]}>
                <SectionTitle>{mode === "signin" ? "Sign in to sync" : "Create account"}</SectionTitle>
                <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={C.inkFaint} autoCapitalize="none" keyboardType="email-address" style={inputStyle} />
                <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={C.inkFaint} secureTextEntry style={inputStyle} />
                {err ? <Txt size={13} weight="semibold" color={C.badAcc}>{err}</Txt> : null}
                <PrimaryButton label={busy ? "…" : mode === "signin" ? "Sign in" : "Create account"} onPress={submitAuth} disabled={busy} />
                <Pressable onPress={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(null); }}>
                  <Txt size={13} weight="semibold" color={C.inkSoft} style={{ textAlign: "center" }}>
                    {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
                  </Txt>
                </Pressable>
              </View>
            )}

            <Divider />

            {/* Backup */}
            <SectionTitle>Backup & data</SectionTitle>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <PrimaryButton label="Export" background={C.page2} color={C.ink} onPress={doExport} />
              <PrimaryButton label="Import" background={C.page2} color={C.ink} onPress={() => setShowImport((s) => !s)} />
            </View>
            {showImport ? (
              <View style={{ gap: 10 }}>
                <Txt size={12} weight="medium" color={C.inkFaint}>
                  Paste the JSON from a grit backup file (exported on web or mobile).
                </Txt>
                <TextInput
                  value={importText}
                  onChangeText={setImportText}
                  placeholder="Paste backup JSON…"
                  placeholderTextColor={C.inkFaint}
                  multiline
                  style={[inputStyle, { height: 120, textAlignVertical: "top" }]}
                />
                <PrimaryButton label="Restore from JSON" onPress={doImport} disabled={!importText.trim()} />
                <Txt size={11} weight="medium" color={C.badAcc}>This replaces all local data.</Txt>
              </View>
            ) : null}

            <Divider />

            {/* Sound */}
            <Pressable onPress={() => void setSoundsEnabled(!settings.soundsEnabled)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Icon name={settings.soundsEnabled ? "Sparkles" : "X"} size={20} color={C.inkSoft} />
              <Txt weight="semibold">Sound {settings.soundsEnabled ? "on" : "off"}</Txt>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const inputStyle = {
  backgroundColor: C.page2,
  borderRadius: R.sm,
  paddingHorizontal: 12,
  paddingVertical: 11,
  fontFamily: FONT.semibold,
  fontSize: 14,
  color: C.ink,
} as const;
