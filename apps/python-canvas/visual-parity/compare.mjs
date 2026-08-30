import { createHash } from "node:crypto";
import {
  existsSync,
  closeSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

const CAPTURE_SCHEMA_VERSION = 1;
const COMPARISON_SCHEMA_VERSION = 2;
const DEFAULT_ANTIALIAS_TOLERANCE = 16;
const DEFAULT_GEOMETRY_TOLERANCE = 0.25;
const DEFAULT_MAX_ANTIALIAS_PIXELS = 128;
const DEFAULT_PIXEL_TOLERANCE = 4;
const EDGE_RASTER_CHANNEL_TOLERANCE = 68;
const EDGE_RASTER_MAX_COMPONENTS = 4;
const EDGE_RASTER_MAX_COMPONENT_HEIGHT = 3;
const EDGE_RASTER_MAX_COMPONENT_PIXELS = 12;
const EDGE_RASTER_MAX_COMPONENT_WIDTH = 6;
const EDGE_RASTER_MAX_PIXELS = 36;
const MAX_IMAGE_PIXELS = 20_000_000;
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
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

function sameValue(left, right) {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((entry, index) => sameValue(entry, right[index]))
    );
  }
  if (
    left !== null &&
    right !== null &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      sameValue(leftKeys, rightKeys) &&
      leftKeys.every((key) => sameValue(left[key], right[key]))
    );
  }
  return false;
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function assertViewport(value, label) {
  const viewport = assertRecord(value, label);
  assertExactKeys(viewport, ["deviceScaleFactor", "height", "width"], label);
  for (const key of ["width", "height", "deviceScaleFactor"]) {
    if (!Number.isFinite(viewport[key]) || viewport[key] <= 0) {
      throw new Error(`${label}.${key} must be a positive finite number.`);
    }
  }
  if (!Number.isInteger(viewport.width) || !Number.isInteger(viewport.height)) {
    throw new Error(`${label} width and height must be integers.`);
  }
  const width = Math.round(viewport.width * viewport.deviceScaleFactor);
  const height = Math.round(viewport.height * viewport.deviceScaleFactor);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new Error(`${label} exceeds the supported screenshot bounds.`);
  }
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
  for (const field of ["captureRevision", "referenceRevision"]) {
    const revision = assertString(receipt[field], `${label}.${field}`);
    if (!/^[0-9a-f]{40}$/u.test(revision)) {
      throw new Error(`${label}.${field} is not a full commit revision.`);
    }
  }
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
  const deferredScenarios = manifest.scenarios.filter(
    (scenario) => scenario.availability !== "capturable",
  );
  if (!sameValue(receipt.deferredScenarios, deferredScenarios)) {
    throw new Error(`${label}.deferredScenarios does not match its manifest.`);
  }
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

function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data) {
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
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
    const expectedCrc = image.readUInt32BE(dataEnd);
    if (
      crc32(Buffer.concat([Buffer.from(type, "ascii"), chunk])) !== expectedCrc
    ) {
      throw new Error(`${filePath} has an invalid PNG checksum.`);
    }
    if (type === "IHDR") {
      if (
        header !== null ||
        chunk.length !== 13 ||
        offset !== PNG_SIGNATURE.length
      ) {
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
      if (chunk.length !== 0) {
        throw new Error(`${filePath} has an invalid PNG end chunk.`);
      }
      ended = true;
      offset = dataEnd + 4;
      break;
    }
    offset = dataEnd + 4;
  }
  if (offset !== image.length || !header || !ended || dataChunks.length === 0) {
    throw new Error(`${filePath} has incomplete PNG data.`);
  }
  if (
    header.width <= 0 ||
    header.height <= 0 ||
    header.width * header.height > MAX_IMAGE_PIXELS ||
    header.bitDepth !== 8 ||
    ![2, 6].includes(header.colorType) ||
    header.compression !== 0 ||
    header.filter !== 0 ||
    header.interlace !== 0
  ) {
    throw new Error(`${filePath} uses an unsupported PNG encoding.`);
  }
  const bytesPerPixel = header.colorType === 6 ? 4 : 3;
  const rowLength = header.width * bytesPerPixel;
  const expectedLength = (rowLength + 1) * header.height;
  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(dataChunks), {
      maxOutputLength: expectedLength,
    });
  } catch (error) {
    throw new Error(
      `${filePath} has unreadable PNG data: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
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
        column >= bytesPerPixel
          ? unfiltered[destinationOffset + column - bytesPerPixel]
          : 0;
      const up =
        row > 0 ? unfiltered[destinationOffset - rowLength + column] : 0;
      const upLeft =
        row > 0 && column >= bytesPerPixel
          ? unfiltered[destinationOffset - rowLength + column - bytesPerPixel]
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
    sourceOffset += bytesPerPixel, destinationOffset += 4
  ) {
    rgba[destinationOffset] = unfiltered[sourceOffset];
    rgba[destinationOffset + 1] = unfiltered[sourceOffset + 1];
    rgba[destinationOffset + 2] = unfiltered[sourceOffset + 2];
    rgba[destinationOffset + 3] =
      bytesPerPixel === 4 ? unfiltered[sourceOffset + 3] : 0xff;
  }
  return { data: rgba, height: header.height, width: header.width };
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

function dimensionDiffImage() {
  return {
    data: Buffer.from([255, 0, 0, 220]),
    height: 1,
    width: 1,
  };
}

function pixelDifferenceRecord(
  baseline,
  candidate,
  offset,
  classification,
  difference,
  x,
  y,
) {
  return {
    baseline: [...baseline.subarray(offset, offset + 4)],
    candidate: [...candidate.subarray(offset, offset + 4)],
    classification,
    difference,
    x,
    y,
  };
}

function createPixelDifferenceWriter(filePath) {
  const descriptor = openSync(filePath, "w");
  let buffer = "";
  let count = 0;
  let closed = false;
  const flush = () => {
    if (buffer.length > 0) {
      writeSync(descriptor, buffer, undefined, "utf8");
      buffer = "";
    }
  };
  return {
    append(record) {
      if (closed) {
        throw new Error(`Pixel diff writer is already closed: ${filePath}.`);
      }
      buffer += `${JSON.stringify(record)}\n`;
      count += 1;
      if (buffer.length >= 65_536) {
        flush();
      }
    },
    close() {
      if (!closed) {
        flush();
        closeSync(descriptor);
        closed = true;
      }
    },
    get count() {
      return count;
    },
  };
}

function appendPixelDifference(
  baseline,
  candidate,
  entry,
  classification,
  differenceWriter,
  diff,
) {
  differenceWriter.append(
    pixelDifferenceRecord(
      baseline.data,
      candidate.data,
      entry.offset,
      classification,
      entry.difference,
      entry.x,
      entry.y,
    ),
  );
  diff[entry.offset] = 255;
  diff[entry.offset + 1] = classification === "meaningful" ? 0 : 183;
  diff[entry.offset + 2] = classification === "edge-raster" ? 64 : 0;
  diff[entry.offset + 3] = classification === "meaningful" ? 220 : 180;
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
          if (x < 0 || y < 0) {
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

function comparePixels(baseline, candidate, options, differenceWriter) {
  if (
    baseline.width !== candidate.width ||
    baseline.height !== candidate.height
  ) {
    differenceWriter.append({
      baseline: { height: baseline.height, width: baseline.width },
      candidate: { height: candidate.height, width: candidate.width },
      classification: "dimension-mismatch",
    });
    return {
      antialiasPixels: 0,
      changedPixels: 0,
      diff: dimensionDiffImage(),
      dimensionsDiffer: true,
      edgeRasterComponents: 0,
      edgeRasterPixels: 0,
      maximumChannelDifference: null,
      meaningfulPixels: 1,
      passed: false,
    };
  }
  const diff = Buffer.alloc(baseline.data.length);
  let antialiasPixels = 0;
  let bufferedEntries = [];
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
      if (antialiased) {
        antialiasPixels += 1;
      } else {
        meaningfulPixels += 1;
      }
      const entry = { antialiased, difference, offset, x, y };
      if (edgeRasterEligible) {
        bufferedEntries.push(entry);
        if (
          meaningfulPixels > EDGE_RASTER_MAX_PIXELS ||
          bufferedEntries.length >
            EDGE_RASTER_MAX_PIXELS + options.maxAntialiasPixels
        ) {
          edgeRasterEligible = false;
          for (const bufferedEntry of bufferedEntries) {
            appendPixelDifference(
              baseline,
              candidate,
              bufferedEntry,
              bufferedEntry.antialiased ? "antialias" : "meaningful",
              differenceWriter,
              diff,
            );
          }
          bufferedEntries = [];
        }
      } else {
        appendPixelDifference(
          baseline,
          candidate,
          entry,
          antialiased ? "antialias" : "meaningful",
          differenceWriter,
          diff,
        );
      }
    }
  }
  const edgeRaster = edgeRasterEligible
    ? selectEdgeRasterPixels(bufferedEntries, baseline, candidate)
    : { componentCount: 0, offsets: new Set() };
  let edgeRasterAntialiasPixels = 0;
  let edgeRasterMeaningfulPixels = 0;
  for (const entry of bufferedEntries) {
    const isEdgeRaster = edgeRaster.offsets.has(entry.offset);
    if (isEdgeRaster) {
      if (entry.antialiased) {
        edgeRasterAntialiasPixels += 1;
      } else {
        edgeRasterMeaningfulPixels += 1;
      }
    }
    appendPixelDifference(
      baseline,
      candidate,
      entry,
      isEdgeRaster
        ? "edge-raster"
        : entry.antialiased
          ? "antialias"
          : "meaningful",
      differenceWriter,
      diff,
    );
  }
  antialiasPixels -= edgeRasterAntialiasPixels;
  meaningfulPixels -= edgeRasterMeaningfulPixels;
  return {
    antialiasPixels,
    changedPixels,
    diff: { data: diff, height: baseline.height, width: baseline.width },
    dimensionsDiffer: false,
    edgeRasterComponents: edgeRaster.componentCount,
    edgeRasterPixels: edgeRaster.offsets.size,
    maximumChannelDifference,
    meaningfulPixels,
    passed:
      meaningfulPixels === 0 && antialiasPixels <= options.maxAntialiasPixels,
  };
}

function createDifferenceCollector() {
  return { count: 0, differences: [] };
}

function addDifference(collector, difference) {
  collector.count += 1;
  collector.differences.push(difference);
}

function isGeometryPath(pathSegments) {
  const segments = pathSegments
    .filter((segment) => typeof segment === "string")
    .filter((segment) => segment !== "publicState");
  const last = segments[segments.length - 1];
  if (segments.includes("rect")) {
    return true;
  }
  if (segments[0] === "terminal" && segments[1] === "pane") {
    return true;
  }
  if (
    segments[0] === "terminal" &&
    segments[1] === "viewport" &&
    ["clientHeight", "scrollHeight", "scrollTop"].includes(last)
  ) {
    return true;
  }
  if (
    segments[0] === "generatedEditor" &&
    segments[1] === "scroller" &&
    ["clientHeight", "scrollHeight", "scrollTop"].includes(last)
  ) {
    return true;
  }
  if (
    segments[0] === "viewport" &&
    ["documentHeight", "documentWidth", "height", "width"].includes(last)
  ) {
    return true;
  }
  return (
    segments[0] === "viewport" &&
    segments[1] === "matrix" &&
    ["x", "y", "zoom"].includes(last)
  );
}

function pathLabel(pathSegments) {
  return pathSegments
    .reduce(
      (label, segment) =>
        typeof segment === "number"
          ? `${label}[${segment}]`
          : `${label}.${segment}`,
      "",
    )
    .slice(1);
}

function comparePublicStateValue(
  baseline,
  candidate,
  pathSegments,
  tolerance,
  contract,
  geometry,
) {
  const label = pathLabel(pathSegments);
  if (typeof baseline === "number" && typeof candidate === "number") {
    if (isGeometryPath(pathSegments)) {
      const difference = Math.abs(baseline - candidate);
      if (difference > tolerance) {
        addDifference(geometry, {
          baseline,
          candidate,
          difference,
          path: label,
        });
      }
      return;
    }
    if (!Object.is(baseline, candidate)) {
      addDifference(contract, { baseline, candidate, field: label });
    }
    return;
  }
  if (Array.isArray(baseline) && Array.isArray(candidate)) {
    if (baseline.length !== candidate.length) {
      addDifference(contract, {
        baseline: baseline.length,
        candidate: candidate.length,
        field: `${label}.length`,
      });
      return;
    }
    for (let index = 0; index < baseline.length; index += 1) {
      comparePublicStateValue(
        baseline[index],
        candidate[index],
        [...pathSegments, index],
        tolerance,
        contract,
        geometry,
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
      addDifference(contract, {
        baseline: baselineKeys,
        candidate: candidateKeys,
        field: `${label}.keys`,
      });
      return;
    }
    for (const key of baselineKeys) {
      comparePublicStateValue(
        baseline[key],
        candidate[key],
        [...pathSegments, key],
        tolerance,
        contract,
        geometry,
      );
    }
    return;
  }
  if (!Object.is(baseline, candidate)) {
    const collector = isGeometryPath(pathSegments) ? geometry : contract;
    addDifference(collector, {
      baseline,
      candidate,
      field: label,
      ...(collector === geometry ? { difference: null, path: label } : {}),
    });
  }
}

function comparePublicState(baseline, candidate, tolerance) {
  const contract = createDifferenceCollector();
  const geometry = createDifferenceCollector();
  comparePublicStateValue(
    baseline,
    candidate,
    ["publicState"],
    tolerance,
    contract,
    geometry,
  );
  return {
    contract,
    geometry: {
      ...geometry,
      passed: geometry.count === 0,
      tolerance,
    },
  };
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

function sortScenarios(scenarios) {
  return [...scenarios].sort((left, right) => left.id.localeCompare(right.id));
}

function scenariosById(scenarios) {
  return new Map(scenarios.map((scenario) => [scenario.id, scenario]));
}

function compareCatalogEntries(
  baselineEntries,
  candidateEntries,
  label,
  contract,
) {
  const baselineById = new Map(baselineEntries);
  const candidateById = new Map(candidateEntries);
  const missingFromCandidate = [];
  const extraInCandidate = [];
  const changed = [];
  for (const [id, baseline] of baselineEntries) {
    const candidate = candidateById.get(id);
    if (candidate === undefined) {
      missingFromCandidate.push({ baseline, id });
      addDifference(contract, {
        baseline,
        candidate: null,
        field: `${label}.${id}`,
        kind: "missing-from-candidate",
      });
      continue;
    }
    if (!sameValue(baseline, candidate)) {
      changed.push({ baseline, candidate, id });
      addDifference(contract, {
        baseline,
        candidate,
        field: `${label}.${id}`,
        kind: "changed",
      });
    }
  }
  for (const [id, candidate] of candidateEntries) {
    if (baselineById.has(id)) {
      continue;
    }
    extraInCandidate.push({ candidate, id });
    addDifference(contract, {
      baseline: null,
      candidate,
      field: `${label}.${id}`,
      kind: "extra-in-candidate",
    });
  }
  return {
    changed,
    extraInCandidate,
    missingFromCandidate,
  };
}

function groupUnsupportedScenarios(scenarios) {
  const grouped = new Map();
  for (const scenario of sortScenarios(scenarios)) {
    const group = grouped.get(scenario.fixture) ?? [];
    group.push(scenario);
    grouped.set(scenario.fixture, group);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fixture, fixtureScenarios]) => ({
      fixture,
      scenarios: fixtureScenarios,
    }));
}

function compareCatalogs(baseline, candidate) {
  const contract = createDifferenceCollector();
  const baselineFixtures = Object.entries(baseline.manifest.fixtures).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  const candidateFixtures = Object.entries(candidate.manifest.fixtures).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  const fixtures = compareCatalogEntries(
    baselineFixtures,
    candidateFixtures,
    "fixtures",
    contract,
  );
  const baselineScenarios = sortScenarios(baseline.manifest.scenarios);
  const candidateScenarios = sortScenarios(candidate.manifest.scenarios);
  const scenarios = compareCatalogEntries(
    baselineScenarios.map((scenario) => [scenario.id, scenario]),
    candidateScenarios.map((scenario) => [scenario.id, scenario]),
    "scenarios",
    contract,
  );
  if (
    baseline.receipt.referenceRevision !== candidate.receipt.referenceRevision
  ) {
    addDifference(contract, {
      baseline: baseline.receipt.referenceRevision,
      candidate: candidate.receipt.referenceRevision,
      field: "receipt.referenceRevision",
      kind: "changed",
    });
  }
  const baselineCapturable = baselineScenarios.filter(
    (scenario) => scenario.availability === "capturable",
  );
  const candidateCapturable = candidateScenarios.filter(
    (scenario) => scenario.availability === "capturable",
  );
  const baselineUnsupported = baselineScenarios.filter(
    (scenario) => scenario.availability !== "capturable",
  );
  const candidateUnsupported = candidateScenarios.filter(
    (scenario) => scenario.availability !== "capturable",
  );
  const baselineCapturableById = scenariosById(baselineCapturable);
  const candidateCapturableById = scenariosById(candidateCapturable);
  const baselineUnsupportedById = scenariosById(baselineUnsupported);
  const candidateUnsupportedById = scenariosById(candidateUnsupported);
  const missingCapturableFromCandidate = baselineCapturable.filter(
    (scenario) => !candidateCapturableById.has(scenario.id),
  );
  const extraCapturableInCandidate = candidateCapturable.filter(
    (scenario) => !baselineCapturableById.has(scenario.id),
  );
  const missingUnsupportedFromCandidate = baselineUnsupported.filter(
    (scenario) => !candidateUnsupportedById.has(scenario.id),
  );
  const extraUnsupportedInCandidate = candidateUnsupported.filter(
    (scenario) => !baselineUnsupportedById.has(scenario.id),
  );
  const comparedCapturableScenarioIds = baselineCapturable
    .filter((scenario) => candidateCapturableById.has(scenario.id))
    .map((scenario) => scenario.id);
  return {
    contract: {
      differenceCount: contract.count,
      differences: contract.differences,
      passed: contract.count === 0,
    },
    fixtures,
    scenarios: {
      baselineCapturable,
      baselineUnsupported,
      candidateCapturable,
      candidateUnsupported,
      changed: scenarios.changed,
      comparedCapturableScenarioIds,
      extraCapturableInCandidate,
      extraInCandidate: scenarios.extraInCandidate,
      extraUnsupportedInCandidate,
      missingCapturableFromCandidate,
      missingFromCandidate: scenarios.missingFromCandidate,
      missingUnsupportedFromCandidate,
    },
    unsupportedByFixture: {
      baseline: groupUnsupportedScenarios(baselineUnsupported),
      candidate: groupUnsupportedScenarios(candidateUnsupported),
      extraInCandidate: groupUnsupportedScenarios(extraUnsupportedInCandidate),
      missingFromCandidate: groupUnsupportedScenarios(
        missingUnsupportedFromCandidate,
      ),
    },
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

function comparisonReceipt(options, comparison, error) {
  const results = comparison?.results ?? [];
  const catalog = comparison?.catalog ?? null;
  const unsupportedFixtureStates = catalog?.unsupportedByFixture ?? {
    baseline: [],
    candidate: [],
    extraInCandidate: [],
    missingFromCandidate: [],
  };
  const supportedParityPassed =
    error === null && results.every((result) => result.passed);
  const catalogPassed = error === null && catalog?.contract.passed === true;
  return {
    baseline: comparison?.baseline ?? { path: options.baselineDir },
    candidate: comparison?.candidate ?? { path: options.candidateDir },
    catalog,
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
    coverageComplete:
      unsupportedFixtureStates.baseline.length === 0 &&
      unsupportedFixtureStates.candidate.length === 0,
    error: error === null ? null : error.message,
    passed: catalogPassed && supportedParityPassed,
    results,
    schemaVersion: COMPARISON_SCHEMA_VERSION,
    supportedParityPassed,
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
