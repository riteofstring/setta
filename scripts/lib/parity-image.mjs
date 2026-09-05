import {
  closeSync,
  openSync,
  readFileSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

export const DEFAULT_ANTIALIAS_TOLERANCE = 16;
export const DEFAULT_GEOMETRY_TOLERANCE = 0.25;
export const DEFAULT_MAX_ANTIALIAS_PIXELS = 128;
export const DEFAULT_PIXEL_TOLERANCE = 4;
const EDGE_RASTER_CHANNEL_TOLERANCE = 68;
const EDGE_RASTER_MAX_COMPONENTS = 4;
const EDGE_RASTER_MAX_COMPONENT_HEIGHT = 3;
const EDGE_RASTER_MAX_COMPONENT_PIXELS = 12;
const EDGE_RASTER_MAX_COMPONENT_WIDTH = 6;
const EDGE_RASTER_MAX_PIXELS = 36;
export const EDGE_RASTER_POLICY = Object.freeze({
  channelTolerance: EDGE_RASTER_CHANNEL_TOLERANCE,
  maxComponentHeight: EDGE_RASTER_MAX_COMPONENT_HEIGHT,
  maxComponentPixels: EDGE_RASTER_MAX_COMPONENT_PIXELS,
  maxComponentWidth: EDGE_RASTER_MAX_COMPONENT_WIDTH,
  maxComponents: EDGE_RASTER_MAX_COMPONENTS,
  maxPixels: EDGE_RASTER_MAX_PIXELS,
});
export const MAX_IMAGE_PIXELS = 20_000_000;
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const CRC_TABLE = new Uint32Array(256);

for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  CRC_TABLE[index] = value >>> 0;
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

function assertPngSignature(image, filePath) {
  if (!image.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`${filePath} is not a PNG.`);
  }
}

function readPngChunk(image, offset, filePath) {
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
  const data = image.subarray(dataStart, dataEnd);
  const expectedCrc = image.readUInt32BE(dataEnd);
  if (
    crc32(Buffer.concat([Buffer.from(type, "ascii"), data])) !== expectedCrc
  ) {
    throw new Error(`${filePath} has an invalid PNG checksum.`);
  }
  return { data, nextOffset: dataEnd + 4, offset, type };
}

function parsePngHeader(record, currentHeader, filePath) {
  if (
    currentHeader !== null ||
    record.data.length !== 13 ||
    record.offset !== PNG_SIGNATURE.length
  ) {
    throw new Error(`${filePath} has an invalid PNG header.`);
  }
  return {
    bitDepth: record.data.readUInt8(8),
    colorType: record.data.readUInt8(9),
    compression: record.data.readUInt8(10),
    filter: record.data.readUInt8(11),
    height: record.data.readUInt32BE(4),
    interlace: record.data.readUInt8(12),
    width: record.data.readUInt32BE(0),
  };
}

function consumePngChunk(state, record, filePath) {
  if (record.type === "IHDR") {
    state.header = parsePngHeader(record, state.header, filePath);
    return;
  }
  if (record.type === "IDAT") {
    state.dataChunks.push(record.data);
    return;
  }
  if (record.type === "IEND") {
    if (record.data.length !== 0) {
      throw new Error(`${filePath} has an invalid PNG end chunk.`);
    }
    state.ended = true;
  }
}

function readPngChunks(image, filePath) {
  let offset = PNG_SIGNATURE.length;
  const state = { dataChunks: [], ended: false, header: null };
  while (offset < image.length && !state.ended) {
    const record = readPngChunk(image, offset, filePath);
    consumePngChunk(state, record, filePath);
    offset = record.nextOffset;
  }
  if (
    offset !== image.length ||
    state.header === null ||
    !state.ended ||
    state.dataChunks.length === 0
  ) {
    throw new Error(`${filePath} has incomplete PNG data.`);
  }
  return state;
}

function assertSupportedPngHeader(header, filePath) {
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
}

function inflatePngData(dataChunks, expectedLength, filePath) {
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
  return inflated;
}

function pngPredictor(filter, left, up, upLeft) {
  if (filter === 0) {
    return 0;
  }
  if (filter === 1) {
    return left;
  }
  if (filter === 2) {
    return up;
  }
  if (filter === 3) {
    return Math.floor((left + up) / 2);
  }
  return paeth(left, up, upLeft);
}

function unfilterPngRow(state, row) {
  const sourceOffset = row * (state.rowLength + 1);
  const destinationOffset = row * state.rowLength;
  const filter = state.inflated[sourceOffset];
  if (filter > 4) {
    throw new Error(`${state.filePath} has an unsupported PNG filter.`);
  }
  for (let column = 0; column < state.rowLength; column += 1) {
    const source = state.inflated[sourceOffset + 1 + column];
    const left =
      column >= state.bytesPerPixel
        ? state.output[destinationOffset + column - state.bytesPerPixel]
        : 0;
    const up =
      row > 0 ? state.output[destinationOffset - state.rowLength + column] : 0;
    const upLeft =
      row > 0 && column >= state.bytesPerPixel
        ? state.output[
            destinationOffset - state.rowLength + column - state.bytesPerPixel
          ]
        : 0;
    const predictor = pngPredictor(filter, left, up, upLeft);
    state.output[destinationOffset + column] = (source + predictor) & 0xff;
  }
}

function unfilterPng(header, inflated, rowLength, bytesPerPixel, filePath) {
  const state = {
    bytesPerPixel,
    filePath,
    inflated,
    output: Buffer.alloc(rowLength * header.height),
    rowLength,
  };
  for (let row = 0; row < header.height; row += 1) {
    unfilterPngRow(state, row);
  }
  return state.output;
}

function convertToRgba(unfiltered, header, bytesPerPixel) {
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
  return rgba;
}

export function decodePng(filePath) {
  const image = readFileSync(filePath);
  assertPngSignature(image, filePath);
  const { dataChunks, header } = readPngChunks(image, filePath);
  assertSupportedPngHeader(header, filePath);
  const bytesPerPixel = header.colorType === 6 ? 4 : 3;
  const rowLength = header.width * bytesPerPixel;
  const expectedLength = (rowLength + 1) * header.height;
  const inflated = inflatePngData(dataChunks, expectedLength, filePath);
  const unfiltered = unfilterPng(
    header,
    inflated,
    rowLength,
    bytesPerPixel,
    filePath,
  );
  return {
    data: convertToRgba(unfiltered, header, bytesPerPixel),
    height: header.height,
    width: header.width,
  };
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

export function writeRgbaPng(filePath, image) {
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

function pixelDifferenceRecord(context, entry, classification) {
  return {
    baseline: [
      ...context.baseline.data.subarray(entry.offset, entry.offset + 4),
    ],
    candidate: [
      ...context.candidate.data.subarray(entry.offset, entry.offset + 4),
    ],
    classification,
    difference: entry.difference,
    x: entry.x,
    y: entry.y,
  };
}

export function createPixelDifferenceWriter(filePath) {
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

function appendPixelDifference(context, entry, classification) {
  context.writer.append(pixelDifferenceRecord(context, entry, classification));
  context.diff[entry.offset] = 255;
  context.diff[entry.offset + 1] = classification === "meaningful" ? 0 : 183;
  context.diff[entry.offset + 2] = classification === "edge-raster" ? 64 : 0;
  context.diff[entry.offset + 3] = classification === "meaningful" ? 220 : 180;
}

const CONNECTED_NEIGHBOR_OFFSETS = Object.freeze([
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
]);

function isWithinImage(x, y, dimensions) {
  return x >= 0 && x < dimensions.width && y >= 0 && y < dimensions.height;
}

function connectedNeighborOffsets(current, dimensions) {
  const offsets = [];
  for (const [xOffset, yOffset] of CONNECTED_NEIGHBOR_OFFSETS) {
    const x = current.x + xOffset;
    const y = current.y + yOffset;
    if (isWithinImage(x, y, dimensions)) {
      offsets.push((y * dimensions.width + x) * 4);
    }
  }
  return offsets;
}

function collectConnectedComponent(
  entry,
  entriesByOffset,
  visited,
  dimensions,
) {
  const component = [];
  const pending = [entry];
  visited.add(entry.offset);
  while (pending.length > 0) {
    const current = pending.pop();
    component.push(current);
    for (const neighborOffset of connectedNeighborOffsets(
      current,
      dimensions,
    )) {
      const neighbor = entriesByOffset.get(neighborOffset);
      if (neighbor === undefined || visited.has(neighborOffset)) {
        continue;
      }
      visited.add(neighborOffset);
      pending.push(neighbor);
    }
  }
  return component;
}

function collectChangedPixelComponents(entries, dimensions) {
  const entriesByOffset = new Map(
    entries.map((entry) => [entry.offset, entry]),
  );
  const visited = new Set();
  const components = [];
  for (const entry of entries) {
    if (visited.has(entry.offset)) {
      continue;
    }
    components.push(
      collectConnectedComponent(entry, entriesByOffset, visited, dimensions),
    );
  }
  return components;
}

function selectEdgeRasterPixels(entries, baseline, candidate) {
  const components = collectChangedPixelComponents(entries, baseline);
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

const NULL_DIFFERENCE_WRITER = Object.freeze({ append() {} });

function hasDifferentDimensions(baseline, candidate) {
  return (
    baseline.width !== candidate.width || baseline.height !== candidate.height
  );
}

function dimensionMismatchComparison(baseline, candidate, writer) {
  writer.append({
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

function createPixelComparisonState(dataLength) {
  return {
    antialiasPixels: 0,
    bufferedEntries: [],
    changedPixels: 0,
    diff: Buffer.alloc(dataLength),
    edgeRasterEligible: true,
    maximumChannelDifference: 0,
    meaningfulPixels: 0,
  };
}

function isAntialiasedPixel(context, difference, x, y) {
  return (
    difference <= context.options.antialiasTolerance &&
    hasEdgeContrast(context.baseline, x, y) &&
    hasEdgeContrast(context.candidate, x, y)
  );
}

function countChangedPixel(state, entry) {
  state.changedPixels += 1;
  if (entry.antialiased) {
    state.antialiasPixels += 1;
  } else {
    state.meaningfulPixels += 1;
  }
}

function edgeRasterLimitExceeded(state, options) {
  return (
    state.meaningfulPixels > EDGE_RASTER_MAX_PIXELS ||
    state.bufferedEntries.length >
      EDGE_RASTER_MAX_PIXELS + options.maxAntialiasPixels
  );
}

function ordinaryClassification(entry) {
  return entry.antialiased ? "antialias" : "meaningful";
}

function flushBufferedPixelDifferences(context, state) {
  for (const entry of state.bufferedEntries) {
    appendPixelDifference(context, entry, ordinaryClassification(entry));
  }
  state.bufferedEntries = [];
}

function bufferOrAppendPixelDifference(context, state, entry) {
  if (!state.edgeRasterEligible) {
    appendPixelDifference(context, entry, ordinaryClassification(entry));
    return;
  }
  state.bufferedEntries.push(entry);
  if (edgeRasterLimitExceeded(state, context.options)) {
    state.edgeRasterEligible = false;
    flushBufferedPixelDifferences(context, state);
  }
}

function inspectPixel(context, state, x, y) {
  const offset = (y * context.baseline.width + x) * 4;
  const difference = channelDifference(
    context.baseline.data,
    context.candidate.data,
    offset,
  );
  state.maximumChannelDifference = Math.max(
    state.maximumChannelDifference,
    difference,
  );
  if (difference <= context.options.pixelTolerance) {
    return;
  }
  const entry = {
    antialiased: isAntialiasedPixel(context, difference, x, y),
    difference,
    offset,
    x,
    y,
  };
  countChangedPixel(state, entry);
  bufferOrAppendPixelDifference(context, state, entry);
}

function scanPixels(context, state) {
  for (let y = 0; y < context.baseline.height; y += 1) {
    for (let x = 0; x < context.baseline.width; x += 1) {
      inspectPixel(context, state, x, y);
    }
  }
}

function selectEdgeRasterForState(context, state) {
  return state.edgeRasterEligible
    ? selectEdgeRasterPixels(
        state.bufferedEntries,
        context.baseline,
        context.candidate,
      )
    : { componentCount: 0, offsets: new Set() };
}

function edgeRasterClassification(entry, offsets) {
  return offsets.has(entry.offset)
    ? "edge-raster"
    : ordinaryClassification(entry);
}

function countEdgeRasterPixel(counts, entry, offsets) {
  if (!offsets.has(entry.offset)) {
    return;
  }
  if (entry.antialiased) {
    counts.antialiasPixels += 1;
  } else {
    counts.meaningfulPixels += 1;
  }
}

function writeBufferedPixelDifferences(context, state, edgeRaster) {
  const counts = { antialiasPixels: 0, meaningfulPixels: 0 };
  for (const entry of state.bufferedEntries) {
    countEdgeRasterPixel(counts, entry, edgeRaster.offsets);
    appendPixelDifference(
      context,
      entry,
      edgeRasterClassification(entry, edgeRaster.offsets),
    );
  }
  return counts;
}

function completedPixelComparison(context, state, edgeRaster, edgeCounts) {
  const antialiasPixels = state.antialiasPixels - edgeCounts.antialiasPixels;
  const meaningfulPixels = state.meaningfulPixels - edgeCounts.meaningfulPixels;
  return {
    antialiasPixels,
    changedPixels: state.changedPixels,
    diff: {
      data: state.diff,
      height: context.baseline.height,
      width: context.baseline.width,
    },
    dimensionsDiffer: false,
    edgeRasterComponents: edgeRaster.componentCount,
    edgeRasterPixels: edgeRaster.offsets.size,
    maximumChannelDifference: state.maximumChannelDifference,
    meaningfulPixels,
    passed:
      meaningfulPixels === 0 &&
      antialiasPixels <= context.options.maxAntialiasPixels,
  };
}

export function comparePixels(baseline, candidate, options, differenceWriter) {
  const writer = differenceWriter ?? NULL_DIFFERENCE_WRITER;
  if (hasDifferentDimensions(baseline, candidate)) {
    if (differenceWriter === undefined) {
      throw new Error("Screenshot dimensions differ.");
    }
    return dimensionMismatchComparison(baseline, candidate, writer);
  }
  const state = createPixelComparisonState(baseline.data.length);
  const context = { baseline, candidate, diff: state.diff, options, writer };
  scanPixels(context, state);
  const edgeRaster = selectEdgeRasterForState(context, state);
  const edgeCounts = writeBufferedPixelDifferences(context, state, edgeRaster);
  return completedPixelComparison(context, state, edgeRaster, edgeCounts);
}
