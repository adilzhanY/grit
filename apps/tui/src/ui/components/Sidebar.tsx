import { Box, Text } from "ink";
import { useUI } from "../ui";
import { useStore } from "../../store/store";
import { theme } from "../theme";

export function Sidebar() {
  const ui = useUI();
  const store = useStore();
  return (
    <Box flexDirection="column" width={22} borderStyle="round" borderColor={theme.inkFaint} paddingX={1}>
      <Text bold color={theme.accent}>
        GRIT
      </Text>
      <Text> </Text>
      {ui.nav.map((n, i) => {
        const active = n.id === ui.view;
        const divider =
          n.id === "must" || n.id === "analytics" || (n.id.startsWith("list:") && ui.nav[i - 1]?.id === "analytics");
        return (
          <Box key={n.id} flexDirection="column">
            {divider ? <Text color={theme.inkFaint}>──────────────</Text> : null}
            <Text color={active ? theme.accent : n.color} bold={active} inverse={active}>
              {active ? "▸ " : "  "}
              {n.label}
              {n.num ? <Text color={active ? theme.accent : theme.inkFaint}>{`  ${n.num}`}</Text> : null}
            </Text>
          </Box>
        );
      })}
      <Text> </Text>
      <Text color={theme.inkFaint}>{store.syncing ? "⟳ syncing" : "✓ synced"}</Text>
    </Box>
  );
}
