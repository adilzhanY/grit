import { Box, Text } from "ink";
import { focusRemainingMs, focusElapsed, fmtElapsed } from "@grit/core";
import { useStore, useNow } from "../../store/store";
import { useUI } from "../ui";
import { theme } from "../theme";

const DEFAULT_HINT =
  "j/k move · space done · a add · / search · : cmd · ? help";

export function StatusBar() {
  const store = useStore();
  const ui = useUI();
  const now = useNow(1000);
  const af = store.activeFocus;

  let focusText: string | null = null;
  let focusColor: string = theme.accent;
  if (af) {
    const phase = af.phase === "focus" ? "Focus" : "Break";
    if (focusElapsed(af, now)) {
      focusText = `⏰ ${phase} done — open Daily Log to answer`;
      focusColor = theme.warn;
    } else if (af.pausedAt != null) {
      focusText = `⏸ ${phase} paused · ${fmtElapsed(focusRemainingMs(af, now))}`;
    } else {
      focusText = `● ${phase} ${fmtElapsed(focusRemainingMs(af, now))}`;
    }
  }

  const cel = store.celebration;
  const celText =
    cel?.kind === "levelup"
      ? `★ Level up! You reached level ${cel.level}`
      : cel?.kind === "milestone"
        ? `★ ${cel.title}: ${cel.label} clean (+${cel.xp} XP)`
        : null;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.inkFaint} paddingX={1}>
      <Box justifyContent="space-between">
        <Text>
          <Text inverse bold color={ui.modeLabel === "NORMAL" ? theme.primary : theme.accent}>
            {` ${ui.modeLabel} `}
          </Text>
          <Text color={theme.inkSoft}>{"  " + (ui.status ?? DEFAULT_HINT)}</Text>
        </Text>
        {focusText ? <Text color={focusColor}>{focusText}</Text> : null}
      </Box>
      {celText ? <Text color={theme.done}>{celText}</Text> : null}
      {store.syncError ? <Text color={theme.warn}>{`sync: ${store.syncError}`}</Text> : null}
    </Box>
  );
}
