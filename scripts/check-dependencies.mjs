import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { repositoryRoot } from "./lib/process.mjs";

const expectedPackageManager = "pnpm@11.19.0";
const expectedNode = "24.18.1";
const supplyChainExceptionsPath = "supply-chain-exceptions.json";
const patchedDependencyPolicyPath = "pnpm-workspace.yaml";
const workspacePolicyPaths = ["pnpm-workspace.yaml", "fixtures/consumer/pnpm-workspace.yaml"];
const manifestPaths = [
  "package.json",
  "packages/workspace/package.json",
  "apps/playground/package.json",
  "fixtures/consumer/package.json",
];
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
}

function isAllowedLocalSpecifier(specifier) {
  return specifier.startsWith("workspace:") || specifier === "file:__SETTA_WORKSPACE_TARBALL__";
}

function validateDependencies(relativePath, manifest) {
  return dependencyFields.flatMap((field) =>
    Object.entries(manifest[field] ?? {}).flatMap(([name, specifier]) => {
      if (exactVersionPattern.test(specifier) || isAllowedLocalSpecifier(specifier)) {
        return [];
      }
      return [`${relativePath}: ${field}.${name} must use an exact version, got ${specifier}`];
    }),
  );
}

function validateManifest(relativePath) {
  const manifest = readJson(relativePath);
  const failures = validateDependencies(relativePath, manifest);

  if (manifest.private !== true) {
    failures.push(`${relativePath}: private must be true`);
  }
  if ("publishConfig" in manifest) {
    failures.push(`${relativePath}: publishConfig is outside the current plan`);
  }
  if (manifest.packageManager && manifest.packageManager !== expectedPackageManager) {
    failures.push(`${relativePath}: packageManager must be ${expectedPackageManager}`);
  }
  if (manifest.engines?.node && manifest.engines.node !== expectedNode) {
    failures.push(`${relativePath}: engines.node must be ${expectedNode}`);
  }

  return failures;
}

function validateSupplyChainSettings() {
  const requiredSettings = [
    "minimumReleaseAge: 10080",
    "minimumReleaseAgeStrict: true",
    "minimumReleaseAgeIgnoreMissingTime: false",
    "trustPolicy: no-downgrade",
    "trustLockfile: false",
    "blockExoticSubdeps: true",
    '"nanoid@<3.3.17": "3.3.17"',
    "esbuild: true",
  ];
  return workspacePolicyPaths.flatMap((relativePath) => {
    const contents = readFileSync(path.join(repositoryRoot, relativePath), "utf8");
    return requiredSettings.flatMap((setting) =>
      contents.includes(setting) ? [] : [`${relativePath}: missing ${setting}`],
    );
  });
}

function configuredMinimumReleaseAgeExclusions(contents) {
  const block = contents.match(/minimumReleaseAgeExclude:\n((?:\s+- "[^"]+"\n?)*)/u)?.[1] ?? "";
  return [...block.matchAll(/^\s+- "([^"]+)"$/gmu)].map((match) => match[1]);
}

function requiredTextFailure(value, message) {
  return typeof value === "string" && value.trim().length > 0 ? [] : [message];
}

function expiryFailure(identifier, expires, today) {
  const expiry = new Date(`${expires}T23:59:59Z`);
  return Number.isNaN(expiry.valueOf()) || expiry <= today
    ? [`${supplyChainExceptionsPath}: ${identifier} expired on ${expires}`]
    : [];
}

function validateExceptionMetadata(exception, today) {
  const identifier = `${exception.package}@${exception.version}`;

  return [
    ...requiredTextFailure(
      exception.package,
      `${supplyChainExceptionsPath}: ${identifier} needs a package`,
    ),
    ...(exactVersionPattern.test(String(exception.version))
      ? []
      : [`${supplyChainExceptionsPath}: ${identifier} must name an exact version`]),
    ...requiredTextFailure(
      exception.rationale,
      `${supplyChainExceptionsPath}: ${identifier} needs a rationale`,
    ),
    ...requiredTextFailure(
      exception.owner,
      `${supplyChainExceptionsPath}: ${identifier} needs an owner`,
    ),
    ...expiryFailure(identifier, exception.expires, today),
  ];
}

function validateWorkspaceExceptions(relativePath, expectedIdentifiers) {
  const contents = readFileSync(path.join(repositoryRoot, relativePath), "utf8");
  const configuredIdentifiers = configuredMinimumReleaseAgeExclusions(contents);
  const configuredSet = new Set(configuredIdentifiers);
  const expectedSet = new Set(expectedIdentifiers);

  return [
    ...expectedIdentifiers.flatMap((identifier) =>
      configuredSet.has(identifier)
        ? []
        : [`${relativePath}: missing exact minimumReleaseAgeExclude for ${identifier}`],
    ),
    ...configuredIdentifiers.flatMap((identifier) =>
      expectedSet.has(identifier)
        ? []
        : [`${relativePath}: ${identifier} has no owned, expiring exception metadata`],
    ),
  ];
}

function validateSupplyChainExceptions() {
  const exceptionConfig = readJson(supplyChainExceptionsPath);
  const exceptions = exceptionConfig.minimumReleaseAge ?? [];
  const identifiers = exceptions.map((exception) => `${exception.package}@${exception.version}`);
  const today = new Date();

  return [
    ...exceptions.flatMap((exception) => validateExceptionMetadata(exception, today)),
    ...(new Set(identifiers).size === identifiers.length
      ? []
      : [`${supplyChainExceptionsPath}: exception identifiers must be unique`]),
    ...workspacePolicyPaths.flatMap((relativePath) =>
      validateWorkspaceExceptions(relativePath, identifiers),
    ),
  ];
}

function configuredPatchedDependencies(contents) {
  const block = contents.match(/patchedDependencies:\n((?:\s{2}.+\n?)*)/u)?.[1] ?? "";
  return block
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(": ");
      if (separatorIndex < 0) {
        return { identifier: line.trim(), patch: "" };
      }
      const stripQuotes = (value) => value.trim().replace(/^['"]|['"]$/gu, "");
      return {
        identifier: stripQuotes(line.slice(0, separatorIndex)),
        patch: stripQuotes(line.slice(separatorIndex + 2)),
      };
    });
}

function validatePatchedDependencies() {
  const exceptionConfig = readJson(supplyChainExceptionsPath);
  const exceptions = exceptionConfig.patchedDependencies ?? [];
  const today = new Date();
  const configured = configuredPatchedDependencies(
    readFileSync(path.join(repositoryRoot, patchedDependencyPolicyPath), "utf8"),
  );
  const expectedByIdentifier = new Map(
    exceptions.map((exception) => [`${exception.package}@${exception.version}`, exception]),
  );

  return [
    ...exceptions.flatMap((exception) => {
      const identifier = `${exception.package}@${exception.version}`;
      return [
        ...validateExceptionMetadata(exception, today),
        ...requiredTextFailure(
          exception.patch,
          `${supplyChainExceptionsPath}: ${identifier} needs a patch path`,
        ),
        ...requiredTextFailure(
          exception.removalCondition,
          `${supplyChainExceptionsPath}: ${identifier} needs a removal condition`,
        ),
        ...(typeof exception.patch === "string" &&
        exception.patch.startsWith("patches/") &&
        existsSync(path.join(repositoryRoot, exception.patch))
          ? []
          : [`${supplyChainExceptionsPath}: ${identifier} patch must exist under patches/`]),
      ];
    }),
    ...(expectedByIdentifier.size === exceptions.length
      ? []
      : [`${supplyChainExceptionsPath}: patched dependency identifiers must be unique`]),
    ...configured.flatMap(({ identifier, patch }) => {
      const expected = expectedByIdentifier.get(identifier);
      if (!expected) {
        return [
          `${patchedDependencyPolicyPath}: ${identifier} has no owned, expiring patch metadata`,
        ];
      }
      return expected.patch === patch
        ? []
        : [`${patchedDependencyPolicyPath}: ${identifier} must use ${expected.patch}`];
    }),
    ...exceptions.flatMap((exception) => {
      const identifier = `${exception.package}@${exception.version}`;
      return configured.some((entry) => entry.identifier === identifier)
        ? []
        : [`${patchedDependencyPolicyPath}: missing patched dependency ${identifier}`];
    }),
  ];
}

const rootManifest = readJson("package.json");
const failures = [
  ...manifestPaths.flatMap(validateManifest),
  ...validateSupplyChainSettings(),
  ...validateSupplyChainExceptions(),
  ...validatePatchedDependencies(),
];

if (rootManifest.packageManager !== expectedPackageManager) {
  failures.push(`package.json: packageManager must be ${expectedPackageManager}`);
}
if (rootManifest.engines?.node !== expectedNode) {
  failures.push(`package.json: engines.node must be ${expectedNode}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Dependency policy passed for ${manifestPaths.length} manifests.`);
