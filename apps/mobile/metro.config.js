// Metro config for the monorepo: watch the workspace root so changes in
// packages/core hot-reload, and let Metro resolve hoisted deps from the root.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Force a SINGLE React across the bundle. The web app pins react 19.2.4 at the
// repo root, but RN 0.79's renderer requires react 19.0.0 exactly. Redirect
// every `react`/`react/*` import (including the one inside react-native) to the
// mobile app's own copy so there's one matching React — no "multiple copies"
// and no "renderer version mismatch".
const reactRoot = path.resolve(projectRoot, "node_modules/react");
const baseResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react" || moduleName.startsWith("react/")) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(reactRoot, "index.js") },
      moduleName,
      platform,
    );
  }
  return (baseResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
