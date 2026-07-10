import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  useFonts,
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
  Onest_800ExtraBold,
} from "@expo-google-fonts/onest";
import { AuthProvider } from "./src/lib/auth";
import { StoreProvider, useStore } from "./src/lib/store";
import { UiProvider, useUi } from "./src/lib/ui";
import { C, clay } from "./src/theme";
import { AccountSheet } from "./src/components/AccountSheet";
import { ConfirmProvider } from "./src/components/ConfirmDialog";
import { Celebration } from "./src/components/Celebration";
import { Toast } from "./src/components/Toast";
import { Logo } from "./src/components/Logo";
import { Today } from "./src/screens/Today";
import { Planned } from "./src/screens/Planned";
import { Habits } from "./src/screens/Habits";
import { DailyLog } from "./src/screens/DailyLog";
import { Focus } from "./src/screens/Focus";
import { Stats } from "./src/screens/Stats";
import { BottomNav } from "./src/components/BottomNav";
import { LogFab } from "./src/components/LogFab";
import { FocusAlarm } from "./src/components/FocusAlarm";
import { Icon } from "./src/components/Icon";
import { Txt } from "./src/components/ui";

function Root() {
  const { tab, setTab } = useUi();
  const { ready, settings } = useStore();
  const [account, setAccount] = useState(false);
  const name = settings.name?.trim() || "Adilzhan";

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 24, backgroundColor: C.page }}>
        <Logo size={96} color={C.primary} />
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.page }}>
      <View style={{ flex: 1 }}>
        {tab === "today" && <Today />}
        {tab === "planned" && <Planned />}
        {tab === "habits" && <Habits />}
        {tab === "log" && <DailyLog />}
        {tab === "focus" && <Focus />}
        {tab === "stats" && <Stats />}
      </View>

      {/* Floating top bar — the dock pill's light twin: logo left, greeting
          centered, stats + account right. Content scrolls under it (screens
          pad TOP_BAR_SPACE); rendered before overlays so they cover it. */}
      <View
        style={[
          {
            position: "absolute",
            top: 8,
            left: 14,
            right: 14,
            height: 52,
            borderRadius: 999,
            backgroundColor: C.surface,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 16,
          },
          clay(),
        ]}
      >
        {/* Brand tile like the app icon: ember flame on the dark rounded square. */}
        <Logo size={26} background="#1A1B1A" />
        <Txt
          size={15}
          weight="extrabold"
          style={{ flex: 1, textAlign: "center" }}
          numberOfLines={1}
        >
          Hello, {name}.
        </Txt>
        <Pressable hitSlop={8} onPress={() => setTab(tab === "stats" ? "today" : "stats")}>
          <Icon name="ChartColumn" size={24} color={tab === "stats" ? C.accent : C.ink} />
        </Pressable>
        <Pressable hitSlop={8} onPress={() => setAccount(true)}>
          <Icon name="UserCircle" size={26} color={C.ink} />
        </Pressable>
      </View>

      {/* FAB + jelly log menu — only on the home page */}
      {tab === "today" ? <LogFab /> : null}

      <BottomNav />
      <AccountSheet open={account} onClose={() => setAccount(false)} />
      <FocusAlarm />
      <Celebration />
      <Toast />
    </View>
  );
}

export default function App() {
  const [loaded] = useFonts({
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
    Onest_800ExtraBold,
  });

  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 24, backgroundColor: C.primary }}>
        <Logo size={96} color="#fff" />
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StoreProvider>
          <UiProvider>
            <ConfirmProvider>
              <SafeAreaView style={{ flex: 1, backgroundColor: C.page }} edges={["top"]}>
                <Root />
              </SafeAreaView>
              <StatusBar style="dark" />
            </ConfirmProvider>
          </UiProvider>
        </StoreProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
