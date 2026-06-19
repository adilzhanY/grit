/**
 * Supabase client for the terminal. Node has no localStorage, so we give the
 * auth library a small file-backed storage adapter: the session token (and
 * nothing else) lives in ~/.config/grit/session.json so you stay signed in
 * across launches. All app DATA stays in the cloud — this is just credentials.
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  createClient,
  type SupabaseClient,
  type SupportedStorage,
} from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY, supabaseConfigured, configDir } from "./env";

function fileStore(): SupportedStorage {
  const dir = configDir();
  const file = join(dir, "session.json");
  const read = (): Record<string, string> => {
    try {
      return JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
    } catch {
      return {};
    }
  };
  const write = (data: Record<string, string>): void => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
  };
  return {
    getItem: (key: string) => read()[key] ?? null,
    setItem: (key: string, value: string) => {
      const data = read();
      data[key] = value;
      write(data);
    },
    removeItem: (key: string) => {
      const data = read();
      delete data[key];
      try {
        if (Object.keys(data).length === 0) rmSync(file);
        else write(data);
      } catch {
        /* ignore */
      }
    },
  };
}

let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (!_client) {
    _client = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
      auth: {
        storage: fileStore(),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return _client;
}

export { supabaseConfigured };
