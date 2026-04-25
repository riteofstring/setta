import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(scriptDir, "..");
const repoRootDir = resolve(frontendDir, "..");
const pluginFrontendDir = resolve(
  repoRootDir,
  "plugins/setta-json-render-app-gen/frontend",
);
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

console.log(
  "Delegating to the plugin-owned app plugin frontend build in plugins/setta-json-render-app-gen/frontend...",
);

const result = spawnSync(pnpmCommand, ["run", "build"], {
  cwd: pluginFrontendDir,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
