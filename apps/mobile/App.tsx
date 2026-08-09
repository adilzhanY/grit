import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
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
import { BottomNav } from "./src/components/BottomNav";
import { LogFab } from "./src/components/LogFab";
import { FocusAlarm } from "./src/components/FocusAlarm";

function Root() {
  const { tab } = useUi();
  const { ready } = useStore();
  const [account, setAccount] = useState(false);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 24, backgroundColor: C.page }}>
        <Logo size={96} color={C.accent} />
        <ActivityIndicator color={C.accent} />
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
      </View>

      {/* FAB + jelly log menu — only on the home page */}
      {tab === "today" ? <LogFab /> : null}

      <BottomNav onProfile={() => setAccount(true)} />
      <AccountSheet open={account} onClose={() => setAccount(false)} />
      <FocusAlarm />
      <Celebration />
      <Toast />
    </View>
  );
}

export default function App() {
  const [loaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 24, backgroundColor: C.page }}>
        <Logo size={96} color={C.accent} />
        <ActivityIndicator color={C.accent} />
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
              <StatusBar style="light" />
            </ConfirmProvider>
          </UiProvider>
        </StoreProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
