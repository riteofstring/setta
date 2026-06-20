import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  contactSheetImage,
  darkenImage,
  readPng,
  sideBySideImage,
  writePng,
} from "./visual-parity-image.mjs";

const rgbaChannels = 4;
const animatedScenes = new Set(["workflow-running", "semantic-cells", "merged"]);
const frameCount = 9;
const frameIntervalMs = 250;

const animationMetricSpecs = {
  changedPixelRatio: { max: 1, min: 0 },
  flickerToMotionRatio: { max: 100, min: 0 },
  globalLuminanceDelta: { max: 1, min: 0 },
  meanFrameDelta: { max: 1, min: 0 },
  p95FrameDelta: { max: 1, min: 0, mode: "upperGuard" },
};

export function isAnimatedVisualParityScene(scene) {
  return animatedScenes.has(scene);
}

export function visualParityAnimationFrameTimes(scene) {
  const base = scene === "workflow-running" ? 1800 : 2200;
  return Array.from({ length: frameCount }, (_value, index) => base + index * frameIntervalMs);
}

export async function writeAnimationContactSheet({ framePaths, outputPath }) {
  const frames = await readFrameSequence(framePaths);
  await writePng(outputPath, contactSheetImage(frames));
  return outputPath;
}

export async function writeAnimationSideBySideContactSheet({
  appContactSheetPath,
  mockupContactSheetPath,
  outputPath,
}) {
  const mockup = await readPng(mockupContactSheetPath);
  const app = await readPng(appContactSheetPath);
  await writePng(outputPath, sideBySideImage(mockup, app));
  return outputPath;
}

export async function animationMetricsForFramePaths(framePaths) {
  return animationMetricsForImages(await readFrameSequence(framePaths));
}

export async function prepareAnimationControls({ mockupFramePaths, sceneDir }) {
  const mockupFrames = await readFrameSequence(mockupFramePaths);
  const frozenFrames = mockupFrames.map(() => mockupFrames[0]);
  const highFlickerFrames = mockupFrames.map((frame, index) =>
    index % 2 === 0 ? frame : darkenImage(frame, 0.3),
  );
  const frozenContactSheetPath = join(sceneDir, "control-animation-frozen-contact-sheet.png");
  const highFlickerContactSheetPath = join(
    sceneDir,
    "control-animation-high-flicker-contact-sheet.png",
  );
  await writePng(frozenContactSheetPath, contactSheetImage(frozenFrames));
  await writePng(highFlickerContactSheetPath, contactSheetImage(highFlickerFrames));
  return {
    negativeControlContactSheets: {
      frozenFrame: frozenContactSheetPath,
      highFlicker: highFlickerContactSheetPath,
    },
    negativeControlMetrics: {
      frozenFrame: animationMetricsForImages(frozenFrames),
      highFlicker: animationMetricsForImages(highFlickerFrames),
    },
  };
}

export function deriveAnimationParityTarget({ mockupMetrics, negativeControlMetrics }) {
  const controls = Object.entries(negativeControlMetrics);
  const target = {
    dimensions: {
      frameCount: mockupMetrics.frameCount,
      height: mockupMetrics.height,
      width: mockupMetrics.width,
    },
    droppedMetrics: {},
    metrics: {},
    negativeControls: Object.fromEntries(
      controls.map(([name, metrics]) => [name, summarizeAnimationMetrics(metrics)]),
    ),
    source: {
      frameIntervalMs,
      negativeControlCount: controls.length,
    },
  };

  for (const [name, spec] of Object.entries(animationMetricSpecs)) {
    const deriveBand = spec.mode === "upperGuard" ? deriveUpperGuardBand : deriveScalarBand;
    const derived = deriveBand({
      max: spec.max,
      min: spec.min,
      mockupValues: [mockupMetrics[name]],
      negativeValues: controls.map(([, metrics]) => metrics[name]),
    });
    if (derived === null) {
      target.droppedMetrics[name] = "mockup value overlaps an animation negative control";
      continue;
    }
    target.metrics[name] = {
      kind: "scalar",
      ...derived,
    };
  }

  if (Object.keys(target.metrics).length === 0) {
    throw new Error("animation target derivation produced no usable motion metrics");
  }
  return target;
}

export function scoreAnimationParityMetrics({ actualMetrics, target }) {
  const dimensionsPass =
    actualMetrics.width === target.dimensions.width &&
    actualMetrics.height === target.dimensions.height &&
    actualMetrics.frameCount === target.dimensions.frameCount;
  const metricScores = {};
  for (const [name, tolerance] of Object.entries(target.metrics)) {
    if (tolerance.kind !== "scalar") {
      throw new Error(`unsupported animation parity metric kind: ${tolerance.kind}`);
    }
    const actual = actualMetrics[name];
    metricScores[name] = {
      actual,
      lower: tolerance.lower,
      pass: actual >= tolerance.lower && actual <= tolerance.upper,
      target: tolerance.target,
      upper: tolerance.upper,
    };
  }
  const metricPass = Object.values(metricScores).every((score) => score.pass);
  return {
    actual: summarizeAnimationMetrics(actualMetrics),
    dimensions: {
      actual: {
        frameCount: actualMetrics.frameCount,
        height: actualMetrics.height,
        width: actualMetrics.width,
      },
      expected: target.dimensions,
      pass: dimensionsPass,
    },
    metrics: metricScores,
    pass: dimensionsPass && metricPass,
  };
}

export async function writeFrameSequenceManifest({ framePaths, manifestPath, scene }) {
  await mkdir(dirname(manifestPath), { recursive: true });
  const payload = {
    frameIntervalMs,
    framePaths,
    frameTimesMs: visualParityAnimationFrameTimes(scene),
    scene,
  };
  await writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function animationMetricsForImages(images) {
  if (images.length < 2) {
    throw new Error("animation metrics require at least two frames");
  }
  const first = images[0];
  for (const image of images) {
    if (image.width !== first.width || image.height !== first.height) {
      throw new Error(
        `animation frame dimensions differ: expected ${first.width}x${first.height}, received ${image.width}x${image.height}`,
      );
    }
  }
  const pixelCount = first.width * first.height;
  const meanLuminance = images.map((image) => frameMeanLuminance(image));
  const frameDeltas = [];
  const changedPixelRatios = [];
  const globalLuminanceDeltas = [];
  const deltaHistogram = new Uint32Array(256);
  for (let frameIndex = 1; frameIndex < images.length; frameIndex += 1) {
    const previous = images[frameIndex - 1];
    const next = images[frameIndex];
    let deltaTotal = 0;
    let changedPixels = 0;
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      const offset = pixelIndex * rgbaChannels;
      const delta =
        (Math.abs(previous.data[offset] - next.data[offset]) +
          Math.abs(previous.data[offset + 1] - next.data[offset + 1]) +
          Math.abs(previous.data[offset + 2] - next.data[offset + 2])) /
        (255 * 3);
      deltaTotal += delta;
      if (delta >= 0.01) {
        changedPixels += 1;
      }
      deltaHistogram[Math.max(0, Math.min(255, Math.floor(delta * 255)))] += 1;
    }
    frameDeltas.push(deltaTotal / pixelCount);
    changedPixelRatios.push(changedPixels / pixelCount);
    globalLuminanceDeltas.push(Math.abs(meanLuminance[frameIndex] - meanLuminance[frameIndex - 1]));
  }
  const meanFrameDelta = meanNumber(frameDeltas);
  const globalLuminanceDelta = Math.max(...globalLuminanceDeltas);
  return {
    changedPixelRatio: meanNumber(changedPixelRatios),
    flickerToMotionRatio: globalLuminanceDelta / Math.max(meanFrameDelta, 1e-9),
    frameCount: images.length,
    globalLuminanceDelta,
    height: first.height,
    meanFrameDelta,
    p95FrameDelta: percentileFromHistogram(deltaHistogram, pixelCount * (images.length - 1), 0.95),
    width: first.width,
  };
}

async function readFrameSequence(framePaths) {
  return Promise.all(framePaths.map((framePath) => readPng(framePath)));
}

function frameMeanLuminance(image) {
  let total = 0;
  const pixelCount = image.width * image.height;
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * rgbaChannels;
    total += srgbLuminance(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
  }
  return total / pixelCount;
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

function deriveUpperGuardBand({ max, min, mockupValues, negativeValues }) {
  const mockupMin = Math.min(...mockupValues);
  const mockupMax = Math.max(...mockupValues);
  const above = negativeValues.filter((value) => value > mockupMax);
  const epsilon = 1e-12;
  const upper = above.length === 0 ? max : Math.max(mockupMax, Math.min(...above) - epsilon);
  return {
    lower: min,
    mockupMax,
    mockupMin,
    target: medianNumber(mockupValues),
    upper,
  };
}

function summarizeAnimationMetrics(metrics) {
  return {
    changedPixelRatio: metrics.changedPixelRatio,
    flickerToMotionRatio: metrics.flickerToMotionRatio,
    globalLuminanceDelta: metrics.globalLuminanceDelta,
    meanFrameDelta: metrics.meanFrameDelta,
    p95FrameDelta: metrics.p95FrameDelta,
  };
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

function meanNumber(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function medianNumber(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const midpointIndex = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[midpointIndex];
  }
  return (sorted[midpointIndex - 1] + sorted[midpointIndex]) / 2;
}

function srgbLuminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
