#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(desktopRoot, "..");
const outputDir = join(desktopRoot, "out", "backend");
const executableExtension = process.platform === "win32" ? ".exe" : "";

const targets = [
  { outputName: `setta-backend${executableExtension}`, packagePath: "./cmd/setta-backend" },
  { outputName: `setta${executableExtension}`, packagePath: "./cmd/setta" },
];

mkdirSync(outputDir, { recursive: true });
for (const target of targets) {
  buildTarget(target);
}

function buildTarget(target) {
  const outputPath = join(outputDir, target.outputName);
  const result = spawnSync(
    join(repoRoot, "scripts", "go.sh"),
    ["build", "-o", outputPath, target.packagePath],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  if (process.platform !== "win32") {
    chmodSync(outputPath, 0o755);
  }
}
