import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { repositoryRoot } from "./lib/process.mjs";

// Setta-specific package contract that remains after Code Policy takes ownership of source import
// direction and declared dependency use. The package exposes only compiled exports, avoids alias
// escape hatches, keeps its unrelated-consumer fixture explicit, and emits the exact artifact
// surface and scoped stylesheet consumers require.
const packageRootRelative = "packages/workspace";
const packageRoot = path.join(repositoryRoot, packageRootRelative);
const checkBuilt = process.argv.includes("--built");

const manifest = JSON.parse(
  readFileSync(path.join(packageRoot, "package.json"), "utf8"),
);
const runtimeDependencyNames = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {}),
]);
function validateLegacyManifestFields() {
  return ["main", "module", "types", "typings", "typesVersions"].flatMap(
    (legacyField) =>
      legacyField in manifest
        ? [
            `${packageRootRelative}/package.json: ${legacyField} duplicates the exports-only package surface`,
          ]
        : [],
  );
}

function validateCompiledExports() {
  const rootExport = manifest.exports?.["."];
  if (
    rootExport?.types !== "./dist/types/index.d.ts" ||
    rootExport?.import !== "./dist/index.js"
  ) {
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
  return patterns.flatMap((pattern) =>
    [...codeLines.matchAll(pattern)].map((match) => match[1]),
  );
}

function bareSpecifierPackageName(specifier) {
  const segments = specifier.split("/");
  return specifier.startsWith("@")
    ? segments.slice(0, 2).join("/")
    : segments[0];
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
        ? [
            `${packageRootRelative}/${name}: ${option} would alias the package dependency graph`,
          ]
        : [],
    );
  });
}

function validateBuiltEntry() {
  const entryPath = path.join(packageRoot, "dist/index.js");
  if (!existsSync(entryPath)) {
    return [
      `${packageRootRelative}/dist/index.js: missing; run the package build first`,
    ];
  }
  return importSpecifiers(readFileSync(entryPath, "utf8")).flatMap(
    (specifier) => {
      if (specifier.startsWith(".") || specifier.startsWith("/")) {
        return [
          `dist/index.js: bundled output must not import by path: ${specifier}`,
        ];
      }
      // The package delivers one stylesheet. A dependency's CSS reaching the entry would make
      // every consumer resolve that stylesheet and its fonts, and would ship it even to a host
      // that registers neither built-in content section.
      if (specifier.endsWith(".css")) {
        return [
          `dist/index.js: bundled output must not import dependency CSS: ${specifier}`,
        ];
      }
      return runtimeDependencyNames.has(bareSpecifierPackageName(specifier))
        ? []
        : [
            `dist/index.js: import is not a declared runtime dependency or peer: ${specifier}`,
          ];
    },
  );
}

function validateBuiltArtifacts() {
  const requiredArtifacts = [
    "dist/index.js.map",
    "dist/types/index.d.ts",
    "dist/styles.css",
  ];
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
    [
      ".react-flow.setta-workspace.setta-workspace-dark",
      "scoped dark canvas surface",
    ],
    [
      ".react-flow__controls-button.react-flow__controls-button",
      "reset-zoom control rule",
    ],
    // Registered bodies are placed by the package-owned content slot. The rule must still ship
    // unconditionally: the Phase 2 Setta-integration render proof caught its earlier layered form
    // being tree-shaken out of the packed artifact.
    [".section-full-no-title", "registered content-slot rule"],
    // The nested item grid contract: the Phase 4 gate rejection caught the compiled sheet
    // shipping the nested placement vocabulary without these named grids, which collapsed a
    // group's children into an implicit side column beside the group label.
    [".section-args-nested {", "nested item grid rule"],
    [".section-args-nested-key-value {", "nested-root item grid rule"],
    [
      String.raw`.\[\&\>p\]\:section-key-value > p`,
      "group-label placement rule",
    ],
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
    [
      '[data-setta-workspace-touch-target="compact"]::after',
      "compact hit-area rule",
    ],
    ["width: min(200px, max(0px, calc(100% - 30px)))", "narrow minimap clamp"],
    // The built-in Text section's rendered surface. Its Markdown presentation compiles from the
    // typography plugin under the package's own class name, and only the class tokens live in
    // source, so the shipped rules are the only proof a consumer receives them.
    [
      '.setta-prose :where(table):not(:where([class~="not-setta-prose"] *))',
      "rendered Markdown table rule",
    ],
    [
      "setta-prose-invert:where(.setta-workspace.setta-workspace-dark",
      "package-scoped rendered Markdown dark variant",
    ],
    [
      String.raw`.setta-prose-h1\:text-\[length\:var\(--setta-workspace-text-h1-size\)\]`,
      "authored Markdown type scale",
    ],
    // KaTeX's presentation is folded in by scripts/compile-katex-styles.mjs rather than imported
    // by consumers: scoped to the workspace surface, including the equation counters KaTeX resets
    // on `body`, and carrying its faces inline so no consumer resolves a dependency font.
    [".setta-workspace .katex{", "scoped math surface"],
    [
      ".setta-workspace{counter-reset:katexEqnNo",
      "scoped math equation counters",
    ],
    ["src:url(data:font/woff2;base64,", "inlined math font faces"],
  ];
  return [
    ...(contents.includes("@tailwind")
      ? ["dist/styles.css: contains uncompiled @tailwind directives"]
      : []),
    ...(/^(?:\*|html\b|body\b|:root\b)/mu.test(contents)
      ? [
          "dist/styles.css: contains a host-wide selector; rules must stay package-scoped",
        ]
      : []),
    ...(contents.includes("url(fonts/")
      ? [
          "dist/styles.css: references a dependency font path; faces must ship inline",
        ]
      : []),
    ...(/^\.katex/mu.test(contents)
      ? [
          "dist/styles.css: contains an unscoped KaTeX rule; folded rules must stay package-scoped",
        ]
      : []),
    ...requiredMarkers.flatMap(([marker, label]) =>
      contents.includes(marker)
        ? []
        : [`dist/styles.css: missing the ${label}: ${marker}`],
    ),
  ];
}

const failures = [
  ...validateLegacyManifestFields(),
  ...validateCompiledExports(),
  ...validateStylesheetExport(),
  ...validateFixtureTemplate(),
  ...validateTsconfigAliases(),
  ...(checkBuilt ? validateBuiltArtifacts() : []),
];

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

const scope = checkBuilt ? "source and built artifacts" : "source contract";
console.log(`Setta package boundary passed (${scope}).`);
