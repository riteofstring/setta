import assert from "node:assert/strict";
import test from "node:test";

import {
  extractModuleSpecifiers,
  getPublicWorkspaceSpecifiers,
  validatePackageExportTargets,
  validateRepositoryPaths,
  validateSourceImports,
} from "./check-boundaries.mjs";

test("accepts the intentional blank-slate tree and reviewed automation scripts", () => {
  assert.deepEqual(
    validateRepositoryPaths([
      "package.json",
      "apps/playground/src/App.tsx",
      "patches/@xyflow__system@0.0.79.patch",
      "packages/workspace/src/core.ts",
      "fixtures/consumer/src/main.tsx",
      "scripts/automation/codex-loop/run-plan-implementation-loop.sh",
    ]),
    [],
  );
});

test("rejects legacy application, runtime, and distribution paths", () => {
  const failures = validateRepositoryPaths([
    "backend/server.py",
    "apps/legacy/App.tsx",
    "scripts/release/publish.mjs",
    "scripts/worktree.sh",
  ]);

  assert.ok(failures.some((failure) => failure.includes("backend/server.py")));
  assert.ok(failures.some((failure) => failure.includes("only apps/playground/")));
  assert.ok(failures.some((failure) => failure.includes("prohibited legacy or distribution")));
  assert.ok(failures.some((failure) => failure.includes("reviewed project-owned allowlist")));
});

test("extracts multiline, side-effect, and dynamic module specifiers", () => {
  const source = `
    import {
      value,
    } from "./value.js";
    import "@setta/workspace/styles.css";
    export type { Model } from "./model.js";
    const lazy = import("./lazy.js");
  `;

  assert.deepEqual(extractModuleSpecifiers(source).sort(), [
    "./lazy.js",
    "./model.js",
    "./value.js",
    "@setta/workspace/styles.css",
  ]);
});

test("rejects source-tree escapes and undeclared application aliases", () => {
  const failures = validateSourceImports({
    allowedPackages: new Set(["react"]),
    relativePath: "packages/workspace/src/react.tsx",
    scopeRoot: "packages/workspace/src/",
    source: `
      import type { ReactNode } from "react";
      import { state } from "frontend/src/state";
      import { legacy } from "../../../frontend/legacy";
    `,
  });

  assert.deepEqual(failures, [
    "packages/workspace/src/react.tsx: external import frontend/src/state is not declared for this workspace",
    "packages/workspace/src/react.tsx: relative import ../../../frontend/legacy escapes packages/workspace/src/",
  ]);
});

test("allows declared package exports and rejects source subpaths", () => {
  const manifest = {
    name: "@setta/workspace",
    exports: {
      ".": "./dist/index.js",
      "./core": "./dist/core.js",
      "./styles.css": "./dist/styles.css",
    },
  };
  const publicWorkspaceSpecifiers = getPublicWorkspaceSpecifiers(manifest);
  const failures = validateSourceImports({
    allowedPackages: new Set(["@setta/workspace", "react"]),
    publicWorkspaceSpecifiers,
    relativePath: "fixtures/consumer/src/main.tsx",
    scopeRoot: "fixtures/consumer/",
    source: `
      import { createDocument } from "@setta/workspace/core";
      import "@setta/workspace/styles.css";
      import { internal } from "@setta/workspace/src/core";
    `,
  });

  assert.deepEqual(failures, [
    "fixtures/consumer/src/main.tsx: @setta/workspace/src/core is not a declared @setta/workspace export",
  ]);
});

test("requires every package export target to remain in dist", () => {
  assert.deepEqual(
    validatePackageExportTargets({
      exports: {
        ".": "./dist/index.js",
        "./internal": "./src/internal.ts",
      },
    }),
    ["packages/workspace/package.json: export target ./src/internal.ts must stay inside ./dist/"],
  );
});
