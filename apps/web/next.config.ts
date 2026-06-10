import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @grit/core ships raw TypeScript from the workspace; let Next transpile it.
  transpilePackages: ["@grit/core"],
};

export default nextConfig;
