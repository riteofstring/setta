import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import {
  assertEmptyOutputDirectory,
  createStagingDirectory,
  promoteStagingDirectory,
} from "./artifact-output.mjs";
import { compareGeometry } from "./compare-geometry.mjs";
import {
  comparePixels,
  decodePng,
  DEFAULT_ANTIALIAS_TOLERANCE,
  DEFAULT_GEOMETRY_TOLERANCE,
  DEFAULT_MAX_ANTIALIAS_PIXELS,
  DEFAULT_PIXEL_TOLERANCE,
  EDGE_RASTER_POLICY,
  writeRgbaPng,
} from "../lib/parity-image.mjs";

const COMPARISON_SCHEMA_VERSION = 2;
const CAPTURE_SCHEMA_VERSION = 1;

function usage() {
  return [
    "Usage: node scripts/xyflow-parity/compare-playground.mjs --baseline-dir <absolute-directory> --candidate-dir <absolute-directory> --output-dir <absolute-directory> [options]",
    "",
    "Options:",
    "  --geometry-tolerance <css-pixels>  Maximum geometry drift, default 0.25",
    "  --pixel-tolerance <channel-value>  Per-channel pixel tolerance, default 4",
    "  --antialias-tolerance <value>      Edge-only channel tolerance, default 16",
    "  --max-antialias-pixels <count>     Maximum tolerated edge pixels, default 128",
    "  --help                             Show this message",
  ].join("\n");
}

function parseArguments(argv) {
  const options = {
    antialiasTolerance: null,
    baselineDir: null,
    candidateDir: null,
    geometryTolerance: null,
    help: false,
    maxAntialiasPixels: null,
    outputDir: null,
    pixelTolerance: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      options.help = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}.`);
    }
    const name = argument.slice(2);
    if (
      ![
        "antialias-tolerance",
        "baseline-dir",
        "candidate-dir",
        "geometry-tolerance",
        "max-antialias-pixels",
        "output-dir",
        "pixel-tolerance",
      ].includes(name)
    ) {
      throw new Error(`Unknown option: ${argument}.`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    index += 1;
    const key = name.replace(/-([a-z])/g, (_match, letter) =>
      letter.toUpperCase(),
    );
    if (options[key] !== null) {
      throw new Error(`${argument} may be supplied only once.`);
    }
    options[key] = value;
  }
  return options;
}

function requirePositiveNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
}

function requireNonNegativeInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function requireMaximum(value, name, maximum) {
  if (value > maximum) {
    throw new Error(`${name} must not exceed ${String(maximum)}.`);
  }
  return value;
}

function requireAbsoluteDirectory(value, name) {
  if (value === null || !path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute directory path.`);
  }
  return path.resolve(value);
}

function normalizeOptions(options) {
  return {
    antialiasTolerance:
      options.antialiasTolerance === null
        ? DEFAULT_ANTIALIAS_TOLERANCE
        : requireMaximum(
            requirePositiveNumber(
              options.antialiasTolerance,
              "--antialias-tolerance",
            ),
            "--antialias-tolerance",
            DEFAULT_ANTIALIAS_TOLERANCE,
          ),
    baselineDir: requireAbsoluteDirectory(
      options.baselineDir,
      "--baseline-dir",
    ),
    candidateDir: requireAbsoluteDirectory(
      options.candidateDir,
      "--candidate-dir",
    ),
    geometryTolerance:
      options.geometryTolerance === null
        ? DEFAULT_GEOMETRY_TOLERANCE
        : requireMaximum(
            requirePositiveNumber(
              options.geometryTolerance,
              "--geometry-tolerance",
            ),
            "--geometry-tolerance",
            DEFAULT_GEOMETRY_TOLERANCE,
          ),
    maxAntialiasPixels:
      options.maxAntialiasPixels === null
        ? DEFAULT_MAX_ANTIALIAS_PIXELS
        : requireMaximum(
            requireNonNegativeInteger(
              options.maxAntialiasPixels,
              "--max-antialias-pixels",
            ),
            "--max-antialias-pixels",
            DEFAULT_MAX_ANTIALIAS_PIXELS,
          ),
    outputDir: requireAbsoluteDirectory(options.outputDir, "--output-dir"),
    pixelTolerance:
      options.pixelTolerance === null
        ? DEFAULT_PIXEL_TOLERANCE
        : requireMaximum(
            requireNonNegativeInteger(
              options.pixelTolerance,
              "--pixel-tolerance",
            ),
            "--pixel-tolerance",
            DEFAULT_PIXEL_TOLERANCE,
          ),
  };
}

function assertArtifactDirectory(directory, label) {
  if (!existsSync(directory)) {
    throw new Error(`${label} does not exist: ${directory}.`);
  }
  const status = lstatSync(directory);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory: ${directory}.`);
  }
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
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function assertRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function assertBuiltWorkspace(value, label) {
  const record = assertRecord(value, label);
  assertString(record.directory, `${label}.directory`);
  const files = assertArray(record.files, `${label}.files`);
  if (files.length === 0) {
    throw new Error(`${label}.files must not be empty.`);
  }
  const paths = files.map((entry, index) => {
    const file = assertRecord(entry, `${label}.files[${index}]`);
    const filePath = assertString(file.path, `${label}.files[${index}].path`);
    const digest = assertString(file.sha256, `${label}.files[${index}].sha256`);
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      throw new Error(`${label}.files[${index}].sha256 is invalid.`);
    }
    return filePath;
  });
  if (new Set(paths).size !== paths.length) {
    throw new Error(`${label}.files has duplicate paths.`);
  }
  return record;
}

function assertLiveResponse(value, label) {
  const record = assertRecord(value, label);
  const bytes = record.bytes;
  const status = record.status;
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new Error(`${label}.bytes must be a positive integer.`);
  }
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    throw new Error(`${label}.status must be a successful HTTP status.`);
  }
  if (record.contentType !== null) {
    assertString(record.contentType, `${label}.contentType`);
  }
  assertString(record.url, `${label}.url`);
  const digest = assertString(record.sha256, `${label}.sha256`);
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw new Error(`${label}.sha256 is invalid.`);
  }
  return record;
}

function assertLiveResponses(value, label) {
  const record = assertRecord(value, label);
  for (const key of ["document", "javascript", "stylesheet"]) {
    assertLiveResponse(record[key], `${label}.${key}`);
  }
  return record;
}

function assertBaselineSourceGuard(value, label) {
  if (value === null) {
    return null;
  }
  const record = assertRecord(value, label);
  for (const key of [
    "ignoredTestDiffPaths",
    "permittedUnreachableDiffPaths",
    "rejectedProductSourceDiffPaths",
  ]) {
    assertArray(record[key], `${label}.${key}`).forEach((entry, index) =>
      assertString(entry, `${label}.${key}[${index}]`),
    );
  }
  return record;
}

function assertRuntimeReference(value, label) {
  if (value === null || value === undefined) {
    return null;
  }
  const record = assertRecord(value, label);
  const acceptedBaseline = assertRecord(
    record.acceptedBaseline,
    `${label}.acceptedBaseline`,
  );
  assertString(
    acceptedBaseline.captureCommit,
    `${label}.acceptedBaseline.captureCommit`,
  );
  assertString(
    acceptedBaseline.frozenReferenceCommit,
    `${label}.acceptedBaseline.frozenReferenceCommit`,
  );
  assertString(
    acceptedBaseline.manifestPath,
    `${label}.acceptedBaseline.manifestPath`,
  );
  const manifestSha256 = assertString(
    acceptedBaseline.manifestSha256,
    `${label}.acceptedBaseline.manifestSha256`,
  );
  if (!/^[0-9a-f]{64}$/.test(manifestSha256)) {
    throw new Error(`${label}.acceptedBaseline.manifestSha256 is invalid.`);
  }
  assertArray(
    record.currentSourceDiffPaths,
    `${label}.currentSourceDiffPaths`,
  ).forEach((entry, index) =>
    assertString(entry, `${label}.currentSourceDiffPaths[${index}]`),
  );
  const verification = assertRecord(
    record.verification,
    `${label}.verification`,
  );
  for (const key of ["builtWorkspace", "chrome", "liveResponseHashes"]) {
    if (verification[key] !== true) {
      throw new Error(`${label}.verification.${key} must be true.`);
    }
  }
  return record;
}

function safeArtifactPath(directory, artifactPath, label) {
  const relativePath = assertString(artifactPath, label);
  if (path.isAbsolute(relativePath)) {
    throw new Error(`${label} must be relative.`);
  }
  const resolvedDirectory = path.resolve(directory);
  const resolvedPath = path.resolve(resolvedDirectory, relativePath);
  if (
    resolvedPath !== resolvedDirectory &&
    !resolvedPath.startsWith(`${resolvedDirectory}${path.sep}`)
  ) {
    throw new Error(`${label} escapes its artifact directory.`);
  }
  return resolvedPath;
}

function assertArtifactFile(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} is missing: ${filePath}.`);
  }
  const status = lstatSync(filePath);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${label} must be a real file: ${filePath}.`);
  }
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertCaptureCommits(capture, label) {
  const frozenReferenceCommit = assertString(
    capture.frozenReferenceCommit,
    `${label}.capture.frozenReferenceCommit`,
  );
  if (!/^[0-9a-f]{40}$/.test(frozenReferenceCommit)) {
    throw new Error(`${label} has an invalid frozen reference commit.`);
  }
  const captureCommit = assertString(
    capture.captureCommit,
    `${label}.capture.captureCommit`,
  );
  if (!/^[0-9a-f]{40}$/.test(captureCommit)) {
    throw new Error(`${label} has an invalid capture commit.`);
  }
}

function assertCaptureBrowser(capture, label) {
  const chrome = assertRecord(capture.chrome, `${label}.capture.chrome`);
  assertString(chrome.product, `${label}.capture.chrome.product`);
  assertString(chrome.userAgent, `${label}.capture.chrome.userAgent`);
  assertString(chrome.binary, `${label}.capture.chrome.binary`);
  assertString(capture.sourceUrl, `${label}.capture.sourceUrl`);
  assertRecord(capture.stabilization, `${label}.capture.stabilization`);
}

function assertCaptureCatalog(record, label) {
  const catalog = assertRecord(record.catalog, `${label}.catalog`);
  assertString(catalog.catalogVersion, `${label}.catalog.catalogVersion`);
  if (typeof catalog.completeCatalog !== "boolean") {
    throw new Error(`${label}.catalog.completeCatalog must be boolean.`);
  }
  assertArray(catalog.requiredCoverage, `${label}.catalog.requiredCoverage`);
  assertArray(catalog.coverageLedger, `${label}.catalog.coverageLedger`);
  assertArray(catalog.unsupportedStates, `${label}.catalog.unsupportedStates`);
  return catalog;
}

function assertManifestScenarios(record, catalog, label) {
  const selectedScenarioIds = assertArray(
    catalog.selectedScenarioIds,
    `${label}.catalog.selectedScenarioIds`,
  ).map((value, index) =>
    assertString(value, `${label}.catalog.selectedScenarioIds[${index}]`),
  );
  const scenarios = assertArray(record.scenarios, `${label}.scenarios`);
  if (scenarios.length === 0) {
    throw new Error(`${label}.scenarios must not be empty.`);
  }
  const ids = scenarios.map((scenario, index) =>
    assertString(
      assertRecord(scenario, `${label}.scenarios[${index}]`).id,
      `${label}.scenarios[${index}].id`,
    ),
  );
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label}.scenarios has duplicate ids.`);
  }
  if (!sameValue(ids, selectedScenarioIds)) {
    throw new Error(`${label} scenario list does not match its catalog.`);
  }
  return scenarios;
}

function assertCaptureManifest(manifest, expectedMode, label) {
  const record = assertRecord(manifest, label);
  if (record.schemaVersion !== CAPTURE_SCHEMA_VERSION) {
    throw new Error(`${label} has unsupported schema version.`);
  }
  const capture = assertRecord(record.capture, `${label}.capture`);
  if (capture.mode !== expectedMode) {
    throw new Error(`${label} must be a ${expectedMode} capture.`);
  }
  assertCaptureCommits(capture, label);
  assertCaptureBrowser(capture, label);
  assertBuiltWorkspace(
    capture.builtWorkspace,
    `${label}.capture.builtWorkspace`,
  );
  assertLiveResponses(capture.liveResponses, `${label}.capture.liveResponses`);
  const baselineSourceGuard = assertBaselineSourceGuard(
    capture.baselineSourceGuard,
    `${label}.capture.baselineSourceGuard`,
  );
  const runtimeReference = assertRuntimeReference(
    capture.runtimeReference,
    `${label}.capture.runtimeReference`,
  );
  if (
    expectedMode === "baseline" &&
    baselineSourceGuard?.rejectedProductSourceDiffPaths.length > 0
  ) {
    throw new Error(`${label} accepted mounted product source differences.`);
  }
  const catalog = assertCaptureCatalog(record, label);
  const scenarios = assertManifestScenarios(record, catalog, label);
  return { capture, catalog, manifest: record, runtimeReference, scenarios };
}

function assertExactCaptureContract(baseline, candidate) {
  const differences = [];
  const appendDifference = (field, left, right) => {
    if (!sameValue(left, right)) {
      differences.push({ baseline: left, candidate: right, field });
    }
  };
  appendDifference(
    "capture.frozenReferenceCommit",
    baseline.capture.frozenReferenceCommit,
    candidate.capture.frozenReferenceCommit,
  );
  appendDifference(
    "capture.chrome",
    baseline.capture.chrome,
    candidate.capture.chrome,
  );
  appendDifference(
    "capture.stabilization",
    baseline.capture.stabilization,
    candidate.capture.stabilization,
  );
  appendDifference(
    "capture.sourceUrl",
    baseline.capture.sourceUrl,
    candidate.capture.sourceUrl,
  );
  appendDifference(
    "catalog.catalogVersion",
    baseline.catalog.catalogVersion,
    candidate.catalog.catalogVersion,
  );
  appendDifference(
    "catalog.requiredCoverage",
    baseline.catalog.requiredCoverage,
    candidate.catalog.requiredCoverage,
  );
  appendDifference(
    "catalog.completeCatalog",
    baseline.catalog.completeCatalog,
    candidate.catalog.completeCatalog,
  );
  appendDifference(
    "catalog.coverageLedger",
    baseline.catalog.coverageLedger,
    candidate.catalog.coverageLedger,
  );
  appendDifference(
    "catalog.unsupportedStates",
    baseline.catalog.unsupportedStates,
    candidate.catalog.unsupportedStates,
  );
  appendDifference(
    "catalog.selectedScenarioIds",
    baseline.catalog.selectedScenarioIds,
    candidate.catalog.selectedScenarioIds,
  );
  if (differences.length > 0) {
    throw new Error(
      `Capture contracts differ: ${differences.map((difference) => difference.field).join(", ")}.`,
    );
  }
}

function expectedScreenshotDimensions(viewport, label) {
  const record = assertRecord(viewport, label);
  const width = record.width;
  const height = record.height;
  const deviceScaleFactor = record.deviceScaleFactor;
  if (
    !Number.isInteger(width) ||
    width <= 0 ||
    !Number.isInteger(height) ||
    height <= 0 ||
    !Number.isFinite(deviceScaleFactor) ||
    deviceScaleFactor <= 0
  ) {
    throw new Error(`${label} has invalid viewport dimensions.`);
  }
  return {
    height: Math.round(height * deviceScaleFactor),
    width: Math.round(width * deviceScaleFactor),
  };
}

function assertCanonicalArtifactPaths(entry, id, label) {
  if (
    entry.receipt !== `${id}/receipt.json` ||
    entry.screenshot !== `${id}/screenshot.png`
  ) {
    throw new Error(`${label} has non-canonical artifact paths.`);
  }
}

function receiptCaptureContract(capture) {
  return {
    mode: capture.mode,
    captureCommit: capture.captureCommit,
    frozenReferenceCommit: capture.frozenReferenceCommit,
    chrome: capture.chrome,
    sourceUrl: capture.sourceUrl,
    builtWorkspace: capture.builtWorkspace,
    liveResponses: capture.liveResponses,
    baselineSourceGuard: capture.baselineSourceGuard,
    runtimeReference: capture.runtimeReference,
  };
}

function assertReceiptCapture(receipt, expectedMode, manifestCapture, label) {
  const capture = assertRecord(receipt.capture, `${label}.capture`);
  const expected = receiptCaptureContract({
    ...manifestCapture,
    mode: expectedMode,
  });
  if (!sameValue(receiptCaptureContract(capture), expected)) {
    throw new Error(
      `${label} receipt capture metadata does not match its manifest.`,
    );
  }
}

function assertReceiptScenario(receipt, entry, id, label) {
  const scenario = assertRecord(receipt.scenario, `${label}.scenario`);
  if (
    scenario.id !== id ||
    scenario.theme !== entry.theme ||
    !sameValue(receipt.viewport, entry.viewport)
  ) {
    throw new Error(
      `${label} receipt scenario metadata does not match its manifest.`,
    );
  }
}

function assertReceiptScreenshot(receipt, entry, label) {
  const screenshot = assertRecord(receipt.screenshot, `${label}.screenshot`);
  if (screenshot.file !== entry.screenshot) {
    throw new Error(
      `${label} receipt screenshot path does not match its manifest.`,
    );
  }
  const expectedDimensions = expectedScreenshotDimensions(
    receipt.viewport,
    `${label}.viewport`,
  );
  if (!sameValue(screenshot.dimensions, expectedDimensions)) {
    throw new Error(
      `${label} receipt screenshot dimensions do not match its viewport.`,
    );
  }
}

function assertReceiptGeometry(receipt, label) {
  const geometry = assertRecord(receipt.geometry, `${label}.geometry`);
  assertRecord(geometry.document, `${label}.geometry.document`);
  const elements = assertRecord(
    geometry.elements,
    `${label}.geometry.elements`,
  );
  assertRecord(elements.shell, `${label}.geometry.elements.shell`);
  assertRecord(elements.flow, `${label}.geometry.elements.flow`);
  for (const field of ["nodes", "panes", "sections", "selection", "windows"]) {
    assertArray(geometry[field], `${label}.geometry.${field}`);
  }
}

function assertReceipt(
  captureDirectory,
  manifestScenario,
  expectedMode,
  manifestCapture,
  label,
) {
  const entry = assertRecord(manifestScenario, label);
  const id = assertString(entry.id, `${label}.id`);
  assertCanonicalArtifactPaths(entry, id, label);
  const receiptPath = safeArtifactPath(
    captureDirectory,
    entry.receipt,
    `${label}.receipt`,
  );
  const screenshotPath = safeArtifactPath(
    captureDirectory,
    entry.screenshot,
    `${label}.screenshot`,
  );
  assertArtifactFile(receiptPath, `${label}.receipt`);
  assertArtifactFile(screenshotPath, `${label}.screenshot`);
  const receipt = assertRecord(
    readJson(receiptPath, `${label} receipt`),
    label,
  );
  assertReceiptCapture(receipt, expectedMode, manifestCapture, label);
  assertReceiptScenario(receipt, entry, id, label);
  assertReceiptScreenshot(receipt, entry, label);
  assertReceiptGeometry(receipt, label);
  return { id, receipt, receiptPath, screenshotPath };
}

function scenarioContractDifferences(baseline, candidate) {
  const differences = [];
  if (baseline.id !== candidate.id) {
    differences.push({
      baseline: baseline.id,
      candidate: candidate.id,
      field: "scenario.id",
    });
  }
  if (
    baseline.receipt.scenario.theme !== candidate.receipt.scenario.theme ||
    !sameValue(baseline.receipt.viewport, candidate.receipt.viewport)
  ) {
    differences.push({
      baseline: {
        theme: baseline.receipt.scenario.theme,
        viewport: baseline.receipt.viewport,
      },
      candidate: {
        theme: candidate.receipt.scenario.theme,
        viewport: candidate.receipt.viewport,
      },
      field: "scenario.theme-or-viewport",
    });
  }
  return differences;
}

function appendScreenshotDimensionDifference(
  differences,
  baselineImage,
  candidateImage,
  expected,
) {
  if (
    baselineImage.width !== expected.width ||
    baselineImage.height !== expected.height ||
    candidateImage.width !== expected.width ||
    candidateImage.height !== expected.height
  ) {
    differences.push({
      baseline: { height: baselineImage.height, width: baselineImage.width },
      candidate: { height: candidateImage.height, width: candidateImage.width },
      field: "screenshot.dimensions",
    });
  }
}

function compareScenario(baseline, candidate, options, stagingDirectory) {
  const contractDifferences = scenarioContractDifferences(baseline, candidate);
  const baselineImage = decodePng(baseline.screenshotPath);
  const candidateImage = decodePng(candidate.screenshotPath);
  appendScreenshotDimensionDifference(
    contractDifferences,
    baselineImage,
    candidateImage,
    expectedScreenshotDimensions(
      baseline.receipt.viewport,
      `scenario ${baseline.id} viewport`,
    ),
  );
  const geometry = compareGeometry(
    baseline.receipt.geometry,
    candidate.receipt.geometry,
    options.geometryTolerance,
  );
  const pixels = comparePixels(baselineImage, candidateImage, options);
  const scenarioDirectory = path.join(stagingDirectory, baseline.id);
  mkdirSync(scenarioDirectory);
  writeJson(path.join(scenarioDirectory, "geometry-diff.json"), geometry);
  writeRgbaPng(path.join(scenarioDirectory, "pixel-diff.png"), pixels.diff);
  const passed =
    contractDifferences.length === 0 && geometry.passed && pixels.passed;
  return {
    artifacts: {
      geometry: `${baseline.id}/geometry-diff.json`,
      pixelDiff: `${baseline.id}/pixel-diff.png`,
    },
    baseline: {
      screenshotSha256: sha256(baseline.screenshotPath),
    },
    candidate: {
      screenshotSha256: sha256(candidate.screenshotPath),
    },
    contractDifferences,
    geometry: {
      differenceCount: geometry.differences.length,
      passed: geometry.passed,
      tolerance: geometry.tolerance,
    },
    id: baseline.id,
    passed,
    pixels: {
      antialiasPixels: pixels.antialiasPixels,
      changedPixels: pixels.changedPixels,
      edgeRasterComponents: pixels.edgeRasterComponents,
      edgeRasterPixels: pixels.edgeRasterPixels,
      maximumChannelDifference: pixels.maximumChannelDifference,
      meaningfulPixels: pixels.meaningfulPixels,
      passed: pixels.passed,
    },
  };
}

function compareCaptures(options, stagingDirectory) {
  assertArtifactDirectory(options.baselineDir, "--baseline-dir");
  assertArtifactDirectory(options.candidateDir, "--candidate-dir");
  const baselineManifestPath = path.join(options.baselineDir, "manifest.json");
  const candidateManifestPath = path.join(
    options.candidateDir,
    "manifest.json",
  );
  const baselineManifest = assertCaptureManifest(
    readJson(baselineManifestPath, "Baseline manifest"),
    "baseline",
    "Baseline manifest",
  );
  const candidateManifest = assertCaptureManifest(
    readJson(candidateManifestPath, "Candidate manifest"),
    "candidate",
    "Candidate manifest",
  );
  assertExactCaptureContract(baselineManifest, candidateManifest);
  const results = [];
  for (let index = 0; index < baselineManifest.scenarios.length; index += 1) {
    const baseline = assertReceipt(
      options.baselineDir,
      baselineManifest.scenarios[index],
      "baseline",
      baselineManifest.capture,
      `Baseline scenario ${index}`,
    );
    const candidate = assertReceipt(
      options.candidateDir,
      candidateManifest.scenarios[index],
      "candidate",
      candidateManifest.capture,
      `Candidate scenario ${index}`,
    );
    results.push(
      compareScenario(baseline, candidate, options, stagingDirectory),
    );
  }
  return {
    baseline: {
      builtWorkspace: baselineManifest.capture.builtWorkspace,
      captureCommit: baselineManifest.capture.captureCommit,
      chrome: baselineManifest.capture.chrome,
      frozenReferenceCommit: baselineManifest.capture.frozenReferenceCommit,
      liveResponses: baselineManifest.capture.liveResponses,
      manifestSha256: sha256(baselineManifestPath),
      path: options.baselineDir,
      runtimeReference: baselineManifest.runtimeReference,
    },
    candidate: {
      builtWorkspace: candidateManifest.capture.builtWorkspace,
      captureCommit: candidateManifest.capture.captureCommit,
      chrome: candidateManifest.capture.chrome,
      frozenReferenceCommit: candidateManifest.capture.frozenReferenceCommit,
      liveResponses: candidateManifest.capture.liveResponses,
      manifestSha256: sha256(candidateManifestPath),
      path: options.candidateDir,
      runtimeReference: candidateManifest.runtimeReference,
    },
    results,
  };
}

function comparisonReceipt(options, comparison, error) {
  const results = comparison?.results ?? [];
  return {
    baseline: comparison?.baseline ?? { path: options.baselineDir },
    candidate: comparison?.candidate ?? { path: options.candidateDir },
    comparedAt: new Date().toISOString(),
    configuration: {
      antialiasTolerance: options.antialiasTolerance,
      edgeRasterPolicy: EDGE_RASTER_POLICY,
      geometryTolerance: options.geometryTolerance,
      maxAntialiasPixels: options.maxAntialiasPixels,
      pixelTolerance: options.pixelTolerance,
    },
    error: error === null ? null : error.message,
    passed: error === null && results.every((result) => result.passed),
    results,
    schemaVersion: COMPARISON_SCHEMA_VERSION,
  };
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    console.log(usage());
    return;
  }
  const options = normalizeOptions(parsed);
  assertEmptyOutputDirectory(options.outputDir);
  const stagingDirectory = createStagingDirectory(options.outputDir);
  let receipt = null;
  try {
    let comparison = null;
    let error = null;
    try {
      comparison = compareCaptures(options, stagingDirectory);
    } catch (reason) {
      error = reason instanceof Error ? reason : new Error(String(reason));
    }
    receipt = comparisonReceipt(options, comparison, error);
    writeJson(path.join(stagingDirectory, "comparison.json"), receipt);
    promoteStagingDirectory(stagingDirectory, options.outputDir);
    console.log(
      JSON.stringify(
        {
          outputDir: options.outputDir,
          passed: receipt.passed,
          scenarioCount: receipt.results.length,
        },
        null,
        2,
      ),
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

await main();
