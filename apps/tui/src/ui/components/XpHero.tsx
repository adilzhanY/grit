import { Box, Text } from "ink";
import { fmtXp } from "@grit/core";
import { useStore } from "../../store/store";
import { theme, bar } from "../theme";

export function XpHero() {
  const { level, todayXp } = useStore();
  return (
    <Box justifyContent="space-between">
      <Text>
        <Text bold color={theme.accent}>{`Lv ${level.level}`}</Text>
        <Text color={theme.done}>{"  " + bar(level.progress, 22) + "  "}</Text>
        <Text color={theme.inkSoft}>{`${level.xpIntoLevel}/${level.xpForThisLevel}`}</Text>
      </Text>
      <Text>
        <Text color={theme.ink}>{level.totalXp.toLocaleString()} XP</Text>
        <Text color={todayXp >= 0 ? theme.done : theme.warn}>{`   ${fmtXp(todayXp)} today`}</Text>
      </Text>
    </Box>
  );
}
