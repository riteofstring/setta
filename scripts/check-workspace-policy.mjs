import { readFileSync } from "node:fs";
import path from "node:path";

import { repositoryRoot } from "./lib/process.mjs";

const rootManifest = JSON.parse(
  readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
);
const expectedPackageManager = rootManifest.packageManager;
const expectedNode = rootManifest.engines?.node;
const pinnedNode = readFileSync(
  path.join(repositoryRoot, ".node-version"),
  "utf8",
).trim();

function readJson(relativePath) {
  return JSON.parse(
    readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
  );
}

function validatePublication(relativePath, manifest) {
  const publishable = relativePath === "packages/workspace/package.json";
  return [
    ...(publishable || manifest.private === true
      ? []
      : [`${relativePath}: applications and fixtures must remain private`]),
    ...(publishable &&
    (manifest.private === true || manifest.publishConfig?.access !== "public")
      ? [
          `${relativePath}: the frontend library must declare public publication`,
        ]
      : []),
  ];
}

function validateManifest(relativePath) {
  const manifest = readJson(relativePath);
  return [
    ...validatePublication(relativePath, manifest),
    ...(manifest.packageManager &&
    manifest.packageManager !== expectedPackageManager
      ? [
          `${relativePath}: packageManager must match the root ${String(expectedPackageManager)}`,
        ]
      : []),
    ...(manifest.engines?.node && manifest.engines.node !== expectedNode
      ? [
          `${relativePath}: engines.node must match the root ${String(expectedNode)}`,
        ]
      : []),
  ];
}

const manifestPaths = [
  "package.json",
  "packages/workspace/package.json",
  "examples/workspace-playground/package.json",
  "fixtures/packed-consumer/package.json",
  "fixtures/packed-consumer/package.template.json",
];
const failures = [
  ...(expectedPackageManager === "pnpm@10.23.0"
    ? []
    : [`package.json: packageManager must remain pnpm@10.23.0`]),
  ...(expectedNode === pinnedNode
    ? []
    : [`package.json: engines.node must match .node-version (${pinnedNode})`]),
  ...manifestPaths.flatMap(validateManifest),
];

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `Workspace publication policy passed for ${String(manifestPaths.length)} manifests.`,
);
