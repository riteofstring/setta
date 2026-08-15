import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { workspaceManifestPaths } from "./lib/files.mjs";
import { repositoryRoot } from "./lib/process.mjs";

const rootManifest = JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));
const policy = JSON.parse(readFileSync(path.join(repositoryRoot, ".code-policy.json"), "utf8"));
const workspacePolicyPath = "pnpm-workspace.yaml";
const workspacePolicy = readFileSync(path.join(repositoryRoot, workspacePolicyPath), "utf8");
const expectedPackageManager = rootManifest.packageManager;
const expectedNode = rootManifest.engines?.node;

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
}

function validateManifest(relativePath) {
  const manifest = readJson(relativePath);
  return [
    ...(manifest.private === true
      ? []
      : [`${relativePath}: private must remain true while publishing is undecided`]),
    ...("publishConfig" in manifest
      ? [`${relativePath}: publishConfig is outside the current extraction plan`]
      : []),
    ...(manifest.packageManager && manifest.packageManager !== expectedPackageManager
      ? [`${relativePath}: packageManager must match the root ${String(expectedPackageManager)}`]
      : []),
    ...(manifest.engines?.node && manifest.engines.node !== expectedNode
      ? [`${relativePath}: engines.node must match the root ${String(expectedNode)}`]
      : []),
  ];
}

function requiredWorkspaceSettings() {
  const minimumReleaseAgeDays = policy.supplyChain?.minimumReleaseAgeDays;
  if (!Number.isInteger(minimumReleaseAgeDays) || minimumReleaseAgeDays < 7) {
    return [".code-policy.json: supplyChain.minimumReleaseAgeDays must be at least 7"];
  }
  const required = [
    "saveExact: true",
    "strictPeerDependencies: true",
    `minimumReleaseAge: ${String(minimumReleaseAgeDays * 24 * 60)}`,
    "minimumReleaseAgeStrict: true",
    "minimumReleaseAgeIgnoreMissingTime: false",
    "trustPolicy: no-downgrade",
    "trustLockfile: false",
    "blockExoticSubdeps: true",
  ];
  return required.flatMap((setting) =>
    workspacePolicy.includes(setting)
      ? []
      : [`${workspacePolicyPath}: missing strict target setting ${setting}`],
  );
}

function forbiddenWorkspaceSettings() {
  return ["trustPolicyExclude", "dangerouslyAllowAllBuilds", "auditConfig", "overrides"].flatMap(
    (key) =>
      new RegExp(`^${key}:`, "mu").test(workspacePolicy)
        ? [`${workspacePolicyPath}: ${key} is not an approved target setting`]
        : [],
  );
}

function forbiddenPackageManagerConfiguration() {
  return [".npmrc", ".yarnrc", ".yarnrc.yml"].flatMap((relativePath) =>
    existsSync(path.join(repositoryRoot, relativePath))
      ? [`${relativePath}: package-manager configuration must stay in pnpm-workspace.yaml`]
      : [],
  );
}

const manifestPaths = [
  "package.json",
  ...workspaceManifestPaths(),
  "fixtures/packed-consumer/package.template.json",
];
const failures = [
  ...(expectedPackageManager === "pnpm@10.23.0"
    ? []
    : [`package.json: packageManager must remain pnpm@10.23.0`]),
  ...(expectedNode === "25.2.1" ? [] : [`package.json: engines.node must remain 25.2.1`]),
  ...manifestPaths.flatMap(validateManifest),
  ...requiredWorkspaceSettings(),
  ...forbiddenWorkspaceSettings(),
  ...forbiddenPackageManagerConfiguration(),
];

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `Workspace-specific dependency policy passed for ${String(manifestPaths.length)} manifests.`,
);
