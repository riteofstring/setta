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

function validateLegacyManifestFields() {
  return ["main", "module", "types", "typings", "typesVersions"].flatMap((legacyField) =>
    legacyField in manifest
      ? [
          `${packageRootRelative}/package.json: ${legacyField} duplicates the exports-only package surface`,
        ]
      : [],
  );
}

function validateCompiledExports() {
  const rootExport = manifest.exports?.["."];
  if (rootExport?.types !== "./dist/types/index.d.ts" || rootExport?.import !== "./dist/index.js") {
    return [
      `${packageRootRelative}/package.json: the root export must map types and import to compiled dist artifacts`,
    ];
  }
  return [];
}

function validateStylesheetExport() {
  if (manifest.exports?.["./styles.css"] !== "./dist/styles.css") {
    return [
      `${packageRootRelative}/package.json: the stylesheet export must map to ./dist/styles.css`,
    ];
  }
  return [];
}

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

function validateConsumerImports(packageRootRelative, manifestName = "package.json") {
  const consumerRoot = path.join(repositoryRoot, packageRootRelative);
  const consumerSourceRoot = path.join(consumerRoot, "src");
  const consumerManifest = JSON.parse(readFileSync(path.join(consumerRoot, manifestName), "utf8"));
  const runtimeNames = new Set([
    ...Object.keys(consumerManifest.dependencies ?? {}),
    ...Object.keys(consumerManifest.peerDependencies ?? {}),
  ]);
  const developmentNames = new Set(Object.keys(consumerManifest.devDependencies ?? {}));

  return walkSourceFiles(consumerSourceRoot).flatMap((absolutePath) => {
    const testFile = isTestFile(absolutePath);
    const allowedNames = testFile ? new Set([...runtimeNames, ...developmentNames]) : runtimeNames;
    return importSpecifiers(readFileSync(absolutePath, "utf8")).flatMap((specifier) => {
      const relativePath = path.relative(repositoryRoot, absolutePath);
      if (specifier.startsWith(".")) {
        const resolvedPath = path.resolve(path.dirname(absolutePath), specifier);
        return resolvedPath.startsWith(`${consumerSourceRoot}${path.sep}`)
          ? []
          : [`${relativePath}: relative import escapes ${packageRootRelative}/src: ${specifier}`];
      }
      if (testFile && specifier.startsWith("node:")) {
        return [];
      }
      return allowedNames.has(bareSpecifierPackageName(specifier))
        ? []
        : [`${relativePath}: import is not declared by ${packageRootRelative}: ${specifier}`];
    });
  });
}

function walkToolingFiles(absoluteDirectory) {
  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      return walkToolingFiles(absolutePath);
    }
    return entry.name.endsWith(".mjs") ? [absolutePath] : [];
  });
}

function validateToolingImports() {
  const scriptsRoot = path.join(repositoryRoot, "scripts");
  const rootManifest = JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));
  const allowedNames = new Set([
    ...Object.keys(rootManifest.dependencies ?? {}),
    ...Object.keys(rootManifest.devDependencies ?? {}),
  ]);
  const files = [...walkToolingFiles(scriptsRoot), path.join(repositoryRoot, "eslint.config.js")];

  return files.flatMap((absolutePath) =>
    importSpecifiers(readFileSync(absolutePath, "utf8")).flatMap((specifier) => {
      const relativePath = path.relative(repositoryRoot, absolutePath);
      if (specifier.startsWith("node:")) {
        return [];
      }
      if (specifier.startsWith(".")) {
        const resolvedPath = path.resolve(path.dirname(absolutePath), specifier);
        return resolvedPath.startsWith(`${scriptsRoot}${path.sep}`)
          ? []
          : [`${relativePath}: relative tooling import escapes scripts/: ${specifier}`];
      }
      return allowedNames.has(bareSpecifierPackageName(specifier))
        ? []
        : [`${relativePath}: tooling import is not declared by the root package: ${specifier}`];
    }),
  );
}

function validateFixtureTemplate() {
  const fixtureManifestPath = path.join(
    repositoryRoot,
    "fixtures/packed-consumer/package.template.json",
  );
  const fixtureManifest = JSON.parse(readFileSync(fixtureManifestPath, "utf8"));
  const workspaceSpecifier = fixtureManifest.dependencies?.["@setta/workspace"];
  return workspaceSpecifier === "file:__SETTA_WORKSPACE_TARBALL__"
    ? []
    : [
        "fixtures/packed-consumer/package.template.json: @setta/workspace must use the packed-tarball placeholder",
      ];
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
    [
      ":where(.setta-workspace.setta-workspace-dark, .setta-workspace.setta-workspace-dark *)",
      "scoped dark variants",
    ],
    [".react-flow.setta-workspace.setta-workspace-dark", "scoped dark canvas surface"],
    [".react-flow__controls-button.react-flow__controls-button", "reset-zoom control rule"],
    // Registered bodies are placed by the package-owned content slot. The rule must still ship
    // unconditionally: the Phase 2 Setta-integration render proof caught its earlier layered form
    // being tree-shaken out of the packed artifact.
    [".section-full-no-title", "registered content-slot rule"],
    // The nested item grid contract: the Phase 4 gate rejection caught the compiled sheet
    // shipping the nested placement vocabulary without these named grids, which collapsed a
    // group's children into an implicit side column beside the group label.
    [".section-args-nested {", "nested item grid rule"],
    [".section-args-nested-key-value {", "nested-root item grid rule"],
    [String.raw`.\[\&\>p\]\:section-key-value > p`, "group-label placement rule"],
    // Frozen main's ordinary slider keeps its numeric field hidden until the value-column
    // container reaches 132 px. The class tokens can survive source tests while the compiled
    // container rules are absent, so lock the actual package artifact that consumers receive.
    ["container-name: slider;", "slider container-query root"],
    ["@container slider (min-width: 132px)", "slider numeric-field threshold"],
    // Consumer Preflight can load after this scoped sheet. The unchecked switch track therefore
    // needs an important utility instead of relying on stylesheet order against `[type=button]`.
    [String.raw`.\!bg-setta-400 {`, "host-resistant unchecked switch paint"],
    // Adaptive hardening must survive Tailwind compilation: source-only class assertions do not
    // prove that consumers receive motion preferences, coarse hit areas, or the narrow minimap.
    ["@media (prefers-reduced-motion: no-preference)", "motion opt-in query"],
    ["@media (prefers-reduced-motion: reduce)", "reduced-motion override"],
    ["@media (pointer: coarse)", "coarse-pointer hit-area query"],
    ['[data-setta-workspace-touch-target="compact"]::after', "compact hit-area rule"],
    ["width: min(200px, max(0px, calc(100% - 30px)))", "narrow minimap clamp"],
  ];
  return [
    ...(contents.includes("@tailwind")
      ? ["dist/styles.css: contains uncompiled @tailwind directives"]
      : []),
    ...(/^(?:\*|html\b|body\b|:root\b)/mu.test(contents)
      ? ["dist/styles.css: contains a host-wide selector; rules must stay package-scoped"]
      : []),
    ...requiredMarkers.flatMap(([marker, label]) =>
      contents.includes(marker) ? [] : [`dist/styles.css: missing the ${label}: ${marker}`],
    ),
  ];
}

const failures = [
  ...validateLegacyManifestFields(),
  ...validateCompiledExports(),
  ...validateStylesheetExport(),
  ...validateSourceImports(),
  ...validateConsumerImports("apps/playground"),
  ...validateConsumerImports("fixtures/packed-consumer", "package.template.json"),
  ...validateToolingImports(),
  ...validateFixtureTemplate(),
  ...validateTsconfigAliases(),
  ...(checkBuilt ? validateBuiltArtifacts() : []),
];

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

const scope = checkBuilt ? "source and built-artifact" : "source";
console.log(`Package boundary passed (${scope} imports).`);
