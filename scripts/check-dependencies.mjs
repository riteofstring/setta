import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { fixtureManifestPaths, workspaceManifestPaths } from "./lib/files.mjs";
import { repositoryRoot } from "./lib/process.mjs";

const expectedPackageManager = "pnpm@10.23.0";
const expectedNode = "25.2.1";
const workspacePolicyPath = "pnpm-workspace.yaml";
const policyPath = "supply-chain-policy.json";
const exceptionsPath = "supply-chain-exceptions.json";
const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const pinnedDependencyFields = ["dependencies", "devDependencies", "optionalDependencies"];
const forbiddenTrackedFiles = [
  ".npmrc",
  ".yarnrc",
  ".yarnrc.yml",
  "package-lock.json",
  "yarn.lock",
];

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
}

function listManifestPaths() {
  return ["package.json", ...workspaceManifestPaths(), ...fixtureManifestPaths()];
}

function validatePinnedDependencies(relativePath, manifest) {
  return pinnedDependencyFields.flatMap((field) =>
    Object.entries(manifest[field] ?? {}).flatMap(([name, specifier]) => {
      // The policy admits exact versions plus explicit workspace/local artifact specifiers;
      // the packed-consumer fixture depends on the tarball through a file: placeholder.
      if (
        exactVersionPattern.test(specifier) ||
        specifier.startsWith("workspace:") ||
        specifier.startsWith("file:")
      ) {
        return [];
      }
      return [`${relativePath}: ${field}.${name} must use an exact version, got ${specifier}`];
    }),
  );
}

function validatePeerDependencies(relativePath, manifest) {
  return Object.entries(manifest.peerDependencies ?? {}).flatMap(([name, specifier]) => {
    if (typeof specifier !== "string" || specifier.trim() === "") {
      return [`${relativePath}: peerDependencies.${name} must be a non-empty range`];
    }
    if (specifier === "*" || specifier === "latest" || specifier === "x") {
      return [
        `${relativePath}: peerDependencies.${name} must name a supported range, got ${specifier}`,
      ];
    }
    return [];
  });
}

function validateManifest(relativePath) {
  const manifest = readJson(relativePath);
  const failures = [
    ...validatePinnedDependencies(relativePath, manifest),
    ...validatePeerDependencies(relativePath, manifest),
  ];

  if (manifest.private !== true) {
    failures.push(`${relativePath}: private must be true while the package is unpublished`);
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

function validateRootManifest() {
  const manifest = readJson("package.json");
  return [
    ...(manifest.packageManager === expectedPackageManager
      ? []
      : [`package.json: packageManager must be ${expectedPackageManager}`]),
    ...(manifest.engines?.node === expectedNode
      ? []
      : [`package.json: engines.node must be ${expectedNode}`]),
  ];
}

function stripYamlQuotes(value) {
  return value.trim().replace(/^['"]|['"]$/gu, "");
}

function yamlListEntries(contents, key) {
  const inlineMatch = contents.match(new RegExp(`^${key}: \\[([^\\]]*)\\]`, "mu"));
  if (inlineMatch) {
    return inlineMatch[1].split(",").map(stripYamlQuotes).filter(Boolean);
  }
  const blockMatch = contents.match(new RegExp(`^${key}:\\n((?:[ \\t]+- .*\\n?)*)`, "mu"));
  if (!blockMatch) {
    return [];
  }
  return [...blockMatch[1].matchAll(/^[ \t]+- (.+)$/gmu)].map((match) => stripYamlQuotes(match[1]));
}

function requiredWorkspaceSettings() {
  const policy = readJson(policyPath);
  const days = policy.minimumReleaseAgeDays;
  if (!Number.isInteger(days) || days < 7) {
    return { failures: [`${policyPath}: minimumReleaseAgeDays must be an integer of at least 7`] };
  }
  return {
    failures: [],
    settings: [
      "saveExact: true",
      "strictPeerDependencies: true",
      `minimumReleaseAge: ${days * 24 * 60}`,
      "minimumReleaseAgeStrict: true",
      "minimumReleaseAgeIgnoreMissingTime: false",
      "trustPolicy: no-downgrade",
      "trustLockfile: false",
      "blockExoticSubdeps: true",
    ],
  };
}

function validateExceptionBackedList(contents, key, exceptions) {
  const configured = yamlListEntries(contents, key);
  const expected = exceptions.map((exception) => `${exception.package}@${exception.version}`);
  const configuredSet = new Set(configured);
  const expectedSet = new Set(expected);

  return [
    ...expected.flatMap((identifier) =>
      configuredSet.has(identifier)
        ? []
        : [`${workspacePolicyPath}: missing ${key} entry for ${identifier}`],
    ),
    ...configured.flatMap((identifier) =>
      expectedSet.has(identifier)
        ? []
        : [
            `${workspacePolicyPath}: ${key} ${identifier} has no owned, expiring exception metadata`,
          ],
    ),
  ];
}

function validateWorkspacePolicy(exceptions) {
  const contents = readFileSync(path.join(repositoryRoot, workspacePolicyPath), "utf8");
  const { failures, settings } = requiredWorkspaceSettings();
  if (failures.length > 0) {
    return failures;
  }

  const forbiddenKeys = ["trustPolicyExclude", "dangerouslyAllowAllBuilds", "auditConfig"];
  return [
    ...settings.flatMap((setting) =>
      contents.includes(setting) ? [] : [`${workspacePolicyPath}: missing ${setting}`],
    ),
    ...forbiddenKeys.flatMap((key) =>
      new RegExp(`^${key}:`, "mu").test(contents)
        ? [`${workspacePolicyPath}: ${key} requires owned, expiring exception metadata`]
        : [],
    ),
    ...validateExceptionBackedList(
      contents,
      "minimumReleaseAgeExclude",
      exceptions.minimumReleaseAge,
    ),
    ...validateExceptionBackedList(contents, "onlyBuiltDependencies", exceptions.allowedBuilds),
    ...(/^onlyBuiltDependencies:/mu.test(contents)
      ? []
      : [`${workspacePolicyPath}: missing explicit onlyBuiltDependencies allowlist`]),
    ...(/^patchedDependencies:/mu.test(contents) && exceptions.patchedDependencies.length === 0
      ? [`${workspacePolicyPath}: patchedDependencies requires owned, expiring exception metadata`]
      : []),
    ...(/^overrides:/mu.test(contents)
      ? [`${workspacePolicyPath}: overrides require owned, expiring exception metadata`]
      : []),
  ];
}

function requiredTextFailure(value, message) {
  return typeof value === "string" && value.trim().length > 0 ? [] : [message];
}

function validateExceptionEntry(section, exception, today) {
  const identifier = `${exception.package}@${exception.version}`;
  const expiry = new Date(`${exception.expires}T23:59:59Z`);

  return [
    ...requiredTextFailure(
      exception.package,
      `${exceptionsPath}: ${section} entry needs a package`,
    ),
    ...(exactVersionPattern.test(String(exception.version))
      ? []
      : [`${exceptionsPath}: ${identifier} must name an exact version`]),
    ...requiredTextFailure(
      exception.rationale,
      `${exceptionsPath}: ${identifier} needs a rationale`,
    ),
    ...requiredTextFailure(exception.owner, `${exceptionsPath}: ${identifier} needs an owner`),
    ...requiredTextFailure(
      exception.removalCondition,
      `${exceptionsPath}: ${identifier} needs a removal condition`,
    ),
    ...(Number.isNaN(expiry.valueOf()) || expiry <= today
      ? [`${exceptionsPath}: ${identifier} needs a future expiry, got ${exception.expires}`]
      : []),
  ];
}

function validateExceptionsFile(exceptions) {
  const sections = ["minimumReleaseAge", "allowedBuilds", "patchedDependencies", "vulnerabilities"];
  const today = new Date();

  return sections.flatMap((section) => {
    const entries = exceptions[section];
    if (!Array.isArray(entries)) {
      return [`${exceptionsPath}: ${section} must be an array`];
    }
    const identifiers = entries.map((exception) => `${exception.package}@${exception.version}`);
    return [
      ...entries.flatMap((exception) => validateExceptionEntry(section, exception, today)),
      ...(new Set(identifiers).size === identifiers.length
        ? []
        : [`${exceptionsPath}: ${section} identifiers must be unique`]),
    ];
  });
}

function validateForbiddenTrackedFiles() {
  return forbiddenTrackedFiles.flatMap((relativePath) =>
    existsSync(path.join(repositoryRoot, relativePath))
      ? [`${relativePath}: package-manager config must flow through ${workspacePolicyPath} only`]
      : [],
  );
}

const exceptions = readJson(exceptionsPath);
const manifestPaths = listManifestPaths();
const failures = [
  ...manifestPaths.flatMap(validateManifest),
  ...validateRootManifest(),
  ...validateWorkspacePolicy(exceptions),
  ...validateExceptionsFile(exceptions),
  ...validateForbiddenTrackedFiles(),
];

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Dependency policy passed for ${manifestPaths.length} manifest(s).`);
