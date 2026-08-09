import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { isTestFile } from "./lib/files.mjs";
import { repositoryRoot } from "./lib/process.mjs";

// The Phase 2 forbidden-import verification: the package dependency graph must contain no
// application aliases, generated backend types, project stores, or backend runtime imports.
// Every package source import must be package-relative or a declared dependency; the built
// artifact must import only declared runtime dependencies and peers.
const packageRootRelative = "packages/workspace";
const packageRoot = path.join(repositoryRoot, packageRootRelative);
const sourceRoot = path.join(packageRoot, "src");
const checkBuilt = process.argv.includes("--built");

const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const runtimeDependencyNames = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {}),
]);
const developmentDependencyNames = new Set(Object.keys(manifest.devDependencies ?? {}));

function walkSourceFiles(absoluteDirectory) {
  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      return walkSourceFiles(absolutePath);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) ? [absolutePath] : [];
  });
}

function importSpecifiers(contents) {
  const codeLines = contents
    .split("\n")
    .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
    .join("\n");
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /^import\s+["']([^"']+)["']/gm,
  ];
  return patterns.flatMap((pattern) => [...codeLines.matchAll(pattern)].map((match) => match[1]));
}

function bareSpecifierPackageName(specifier) {
  const segments = specifier.split("/");
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}

function validateSpecifier(absolutePath, specifier, allowedDependencyNames) {
  const relativePath = path.relative(repositoryRoot, absolutePath);
  if (specifier.startsWith(".")) {
    const resolvedPath = path.resolve(path.dirname(absolutePath), specifier);
    return resolvedPath.startsWith(`${sourceRoot}${path.sep}`)
      ? []
      : [`${relativePath}: relative import escapes the package source: ${specifier}`];
  }
  return allowedDependencyNames.has(bareSpecifierPackageName(specifier))
    ? []
    : [`${relativePath}: import is not a declared package dependency: ${specifier}`];
}

function validateSourceImports() {
  return walkSourceFiles(sourceRoot).flatMap((absolutePath) => {
    const isTest = isTestFile(absolutePath);
    const allowedDependencyNames = isTest
      ? new Set([...runtimeDependencyNames, ...developmentDependencyNames, "vitest"])
      : runtimeDependencyNames;
    return importSpecifiers(readFileSync(absolutePath, "utf8")).flatMap((specifier) => {
      // Tests run under vitest on Node and may use the platform's `node:`-prefixed builtins
      // (the stylesheet-geometry suite compiles the real build input); builtins add nothing
      // to the dependency graph, and production sources stay browser-only.
      if (isTest && specifier.startsWith("node:")) {
        return [];
      }
      return validateSpecifier(absolutePath, specifier, allowedDependencyNames);
    });
  });
}

function validateTsconfigAliases() {
  return ["tsconfig.json", "tsconfig.build.json"].flatMap((name) => {
    const compilerOptions = JSON.parse(
      readFileSync(path.join(packageRoot, name), "utf8"),
    ).compilerOptions;
    return ["paths", "baseUrl"].flatMap((option) =>
      compilerOptions && option in compilerOptions
        ? [`${packageRootRelative}/${name}: ${option} would alias the package dependency graph`]
        : [],
    );
  });
}

function validateBuiltEntry() {
  const entryPath = path.join(packageRoot, "dist/index.js");
  if (!existsSync(entryPath)) {
    return [`${packageRootRelative}/dist/index.js: missing; run the package build first`];
  }
  return importSpecifiers(readFileSync(entryPath, "utf8")).flatMap((specifier) => {
    if (specifier.startsWith(".") || specifier.startsWith("/")) {
      return [`dist/index.js: bundled output must not import by path: ${specifier}`];
    }
    return runtimeDependencyNames.has(bareSpecifierPackageName(specifier))
      ? []
      : [`dist/index.js: import is not a declared runtime dependency or peer: ${specifier}`];
  });
}

function validateBuiltArtifacts() {
  const requiredArtifacts = ["dist/index.js.map", "dist/types/index.d.ts", "dist/styles.css"];
  const missing = requiredArtifacts.flatMap((relativePath) =>
    existsSync(path.join(packageRoot, relativePath))
      ? []
      : [`${packageRootRelative}/${relativePath}: missing build artifact`],
  );
  return [...missing, ...validateBuiltEntry(), ...validateBuiltStylesheet()];
}

function validateBuiltStylesheet() {
  const stylesheetPath = path.join(packageRoot, "dist/styles.css");
  if (!existsSync(stylesheetPath)) {
    return [];
  }
  const contents = readFileSync(stylesheetPath, "utf8");
  const requiredMarkers = [
    // The scoped Preflight subset and the specificity-doubled reset-zoom rule must survive
    // compilation; both are cascade-critical (scopedBase.css, commit ae1e8c3b6).
    [":where(.setta-workspace, .setta-workspace *)", "scoped base subset"],
    [":where(.setta-workspace) :where(dl, dd)", "scoped dropdown-list reset"],
    [".react-flow__controls-button.react-flow__controls-button", "reset-zoom control rule"],
    // The section grid placement vocabulary is the host content seam: consumers place their
    // registered section content with these classes, so Tailwind's content scan can never see
    // the usage and the rules must ship unconditionally (Phase 2 Setta-integration render
    // proof caught the layered variant being tree-shaken out).
    [".section-full-no-title", "host content-placement rule"],
    // The nested item grid contract: the Phase 4 gate rejection caught the compiled sheet
    // shipping the nested placement vocabulary without these named grids, which collapsed a
    // group's children into an implicit side column beside the group label.
    [".section-args-nested {", "nested item grid rule"],
    [".section-args-nested-key-value {", "nested-root item grid rule"],
    [String.raw`.\[\&\>p\]\:section-key-value > p`, "group-label placement rule"],
  ];
  return [
    ...(contents.includes("@tailwind")
      ? ["dist/styles.css: contains uncompiled @tailwind directives"]
      : []),
    ...(/^(?:\*|html\b(?!\.dark)|body\b|:root\b)/mu.test(contents)
      ? ["dist/styles.css: contains a host-wide selector; rules must stay package-scoped"]
      : []),
    ...requiredMarkers.flatMap(([marker, label]) =>
      contents.includes(marker) ? [] : [`dist/styles.css: missing the ${label}: ${marker}`],
    ),
  ];
}

const failures = [
  ...validateSourceImports(),
  ...validateTsconfigAliases(),
  ...(checkBuilt ? validateBuiltArtifacts() : []),
];

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

const scope = checkBuilt ? "source and built-artifact" : "source";
console.log(`Package boundary passed (${scope} imports).`);
