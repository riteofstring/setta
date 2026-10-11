import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { repositoryRoot } from "./lib/process.mjs";

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
  const browserExport = manifest.exports?.["./browser"];
  if (
    browserExport?.types !== "./dist/types/browser/index.d.ts" ||
    browserExport?.import !== "./dist/browser.js"
  ) {
    return [
      `${packageRootRelative}/package.json: the browser entry must map to its independent compiled artifacts`,
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
  const workspaceSpecifier =
    fixtureManifest.dependencies?.["@riteofstring/setta"];
  return workspaceSpecifier === "file:__SETTA_WORKSPACE_TARBALL__"
    ? []
    : [
        "fixtures/packed-consumer/package.template.json: @riteofstring/setta must use the packed-tarball placeholder",
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
    "dist/browser.js",
    "dist/browser.js.map",
    "dist/types/browser/index.d.ts",
    "dist/types/index.d.ts",
    "dist/styles.css",
  ];
  const missing = requiredArtifacts.flatMap((relativePath) =>
    existsSync(path.join(packageRoot, relativePath))
      ? []
      : [`${packageRootRelative}/${relativePath}: missing build artifact`],
  );
  const browserPath = path.join(packageRoot, "dist/browser.js");
  const browserImports = existsSync(browserPath)
    ? importSpecifiers(readFileSync(browserPath, "utf8")).map(
        (specifier) =>
          `dist/browser.js: standalone worker runtime must not import ${specifier}`,
      )
    : [];
  return [
    ...missing,
    ...browserImports,
    ...validateBuiltEntry(),
    ...validateBuiltStylesheet(),
  ];
}

function validateBuiltStylesheet() {
  const stylesheetPath = path.join(packageRoot, "dist/styles.css");
  if (!existsSync(stylesheetPath)) {
    return [];
  }
  const contents = readFileSync(stylesheetPath, "utf8");
  const requiredMarkers = [
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

    [".section-full-no-title", "registered content-slot rule"],

    [".section-args-nested {", "nested item grid rule"],
    [".section-args-nested-key-value {", "nested-root item grid rule"],
    [
      String.raw`.\[\&\>p\]\:section-key-value > p`,
      "group-label placement rule",
    ],

    ["container-name: slider;", "slider container-query root"],
    ["@container slider (min-width: 132px)", "slider numeric-field threshold"],

    [String.raw`.\!bg-setta-400 {`, "host-resistant unchecked switch paint"],

    ["@media (prefers-reduced-motion: no-preference)", "motion opt-in query"],
    ["@media (prefers-reduced-motion: reduce)", "reduced-motion override"],
    ["@media (pointer: coarse)", "coarse-pointer hit-area query"],
    [
      '[data-setta-workspace-touch-target="compact"]::after',
      "compact hit-area rule",
    ],
    ["width: min(200px, max(0px, calc(100% - 30px)))", "narrow minimap clamp"],

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
