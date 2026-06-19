/**
 * Tiny .env reader. GritTUI has no bundler to inline env vars, so we load them
 * at startup. Priority: real process.env first, then this app's .env, then the
 * web and mobile .env files (so an existing Grit checkout works with no extra
 * config). We only ever read PUBLIC values — never the Supabase secret key.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", ".."); // apps/tui/src -> repo root

/** Parse a .env file into a flat record. Missing files yield {}. */
function parseEnvFile(path: string): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

const merged: Record<string, string> = {
  ...parseEnvFile(join(repoRoot, "apps", "mobile", ".env")),
  ...parseEnvFile(join(repoRoot, "apps", "web", ".env")),
  ...parseEnvFile(join(repoRoot, "apps", "tui", ".env")),
  // Real environment wins over any file.
  ...Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v != null) as [
      string,
      string,
    ][],
  ),
};

function pick(...names: string[]): string | undefined {
  for (const n of names) {
    if (merged[n]) return merged[n];
  }
  return undefined;
}

export const SUPABASE_URL = pick(
  "GRIT_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_URL",
);

export const SUPABASE_KEY = pick(
  "GRIT_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
);

export function supabaseConfigured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_KEY;
}

/** Where we persist the auth session so you stay logged in between launches. */
export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? join(xdg, "grit") : join(homedir(), ".config", "grit");
}
