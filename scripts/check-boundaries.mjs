import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { repositoryRoot, run } from "./lib/process.mjs";

const allowedRootDirectories = new Set([
  "apps",
  "docs",
  "fixtures",
  "packages",
  "scripts",
  "tests",
]);
const allowedRootFiles = new Set([
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  ".node-version",
  ".prettierignore",
  ".prettierrc.json",
  "AGENTS.md",
  "README.md",
  "dependency-license-policy.json",
  "eslint.config.js",
  "knip.json",
  "package.json",
  "playwright.config.ts",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "supply-chain-exceptions.json",
  "tsconfig.base.json",
  "tsconfig.json",
  "vitest.config.ts",
]);
const constrainedDirectoryPrefixes = new Map([
  ["apps", "apps/playground/"],
  ["fixtures", "fixtures/consumer/"],
  ["packages", "packages/workspace/"],
]);
const prohibitedPathSegments = new Set([
  ".github",
  "backend",
  "cmd",
  "deployment",
  "deployments",
  "frontend",
  "generated",
  "generation",
  "installer",
  "installers",
  "migration",
  "migrations",
  "plugin",
  "plugins",
  "release",
  "releases",
]);
const prohibitedExtensions = new Set([".go", ".ps1", ".py"]);
const allowedShellScripts = new Set([
  "scripts/automation/codex-loop/run-plan-implementation-loop.sh",
  "scripts/automation/codex-loop/test_run_plan_implementation_loop.sh",
]);
const codeExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const dependencyFields = ["dependencies", "optionalDependencies", "peerDependencies"];
const developmentDependencyFields = [...dependencyFields, "devDependencies"];
const moduleSpecifierPatterns = [
  /\b(?:import|export)\s+(?:type\s+)?[^"'`;]*?\s+from\s+["']([^"']+)["']/gu,
  /\bimport\s+["']([^"']+)["']/gu,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
];

function normalizeRepositoryPath(relativePath) {
  return relativePath.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function validateTopLevelPath(relativePath) {
  const segments = relativePath.split("/");
  const topLevelName = segments[0];
  if (!topLevelName) {
    return [`Invalid empty repository path: ${relativePath}`];
  }
  if (segments.length === 1) {
    return allowedRootFiles.has(topLevelName)
      ? []
      : [`${relativePath}: root file is outside the blank-slate allowlist`];
  }
  if (!allowedRootDirectories.has(topLevelName)) {
    return [`${relativePath}: top-level directory is outside the blank-slate allowlist`];
  }

  const requiredPrefix = constrainedDirectoryPrefixes.get(topLevelName);
  return requiredPrefix && !relativePath.startsWith(requiredPrefix)
    ? [`${relativePath}: only ${requiredPrefix} is allowed in ${topLevelName}/`]
    : [];
}

function validateImplementationPath(relativePath) {
  const failures = [];
  const extension = path.posix.extname(relativePath).toLowerCase();
  const prohibitedSegment = relativePath
    .toLowerCase()
    .split("/")
    .find((segment) => prohibitedPathSegments.has(segment));

  if (prohibitedSegment) {
    failures.push(
      `${relativePath}: prohibited legacy or distribution path segment ${prohibitedSegment}`,
    );
  }
  if (prohibitedExtensions.has(extension)) {
    failures.push(
      `${relativePath}: ${extension} implementation is outside this Node/TypeScript branch`,
    );
  }
  if (extension === ".sh" && !allowedShellScripts.has(relativePath)) {
    failures.push(`${relativePath}: shell tooling is not in the reviewed project-owned allowlist`);
  }
  return failures;
}

export function validateRepositoryPaths(repositoryPaths) {
  return repositoryPaths.flatMap((candidatePath) => {
    const relativePath = normalizeRepositoryPath(candidatePath);
    return [...validateTopLevelPath(relativePath), ...validateImplementationPath(relativePath)];
  });
}

export function extractModuleSpecifiers(source) {
  const specifiers = new Set();
  for (const pattern of moduleSpecifierPatterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) {
        specifiers.add(specifier);
      }
    }
  }
  return [...specifiers];
}

function packageNameFromSpecifier(specifier) {
  const segments = specifier.split("/");
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : (segments[0] ?? "");
}

function dependencyNames(manifest, fields) {
  return new Set(fields.flatMap((field) => Object.keys(manifest[field] ?? {})));
}

function validateRelativeImport(relativePath, specifier, scopeRoot) {
  const resolvedPath = path.posix.normalize(
    path.posix.join(path.posix.dirname(relativePath), specifier),
  );
  return resolvedPath.startsWith(scopeRoot)
    ? []
    : [`${relativePath}: relative import ${specifier} escapes ${scopeRoot}`];
}

function validateExternalImport(
  relativePath,
  specifier,
  allowedPackages,
  publicWorkspaceSpecifiers,
) {
  if (specifier === "@setta/workspace" || specifier.startsWith("@setta/workspace/")) {
    return publicWorkspaceSpecifiers.has(specifier)
      ? []
      : [`${relativePath}: ${specifier} is not a declared @setta/workspace export`];
  }

  const packageName = packageNameFromSpecifier(specifier);
  return allowedPackages.has(packageName)
    ? []
    : [`${relativePath}: external import ${specifier} is not declared for this workspace`];
}

export function validateSourceImports({
  allowedPackages,
  publicWorkspaceSpecifiers = new Set(),
  relativePath,
  scopeRoot,
  source,
}) {
  return extractModuleSpecifiers(source).flatMap((specifier) => {
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      return validateRelativeImport(relativePath, specifier, scopeRoot);
    }
    if (specifier.startsWith("/")) {
      return [`${relativePath}: absolute import ${specifier} is not portable`];
    }
    return validateExternalImport(
      relativePath,
      specifier,
      allowedPackages,
      publicWorkspaceSpecifiers,
    );
  });
}

function collectExportTargets(value) {
  if (typeof value === "string") {
    return [value];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.values(value).flatMap(collectExportTargets);
}

export function getPublicWorkspaceSpecifiers(manifest) {
  const exportKeys = Object.keys(manifest.exports ?? {});
  return new Set(
    exportKeys.map((exportKey) =>
      exportKey === "." ? manifest.name : `${manifest.name}/${exportKey.replace(/^\.\//u, "")}`,
    ),
  );
}

export function validatePackageExportTargets(manifest) {
  return collectExportTargets(manifest.exports).flatMap((target) =>
    target.startsWith("./dist/") && !target.includes("../")
      ? []
      : [`packages/workspace/package.json: export target ${target} must stay inside ./dist/`],
  );
}

function validateScopeImports({
  allowedPackages,
  publicWorkspaceSpecifiers,
  readText,
  repositoryPaths,
  scopeRoot,
}) {
  return repositoryPaths
    .filter(
      (relativePath) =>
        relativePath.startsWith(scopeRoot) && codeExtensions.has(path.posix.extname(relativePath)),
    )
    .flatMap((relativePath) =>
      validateSourceImports({
        allowedPackages,
        publicWorkspaceSpecifiers,
        relativePath,
        scopeRoot,
        source: readText(relativePath),
      }),
    );
}

export function checkRepositoryBoundary({ readText, repositoryPaths }) {
  const normalizedPaths = repositoryPaths.map(normalizeRepositoryPath);
  const packageManifest = JSON.parse(readText("packages/workspace/package.json"));
  const playgroundManifest = JSON.parse(readText("apps/playground/package.json"));
  const consumerManifest = JSON.parse(readText("fixtures/consumer/package.json"));
  const publicWorkspaceSpecifiers = getPublicWorkspaceSpecifiers(packageManifest);

  return [
    ...validateRepositoryPaths(normalizedPaths),
    ...validatePackageExportTargets(packageManifest),
    ...validateScopeImports({
      allowedPackages: dependencyNames(packageManifest, dependencyFields),
      publicWorkspaceSpecifiers: new Set(),
      readText,
      repositoryPaths: normalizedPaths,
      scopeRoot: "packages/workspace/src/",
    }),
    ...validateScopeImports({
      allowedPackages: dependencyNames(playgroundManifest, developmentDependencyFields),
      publicWorkspaceSpecifiers,
      readText,
      repositoryPaths: normalizedPaths,
      scopeRoot: "apps/playground/",
    }),
    ...validateScopeImports({
      allowedPackages: dependencyNames(consumerManifest, developmentDependencyFields),
      publicWorkspaceSpecifiers,
      readText,
      repositoryPaths: normalizedPaths,
      scopeRoot: "fixtures/consumer/",
    }),
  ];
}

function listRepositoryPaths() {
  const output = run("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    capture: true,
  }).stdout;
  return output.split("\n").filter(Boolean);
}

function runBoundaryCheck() {
  const repositoryPaths = listRepositoryPaths();
  const failures = checkRepositoryBoundary({
    readText: (relativePath) => readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
    repositoryPaths,
  });
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`Repository boundary passed for ${repositoryPaths.length} files.`);
}

const currentModulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentModulePath) {
  runBoundaryCheck();
}
