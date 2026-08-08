import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildPackageArtifact } from "./lib/package-artifact.mjs";
import { repositoryRoot, runPnpm } from "./lib/process.mjs";

const tarballPath = buildPackageArtifact();
const temporaryRoot = mkdtempSync(path.join(tmpdir(), "setta-workspace-consumer-"));

try {
  cpSync(path.join(repositoryRoot, "fixtures/consumer"), temporaryRoot, { recursive: true });
  const manifestPath = path.join(temporaryRoot, "package.json");
  const manifest = readFileSync(manifestPath, "utf8").replace(
    "file:__SETTA_WORKSPACE_TARBALL__",
    `file:${tarballPath}`,
  );
  writeFileSync(manifestPath, manifest);

  runPnpm(["install", "--no-frozen-lockfile"], { cwd: temporaryRoot });
  runPnpm(["install", "--frozen-lockfile"], { cwd: temporaryRoot });
  runPnpm(["run", "build"], { cwd: temporaryRoot });
  console.log("Packed consumer fixture built successfully.");
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
