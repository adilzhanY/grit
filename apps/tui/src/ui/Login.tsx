import { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { signIn, signUp } from "../data/auth";
import { TextInput } from "./components/TextInput";
import { theme } from "./theme";

export function Login() {
  const { exit } = useApp();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [field, setField] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mode toggle + quit; the active TextInput handles typing/enter/esc itself.
  useInput((input, key) => {
    if (key.ctrl && input === "n") {
      setMode((m) => (m === "in" ? "up" : "in"));
      setError(null);
    }
    if (key.ctrl && input === "c") exit();
  });

  const submit = async () => {
    if (busy) return;
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    setBusy(true);
    setError(null);
    if (mode === "in") {
      const { error } = await signIn(email, password);
      setBusy(false);
      if (error) setError(error);
      // success -> App's auth subscription swaps to the app.
    } else {
      const { error, needsConfirm } = await signUp(email, password);
      setBusy(false);
      if (error) setError(error);
      else if (needsConfirm) setError("Account created — confirm via the email link, then sign in.");
    }
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={2} paddingY={1}>
      <Text bold color={theme.accent}>
        GritTUI
      </Text>
      <Text color={theme.inkFaint}>
        {mode === "in" ? "Sign in to your Grit account" : "Create a new Grit account"}
      </Text>
      <Box marginTop={1}>
        <Box width={11}>
          <Text color={field === 0 ? theme.accent : theme.inkSoft}>{field === 0 ? "› " : "  "}Email</Text>
        </Box>
        {field === 0 ? (
          <TextInput
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            onSubmit={() => setField(1)}
            onCancel={() => exit()}
          />
        ) : (
          <Text>{email || <Text color={theme.inkFaint}>you@example.com</Text>}</Text>
        )}
      </Box>
      <Box>
        <Box width={11}>
          <Text color={field === 1 ? theme.accent : theme.inkSoft}>{field === 1 ? "› " : "  "}Password</Text>
        </Box>
        {field === 1 ? (
          <TextInput
            value={password}
            mask
            onChange={setPassword}
            placeholder="••••••••"
            onSubmit={() => void submit()}
            onCancel={() => setField(0)}
          />
        ) : (
          <Text>{password ? "*".repeat(password.length) : <Text color={theme.inkFaint}>••••••••</Text>}</Text>
        )}
      </Box>
      {error ? (
        <Text color={theme.warn}>{error}</Text>
      ) : (
        <Text color={theme.inkFaint}> </Text>
      )}
      <Text color={theme.inkFaint}>
        {busy ? "Working…" : "enter next/submit · ctrl-n " + (mode === "in" ? "create account" : "sign in") + " · ctrl-c quit"}
      </Text>
    </Box>
  );
}
