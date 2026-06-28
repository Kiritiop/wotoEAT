const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Zustand's package.json exports field points to ESM (.mjs) files that use
// `import.meta`, which Metro cannot handle. Force CJS resolution instead.
const ZUSTAND_CJS = {
  zustand: path.resolve(__dirname, "node_modules/zustand/index.js"),
  "zustand/middleware": path.resolve(__dirname, "node_modules/zustand/middleware.js"),
  "zustand/shallow": path.resolve(__dirname, "node_modules/zustand/shallow.js"),
  "zustand/vanilla": path.resolve(__dirname, "node_modules/zustand/vanilla.js"),
  "zustand/react": path.resolve(__dirname, "node_modules/zustand/react.js"),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (ZUSTAND_CJS[moduleName]) {
    return { type: "sourceFile", filePath: ZUSTAND_CJS[moduleName] };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
