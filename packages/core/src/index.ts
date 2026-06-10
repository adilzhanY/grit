/**
 * @grit/core — platform-agnostic domain logic shared by the web (Next.js) and
 * mobile (Expo) apps. Pure TypeScript only: no DOM, no IndexedDB, no React
 * Native. Storage and UI live in each app; this is the brain they share.
 */
export * from "./types";
export * from "./day";
export * from "./daylog";
export * from "./milestones";
export * from "./leveling";
export * from "./schedule";
