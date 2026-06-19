/** Root: auth gate -> store -> UI shell. Owns the global (view-switching) keymap. */
import { useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { User } from "@supabase/supabase-js";
import { supabaseConfigured } from "../supabase";
import { getSession, onAuthStateChange, signOut } from "../data/auth";
import { StoreProvider, useStore, clearLocalData } from "../store/store";
import { resetSyncCursor } from "../data/sync";
import { UIProvider, useUI } from "./ui";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { MainView } from "./views/Views";
import { Login } from "./Login";
import { theme } from "./theme";

export function App() {
  const [phase, setPhase] = useState<"loading" | "login" | "app">("loading");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let alive = true;
    getSession().then((s) => {
      if (!alive) return;
      setUser(s?.user ?? null);
      setPhase(s?.user ? "app" : "login");
    });
    const unsub = onAuthStateChange((u) => {
      if (!alive) return;
      setUser(u);
      setPhase(u ? "app" : "login");
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  if (!supabaseConfigured()) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={theme.warn} paddingX={2} paddingY={1}>
        <Text color={theme.warn} bold>
          Supabase is not configured.
        </Text>
        <Text color={theme.inkSoft}>
          Set GRIT_SUPABASE_URL and GRIT_SUPABASE_PUBLISHABLE_KEY (see apps/tui/.env.example),
        </Text>
        <Text color={theme.inkSoft}>or run from a checkout where apps/web/.env is filled in.</Text>
      </Box>
    );
  }

  if (phase === "loading") return <Text color={theme.inkFaint}>Connecting…</Text>;
  if (phase === "login" || !user) return <Login />;

  return (
    <StoreProvider key={user.id} user={user}>
      <Shell
        onSignOut={async () => {
          const id = user.id;
          await signOut();
          clearLocalData();
          resetSyncCursor(id);
          setUser(null);
          setPhase("login");
        }}
      />
    </StoreProvider>
  );
}

function Shell({ onSignOut }: { onSignOut: () => void }) {
  const { exit } = useApp();
  return (
    <UIProvider onSignOut={onSignOut} onQuit={() => exit()}>
      <Layout />
    </UIProvider>
  );
}

function Layout() {
  const store = useStore();
  const ui = useUI();

  // Auto-dismiss the level-up / milestone banner.
  useEffect(() => {
    if (!store.celebration) return;
    const id = setTimeout(() => store.dismissCelebration(), 4500);
    return () => clearTimeout(id);
  }, [store.celebration, store]);

  // Auto-clear a transient status note after a few seconds.
  useEffect(() => {
    if (!ui.status) return;
    const id = setTimeout(() => ui.notify(null), 4000);
    return () => clearTimeout(id);
  }, [ui.status, ui]);

  if (!store.ready) {
    return (
      <Box paddingX={1}>
        <Text color={theme.accent}>⟳ </Text>
        <Text color={theme.inkSoft}>Loading your data from the cloud…</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Sidebar />
        <Box flexDirection="column" flexGrow={1} marginLeft={1} paddingX={1}>
          <MainView />
        </Box>
      </Box>
      <StatusBar />
      <GlobalKeys />
    </Box>
  );
}

/** View-switching / overlay-opening keys. Inactive while an overlay is up. */
function GlobalKeys() {
  const ui = useUI();
  useInput(
    (input, key) => {
      if (key.tab) return ui.cycleView(key.shift ? -1 : 1);
      if (input === ":") return ui.openCommand();
      if (input === "/") return ui.openSearch();
      if (input === "?") return ui.openHelp();
      if (key.ctrl && input === "p") return ui.openFuzzy();
      if (/^[1-9]$/.test(input)) {
        const item = ui.nav[Number(input) - 1];
        if (item) ui.setView(item.id);
      }
    },
    { isActive: !ui.inputCaptured },
  );
  return null;
}
