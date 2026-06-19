#!/usr/bin/env node
// Launcher for GritTUI. Registers tsx so the app (and @grit/core, which ships
// raw TypeScript from the workspace) can run straight from source — no build
// step. Works both as the local `grit` bin and after `npm link`.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// Ensure tsx uses the TUI's tsconfig (automatic JSX runtime) no matter the cwd.
process.env.TSX_TSCONFIG_PATH = join(here, "..", "tsconfig.json");

const { register } = await import("tsx/esm/api");
register();

await import(join(here, "..", "src", "cli.tsx"));
