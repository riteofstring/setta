import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

import { repositoryRoot, runPnpm } from "./process.mjs";
import { readTarGzip } from "./tar.mjs";

const expectedFiles = new Set([
  "package/README.md",
  "package/THIRD_PARTY_NOTICES.md",
  "package/dist/core.d.ts",
  "package/dist/core.d.ts.map",
  "package/dist/core.js",
  "package/dist/core.js.map",
  "package/dist/index.d.ts",
  "package/dist/index.d.ts.map",
  "package/dist/index.js",
  "package/dist/index.js.map",
  "package/dist/internal/adapter-proof-drag-planning.d.ts",
  "package/dist/internal/adapter-proof-drag-planning.d.ts.map",
  "package/dist/internal/adapter-proof-drag-planning.js",
  "package/dist/internal/adapter-proof-drag-planning.js.map",
  "package/dist/internal/adapter-proof-model.d.ts",
  "package/dist/internal/adapter-proof-model.d.ts.map",
  "package/dist/internal/adapter-proof-model.js",
  "package/dist/internal/adapter-proof-model.js.map",
  "package/dist/internal/collision-characterization.d.ts",
  "package/dist/internal/collision-characterization.d.ts.map",
  "package/dist/internal/collision-characterization.js",
  "package/dist/internal/collision-characterization.js.map",
  "package/dist/internal/document-commands.d.ts",
  "package/dist/internal/document-commands.d.ts.map",
  "package/dist/internal/document-commands.js",
  "package/dist/internal/document-commands.js.map",
  "package/dist/internal/geometry-index.d.ts",
  "package/dist/internal/geometry-index.d.ts.map",
  "package/dist/internal/geometry-index.js",
  "package/dist/internal/geometry-index.js.map",
  "package/dist/internal/interaction-geometry.d.ts",
  "package/dist/internal/interaction-geometry.d.ts.map",
  "package/dist/internal/interaction-geometry.js",
  "package/dist/internal/interaction-geometry.js.map",
  "package/dist/internal/interaction-owner.d.ts",
  "package/dist/internal/interaction-owner.d.ts.map",
  "package/dist/internal/interaction-owner.js",
  "package/dist/internal/interaction-owner.js.map",
  "package/dist/internal/runtime-option-validation.d.ts",
  "package/dist/internal/runtime-option-validation.d.ts.map",
  "package/dist/internal/runtime-option-validation.js",
  "package/dist/internal/runtime-option-validation.js.map",
  "package/dist/internal/section-move-planning.d.ts",
  "package/dist/internal/section-move-planning.d.ts.map",
  "package/dist/internal/section-move-planning.js",
  "package/dist/internal/section-move-planning.js.map",
  "package/dist/internal/selection-planning.d.ts",
  "package/dist/internal/selection-planning.d.ts.map",
  "package/dist/internal/selection-planning.js",
  "package/dist/internal/selection-planning.js.map",
  "package/dist/internal/sorting-preview.d.ts",
  "package/dist/internal/sorting-preview.d.ts.map",
  "package/dist/internal/sorting-preview.js",
  "package/dist/internal/sorting-preview.js.map",
  "package/dist/internal/transient-root-projection.d.ts",
  "package/dist/internal/transient-root-projection.d.ts.map",
  "package/dist/internal/transient-root-projection.js",
  "package/dist/internal/transient-root-projection.js.map",
  "package/dist/internal/upstream-adapter-drag-proof.d.ts",
  "package/dist/internal/upstream-adapter-drag-proof.d.ts.map",
  "package/dist/internal/upstream-adapter-drag-proof.js",
  "package/dist/internal/upstream-adapter-drag-proof.js.map",
  "package/dist/internal/upstream-adapter-geometry-proof.d.ts",
  "package/dist/internal/upstream-adapter-geometry-proof.d.ts.map",
  "package/dist/internal/upstream-adapter-geometry-proof.js",
  "package/dist/internal/upstream-adapter-geometry-proof.js.map",
  "package/dist/internal/upstream-adapter-proof-diagnostics.d.ts",
  "package/dist/internal/upstream-adapter-proof-diagnostics.d.ts.map",
  "package/dist/internal/upstream-adapter-proof-diagnostics.js",
  "package/dist/internal/upstream-adapter-proof-diagnostics.js.map",
  "package/dist/internal/upstream-adapter-proof.d.ts",
  "package/dist/internal/upstream-adapter-proof.d.ts.map",
  "package/dist/internal/upstream-adapter-proof.js",
  "package/dist/internal/upstream-adapter-proof.js.map",
  "package/dist/internal/upstream-dnd-adapter.d.ts",
  "package/dist/internal/upstream-dnd-adapter.d.ts.map",
  "package/dist/internal/upstream-dnd-adapter.js",
  "package/dist/internal/upstream-dnd-adapter.js.map",
  "package/dist/internal/workspace-controller.d.ts",
  "package/dist/internal/workspace-controller.d.ts.map",
  "package/dist/internal/workspace-controller.js",
  "package/dist/internal/workspace-controller.js.map",
  "package/dist/internal/workspace-document-contract.d.ts",
  "package/dist/internal/workspace-document-contract.d.ts.map",
  "package/dist/internal/workspace-document-contract.js",
  "package/dist/internal/workspace-document-contract.js.map",
  "package/dist/internal/workspace-document-validation.d.ts",
  "package/dist/internal/workspace-document-validation.d.ts.map",
  "package/dist/internal/workspace-document-validation.js",
  "package/dist/internal/workspace-document-validation.js.map",
  "package/dist/internal/workspace-document.d.ts",
  "package/dist/internal/workspace-document.d.ts.map",
  "package/dist/internal/workspace-document.js",
  "package/dist/internal/workspace-document.js.map",
  "package/dist/internal/workspace-canvas-adapter.d.ts",
  "package/dist/internal/workspace-canvas-adapter.d.ts.map",
  "package/dist/internal/workspace-canvas-adapter.js",
  "package/dist/internal/workspace-canvas-adapter.js.map",
  "package/dist/internal/workspace-canvas-gesture-policy.d.ts",
  "package/dist/internal/workspace-canvas-gesture-policy.d.ts.map",
  "package/dist/internal/workspace-canvas-gesture-policy.js",
  "package/dist/internal/workspace-canvas-gesture-policy.js.map",
  "package/dist/internal/workspace-canvas-model.d.ts",
  "package/dist/internal/workspace-canvas-model.d.ts.map",
  "package/dist/internal/workspace-canvas-model.js",
  "package/dist/internal/workspace-canvas-model.js.map",
  "package/dist/internal/workspace-canvas-navigation.d.ts",
  "package/dist/internal/workspace-canvas-navigation.d.ts.map",
  "package/dist/internal/workspace-canvas-navigation.js",
  "package/dist/internal/workspace-canvas-navigation.js.map",
  "package/dist/internal/workspace-geometry-service.d.ts",
  "package/dist/internal/workspace-geometry-service.d.ts.map",
  "package/dist/internal/workspace-geometry-service.js",
  "package/dist/internal/workspace-geometry-service.js.map",
  "package/dist/internal/workspace-interaction-boundary.d.ts",
  "package/dist/internal/workspace-interaction-boundary.d.ts.map",
  "package/dist/internal/workspace-interaction-boundary.js",
  "package/dist/internal/workspace-interaction-boundary.js.map",
  "package/dist/internal/workspace-policy.d.ts",
  "package/dist/internal/workspace-policy.d.ts.map",
  "package/dist/internal/workspace-policy.js",
  "package/dist/internal/workspace-policy.js.map",
  "package/dist/internal/workspace-preferences.d.ts",
  "package/dist/internal/workspace-preferences.d.ts.map",
  "package/dist/internal/workspace-preferences.js",
  "package/dist/internal/workspace-preferences.js.map",
  "package/dist/internal/workspace-surface-contract.d.ts",
  "package/dist/internal/workspace-surface-contract.d.ts.map",
  "package/dist/internal/workspace-surface-contract.js",
  "package/dist/internal/workspace-surface-contract.js.map",
  "package/dist/internal/workspace-toolbar.d.ts",
  "package/dist/internal/workspace-toolbar.d.ts.map",
  "package/dist/internal/workspace-toolbar.js",
  "package/dist/internal/workspace-toolbar.js.map",
  "package/dist/internal/workspace-viewport-lifecycle.d.ts",
  "package/dist/internal/workspace-viewport-lifecycle.d.ts.map",
  "package/dist/internal/workspace-viewport-lifecycle.js",
  "package/dist/internal/workspace-viewport-lifecycle.js.map",
  "package/dist/internal/workspace-viewport-synchronizer.d.ts",
  "package/dist/internal/workspace-viewport-synchronizer.d.ts.map",
  "package/dist/internal/workspace-viewport-synchronizer.js",
  "package/dist/internal/workspace-viewport-synchronizer.js.map",
  "package/dist/react.d.ts",
  "package/dist/react.d.ts.map",
  "package/dist/react.js",
  "package/dist/react.js.map",
  "package/dist/styles.css",
  "package/dist/testing.d.ts",
  "package/dist/testing.d.ts.map",
  "package/dist/testing.js",
  "package/dist/testing.js.map",
  "package/package.json",
]);

function validateEntries(entries) {
  const actualFiles = new Set(entries.map((entry) => entry.name));
  const missing = [...expectedFiles].filter((name) => !actualFiles.has(name));
  const unexpected = [...actualFiles].filter((name) => !expectedFiles.has(name));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      [
        missing.length > 0 ? `Missing package files: ${missing.join(", ")}` : "",
        unexpected.length > 0 ? `Unexpected package files: ${unexpected.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

function validateManifest(entries) {
  const manifestEntry = entries.find((entry) => entry.name === "package/package.json");
  if (!manifestEntry) {
    throw new Error("Packed artifact is missing package/package.json.");
  }
  const manifest = JSON.parse(manifestEntry.content.toString("utf8"));
  if (manifest.name !== "@setta/workspace" || manifest.private !== true) {
    throw new Error("Packed manifest must remain the private @setta/workspace package.");
  }
  if ("publishConfig" in manifest) {
    throw new Error("Packed manifest must not contain publishConfig.");
  }
}

export function buildPackageArtifact() {
  const artifactsDirectory = path.join(repositoryRoot, ".artifacts");
  const packageRoot = path.join(repositoryRoot, "packages/workspace");
  rmSync(artifactsDirectory, { force: true, recursive: true });
  mkdirSync(artifactsDirectory, { recursive: true });

  runPnpm(["run", "build:package"]);
  runPnpm(["pack", "--pack-destination", artifactsDirectory], { cwd: packageRoot });

  const tarballs = readdirSync(artifactsDirectory).filter((name) => name.endsWith(".tgz"));
  if (tarballs.length !== 1) {
    throw new Error(`Expected one package tarball, found ${tarballs.length}.`);
  }

  const tarballPath = path.join(artifactsDirectory, tarballs[0]);
  const entries = readTarGzip(readFileSync(tarballPath));
  validateEntries(entries);
  validateManifest(entries);
  return tarballPath;
}
