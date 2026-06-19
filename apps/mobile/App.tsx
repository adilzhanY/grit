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
import { C } from "./src/theme";
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
      {/* Top bar: greeting + account button (sits in its own row, never over content) */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingTop: 2,
          paddingBottom: 4,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Logo size={26} color={C.primary} />
          <Txt size={16} weight="extrabold">
            Hello, {name}.
          </Txt>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            onPress={() => setTab(tab === "stats" ? "today" : "stats")}
            hitSlop={8}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: tab === "stats" ? C.primary : C.surface,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#141a18",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.12,
              shadowRadius: 5,
              elevation: 3,
            }}
          >
            <Icon name="ChartColumn" size={17} color={tab === "stats" ? "#fff" : C.primary} />
          </Pressable>
          <Pressable
            onPress={() => setAccount(true)}
            hitSlop={8}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: C.surface,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#141a18",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.12,
              shadowRadius: 5,
              elevation: 3,
            }}
          >
            <Icon name="UserCircle" size={18} color={C.primary} />
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "today" && <Today />}
        {tab === "planned" && <Planned />}
        {tab === "habits" && <Habits />}
        {tab === "log" && <DailyLog />}
        {tab === "focus" && <Focus />}
        {tab === "stats" && <Stats />}
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
