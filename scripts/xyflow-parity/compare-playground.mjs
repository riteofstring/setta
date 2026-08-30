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
import { deflateSync, inflateSync } from "node:zlib";

import {
  assertEmptyOutputDirectory,
  createStagingDirectory,
  promoteStagingDirectory,
} from "./artifact-output.mjs";

const COMPARISON_SCHEMA_VERSION = 2;
const CAPTURE_SCHEMA_VERSION = 1;
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const DEFAULT_GEOMETRY_TOLERANCE = 0.25;
const DEFAULT_PIXEL_TOLERANCE = 4;
const DEFAULT_ANTIALIAS_TOLERANCE = 16;
const DEFAULT_MAX_ANTIALIAS_PIXELS = 128;
const EDGE_RASTER_CHANNEL_TOLERANCE = 68;
const EDGE_RASTER_MAX_COMPONENTS = 4;
const EDGE_RASTER_MAX_COMPONENT_HEIGHT = 3;
const EDGE_RASTER_MAX_COMPONENT_PIXELS = 12;
const EDGE_RASTER_MAX_COMPONENT_WIDTH = 6;
const EDGE_RASTER_MAX_PIXELS = 36;
const NUMBER_PATTERN = /-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi;
const CRC_TABLE = new Uint32Array(256);

for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  CRC_TABLE[index] = value >>> 0;
}

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

function assertCaptureManifest(manifest, expectedMode, label) {
  const record = assertRecord(manifest, label);
  if (record.schemaVersion !== CAPTURE_SCHEMA_VERSION) {
    throw new Error(`${label} has unsupported schema version.`);
  }
  const capture = assertRecord(record.capture, `${label}.capture`);
  if (capture.mode !== expectedMode) {
    throw new Error(`${label} must be a ${expectedMode} capture.`);
  }
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
  const chrome = assertRecord(capture.chrome, `${label}.capture.chrome`);
  assertString(chrome.product, `${label}.capture.chrome.product`);
  assertString(chrome.userAgent, `${label}.capture.chrome.userAgent`);
  assertString(chrome.binary, `${label}.capture.chrome.binary`);
  assertString(capture.sourceUrl, `${label}.capture.sourceUrl`);
  assertRecord(capture.stabilization, `${label}.capture.stabilization`);
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
  const catalog = assertRecord(record.catalog, `${label}.catalog`);
  assertString(catalog.catalogVersion, `${label}.catalog.catalogVersion`);
  if (typeof catalog.completeCatalog !== "boolean") {
    throw new Error(`${label}.catalog.completeCatalog must be boolean.`);
  }
  assertArray(catalog.requiredCoverage, `${label}.catalog.requiredCoverage`);
  assertArray(catalog.coverageLedger, `${label}.catalog.coverageLedger`);
  assertArray(catalog.unsupportedStates, `${label}.catalog.unsupportedStates`);
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

function assertReceipt(
  captureDirectory,
  manifestScenario,
  expectedMode,
  manifestCapture,
  label,
) {
  const entry = assertRecord(manifestScenario, label);
  const id = assertString(entry.id, `${label}.id`);
  if (
    entry.receipt !== `${id}/receipt.json` ||
    entry.screenshot !== `${id}/screenshot.png`
  ) {
    throw new Error(`${label} has non-canonical artifact paths.`);
  }
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
  const capture = assertRecord(receipt.capture, `${label}.capture`);
  if (
    capture.mode !== expectedMode ||
    capture.captureCommit !== manifestCapture.captureCommit ||
    capture.frozenReferenceCommit !== manifestCapture.frozenReferenceCommit ||
    !sameValue(capture.chrome, manifestCapture.chrome) ||
    capture.sourceUrl !== manifestCapture.sourceUrl ||
    !sameValue(capture.builtWorkspace, manifestCapture.builtWorkspace) ||
    !sameValue(capture.liveResponses, manifestCapture.liveResponses) ||
    !sameValue(
      capture.baselineSourceGuard,
      manifestCapture.baselineSourceGuard,
    ) ||
    !sameValue(capture.runtimeReference, manifestCapture.runtimeReference)
  ) {
    throw new Error(
      `${label} receipt capture metadata does not match its manifest.`,
    );
  }
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
  return { id, receipt, receiptPath, screenshotPath };
}

function paeth(left, up, upLeft) {
  const prediction = left + up - upLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upLeftDistance = Math.abs(prediction - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  return upDistance <= upLeftDistance ? up : upLeft;
}

function decodePng(filePath) {
  const image = readFileSync(filePath);
  if (!image.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`${filePath} is not a PNG.`);
  }
  let offset = PNG_SIGNATURE.length;
  let header = null;
  const dataChunks = [];
  let ended = false;
  while (offset < image.length) {
    if (offset + 12 > image.length) {
      throw new Error(`${filePath} has a truncated PNG chunk.`);
    }
    const length = image.readUInt32BE(offset);
    const type = image.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > image.length) {
      throw new Error(`${filePath} has an invalid PNG chunk length.`);
    }
    const chunk = image.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      if (header !== null || chunk.length !== 13) {
        throw new Error(`${filePath} has an invalid PNG header.`);
      }
      header = {
        bitDepth: chunk.readUInt8(8),
        colorType: chunk.readUInt8(9),
        compression: chunk.readUInt8(10),
        filter: chunk.readUInt8(11),
        height: chunk.readUInt32BE(4),
        interlace: chunk.readUInt8(12),
        width: chunk.readUInt32BE(0),
      };
    } else if (type === "IDAT") {
      dataChunks.push(chunk);
    } else if (type === "IEND") {
      ended = true;
      offset = dataEnd + 4;
      break;
    }
    offset = dataEnd + 4;
  }
  if (!header || !ended || dataChunks.length === 0) {
    throw new Error(`${filePath} has incomplete PNG data.`);
  }
  if (
    header.width <= 0 ||
    header.height <= 0 ||
    header.bitDepth !== 8 ||
    ![2, 6].includes(header.colorType) ||
    header.compression !== 0 ||
    header.filter !== 0 ||
    header.interlace !== 0
  ) {
    throw new Error(`${filePath} uses an unsupported PNG encoding.`);
  }
  const sourceBytesPerPixel = header.colorType === 6 ? 4 : 3;
  const rowLength = header.width * sourceBytesPerPixel;
  const inflated = inflateSync(Buffer.concat(dataChunks));
  const expectedLength = (rowLength + 1) * header.height;
  if (inflated.length !== expectedLength) {
    throw new Error(`${filePath} has an unexpected PNG data length.`);
  }
  const unfiltered = Buffer.alloc(rowLength * header.height);
  for (let row = 0; row < header.height; row += 1) {
    const sourceOffset = row * (rowLength + 1);
    const destinationOffset = row * rowLength;
    const filter = inflated[sourceOffset];
    if (filter > 4) {
      throw new Error(`${filePath} has an unsupported PNG filter.`);
    }
    for (let column = 0; column < rowLength; column += 1) {
      const source = inflated[sourceOffset + 1 + column];
      const left =
        column >= sourceBytesPerPixel
          ? unfiltered[destinationOffset + column - sourceBytesPerPixel]
          : 0;
      const up =
        row > 0 ? unfiltered[destinationOffset - rowLength + column] : 0;
      const upLeft =
        row > 0 && column >= sourceBytesPerPixel
          ? unfiltered[
              destinationOffset - rowLength + column - sourceBytesPerPixel
            ]
          : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? Math.floor((left + up) / 2)
                : paeth(left, up, upLeft);
      unfiltered[destinationOffset + column] = (source + predictor) & 0xff;
    }
  }
  const rgba = Buffer.alloc(header.width * header.height * 4);
  for (
    let sourceOffset = 0, destinationOffset = 0;
    sourceOffset < unfiltered.length;
    sourceOffset += sourceBytesPerPixel, destinationOffset += 4
  ) {
    rgba[destinationOffset] = unfiltered[sourceOffset];
    rgba[destinationOffset + 1] = unfiltered[sourceOffset + 1];
    rgba[destinationOffset + 2] = unfiltered[sourceOffset + 2];
    rgba[destinationOffset + 3] =
      sourceBytesPerPixel === 4 ? unfiltered[sourceOffset + 3] : 0xff;
  }
  return { data: rgba, height: header.height, width: header.width };
}

function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data) {
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function writeRgbaPng(filePath, image) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(6, 9);
  const rowLength = image.width * 4;
  const raw = Buffer.alloc((rowLength + 1) * image.height);
  for (let row = 0; row < image.height; row += 1) {
    const sourceOffset = row * rowLength;
    const destinationOffset = row * (rowLength + 1);
    raw[destinationOffset] = 0;
    image.data.copy(
      raw,
      destinationOffset + 1,
      sourceOffset,
      sourceOffset + rowLength,
    );
  }
  writeFileSync(
    filePath,
    Buffer.concat([
      PNG_SIGNATURE,
      pngChunk("IHDR", header),
      pngChunk("IDAT", deflateSync(raw)),
      pngChunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

function channelDifference(left, right, offset) {
  return Math.max(
    Math.abs(left[offset] - right[offset]),
    Math.abs(left[offset + 1] - right[offset + 1]),
    Math.abs(left[offset + 2] - right[offset + 2]),
    Math.abs(left[offset + 3] - right[offset + 3]),
  );
}

function hasEdgeContrast(image, x, y) {
  const offset = (y * image.width + x) * 4;
  const neighbors = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];
  return neighbors.some(([neighborX, neighborY]) => {
    if (
      neighborX < 0 ||
      neighborX >= image.width ||
      neighborY < 0 ||
      neighborY >= image.height
    ) {
      return false;
    }
    const neighborOffset = (neighborY * image.width + neighborX) * 4;
    return (
      Math.max(
        Math.abs(image.data[offset] - image.data[neighborOffset]),
        Math.abs(image.data[offset + 1] - image.data[neighborOffset + 1]),
        Math.abs(image.data[offset + 2] - image.data[neighborOffset + 2]),
        Math.abs(image.data[offset + 3] - image.data[neighborOffset + 3]),
      ) > 8
    );
  });
}

function hasNearbyEdgeContrast(image, x, y) {
  for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
    for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
      const neighborX = x + xOffset;
      const neighborY = y + yOffset;
      if (
        neighborX >= 0 &&
        neighborX < image.width &&
        neighborY >= 0 &&
        neighborY < image.height &&
        hasEdgeContrast(image, neighborX, neighborY)
      ) {
        return true;
      }
    }
  }
  return false;
}

function collectChangedPixelComponents(entries, imageWidth) {
  const entriesByOffset = new Map(
    entries.map((entry) => [entry.offset, entry]),
  );
  const visited = new Set();
  const components = [];
  for (const entry of entries) {
    if (visited.has(entry.offset)) {
      continue;
    }
    const component = [];
    const pending = [entry];
    visited.add(entry.offset);
    while (pending.length > 0) {
      const current = pending.pop();
      component.push(current);
      for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
        for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
          if (xOffset === 0 && yOffset === 0) {
            continue;
          }
          const x = current.x + xOffset;
          const y = current.y + yOffset;
          if (x < 0 || x >= imageWidth || y < 0) {
            continue;
          }
          const neighborOffset = (y * imageWidth + x) * 4;
          const neighbor = entriesByOffset.get(neighborOffset);
          if (neighbor && !visited.has(neighborOffset)) {
            visited.add(neighborOffset);
            pending.push(neighbor);
          }
        }
      }
    }
    components.push(component);
  }
  return components;
}

function selectEdgeRasterPixels(entries, baseline, candidate) {
  const components = collectChangedPixelComponents(entries, baseline.width);
  const accepted = components.filter((component) => {
    if (!component.some((entry) => !entry.antialiased)) {
      return false;
    }
    const xs = component.map((entry) => entry.x);
    const ys = component.map((entry) => entry.y);
    return (
      component.length <= EDGE_RASTER_MAX_COMPONENT_PIXELS &&
      Math.max(...xs) - Math.min(...xs) + 1 <=
        EDGE_RASTER_MAX_COMPONENT_WIDTH &&
      Math.max(...ys) - Math.min(...ys) + 1 <=
        EDGE_RASTER_MAX_COMPONENT_HEIGHT &&
      component.every(
        (entry) =>
          entry.difference <= EDGE_RASTER_CHANNEL_TOLERANCE &&
          hasNearbyEdgeContrast(baseline, entry.x, entry.y) &&
          hasNearbyEdgeContrast(candidate, entry.x, entry.y),
      )
    );
  });
  const pixelCount = accepted.reduce(
    (total, component) => total + component.length,
    0,
  );
  if (
    accepted.length > EDGE_RASTER_MAX_COMPONENTS ||
    pixelCount > EDGE_RASTER_MAX_PIXELS
  ) {
    return { componentCount: 0, offsets: new Set() };
  }
  return {
    componentCount: accepted.length,
    offsets: new Set(
      accepted.flatMap((component) => component.map((entry) => entry.offset)),
    ),
  };
}

function comparePixels(baseline, candidate, options) {
  if (
    baseline.width !== candidate.width ||
    baseline.height !== candidate.height
  ) {
    throw new Error("Screenshot dimensions differ.");
  }
  const diff = Buffer.alloc(baseline.data.length);
  let antialiasPixels = 0;
  const bufferedEntries = [];
  let changedPixels = 0;
  let edgeRasterEligible = true;
  let maximumChannelDifference = 0;
  let meaningfulPixels = 0;
  for (let y = 0; y < baseline.height; y += 1) {
    for (let x = 0; x < baseline.width; x += 1) {
      const offset = (y * baseline.width + x) * 4;
      const difference = channelDifference(
        baseline.data,
        candidate.data,
        offset,
      );
      maximumChannelDifference = Math.max(maximumChannelDifference, difference);
      if (difference <= options.pixelTolerance) {
        continue;
      }
      changedPixels += 1;
      const antialiased =
        difference <= options.antialiasTolerance &&
        hasEdgeContrast(baseline, x, y) &&
        hasEdgeContrast(candidate, x, y);
      const entry = { antialiased, difference, offset, x, y };
      if (antialiased) {
        antialiasPixels += 1;
        diff[offset] = 255;
        diff[offset + 1] = 183;
        diff[offset + 2] = 0;
        diff[offset + 3] = 180;
      } else {
        meaningfulPixels += 1;
        diff[offset] = 255;
        diff[offset + 1] = 0;
        diff[offset + 2] = 0;
        diff[offset + 3] = 220;
      }
      if (edgeRasterEligible) {
        bufferedEntries.push(entry);
        if (
          meaningfulPixels > EDGE_RASTER_MAX_PIXELS ||
          bufferedEntries.length >
            EDGE_RASTER_MAX_PIXELS + options.maxAntialiasPixels
        ) {
          edgeRasterEligible = false;
        }
      }
    }
  }
  const edgeRaster = edgeRasterEligible
    ? selectEdgeRasterPixels(bufferedEntries, baseline, candidate)
    : { componentCount: 0, offsets: new Set() };
  let edgeRasterAntialiasPixels = 0;
  let edgeRasterMeaningfulPixels = 0;
  for (const entry of bufferedEntries) {
    if (!edgeRaster.offsets.has(entry.offset)) {
      continue;
    }
    if (entry.antialiased) {
      edgeRasterAntialiasPixels += 1;
    } else {
      edgeRasterMeaningfulPixels += 1;
    }
    diff[entry.offset] = 255;
    diff[entry.offset + 1] = 183;
    diff[entry.offset + 2] = 64;
    diff[entry.offset + 3] = 180;
  }
  antialiasPixels -= edgeRasterAntialiasPixels;
  meaningfulPixels -= edgeRasterMeaningfulPixels;
  return {
    antialiasPixels,
    changedPixels,
    diff: { data: diff, height: baseline.height, width: baseline.width },
    edgeRasterComponents: edgeRaster.componentCount,
    edgeRasterPixels: edgeRaster.offsets.size,
    maximumChannelDifference,
    meaningfulPixels,
    passed:
      meaningfulPixels === 0 && antialiasPixels <= options.maxAntialiasPixels,
  };
}

function transformNumbers(value) {
  return [...value.matchAll(NUMBER_PATTERN)].map((match) => Number(match[0]));
}

function transformShape(value) {
  return value.replace(NUMBER_PATTERN, "#");
}

function compareGeometryValue(
  baseline,
  candidate,
  pathLabel,
  tolerance,
  differences,
) {
  if (typeof baseline === "number" && typeof candidate === "number") {
    const difference = Math.abs(baseline - candidate);
    if (difference > tolerance) {
      differences.push({
        baseline,
        candidate,
        difference,
        path: pathLabel,
      });
    }
    return;
  }
  if (
    typeof baseline === "string" &&
    typeof candidate === "string" &&
    pathLabel.endsWith(".style.transform") &&
    transformShape(baseline) === transformShape(candidate)
  ) {
    const baselineNumbers = transformNumbers(baseline);
    const candidateNumbers = transformNumbers(candidate);
    if (baselineNumbers.length === candidateNumbers.length) {
      for (let index = 0; index < baselineNumbers.length; index += 1) {
        compareGeometryValue(
          baselineNumbers[index],
          candidateNumbers[index],
          `${pathLabel}[${index}]`,
          tolerance,
          differences,
        );
      }
      return;
    }
  }
  if (Array.isArray(baseline) && Array.isArray(candidate)) {
    if (baseline.length !== candidate.length) {
      differences.push({
        baseline: baseline.length,
        candidate: candidate.length,
        difference: null,
        path: `${pathLabel}.length`,
      });
      return;
    }
    for (let index = 0; index < baseline.length; index += 1) {
      compareGeometryValue(
        baseline[index],
        candidate[index],
        `${pathLabel}[${index}]`,
        tolerance,
        differences,
      );
    }
    return;
  }
  if (
    baseline !== null &&
    candidate !== null &&
    typeof baseline === "object" &&
    typeof candidate === "object" &&
    !Array.isArray(baseline) &&
    !Array.isArray(candidate)
  ) {
    const baselineKeys = Object.keys(baseline).sort();
    const candidateKeys = Object.keys(candidate).sort();
    if (!sameValue(baselineKeys, candidateKeys)) {
      differences.push({
        baseline: baselineKeys,
        candidate: candidateKeys,
        difference: null,
        path: `${pathLabel}.keys`,
      });
      return;
    }
    for (const key of baselineKeys) {
      compareGeometryValue(
        baseline[key],
        candidate[key],
        `${pathLabel}.${key}`,
        tolerance,
        differences,
      );
    }
    return;
  }
  if (baseline !== candidate) {
    differences.push({
      baseline,
      candidate,
      difference: null,
      path: pathLabel,
    });
  }
}

function compareGeometry(baseline, candidate, tolerance) {
  const differences = [];
  compareGeometryValue(baseline, candidate, "geometry", tolerance, differences);
  return {
    differences,
    passed: differences.length === 0,
    tolerance,
  };
}

function compareScenario(baseline, candidate, options, stagingDirectory) {
  const contractDifferences = [];
  if (baseline.id !== candidate.id) {
    contractDifferences.push({
      baseline: baseline.id,
      candidate: candidate.id,
      field: "scenario.id",
    });
  }
  if (
    baseline.receipt.scenario.theme !== candidate.receipt.scenario.theme ||
    !sameValue(baseline.receipt.viewport, candidate.receipt.viewport)
  ) {
    contractDifferences.push({
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
  const baselineImage = decodePng(baseline.screenshotPath);
  const candidateImage = decodePng(candidate.screenshotPath);
  const expectedDimensions = expectedScreenshotDimensions(
    baseline.receipt.viewport,
    `scenario ${baseline.id} viewport`,
  );
  if (
    baselineImage.width !== expectedDimensions.width ||
    baselineImage.height !== expectedDimensions.height ||
    candidateImage.width !== expectedDimensions.width ||
    candidateImage.height !== expectedDimensions.height
  ) {
    contractDifferences.push({
      baseline: { height: baselineImage.height, width: baselineImage.width },
      candidate: { height: candidateImage.height, width: candidateImage.width },
      field: "screenshot.dimensions",
    });
  }
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
      edgeRasterPolicy: {
        channelTolerance: EDGE_RASTER_CHANNEL_TOLERANCE,
        maxComponentHeight: EDGE_RASTER_MAX_COMPONENT_HEIGHT,
        maxComponentPixels: EDGE_RASTER_MAX_COMPONENT_PIXELS,
        maxComponentWidth: EDGE_RASTER_MAX_COMPONENT_WIDTH,
        maxComponents: EDGE_RASTER_MAX_COMPONENTS,
        maxPixels: EDGE_RASTER_MAX_PIXELS,
      },
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
