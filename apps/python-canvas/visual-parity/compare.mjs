import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  comparePixels,
  createPixelDifferenceWriter,
  decodePng,
  DEFAULT_ANTIALIAS_TOLERANCE,
  DEFAULT_GEOMETRY_TOLERANCE,
  DEFAULT_MAX_ANTIALIAS_PIXELS,
  DEFAULT_PIXEL_TOLERANCE,
  EDGE_RASTER_POLICY,
  MAX_IMAGE_PIXELS,
  writeRgbaPng,
} from "../../../scripts/lib/parity-image.mjs";
import {
  addDifference,
  comparePublicState,
  createDifferenceCollector,
  sameValue,
} from "./comparison-values.mjs";
import { compareCatalogs } from "./compare-catalogs.mjs";

const CAPTURE_SCHEMA_VERSION = 1;
const COMPARISON_SCHEMA_VERSION = 2;

function usage() {
  return [
    "Usage: node apps/python-canvas/visual-parity/compare.mjs --baseline-dir <absolute-directory> --candidate-dir <absolute-directory> --output-dir <absolute-directory>",
    "",
    "The comparator reads immutable captures and writes a new atomic receipt directory.",
    "Geometry drift is limited to 0.25 CSS pixels. Pixel and antialias tolerances",
    "are fixed to the bounded Playground parity values.",
    "The receipt enumerates catalog drift and fixture-owned unsupported seams; each",
    "scenario directory contains a complete deterministic pixel-diff.ndjson record.",
    "",
    "Options:",
    "  --baseline-dir <absolute-directory>   Immutable baseline capture directory.",
    "  --candidate-dir <absolute-directory>  Candidate capture directory.",
    "  --output-dir <absolute-directory>     New directory for receipt and diffs.",
    "  --help                                Show this message.",
  ].join("\n");
}

function parseArguments(argv) {
  const options = {
    baselineDir: null,
    candidateDir: null,
    help: false,
    outputDir: null,
  };
  const names = new Map([
    ["--baseline-dir", "baselineDir"],
    ["--candidate-dir", "candidateDir"],
    ["--output-dir", "outputDir"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      options.help = true;
      continue;
    }
    const key = names.get(argument);
    if (key === undefined) {
      throw new Error(`Unknown option: ${argument}.`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    if (options[key] !== null) {
      throw new Error(`${argument} may be supplied only once.`);
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

function requireAbsoluteDirectory(value, label) {
  if (value === null || !path.isAbsolute(value)) {
    throw new Error(`${label} must be an absolute directory path.`);
  }
  return path.resolve(value);
}

function isWithin(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function pathsOverlap(left, right) {
  return isWithin(left, right) || isWithin(right, left);
}

function assertArtifactDirectory(directory, label) {
  if (!existsSync(directory)) {
    throw new Error(`${label} does not exist: ${directory}.`);
  }
  const status = lstatSync(directory);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory: ${directory}.`);
  }
  return realpathSync(directory);
}

function canonicalFuturePath(directory, label) {
  let current = directory;
  const missingSegments = [];
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`${label} has no existing parent directory.`);
    }
    missingSegments.unshift(path.basename(current));
    current = parent;
  }
  const status = lstatSync(current);
  if (!status.isDirectory()) {
    throw new Error(`${label} parent is not a directory: ${current}.`);
  }
  return path.join(realpathSync(current), ...missingSegments);
}

function assertNewOutputDirectory(directory) {
  const filesystemRoot = path.parse(directory).root;
  if (directory === filesystemRoot) {
    throw new Error("--output-dir must be a new dedicated directory.");
  }
  if (existsSync(directory)) {
    throw new Error(
      `--output-dir already exists and will not be overwritten: ${directory}.`,
    );
  }
  return canonicalFuturePath(directory, "--output-dir");
}

function normalizeOptions(parsed) {
  const baselineDir = requireAbsoluteDirectory(
    parsed.baselineDir,
    "--baseline-dir",
  );
  const candidateDir = requireAbsoluteDirectory(
    parsed.candidateDir,
    "--candidate-dir",
  );
  const outputDir = requireAbsoluteDirectory(parsed.outputDir, "--output-dir");
  const baselinePath = assertArtifactDirectory(baselineDir, "--baseline-dir");
  const candidatePath = assertArtifactDirectory(
    candidateDir,
    "--candidate-dir",
  );
  if (pathsOverlap(baselinePath, candidatePath)) {
    throw new Error(
      "--baseline-dir and --candidate-dir must be separate, non-overlapping directories.",
    );
  }
  const outputPath = assertNewOutputDirectory(outputDir);
  if (
    pathsOverlap(outputPath, baselinePath) ||
    pathsOverlap(outputPath, candidatePath)
  ) {
    throw new Error(
      "--output-dir must not overlap the baseline or candidate capture directory.",
    );
  }
  return {
    antialiasTolerance: DEFAULT_ANTIALIAS_TOLERANCE,
    baselineDir: baselinePath,
    candidateDir: candidatePath,
    geometryTolerance: DEFAULT_GEOMETRY_TOLERANCE,
    maxAntialiasPixels: DEFAULT_MAX_ANTIALIAS_PIXELS,
    outputDir: outputPath,
    pixelTolerance: DEFAULT_PIXEL_TOLERANCE,
  };
}

function assertRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertExactKeys(record, expectedKeys, label) {
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (!sameValue(actual, expected)) {
    throw new Error(`${label} has unexpected keys.`);
  }
}

function assertUniqueStrings(value, label) {
  const values = assertArray(value, label).map((entry, index) =>
    assertString(entry, `${label}[${index}]`),
  );
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} has duplicate values.`);
  }
  return values;
}

function assertJsonValue(value, label) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} contains a non-finite number.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertJsonValue(entry, `${label}[${index}]`),
    );
    return;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertJsonValue(entry, `${label}.${key}`);
    }
    return;
  }
  throw new Error(`${label} is not JSON data.`);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `${label} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertRealFile(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} is missing: ${filePath}.`);
  }
  const status = lstatSync(filePath);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${label} must be a real file: ${filePath}.`);
  }
}

function assertRealDirectory(directory, label) {
  if (!existsSync(directory)) {
    throw new Error(`${label} is missing: ${directory}.`);
  }
  const status = lstatSync(directory);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory: ${directory}.`);
  }
}

function safeScenarioPath(directory, id, extension, label) {
  if (!/^[a-z0-9-]+$/u.test(id)) {
    throw new Error(`${label} id is invalid.`);
  }
  const resolvedDirectory = path.resolve(directory);
  const filePath = path.resolve(
    resolvedDirectory,
    extension === ".png" ? "screenshots" : "metadata",
    `${id}${extension}`,
  );
  if (!filePath.startsWith(`${resolvedDirectory}${path.sep}`)) {
    throw new Error(`${label} escapes the capture directory.`);
  }
  return filePath;
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function assertPositiveViewportValues(viewport, label) {
  for (const key of ["width", "height", "deviceScaleFactor"]) {
    if (!Number.isFinite(viewport[key]) || viewport[key] <= 0) {
      throw new Error(`${label}.${key} must be a positive finite number.`);
    }
  }
}

function assertIntegerViewport(viewport, label) {
  if (!Number.isInteger(viewport.width) || !Number.isInteger(viewport.height)) {
    throw new Error(`${label} width and height must be integers.`);
  }
}

function assertSupportedScreenshotBounds(width, height, label) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new Error(`${label} exceeds the supported screenshot bounds.`);
  }
}

function assertViewport(value, label) {
  const viewport = assertRecord(value, label);
  assertExactKeys(viewport, ["deviceScaleFactor", "height", "width"], label);
  assertPositiveViewportValues(viewport, label);
  assertIntegerViewport(viewport, label);
  const width = Math.round(viewport.width * viewport.deviceScaleFactor);
  const height = Math.round(viewport.height * viewport.deviceScaleFactor);
  assertSupportedScreenshotBounds(width, height, label);
  return { height, width };
}

function assertScenario(value, index, fixtures, label) {
  const scenario = assertRecord(value, `${label}.scenarios[${index}]`);
  const scenarioLabel = `${label}.scenarios[${index}]`;
  const id = assertString(scenario.id, `${scenarioLabel}.id`);
  if (!/^[a-z0-9-]+$/u.test(id)) {
    throw new Error(`${scenarioLabel}.id is invalid.`);
  }
  const fixture = assertString(scenario.fixture, `${scenarioLabel}.fixture`);
  if (!Object.hasOwn(fixtures, fixture)) {
    throw new Error(`${scenarioLabel}.fixture is not declared.`);
  }
  assertString(scenario.state, `${scenarioLabel}.state`);
  assertString(scenario.viewport, `${scenarioLabel}.viewport`);
  if (scenario.theme !== "dark" && scenario.theme !== "light") {
    throw new Error(`${scenarioLabel}.theme is invalid.`);
  }
  const coverage = assertUniqueStrings(
    scenario.coverage,
    `${scenarioLabel}.coverage`,
  );
  if (coverage.length === 0) {
    throw new Error(`${scenarioLabel}.coverage must not be empty.`);
  }
  if (scenario.sectionKinds !== undefined) {
    assertUniqueStrings(scenario.sectionKinds, `${scenarioLabel}.sectionKinds`);
  }
  if (scenario.availability === "capturable") {
    assertString(scenario.capture, `${scenarioLabel}.capture`);
    return scenario;
  }
  if (scenario.availability !== "requires-product-seam") {
    throw new Error(`${scenarioLabel}.availability is invalid.`);
  }
  const hook = assertRecord(
    scenario.fixtureHook,
    `${scenarioLabel}.fixtureHook`,
  );
  assertString(hook.owner, `${scenarioLabel}.fixtureHook.owner`);
  assertString(hook.requirement, `${scenarioLabel}.fixtureHook.requirement`);
  return scenario;
}

function assertManifest(value, label) {
  const manifest = assertRecord(value, label);
  assertExactKeys(manifest, ["fixtures", "schemaVersion", "scenarios"], label);
  if (manifest.schemaVersion !== CAPTURE_SCHEMA_VERSION) {
    throw new Error(`${label} has an unsupported schema version.`);
  }
  const fixtures = assertRecord(manifest.fixtures, `${label}.fixtures`);
  const fixtureIds = Object.keys(fixtures).sort();
  if (fixtureIds.length === 0) {
    throw new Error(`${label}.fixtures must not be empty.`);
  }
  for (const fixtureId of fixtureIds) {
    const fixture = assertRecord(
      fixtures[fixtureId],
      `${label}.fixtures.${fixtureId}`,
    );
    assertString(fixture.source, `${label}.fixtures.${fixtureId}.source`);
    if (fixture.sectionKinds !== undefined) {
      assertUniqueStrings(
        fixture.sectionKinds,
        `${label}.fixtures.${fixtureId}.sectionKinds`,
      );
    }
  }
  const scenarios = assertArray(manifest.scenarios, `${label}.scenarios`);
  if (scenarios.length === 0) {
    throw new Error(`${label}.scenarios must not be empty.`);
  }
  const checkedScenarios = scenarios.map((scenario, index) =>
    assertScenario(scenario, index, fixtures, label),
  );
  const ids = checkedScenarios.map((scenario) => scenario.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label}.scenarios has duplicate ids.`);
  }
  const capturable = checkedScenarios.filter(
    (scenario) => scenario.availability === "capturable",
  );
  if (capturable.length === 0) {
    throw new Error(`${label} has no capturable scenarios.`);
  }
  return { fixtures, manifest, scenarios: checkedScenarios };
}

function assertReceiptRevisions(receipt, label) {
  for (const field of ["captureRevision", "referenceRevision"]) {
    const revision = assertString(receipt[field], `${label}.${field}`);
    if (!/^[0-9a-f]{40}$/u.test(revision)) {
      throw new Error(`${label}.${field} is not a full commit revision.`);
    }
  }
}

function assertCapturedScenarioIds(receipt, manifest, label) {
  const capturedScenarioIds = assertUniqueStrings(
    receipt.capturedScenarioIds,
    `${label}.capturedScenarioIds`,
  );
  const expectedScenarioIds = manifest.scenarios
    .filter((scenario) => scenario.availability === "capturable")
    .map((scenario) => scenario.id);
  if (!sameValue(capturedScenarioIds, expectedScenarioIds)) {
    throw new Error(
      `${label}.capturedScenarioIds must include every capturable scenario in manifest order.`,
    );
  }
}

function assertDeferredScenarios(receipt, manifest, label) {
  const deferredScenarios = manifest.scenarios.filter(
    (scenario) => scenario.availability !== "capturable",
  );
  if (!sameValue(receipt.deferredScenarios, deferredScenarios)) {
    throw new Error(`${label}.deferredScenarios does not match its manifest.`);
  }
}

function assertSourceDifferences(receipt, label) {
  const sourceDifferences = assertArray(
    receipt.productSourceDifferencesFromReference,
    `${label}.productSourceDifferencesFromReference`,
  );
  sourceDifferences.forEach((entry, index) =>
    assertString(
      entry,
      `${label}.productSourceDifferencesFromReference[${index}]`,
    ),
  );
}

function assertRuntimeArtifactHashes(receipt, label) {
  const hashes = assertRecord(
    receipt.runtimeArtifactHashes,
    `${label}.runtimeArtifactHashes`,
  );
  for (const [filePath, digest] of Object.entries(hashes)) {
    if (path.isAbsolute(filePath) || filePath.startsWith("..")) {
      throw new Error(`${label}.runtimeArtifactHashes has an unsafe path.`);
    }
    if (typeof digest !== "string" || !/^[0-9a-f]{64}$/u.test(digest)) {
      throw new Error(`${label}.runtimeArtifactHashes has an invalid digest.`);
    }
  }
}

function assertCaptureReceipt(value, manifest, expectedMode, label) {
  const receipt = assertRecord(value, label);
  assertExactKeys(
    receipt,
    [
      "baselineRoot",
      "captureRevision",
      "capturedScenarioIds",
      "deferredScenarios",
      "mode",
      "productSourceDifferencesFromReference",
      "referenceRevision",
      "runtimeArtifactHashes",
      "schemaVersion",
    ],
    label,
  );
  if (receipt.schemaVersion !== CAPTURE_SCHEMA_VERSION) {
    throw new Error(`${label} has an unsupported schema version.`);
  }
  if (receipt.mode !== expectedMode) {
    throw new Error(`${label}.mode must be ${expectedMode}.`);
  }
  assertString(receipt.baselineRoot, `${label}.baselineRoot`);
  assertReceiptRevisions(receipt, label);
  assertCapturedScenarioIds(receipt, manifest, label);
  assertDeferredScenarios(receipt, manifest, label);
  assertSourceDifferences(receipt, label);
  assertRuntimeArtifactHashes(receipt, label);
  return receipt;
}

function assertMetadata(value, scenario, label) {
  const metadata = assertRecord(value, label);
  assertExactKeys(
    metadata,
    ["browser", "canonicalSnapshot", "publicState", "scenario", "viewport"],
    label,
  );
  const browser = assertRecord(metadata.browser, `${label}.browser`);
  if (Object.keys(browser).length === 0) {
    throw new Error(`${label}.browser must not be empty.`);
  }
  const canonicalSnapshot = assertRecord(
    metadata.canonicalSnapshot,
    `${label}.canonicalSnapshot`,
  );
  const publicState = assertRecord(
    metadata.publicState,
    `${label}.publicState`,
  );
  assertJsonValue(browser, `${label}.browser`);
  assertJsonValue(canonicalSnapshot, `${label}.canonicalSnapshot`);
  assertJsonValue(publicState, `${label}.publicState`);
  if (!sameValue(metadata.scenario, scenario)) {
    throw new Error(`${label}.scenario does not match its manifest scenario.`);
  }
  const dimensions = assertViewport(metadata.viewport, `${label}.viewport`);
  return { browser, canonicalSnapshot, dimensions, metadata, publicState };
}

function compareExactField(contract, field, baseline, candidate) {
  if (!sameValue(baseline, candidate)) {
    addDifference(contract, { baseline, candidate, field });
  }
}

function assertScreenshotDimensions(image, dimensions, label) {
  if (image.width !== dimensions.width || image.height !== dimensions.height) {
    throw new Error(
      `${label} dimensions ${image.width}x${image.height} do not match viewport ${dimensions.width}x${dimensions.height}.`,
    );
  }
}

function loadCapture(directory, expectedMode, label) {
  assertRealDirectory(directory, label);
  const manifestPath = path.join(directory, "manifest.json");
  const receiptPath = path.join(directory, "receipt.json");
  assertRealFile(manifestPath, `${label} manifest`);
  assertRealFile(receiptPath, `${label} receipt`);
  const manifest = assertManifest(
    readJson(manifestPath, `${label} manifest`),
    `${label} manifest`,
  );
  const receipt = assertCaptureReceipt(
    readJson(receiptPath, `${label} receipt`),
    manifest,
    expectedMode,
    `${label} receipt`,
  );
  const metadataDirectory = path.join(directory, "metadata");
  const screenshotsDirectory = path.join(directory, "screenshots");
  assertRealDirectory(metadataDirectory, `${label} metadata directory`);
  assertRealDirectory(screenshotsDirectory, `${label} screenshots directory`);
  const scenarios = new Map();
  for (const scenario of manifest.scenarios) {
    if (scenario.availability !== "capturable") {
      continue;
    }
    const metadataPath = safeScenarioPath(
      directory,
      scenario.id,
      ".json",
      `${label} scenario`,
    );
    const screenshotPath = safeScenarioPath(
      directory,
      scenario.id,
      ".png",
      `${label} scenario`,
    );
    assertRealFile(metadataPath, `${label} metadata ${scenario.id}`);
    assertRealFile(screenshotPath, `${label} screenshot ${scenario.id}`);
    const checked = assertMetadata(
      readJson(metadataPath, `${label} metadata ${scenario.id}`),
      scenario,
      `${label} metadata ${scenario.id}`,
    );
    assertScreenshotDimensions(
      decodePng(screenshotPath),
      checked.dimensions,
      `${label} screenshot ${scenario.id}`,
    );
    scenarios.set(scenario.id, {
      ...checked,
      id: scenario.id,
      metadataPath,
      scenario,
      screenshotPath,
    });
  }
  return {
    directory,
    manifest,
    manifestPath,
    receipt,
    receiptPath,
    scenarios,
  };
}

function scenarioArtifactsDirectory(stagingDirectory, id) {
  const directory = path.join(stagingDirectory, "scenarios", id);
  mkdirSync(directory, { recursive: true });
  return directory;
}

function compareScenario(baseline, candidate, options, stagingDirectory) {
  const contract = createDifferenceCollector();
  compareExactField(
    contract,
    "scenario",
    baseline.scenario,
    candidate.scenario,
  );
  compareExactField(
    contract,
    "viewport",
    baseline.metadata.viewport,
    candidate.metadata.viewport,
  );
  compareExactField(contract, "browser", baseline.browser, candidate.browser);
  compareExactField(
    contract,
    "canonicalSnapshot",
    baseline.canonicalSnapshot,
    candidate.canonicalSnapshot,
  );
  const publicState = comparePublicState(
    baseline.publicState,
    candidate.publicState,
    options.geometryTolerance,
  );
  for (const difference of publicState.contract.differences) {
    addDifference(contract, difference);
  }
  const baselineImage = decodePng(baseline.screenshotPath);
  const candidateImage = decodePng(candidate.screenshotPath);
  const dimensions = baseline.dimensions;
  if (!sameValue(baseline.dimensions, candidate.dimensions)) {
    addDifference(contract, {
      baseline: baseline.dimensions,
      candidate: candidate.dimensions,
      field: "screenshot.viewport-dimensions",
    });
  }
  if (
    baselineImage.width !== dimensions.width ||
    baselineImage.height !== dimensions.height ||
    candidateImage.width !== dimensions.width ||
    candidateImage.height !== dimensions.height
  ) {
    addDifference(contract, {
      baseline: { height: baselineImage.height, width: baselineImage.width },
      candidate: { height: candidateImage.height, width: candidateImage.width },
      field: "screenshot.dimensions",
    });
  }
  const artifactDirectory = scenarioArtifactsDirectory(
    stagingDirectory,
    baseline.id,
  );
  const pixelDifferencePath = path.join(artifactDirectory, "pixel-diff.ndjson");
  const pixelDifferenceWriter =
    createPixelDifferenceWriter(pixelDifferencePath);
  let pixels;
  try {
    pixels = comparePixels(
      baselineImage,
      candidateImage,
      options,
      pixelDifferenceWriter,
    );
  } finally {
    pixelDifferenceWriter.close();
  }
  const geometryReceipt = {
    differenceCount: publicState.geometry.count,
    differences: publicState.geometry.differences,
    passed: publicState.geometry.passed,
    tolerance: publicState.geometry.tolerance,
  };
  writeJson(
    path.join(artifactDirectory, "geometry-diff.json"),
    geometryReceipt,
  );
  writeRgbaPng(path.join(artifactDirectory, "pixel-diff.png"), pixels.diff);
  const result = {
    artifacts: {
      geometryDiff: `scenarios/${baseline.id}/geometry-diff.json`,
      pixelDiff: `scenarios/${baseline.id}/pixel-diff.png`,
      pixelDiffRecords: `scenarios/${baseline.id}/pixel-diff.ndjson`,
    },
    baseline: {
      metadataSha256: sha256(baseline.metadataPath),
      screenshotSha256: sha256(baseline.screenshotPath),
    },
    candidate: {
      metadataSha256: sha256(candidate.metadataPath),
      screenshotSha256: sha256(candidate.screenshotPath),
    },
    contract: {
      differenceCount: contract.count,
      differences: contract.differences,
      passed: contract.count === 0,
    },
    geometry: geometryReceipt,
    id: baseline.id,
    passed:
      contract.count === 0 && publicState.geometry.passed && pixels.passed,
    pixels: {
      antialiasPixels: pixels.antialiasPixels,
      changedPixels: pixels.changedPixels,
      dimensionsDiffer: pixels.dimensionsDiffer,
      differenceRecordCount: pixelDifferenceWriter.count,
      differenceRecordsFormat: "ndjson",
      differenceRecordsSha256: sha256(pixelDifferencePath),
      edgeRasterComponents: pixels.edgeRasterComponents,
      edgeRasterPixels: pixels.edgeRasterPixels,
      maximumChannelDifference: pixels.maximumChannelDifference,
      meaningfulPixels: pixels.meaningfulPixels,
      passed: pixels.passed,
    },
  };
  writeJson(path.join(artifactDirectory, "result.json"), result);
  return result;
}

function compareCaptures(options, stagingDirectory) {
  const baseline = loadCapture(
    options.baselineDir,
    "baseline",
    "Baseline capture",
  );
  const candidate = loadCapture(
    options.candidateDir,
    "candidate",
    "Candidate capture",
  );
  const catalog = compareCatalogs(baseline, candidate);
  const results = [];
  mkdirSync(path.join(stagingDirectory, "scenarios"));
  for (const id of catalog.scenarios.comparedCapturableScenarioIds) {
    results.push(
      compareScenario(
        baseline.scenarios.get(id),
        candidate.scenarios.get(id),
        options,
        stagingDirectory,
      ),
    );
  }
  return {
    baseline: {
      manifestSha256: sha256(baseline.manifestPath),
      path: baseline.directory,
      receiptSha256: sha256(baseline.receiptPath),
    },
    candidate: {
      manifestSha256: sha256(candidate.manifestPath),
      path: candidate.directory,
      receiptSha256: sha256(candidate.receiptPath),
    },
    catalog,
    results,
  };
}

function comparisonResults(comparison) {
  return comparison === null ? [] : comparison.results;
}

function comparisonCatalog(comparison) {
  return comparison === null ? null : comparison.catalog;
}

function emptyUnsupportedFixtureStates() {
  return {
    baseline: [],
    candidate: [],
    extraInCandidate: [],
    missingFromCandidate: [],
  };
}

function unsupportedFixtureStatesFor(catalog) {
  if (catalog === null || catalog.unsupportedByFixture === undefined) {
    return emptyUnsupportedFixtureStates();
  }
  return catalog.unsupportedByFixture;
}

function supportedParityPassed(error, results) {
  if (error !== null) {
    return false;
  }
  return results.every((result) => result.passed);
}

function catalogComparisonPassed(error, catalog) {
  return error === null && catalog !== null && catalog.contract.passed === true;
}

function coverageComplete(unsupportedFixtureStates) {
  return (
    unsupportedFixtureStates.baseline.length === 0 &&
    unsupportedFixtureStates.candidate.length === 0
  );
}

function comparisonEndpoint(comparison, key, pathValue) {
  return comparison === null ? { path: pathValue } : comparison[key];
}

function comparisonError(error) {
  return error === null ? null : error.message;
}

function comparisonReceipt(options, comparison, error) {
  const results = comparisonResults(comparison);
  const catalog = comparisonCatalog(comparison);
  const unsupportedFixtureStates = unsupportedFixtureStatesFor(catalog);
  const supportedPassed = supportedParityPassed(error, results);
  const catalogPassed = catalogComparisonPassed(error, catalog);
  return {
    baseline: comparisonEndpoint(comparison, "baseline", options.baselineDir),
    candidate: comparisonEndpoint(
      comparison,
      "candidate",
      options.candidateDir,
    ),
    catalog,
    configuration: {
      antialiasTolerance: options.antialiasTolerance,
      edgeRasterPolicy: EDGE_RASTER_POLICY,
      geometryTolerance: options.geometryTolerance,
      maxAntialiasPixels: options.maxAntialiasPixels,
      pixelTolerance: options.pixelTolerance,
    },
    coverageComplete: coverageComplete(unsupportedFixtureStates),
    error: comparisonError(error),
    passed: catalogPassed && supportedPassed,
    results,
    schemaVersion: COMPARISON_SCHEMA_VERSION,
    supportedParityPassed: supportedPassed,
    unsupportedFixtureStates,
  };
}

function createStagingDirectory(outputDirectory) {
  const parentDirectory = path.dirname(outputDirectory);
  mkdirSync(parentDirectory, { recursive: true });
  return mkdtempSync(
    path.join(parentDirectory, `.${path.basename(outputDirectory)}-staging-`),
  );
}

function promoteStagingDirectory(stagingDirectory, outputDirectory) {
  if (existsSync(outputDirectory)) {
    throw new Error(
      `--output-dir already exists and will not be overwritten: ${outputDirectory}.`,
    );
  }
  renameSync(stagingDirectory, outputDirectory);
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const options = normalizeOptions(parsed);
  const stagingDirectory = createStagingDirectory(options.outputDir);
  try {
    let comparison = null;
    let error = null;
    try {
      comparison = compareCaptures(options, stagingDirectory);
    } catch (reason) {
      error = reason instanceof Error ? reason : new Error(String(reason));
    }
    const receipt = comparisonReceipt(options, comparison, error);
    writeJson(path.join(stagingDirectory, "receipt.json"), receipt);
    promoteStagingDirectory(stagingDirectory, options.outputDir);
    process.stdout.write(
      `${JSON.stringify(
        {
          outputDir: options.outputDir,
          passed: receipt.passed,
          scenarioCount: receipt.results.length,
        },
        null,
        2,
      )}\n`,
    );
    if (!receipt.passed) {
      process.exitCode = 1;
    }
  } finally {
    if (existsSync(stagingDirectory)) {
      rmSync(stagingDirectory, { force: true, recursive: true });
    }
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
