import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { workspaceManifestPaths } from "./lib/files.mjs";
import { repositoryRoot, runPnpm } from "./lib/process.mjs";

const requiredInputs = ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml"];

for (const relativePath of requiredInputs) {
  if (!existsSync(path.join(repositoryRoot, relativePath))) {
    throw new Error(`Lockfile sync check requires ${relativePath}.`);
  }
}

const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "setta-workspace-lock-sync-"));
try {
  for (const relativePath of [...requiredInputs, ...workspaceManifestPaths()]) {
    mkdirSync(path.dirname(path.join(temporaryDirectory, relativePath)), { recursive: true });
    cpSync(path.join(repositoryRoot, relativePath), path.join(temporaryDirectory, relativePath));
  }
  runPnpm(["install", "--lockfile-only", "--frozen-lockfile", "--ignore-scripts"], {
    cwd: temporaryDirectory,
  });
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log("Lockfile matches the checked-in manifests.");
