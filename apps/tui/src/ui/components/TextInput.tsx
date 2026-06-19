/** Minimal controlled single-line text input for Ink (no external dep). */
import { useState } from "react";
import { Text } from "ink";
import { useInput } from "ink";
import { theme } from "../theme";

export function TextInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder = "",
  mask = false,
  isActive = true,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: (v: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  mask?: boolean;
  isActive?: boolean;
}) {
  const [cursor, setCursor] = useState(value.length);

  useInput(
    (input, key) => {
      if (key.return) {
        onSubmit?.(value);
        return;
      }
      if (key.escape) {
        onCancel?.();
        return;
      }
      if (key.leftArrow) {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.rightArrow) {
        setCursor((c) => Math.min(value.length, c + 1));
        return;
      }
      if (key.backspace || key.delete) {
        if (cursor > 0) {
          const next = value.slice(0, cursor - 1) + value.slice(cursor);
          onChange(next);
          setCursor((c) => Math.max(0, c - 1));
        }
        return;
      }
      if (key.ctrl && input === "u") {
        onChange("");
        setCursor(0);
        return;
      }
      if (key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow) {
        return; // let the parent handle navigation chords
      }
      if (input) {
        const next = value.slice(0, cursor) + input + value.slice(cursor);
        onChange(next);
        setCursor((c) => c + input.length);
      }
    },
    { isActive },
  );

  const shown = mask ? "*".repeat(value.length) : value;
  if (value.length === 0) {
    return (
      <Text>
        <Text inverse> </Text>
        <Text color={theme.inkFaint}>{placeholder}</Text>
      </Text>
    );
  }
  const c = Math.min(cursor, shown.length);
  const before = shown.slice(0, c);
  const at = shown.slice(c, c + 1) || " ";
  const after = shown.slice(c + 1);
  return (
    <Text>
      {before}
      <Text inverse>{at}</Text>
      {after}
    </Text>
  );
}
