import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { repositoryRoot, run, runPnpm } from "./lib/process.mjs";

// Phase 2's packed unrelated-consumer proof: build and pack @setta/workspace, materialize the
// checked-in fixture (fixtures/packed-consumer) into a temporary directory against the packed
// tarball, install it under the repository's supply-chain controls, and build it. The fixture
// consumes only public exports and the compiled stylesheet; this command is a phase-gate
// check, not part of the routine static quality gate. Pass --keep to retain the installed
// consumer for developer inspection (`pnpm run preview` inside the kept directory).

const fixtureRoot = path.join(repositoryRoot, "fixtures/packed-consumer");
const tarballPlaceholder = "file:__SETTA_WORKSPACE_TARBALL__";
const allowedImportSpecifiers = new Set([
  "react",
  "react-dom/client",
  "@setta/workspace",
  "@setta/workspace/styles.css",
]);

function assertConsumerImportSurface() {
  const sourceDirectory = path.join(fixtureRoot, "src");
  const violations = readdirSync(sourceDirectory).flatMap((fileName) => {
    const contents = readFileSync(path.join(sourceDirectory, fileName), "utf8");
    const specifiers = [...contents.matchAll(/(?:from|^\s*import)\s+"([^"]+)"/gmu)].map(
      (match) => match[1],
    );
    return specifiers
      .filter((specifier) => !allowedImportSpecifiers.has(specifier))
      .filter((specifier) => !specifier.startsWith("./"))
      .map((specifier) => `src/${fileName}: forbidden import ${specifier}`);
  });
  if (violations.length > 0) {
    throw new Error(`Packed-consumer import surface violations:\n${violations.join("\n")}`);
  }
}

function assertFixtureManifest() {
  const manifest = JSON.parse(readFileSync(path.join(fixtureRoot, "package.json"), "utf8"));
  if (manifest.dependencies?.["@setta/workspace"] !== tarballPlaceholder) {
    throw new Error(`The fixture must depend on @setta/workspace through ${tarballPlaceholder}.`);
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

function buildAndPackWorkspace(artifactDirectory) {
  runPnpm(["--filter", "@setta/workspace", "build"]);
  runPnpm(["pack", "--pack-destination", artifactDirectory], {
    cwd: path.join(repositoryRoot, "packages/workspace"),
  });
  const tarballs = readdirSync(artifactDirectory).filter((name) => name.endsWith(".tgz"));
  if (tarballs.length !== 1) {
    throw new Error(`Expected one packed tarball, found ${String(tarballs.length)}.`);
  }
  return path.join(artifactDirectory, tarballs[0]);
}

const requiredTarballEntries = [
  "package/package.json",
  "package/README.md",
  "package/dist/index.js",
  "package/dist/index.js.map",
  "package/dist/styles.css",
  "package/dist/types/index.d.ts",
  "package/src/canvas/LICENSE",
  "package/src/dnd/LICENSE",
  "package/tailwind-preset.mjs",
];
const allowedSourceEntries = new Set(["package/src/canvas/LICENSE", "package/src/dnd/LICENSE"]);

function assertTarballContents(tarballPath) {
  const entries = run("tar", ["-tzf", tarballPath], { capture: true })
    .stdout.split("\n")
    .filter(Boolean);
  const entrySet = new Set(entries);
  const missing = requiredTarballEntries.filter((entry) => !entrySet.has(entry));
  const leakedSource = entries.filter(
    (entry) => entry.startsWith("package/src/") && !allowedSourceEntries.has(entry),
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
    throw new Error(`Packed tarball is not the compiled surface:\n${problems.join("\n")}`);
  }
}

function materializeConsumer(consumerRoot, tarballPath) {
  cpSync(fixtureRoot, consumerRoot, { recursive: true });
  const manifestPath = path.join(consumerRoot, "package.json");
  const manifest = readFileSync(manifestPath, "utf8").replace(
    tarballPlaceholder,
    `file:${tarballPath}`,
  );
  writeFileSync(manifestPath, manifest);
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
    throw new Error("The consumer bundle does not contain the packed workspace runtime.");
  }
  if (!stylesheets.some((contents) => contents.includes(".setta-workspace"))) {
    throw new Error("The consumer bundle does not contain the scoped workspace stylesheet.");
  }
}

const keepConsumer = process.argv.includes("--keep");
const temporaryRoot = mkdtempSync(path.join(tmpdir(), "setta-workspace-packed-consumer-"));
const artifactDirectory = path.join(temporaryRoot, "artifact");
const consumerRoot = path.join(temporaryRoot, "consumer");

try {
  assertConsumerImportSurface();
  assertFixtureManifest();
  mkdirSync(artifactDirectory);
  const tarballPath = buildAndPackWorkspace(artifactDirectory);
  assertTarballContents(tarballPath);
  materializeConsumer(consumerRoot, tarballPath);
  runPnpm(["install", "--no-frozen-lockfile"], { cwd: consumerRoot });
  runPnpm(["run", "build"], { cwd: consumerRoot });
  assertBuiltConsumer(consumerRoot);
  console.log("Packed unrelated consumer installed and built from public exports only.");
  if (keepConsumer) {
    console.log(`Kept for inspection: ${consumerRoot} (run \`pnpm run preview\` there).`);
  }
} finally {
  if (!keepConsumer) {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}
