import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @grit/core ships raw TypeScript from the workspace; let Next transpile it.
  transpilePackages: ["@grit/core"],
  // Ship a fully static bundle (out/): no Node server needed at runtime, so it
  // can be served by a tiny static server and cached for offline by the service
  // worker. The app is 100% client-side (Dexie + Supabase), so nothing is lost.
  output: "export",
  // Static export can't run the on-demand image optimizer; serve images as-is.
  images: { unoptimized: true },
};

export default nextConfig;
