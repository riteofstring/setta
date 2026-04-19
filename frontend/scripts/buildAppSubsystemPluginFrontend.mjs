import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(scriptDir, "..");
const repoRootDir = resolve(frontendDir, "..");

const sdkConfigFile = resolve(
  frontendDir,
  "plugin-sdk/app-subsystem/vite.config.mjs",
);
const pluginConfigFile = resolve(
  repoRootDir,
  "plugins/setta-json-render-app-gen/frontend/vite.config.mjs",
);

console.log("Building app-subsystem frontend SDK...");
await build({
  configFile: sdkConfigFile,
});

console.log("Building setta-json-render-app-gen plugin frontend...");
await build({
  configFile: pluginConfigFile,
});
