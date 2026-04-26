import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  realpathSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDir, "..");
const vendoredSdkRoot = resolve(
  frontendRoot,
  "vendor",
  "app-subsystem-frontend-sdk",
);
const vendoredDistPath = resolve(vendoredSdkRoot, "dist", "index.js");
const vendoredTypesPath = resolve(vendoredSdkRoot, "types", "index.d.ts");
const force = process.argv.includes("--force");

if (!force && existsSync(vendoredDistPath) && existsSync(vendoredTypesPath)) {
  process.exit(0);
}

const sdkSourceRoot = resolveSdkSourceRoot();
if (!sdkSourceRoot) {
  fail(
    [
      "Missing vendored @setta/app-subsystem-frontend-sdk build output.",
      "Set SETTA_APP_SUBSYSTEM_FRONTEND_SDK_SOURCE_ROOT to the canonical",
      "frontend/plugin-sdk/app-subsystem source package, or build from a source",
      "distribution that already includes frontend/vendor/app-subsystem-frontend-sdk/dist.",
    ].join(" "),
  );
}

runPnpm(sdkSourceRoot, ["install", "--lockfile=false"]);
runPnpm(sdkSourceRoot, ["run", "build"]);

const sourceDistPath = resolve(sdkSourceRoot, "dist", "index.js");
const sourceTypesPath = resolve(sdkSourceRoot, "types", "index.d.ts");
for (const path of [sourceDistPath, sourceTypesPath]) {
  if (!existsSync(path)) {
    fail(`Canonical SDK build did not produce ${path}.`);
  }
}

mkdirSync(dirname(vendoredDistPath), { recursive: true });
mkdirSync(dirname(vendoredTypesPath), { recursive: true });
copyFileSync(sourceDistPath, vendoredDistPath);
copyFileSync(sourceTypesPath, vendoredTypesPath);

function resolveSdkSourceRoot() {
  const envSourceRoot =
    process.env.SETTA_APP_SUBSYSTEM_FRONTEND_SDK_SOURCE_ROOT?.trim();
  if (envSourceRoot) {
    return validateSdkSourceRoot(resolve(envSourceRoot));
  }

  let current = frontendRoot;
  while (true) {
    const candidate = resolve(
      current,
      "frontend",
      "plugin-sdk",
      "app-subsystem",
    );
    const resolvedCandidate = validateSdkSourceRoot(candidate);
    if (resolvedCandidate) {
      return resolvedCandidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function validateSdkSourceRoot(candidate) {
  const packageJsonPath = resolve(candidate, "package.json");
  const sourceIndexPath = resolve(candidate, "src", "index.ts");
  if (!existsSync(packageJsonPath) || !existsSync(sourceIndexPath)) {
    return null;
  }
  return realpathSync(candidate);
}

function runPnpm(cwd, args) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(command, ["--dir", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0) {
    return;
  }
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  const suffix = output ? `\n${output}` : "";
  fail(`${command} --dir ${cwd} ${args.join(" ")} failed.${suffix}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
