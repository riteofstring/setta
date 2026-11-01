import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { repositoryRoot, run, runPnpm } from "./lib/process.mjs";
import { verifyPackedConsumerBrowser } from "./lib/packed-consumer-browser.mjs";

const fixtureRoot = path.join(repositoryRoot, "fixtures/packed-consumer");
const fixtureManifestTemplate = "package.template.json";
const fixtureWorkspaceTemplate = "pnpm-workspace.template.yaml";
const tarballPlaceholder = "file:__SETTA_WORKSPACE_TARBALL__";
const allowedImportSpecifiers = new Set([
  "react",
  "react-dom/client",
  "@riteofstring/setta",
  "@riteofstring/setta/styles.css",
  "@riteofstring/setta/browser",
]);

function assertConsumerImportSurface() {
  const sourceDirectory = path.join(fixtureRoot, "src");
  const violations = readdirSync(sourceDirectory).flatMap((fileName) => {
    const contents = readFileSync(path.join(sourceDirectory, fileName), "utf8");
    const specifiers = [
      ...contents.matchAll(/(?:from|^\s*import)\s+"([^"]+)"/gmu),
    ].map((match) => match[1]);
    return specifiers
      .filter((specifier) => !allowedImportSpecifiers.has(specifier))
      .filter((specifier) => !specifier.startsWith("./"))
      .map((specifier) => `src/${fileName}: forbidden import ${specifier}`);
  });
  if (violations.length > 0) {
    throw new Error(
      `Packed-consumer import surface violations:\n${violations.join("\n")}`,
    );
  }
}

function assertFixtureManifest() {
  const manifest = JSON.parse(
    readFileSync(path.join(fixtureRoot, fixtureManifestTemplate), "utf8"),
  );
  if (manifest.dependencies?.["@riteofstring/setta"] !== tarballPlaceholder) {
    throw new Error(
      `The fixture must depend on @riteofstring/setta through ${tarballPlaceholder}.`,
    );
  }
  const linkedSpecifiers = Object.entries({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  }).filter(([, specifier]) => /^(?:workspace|link):/u.test(specifier));
  if (linkedSpecifiers.length > 0) {
    throw new Error(
      `The fixture must stay unrelated to the workspace; found linked specifiers: ` +
        linkedSpecifiers.map(([name]) => name).join(", "),
    );
  }
}

function buildAndPackWorkspace() {
  runPnpm(["--filter", "@riteofstring/setta", "build"]);
  return path.join(repositoryRoot, "packages/workspace/setta.tgz");
}

const requiredTarballEntries = [
  "package/package.json",
  "package/README.md",
  "package/BROWSER.md",
  "package/LICENSE",
  "package/dist/browser.js",
  "package/dist/types/browser/index.d.ts",
  "package/dist/index.js",
  "package/dist/index.js.map",
  "package/dist/styles.css",
  "package/dist/THIRD-PARTY-NOTICES.txt",
  "package/dist/types/index.d.ts",
  "package/src/canvas/LICENSE",
  "package/src/dnd/LICENSE",
  "package/tailwind-preset.mjs",
];
const allowedSourceEntries = new Set([
  "package/src/canvas/LICENSE",
  "package/src/dnd/LICENSE",
]);

function assertTarballContents(tarballPath) {
  const entries = run("tar", ["-tzf", tarballPath], { capture: true })
    .stdout.split("\n")
    .filter(Boolean);
  const entrySet = new Set(entries);
  const missing = requiredTarballEntries.filter(
    (entry) => !entrySet.has(entry),
  );
  const leakedSource = entries.filter(
    (entry) =>
      entry.startsWith("package/src/") && !allowedSourceEntries.has(entry),
  );
  const leakedConfig = entries.filter((entry) =>
    /tsconfig|vite\.config|vitest|node_modules/u.test(entry),
  );
  const problems = [
    ...missing.map((entry) => `missing ${entry}`),
    ...leakedSource.map((entry) => `packs package source ${entry}`),
    ...leakedConfig.map((entry) => `packs build configuration ${entry}`),
  ];
  if (problems.length > 0) {
    throw new Error(
      `Packed tarball is not the compiled surface:\n${problems.join("\n")}`,
    );
  }
}

function materializeConsumer(consumerRoot, tarballPath) {
  cpSync(fixtureRoot, consumerRoot, { recursive: true });
  rmSync(path.join(consumerRoot, "node_modules"), {
    force: true,
    recursive: true,
  });
  const manifestPath = path.join(consumerRoot, "package.json");
  const templatePath = path.join(consumerRoot, fixtureManifestTemplate);
  const workspaceTemplatePath = path.join(
    consumerRoot,
    fixtureWorkspaceTemplate,
  );
  const manifest = readFileSync(templatePath, "utf8").replace(
    tarballPlaceholder,
    `file:${tarballPath}`,
  );
  writeFileSync(manifestPath, manifest);
  rmSync(templatePath);
  writeFileSync(
    path.join(consumerRoot, "pnpm-workspace.yaml"),
    readFileSync(workspaceTemplatePath, "utf8"),
  );
  rmSync(workspaceTemplatePath);
}

function assertBuiltConsumer(consumerRoot) {
  if (!existsSync(path.join(consumerRoot, "dist/index.html"))) {
    throw new Error("The built consumer is missing dist/index.html.");
  }
  const assetsDirectory = path.join(consumerRoot, "dist/assets");
  const assetNames = readdirSync(assetsDirectory);
  const readAssets = (extension) =>
    assetNames
      .filter((name) => name.endsWith(extension))
      .map((name) => readFileSync(path.join(assetsDirectory, name), "utf8"));
  const scripts = readAssets(".js");
  const stylesheets = readAssets(".css");
  if (!scripts.some((contents) => contents.includes("registerSectionKinds"))) {
    throw new Error(
      "The consumer bundle does not contain the packed workspace runtime.",
    );
  }
  if (!scripts.some((contents) => contents.includes("Packed time value"))) {
    throw new Error(
      "The consumer bundle does not contain the packed meta-control fixture.",
    );
  }
  if (!stylesheets.some((contents) => contents.includes(".setta-workspace"))) {
    throw new Error(
      "The consumer bundle does not contain the scoped workspace stylesheet.",
    );
  }
}

const keepConsumer = process.argv.includes("--keep");
const temporaryRoot = mkdtempSync(
  path.join(tmpdir(), "setta-workspace-packed-consumer-"),
);
const consumerRoot = path.join(temporaryRoot, "consumer");

try {
  assertConsumerImportSurface();
  assertFixtureManifest();
  const tarballPath = buildAndPackWorkspace();
  assertTarballContents(tarballPath);
  materializeConsumer(consumerRoot, tarballPath);
  runPnpm(["install", "--lockfile-only", "--ignore-scripts"], {
    cwd: consumerRoot,
  });
  runPnpm(["install", "--frozen-lockfile", "--ignore-scripts"], {
    cwd: consumerRoot,
  });
  runPnpm(["run", "build"], { cwd: consumerRoot });
  assertBuiltConsumer(consumerRoot);
  await verifyPackedConsumerBrowser(consumerRoot);
  console.log(
    "Packed unrelated consumer installed and built from public exports only.",
  );
  if (keepConsumer) {
    console.log(
      `Kept for inspection: ${consumerRoot} (run \`pnpm run preview\` there).`,
    );
  }
} finally {
  if (!keepConsumer) {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}
