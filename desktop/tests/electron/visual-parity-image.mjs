import { Buffer } from "node:buffer";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const rgbaChannels = 4;

const scalarMetricSpecs = {
  backgroundLuminance: { max: 1, min: 0 },
  colorfulness: { max: 255, min: 0 },
  glowSoftness: { max: 20, min: 0 },
  litPixelRatio: { max: 1, min: 0 },
  meanLuminance: { max: 1, min: 0 },
  neonHuePresence: { max: 1, min: 0 },
  p95Luminance: { max: 1, min: 0 },
};

const vectorMetricSpecs = {
  backgroundRgb: { maxDistance: Math.sqrt(3 * 255 * 255), minDistance: 0 },
};

export async function readPng(path) {
  return decodePng(await readFile(path));
}

export async function writePng(path, image) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, encodePng(image));
}

export async function copyPng(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, await readFile(source));
}

export async function imageMetricsForPng(path) {
  return imageMetrics(await readPng(path));
}

export function imageMetrics(image) {
  const pixelCount = image.width * image.height;
  const samples = collectImageMetricSamples(image);
  const backgroundRgb = medianRgb(samples.backgroundSamples);
  const backgroundLuminance = srgbLuminance(backgroundRgb[0], backgroundRgb[1], backgroundRgb[2]);
  const litPixels = litPixelCountForImage({
    backgroundLuminance,
    image,
    luminanceValues: samples.luminanceValues,
  });
  return {
    backgroundLuminance,
    backgroundRgb: {
      b: backgroundRgb[2],
      g: backgroundRgb[1],
      r: backgroundRgb[0],
    },
    colorfulness: colorfulnessForSamples(samples, pixelCount),
    glowSoftness: glowSoftness({
      backgroundLuminance,
      image,
      luminanceValues: samples.luminanceValues,
    }),
    height: image.height,
    litPixelRatio: litPixels / pixelCount,
    meanLuminance: samples.luminanceTotal / pixelCount,
    neonHuePresence: samples.neonPixels / pixelCount,
    p95Luminance: percentileFromHistogram(samples.luminanceHistogram, pixelCount, 0.95),
    width: image.width,
  };
}

function collectImageMetricSamples(image) {
  const pixelCount = image.width * image.height;
  const backgroundSamples = [];
  const luminanceHistogram = new Uint32Array(256);
  const luminanceValues = new Float64Array(pixelCount);
  const rgValues = new Float64Array(pixelCount);
  const ybValues = new Float64Array(pixelCount);
  let luminanceTotal = 0;
  let neonPixels = 0;
  let rgTotal = 0;
  let ybTotal = 0;
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const sample = metricPixelSample(image, pixelIndex);
    luminanceValues[pixelIndex] = sample.luminance;
    luminanceTotal += sample.luminance;
    luminanceHistogram[Math.max(0, Math.min(255, Math.floor(sample.luminance * 255)))] += 1;
    rgValues[pixelIndex] = sample.rg;
    ybValues[pixelIndex] = sample.yb;
    rgTotal += sample.rg;
    ybTotal += sample.yb;
    if (isBackgroundSamplePoint(sample.x, sample.y, image.width, image.height)) {
      backgroundSamples.push([sample.r, sample.g, sample.b]);
    }
    if (isNeonPixel(sample.r, sample.g, sample.b)) {
      neonPixels += 1;
    }
  }
  return {
    backgroundSamples,
    luminanceHistogram,
    luminanceTotal,
    luminanceValues,
    neonPixels,
    rgTotal,
    rgValues,
    ybTotal,
    ybValues,
  };
}

function metricPixelSample(image, pixelIndex) {
  const offset = pixelIndex * rgbaChannels;
  const alpha = image.data[offset + 3] / 255;
  const r = image.data[offset] * alpha;
  const g = image.data[offset + 1] * alpha;
  const b = image.data[offset + 2] * alpha;
  return {
    b,
    g,
    luminance: srgbLuminance(r, g, b),
    r,
    rg: r - g,
    x: pixelIndex % image.width,
    y: Math.floor(pixelIndex / image.width),
    yb: 0.5 * (r + g) - b,
  };
}

function litPixelCountForImage({ backgroundLuminance, image, luminanceValues }) {
  let litPixels = 0;
  for (let pixelIndex = 0; pixelIndex < image.width * image.height; pixelIndex += 1) {
    const offset = pixelIndex * rgbaChannels;
    const alpha = image.data[offset + 3] / 255;
    const r = image.data[offset] * alpha;
    const g = image.data[offset + 1] * alpha;
    const b = image.data[offset + 2] * alpha;
    if (isLitPixel({ backgroundLuminance, b, g, luminance: luminanceValues[pixelIndex], r })) {
      litPixels += 1;
    }
  }
  return litPixels;
}

function isLitPixel({ backgroundLuminance, b, g, luminance, r }) {
  const hsv = rgbToHsv(r, g, b);
  return luminance >= backgroundLuminance + 0.08 || (hsv.saturation >= 0.25 && hsv.value >= 0.5);
}

function isNeonPixel(r, g, b) {
  const hsv = rgbToHsv(r, g, b);
  return hsv.saturation >= 0.35 && hsv.value >= 0.22 && hueInNeonBand(hsv.hue);
}

function colorfulnessForSamples(samples, pixelCount) {
  const rgMean = samples.rgTotal / pixelCount;
  const ybMean = samples.ybTotal / pixelCount;
  let rgVariance = 0;
  let ybVariance = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    rgVariance += (samples.rgValues[index] - rgMean) ** 2;
    ybVariance += (samples.ybValues[index] - ybMean) ** 2;
  }
  return (
    Math.sqrt(rgVariance / pixelCount + ybVariance / pixelCount) +
    0.3 * Math.sqrt(rgMean ** 2 + ybMean ** 2)
  );
}

export function deriveVisualParityTarget({ mockupMetrics, negativeControlMetrics }) {
  if (mockupMetrics.length === 0) {
    throw new Error("cannot derive visual parity target without mockup metrics");
  }
  const controls = Object.entries(negativeControlMetrics);
  const target = {
    dimensions: {
      height: mockupMetrics[0].height,
      width: mockupMetrics[0].width,
    },
    droppedMetrics: {},
    metrics: {},
    negativeControls: Object.fromEntries(
      controls.map(([name, metrics]) => [name, summarizeMetrics(metrics)]),
    ),
    source: {
      mockupRerenderCount: mockupMetrics.length,
      negativeControlCount: controls.length,
    },
  };

  for (const [name, spec] of Object.entries(scalarMetricSpecs)) {
    const dropReason = scalarMetricDropReason({
      mockupValues: mockupMetrics.map((metrics) => metrics[name]),
      name,
      negativeValues: controls.map(([, metrics]) => metrics[name]),
    });
    if (dropReason !== null) {
      target.droppedMetrics[name] = dropReason;
      continue;
    }
    const derived = deriveScalarBand({
      max: spec.max,
      min: spec.min,
      mockupValues: mockupMetrics.map((metrics) => metrics[name]),
      negativeValues: controls.map(([, metrics]) => metrics[name]),
    });
    if (derived === null) {
      target.droppedMetrics[name] = "mockup values overlap a negative control";
      continue;
    }
    target.metrics[name] = {
      kind: "scalar",
      ...derived,
    };
  }

  for (const [name, spec] of Object.entries(vectorMetricSpecs)) {
    const mockupValue = medianRgbObject(mockupMetrics.map((metrics) => metrics[name]));
    const mockupDistances = mockupMetrics.map((metrics) => rgbDistance(metrics[name], mockupValue));
    const negativeDistances = controls.map(([, metrics]) =>
      rgbDistance(metrics[name], mockupValue),
    );
    const derived = deriveDistanceBand({
      maxDistance: spec.maxDistance,
      mockupDistances,
      negativeDistances,
    });
    if (derived === null) {
      target.droppedMetrics[name] = "mockup colour distance overlaps a negative control";
      continue;
    }
    target.metrics[name] = {
      kind: "rgb-distance",
      target: mockupValue,
      ...derived,
    };
  }

  return target;
}

function scalarMetricDropReason({ mockupValues, name, negativeValues }) {
  if (name !== "p95Luminance" || negativeValues.length === 0) {
    return null;
  }
  const mockupMin = Math.min(...mockupValues);
  const mockupMax = Math.max(...mockupValues);
  const nearestOutsideGap = Math.min(
    ...negativeValues
      .filter((value) => value < mockupMin || value > mockupMax)
      .map((value) => (value < mockupMin ? mockupMin - value : value - mockupMax)),
  );
  return nearestOutsideGap <= 1 / 255 + 1e-12
    ? "nearest negative control is within one luminance histogram bin"
    : null;
}

export function scoreVisualParityMetrics({ actualMetrics, target }) {
  const dimensionsPass =
    actualMetrics.width === target.dimensions.width &&
    actualMetrics.height === target.dimensions.height;
  const metricScores = {};
  for (const [name, tolerance] of Object.entries(target.metrics)) {
    if (tolerance.kind === "scalar") {
      const actual = actualMetrics[name];
      metricScores[name] = {
        actual,
        lower: tolerance.lower,
        pass: actual >= tolerance.lower && actual <= tolerance.upper,
        target: tolerance.target,
        upper: tolerance.upper,
      };
      continue;
    }
    if (tolerance.kind === "rgb-distance") {
      const actual = actualMetrics[name];
      const distance = rgbDistance(actual, tolerance.target);
      metricScores[name] = {
        actual,
        distance,
        maxDistance: tolerance.maxDistance,
        pass: distance <= tolerance.maxDistance,
        target: tolerance.target,
      };
      continue;
    }
    throw new Error(`unsupported visual parity metric kind: ${tolerance.kind}`);
  }
  const metricPass = Object.values(metricScores).every((score) => score.pass);
  return {
    actual: summarizeMetrics(actualMetrics),
    dimensions: {
      actual: { height: actualMetrics.height, width: actualMetrics.width },
      expected: target.dimensions,
      pass: dimensionsPass,
    },
    metrics: metricScores,
    pass: dimensionsPass && metricPass,
  };
}

export function darkenImage(image, factor) {
  const next = cloneImage(image);
  for (let index = 0; index < next.data.length; index += rgbaChannels) {
    next.data[index] = clampByte(next.data[index] * factor);
    next.data[index + 1] = clampByte(next.data[index + 1] * factor);
    next.data[index + 2] = clampByte(next.data[index + 2] * factor);
  }
  return next;
}

export function boxBlurImage(image, radius) {
  if (!Number.isInteger(radius) || radius < 1) {
    throw new Error(`blur radius must be a positive integer: ${String(radius)}`);
  }
  const horizontal = cloneImage(image);
  const output = cloneImage(image);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      writeAveragedPixel({
        destination: horizontal,
        image,
        maxX: Math.min(image.width - 1, x + radius),
        maxY: y,
        minX: Math.max(0, x - radius),
        minY: y,
        x,
        y,
      });
    }
  }
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      writeAveragedPixel({
        destination: output,
        image: horizontal,
        maxX: x,
        maxY: Math.min(image.height - 1, y + radius),
        minX: x,
        minY: Math.max(0, y - radius),
        x,
        y,
      });
    }
  }
  return output;
}

export function sideBySideImage(left, right) {
  const gutter = 24;
  const width = left.width + gutter + right.width;
  const height = Math.max(left.height, right.height);
  const output = {
    data: Buffer.alloc(width * height * rgbaChannels),
    height,
    width,
  };
  for (let offset = 0; offset < output.data.length; offset += rgbaChannels) {
    output.data[offset] = 4;
    output.data[offset + 1] = 5;
    output.data[offset + 2] = 10;
    output.data[offset + 3] = 255;
  }
  blitImage(output, left, 0, 0);
  blitImage(output, right, left.width + gutter, 0);
  return output;
}

export function contactSheetImage(images, { columns = 3, gutter = 12, tileWidth = 680 } = {}) {
  validateContactSheetOptions({ columns, gutter, images, tileWidth });
  const first = images[0];
  const scale = Math.min(1, tileWidth / first.width);
  const tileHeight = Math.max(1, Math.round(first.height * scale));
  const scaledTileWidth = Math.max(1, Math.round(first.width * scale));
  const rows = Math.ceil(images.length / columns);
  const width = columns * scaledTileWidth + (columns - 1) * gutter;
  const height = rows * tileHeight + (rows - 1) * gutter;
  const output = filledImage(width, height, { b: 10, g: 5, r: 4 });
  images.forEach((image, index) => {
    const scaled = scale === 1 ? image : nearestResizeImage(image, scaledTileWidth, tileHeight);
    const column = index % columns;
    const row = Math.floor(index / columns);
    blitImage(output, scaled, column * (scaledTileWidth + gutter), row * (tileHeight + gutter));
  });
  return output;
}

function validateContactSheetOptions({ columns, gutter, images, tileWidth }) {
  validateContactSheetImageList(images);
  validateContactSheetPositiveInteger("columns", columns);
  validateContactSheetNonNegativeInteger("gutter", gutter);
  validateContactSheetPositiveInteger("tileWidth", tileWidth);
  validateContactSheetFrameDimensions(images);
}

function validateContactSheetImageList(images) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error("contact sheet requires at least one image");
  }
}

function validateContactSheetPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`contact sheet ${name} must be a positive integer: ${String(value)}`);
  }
}

function validateContactSheetNonNegativeInteger(name, value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`contact sheet ${name} must be a non-negative integer: ${String(value)}`);
  }
}

function validateContactSheetFrameDimensions(images) {
  const first = images[0];
  for (const image of images) {
    if (image.width !== first.width || image.height !== first.height) {
      throw new Error(
        `contact sheet frame dimensions differ: expected ${first.width}x${first.height}, received ${image.width}x${image.height}`,
      );
    }
  }
}

function decodePng(buffer) {
  if (!buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error("PNG signature mismatch");
  }
  let offset = pngSignature.length;
  let header = null;
  const idatChunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      header = {
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        height: data.readUInt32BE(4),
        interlace: data[12],
        width: data.readUInt32BE(0),
      };
      continue;
    }
    if (type === "IDAT") {
      idatChunks.push(data);
      continue;
    }
    if (type === "IEND") {
      break;
    }
  }
  if (header === null) {
    throw new Error("PNG is missing IHDR");
  }
  assertSupportedPngHeader(header);
  const bytesPerPixel = pngBytesPerPixel(header.colorType);
  const scanlineLength = header.width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rgba = Buffer.alloc(header.width * header.height * rgbaChannels);
  const previous = Buffer.alloc(scanlineLength);
  let sourceOffset = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const scanline = Buffer.from(inflated.subarray(sourceOffset, sourceOffset + scanlineLength));
    sourceOffset += scanlineLength;
    unfilterScanline(scanline, previous, bytesPerPixel, filter);
    convertScanlineToRgba({
      colorType: header.colorType,
      rgba,
      scanline,
      width: header.width,
      y,
    });
    previous.set(scanline);
  }
  return {
    data: rgba,
    height: header.height,
    width: header.width,
  };
}

function encodePng(image) {
  const scanlineLength = image.width * rgbaChannels;
  const raw = Buffer.alloc((scanlineLength + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const rowOffset = y * (scanlineLength + 1);
    raw[rowOffset] = 0;
    image.data.copy(raw, rowOffset + 1, y * scanlineLength, (y + 1) * scanlineLength);
  }
  return Buffer.concat([
    pngSignature,
    pngChunk("IHDR", pngHeader(image)),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngHeader(image) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return header;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function assertSupportedPngHeader(header) {
  if (
    header.bitDepth !== 8 ||
    header.compression !== 0 ||
    header.filter !== 0 ||
    header.interlace !== 0
  ) {
    throw new Error(`unsupported PNG header: ${JSON.stringify(header)}`);
  }
  pngBytesPerPixel(header.colorType);
}

function pngBytesPerPixel(colorType) {
  switch (colorType) {
    case 0:
      return 1;
    case 2:
      return 3;
    case 4:
      return 2;
    case 6:
      return 4;
    default:
      throw new Error(`unsupported PNG color type: ${colorType}`);
  }
}

function unfilterScanline(scanline, previous, bytesPerPixel, filter) {
  const unfilter = pngUnfilters[filter];
  if (!unfilter) {
    throw new Error(`unsupported PNG filter: ${filter}`);
  }
  unfilter(scanline, previous, bytesPerPixel);
}

const pngUnfilters = {
  0: () => {},
  1: (scanline, _previous, bytesPerPixel) => {
    for (let index = 0; index < scanline.length; index += 1) {
      scanline[index] = (scanline[index] + leftByte(scanline, index, bytesPerPixel)) & 0xff;
    }
  },
  2: (scanline, previous) => {
    for (let index = 0; index < scanline.length; index += 1) {
      scanline[index] = (scanline[index] + previous[index]) & 0xff;
    }
  },
  3: (scanline, previous, bytesPerPixel) => {
    for (let index = 0; index < scanline.length; index += 1) {
      scanline[index] =
        (scanline[index] +
          Math.floor((leftByte(scanline, index, bytesPerPixel) + previous[index]) / 2)) &
        0xff;
    }
  },
  4: (scanline, previous, bytesPerPixel) => {
    for (let index = 0; index < scanline.length; index += 1) {
      const left = leftByte(scanline, index, bytesPerPixel);
      const up = previous[index];
      const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
      scanline[index] = (scanline[index] + paeth(left, up, upLeft)) & 0xff;
    }
  },
};

function leftByte(scanline, index, bytesPerPixel) {
  return index >= bytesPerPixel ? scanline[index - bytesPerPixel] : 0;
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  if (upDistance <= upLeftDistance) {
    return up;
  }
  return upLeft;
}

function convertScanlineToRgba({ colorType, rgba, scanline, width, y }) {
  for (let x = 0; x < width; x += 1) {
    const destination = (y * width + x) * rgbaChannels;
    switch (colorType) {
      case 0: {
        const gray = scanline[x];
        rgba[destination] = gray;
        rgba[destination + 1] = gray;
        rgba[destination + 2] = gray;
        rgba[destination + 3] = 255;
        break;
      }
      case 2: {
        const source = x * 3;
        rgba[destination] = scanline[source];
        rgba[destination + 1] = scanline[source + 1];
        rgba[destination + 2] = scanline[source + 2];
        rgba[destination + 3] = 255;
        break;
      }
      case 4: {
        const source = x * 2;
        rgba[destination] = scanline[source];
        rgba[destination + 1] = scanline[source];
        rgba[destination + 2] = scanline[source];
        rgba[destination + 3] = scanline[source + 1];
        break;
      }
      case 6: {
        scanline.copy(rgba, destination, x * rgbaChannels, (x + 1) * rgbaChannels);
        break;
      }
      default:
        throw new Error(`unsupported PNG color type: ${colorType}`);
    }
  }
}

function deriveScalarBand({ max, min, mockupValues, negativeValues }) {
  const mockupMin = Math.min(...mockupValues);
  const mockupMax = Math.max(...mockupValues);
  const inside = negativeValues.some((value) => value >= mockupMin && value <= mockupMax);
  if (inside) {
    return null;
  }
  const below = negativeValues.filter((value) => value < mockupMin);
  const above = negativeValues.filter((value) => value > mockupMax);
  const epsilon = 1e-12;
  const lower = below.length === 0 ? min : Math.min(mockupMin, Math.max(...below) + epsilon);
  const upper = above.length === 0 ? max : Math.max(mockupMax, Math.min(...above) - epsilon);
  return {
    lower,
    mockupMax,
    mockupMin,
    target: medianNumber(mockupValues),
    upper,
  };
}

function deriveDistanceBand({ maxDistance, mockupDistances, negativeDistances }) {
  const mockupMax = Math.max(...mockupDistances);
  const inside = negativeDistances.some((distance) => distance <= mockupMax);
  if (inside) {
    return null;
  }
  return {
    maxDistance:
      negativeDistances.length === 0
        ? maxDistance
        : Math.max(mockupMax, Math.min(...negativeDistances) - 1e-12),
    mockupMaxDistance: mockupMax,
    minDistance: 0,
  };
}

function summarizeMetrics(metrics) {
  return {
    backgroundLuminance: metrics.backgroundLuminance,
    backgroundRgb: metrics.backgroundRgb,
    colorfulness: metrics.colorfulness,
    glowSoftness: metrics.glowSoftness,
    litPixelRatio: metrics.litPixelRatio,
    meanLuminance: metrics.meanLuminance,
    neonHuePresence: metrics.neonHuePresence,
    p95Luminance: metrics.p95Luminance,
  };
}

function glowSoftness({ backgroundLuminance, image, luminanceValues }) {
  let hardEdgePixels = 0;
  let softHaloPixels = 0;
  for (let y = 1; y < image.height - 1; y += 1) {
    for (let x = 1; x < image.width - 1; x += 1) {
      const index = y * image.width + x;
      const luminance = luminanceValues[index];
      if (luminance < backgroundLuminance + 0.035) {
        continue;
      }
      const gradient = Math.max(
        Math.abs(luminance - luminanceValues[index - 1]),
        Math.abs(luminance - luminanceValues[index + 1]),
        Math.abs(luminance - luminanceValues[index - image.width]),
        Math.abs(luminance - luminanceValues[index + image.width]),
      );
      if (gradient >= 0.16) {
        hardEdgePixels += 1;
      } else if (gradient >= 0.015 && gradient <= 0.09) {
        softHaloPixels += 1;
      }
    }
  }
  return softHaloPixels / Math.max(1, hardEdgePixels);
}

function percentileFromHistogram(histogram, total, percentile) {
  const threshold = Math.ceil(total * percentile);
  let count = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    count += histogram[index];
    if (count >= threshold) {
      return index / 255;
    }
  }
  return 1;
}

function isBackgroundSamplePoint(x, y, width, height) {
  const xMargin = Math.max(1, Math.floor(width * 0.08));
  const yMargin = Math.max(1, Math.floor(height * 0.08));
  const inHorizontalCorner = x < xMargin || x >= width - xMargin;
  const inVerticalCorner = y < yMargin || y >= height - yMargin;
  return inHorizontalCorner && inVerticalCorner;
}

function medianRgb(samples) {
  if (samples.length === 0) {
    return [0, 0, 0];
  }
  return [0, 1, 2].map((channel) => medianNumber(samples.map((sample) => sample[channel])));
}

function medianRgbObject(values) {
  return {
    b: medianNumber(values.map((value) => value.b)),
    g: medianNumber(values.map((value) => value.g)),
    r: medianNumber(values.map((value) => value.r)),
  };
}

function medianNumber(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const midpointIndex = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[midpointIndex];
  }
  return (sorted[midpointIndex - 1] + sorted[midpointIndex]) / 2;
}

function rgbDistance(left, right) {
  return Math.sqrt((left.r - right.r) ** 2 + (left.g - right.g) ** 2 + (left.b - right.b) ** 2);
}

function srgbLuminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function rgbToHsv(r, g, b) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === red) {
      hue = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      hue = 60 * ((blue - red) / delta + 2);
    } else {
      hue = 60 * ((red - green) / delta + 4);
    }
  }
  if (hue < 0) {
    hue += 360;
  }
  return {
    hue,
    saturation: max === 0 ? 0 : delta / max,
    value: max,
  };
}

function hueInNeonBand(hue) {
  return hue >= 165 && hue <= 230;
}

function writeAveragedPixel({ destination, image, maxX, maxY, minX, minY, x, y }) {
  const totals = [0, 0, 0, 0];
  let count = 0;
  for (let sampleY = minY; sampleY <= maxY; sampleY += 1) {
    for (let sampleX = minX; sampleX <= maxX; sampleX += 1) {
      const offset = (sampleY * image.width + sampleX) * rgbaChannels;
      totals[0] += image.data[offset];
      totals[1] += image.data[offset + 1];
      totals[2] += image.data[offset + 2];
      totals[3] += image.data[offset + 3];
      count += 1;
    }
  }
  const destinationOffset = (y * destination.width + x) * rgbaChannels;
  destination.data[destinationOffset] = clampByte(totals[0] / count);
  destination.data[destinationOffset + 1] = clampByte(totals[1] / count);
  destination.data[destinationOffset + 2] = clampByte(totals[2] / count);
  destination.data[destinationOffset + 3] = clampByte(totals[3] / count);
}

function blitImage(destination, source, left, top) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = (y * source.width + x) * rgbaChannels;
      const destinationOffset = ((top + y) * destination.width + left + x) * rgbaChannels;
      source.data.copy(
        destination.data,
        destinationOffset,
        sourceOffset,
        sourceOffset + rgbaChannels,
      );
    }
  }
}

function nearestResizeImage(source, width, height) {
  const output = {
    data: Buffer.alloc(width * height * rgbaChannels),
    height,
    width,
  };
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor((y / height) * source.height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor((x / width) * source.width));
      const sourceOffset = (sourceY * source.width + sourceX) * rgbaChannels;
      const destinationOffset = (y * width + x) * rgbaChannels;
      source.data.copy(output.data, destinationOffset, sourceOffset, sourceOffset + rgbaChannels);
    }
  }
  return output;
}

function filledImage(width, height, { b, g, r }) {
  const output = {
    data: Buffer.alloc(width * height * rgbaChannels),
    height,
    width,
  };
  for (let offset = 0; offset < output.data.length; offset += rgbaChannels) {
    output.data[offset] = r;
    output.data[offset + 1] = g;
    output.data[offset + 2] = b;
    output.data[offset + 3] = 255;
  }
  return output;
}

function cloneImage(image) {
  return {
    data: Buffer.from(image.data),
    height: image.height,
    width: image.width,
  };
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

let crcTable = null;

function crc32(buffer) {
  if (crcTable === null) {
    crcTable = buildCrcTable();
  }
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}
