// Pixel half of the Easy Button visual comparison. This runs only inside the
// pinned Electron process used for the mockup, so Chromium decodes and encodes
// both images through the same nativeImage implementation that captured them.

import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { nativeImage } from "electron";

const bytesPerPixel = 4;
const comparisonGap = 8;

export async function writeEasyButtonImageDiffReport({ mockup, outDir, pairs, production }) {
  const rows = [];
  for (const pair of pairs) {
    const productionState = requireState(production, pair.production);
    const mockupState = requireState(mockup, pair.mockup);
    const crops = productionState.crops.filter((crop) => mockupState.crops.includes(crop));
    const times = productionState.frames
      .map((frame) => frame.timeMs)
      .filter((timeMs) => mockupState.frames.some((frame) => frame.timeMs === timeMs));
    for (const timeMs of times) {
      for (const crop of crops) {
        rows.push(await compareCapturedCrop({ crop, mockup: pair.mockup, outDir, pair, timeMs }));
      }
    }
  }
  verifyExactComparator();
  const report = {
    comparator: "exact-bgra-v1",
    comparatorSelfTest: "passed",
    rows,
    summary: summarizeRows(rows),
  };
  await writeFile(join(outDir, "image-diff.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, "image-diff.md"), formatImageDiffReport(report));
  return report;
}

async function compareCapturedCrop({ crop, mockup, outDir, pair, timeMs }) {
  const productionPath = join(outDir, `production-${pair.production}-t${timeMs}-${crop}.png`);
  const mockupPath = join(outDir, `mockup-${mockup}-t${timeMs}-${crop}.png`);
  const productionImage = requireImage(productionPath);
  const mockupImage = requireImage(mockupPath);
  const diff = compareImages(productionImage, mockupImage);
  const prefix = `${pair.production}-vs-${mockup}-t${timeMs}-${crop}`;
  const artifacts = { heatmap: "", sideBySide: "" };
  if (diff.changedPixels > 0) {
    artifacts.heatmap = join("image-diffs", `${prefix}-heatmap.png`);
    artifacts.sideBySide = join("image-diffs", `${prefix}-side-by-side.png`);
    await Promise.all([
      writeNativeImage(join(outDir, artifacts.heatmap), diff.heatmap),
      writeNativeImage(
        join(outDir, artifacts.sideBySide),
        sideBySide(productionImage, mockupImage),
      ),
    ]);
  }
  return {
    artifacts,
    changedPixelRatio: round(diff.changedPixels / diff.totalPixels),
    changedPixels: diff.changedPixels,
    crop,
    dimensionMatch: diff.dimensionMatch,
    maxChannelDelta: diff.maxChannelDelta,
    meanChannelDelta: round(diff.totalChannelDelta / (diff.totalPixels * bytesPerPixel)),
    mockup,
    mockupSize: mockupImage.getSize(),
    production: pair.production,
    productionSize: productionImage.getSize(),
    timeMs,
    totalPixels: diff.totalPixels,
  };
}

function compareImages(productionImage, mockupImage) {
  const production = imageData(productionImage);
  const mockup = imageData(mockupImage);
  const width = Math.max(production.width, mockup.width);
  const height = Math.max(production.height, mockup.height);
  const heatmap = Buffer.alloc(width * height * bytesPerPixel);
  let changedPixels = 0;
  let maxChannelDelta = 0;
  let totalChannelDelta = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = pixelOffset(width, x, y);
      const productionPixel = pixelAt(production, x, y);
      const mockupPixel = pixelAt(mockup, x, y);
      let pixelChanged = false;
      let luminance = 0;
      for (let channel = 0; channel < bytesPerPixel; channel += 1) {
        const delta = Math.abs(productionPixel[channel] - mockupPixel[channel]);
        maxChannelDelta = Math.max(maxChannelDelta, delta);
        totalChannelDelta += delta;
        pixelChanged ||= delta !== 0;
        if (channel < 3) {
          luminance += Math.round((productionPixel[channel] + mockupPixel[channel]) / 6);
        }
      }
      if (pixelChanged) {
        changedPixels += 1;
        heatmap[target + 2] = 255;
      } else {
        heatmap[target] = luminance;
        heatmap[target + 1] = luminance;
        heatmap[target + 2] = luminance;
      }
      heatmap[target + 3] = 255;
    }
  }
  return {
    changedPixels,
    dimensionMatch: production.width === mockup.width && production.height === mockup.height,
    heatmap: nativeImage.createFromBitmap(heatmap, { height, width }),
    maxChannelDelta,
    totalChannelDelta,
    totalPixels: width * height,
  };
}

function sideBySide(leftImage, rightImage) {
  const left = imageData(leftImage);
  const right = imageData(rightImage);
  const width = left.width + comparisonGap + right.width;
  const height = Math.max(left.height, right.height);
  const bitmap = Buffer.alloc(width * height * bytesPerPixel);
  fillBitmap(bitmap, 15, 18, 25, 255);
  blit(bitmap, width, left, 0);
  blit(bitmap, width, right, left.width + comparisonGap);
  return nativeImage.createFromBitmap(bitmap, { height, width });
}

function imageData(image) {
  const { height, width } = image.getSize();
  return { bitmap: image.getBitmap(), height, width };
}

function pixelAt(image, x, y) {
  if (x >= image.width || y >= image.height) {
    return [0, 0, 0, 0];
  }
  const offset = pixelOffset(image.width, x, y);
  return image.bitmap.subarray(offset, offset + bytesPerPixel);
}

function pixelOffset(width, x, y) {
  return (y * width + x) * bytesPerPixel;
}

function fillBitmap(bitmap, blue, green, red, alpha) {
  for (let offset = 0; offset < bitmap.length; offset += bytesPerPixel) {
    bitmap[offset] = blue;
    bitmap[offset + 1] = green;
    bitmap[offset + 2] = red;
    bitmap[offset + 3] = alpha;
  }
}

function blit(target, targetWidth, source, targetX) {
  for (let y = 0; y < source.height; y += 1) {
    const sourceStart = pixelOffset(source.width, 0, y);
    const targetStart = pixelOffset(targetWidth, targetX, y);
    source.bitmap.copy(
      target,
      targetStart,
      sourceStart,
      sourceStart + source.width * bytesPerPixel,
    );
  }
}

function requireImage(path) {
  const image = nativeImage.createFromPath(path);
  if (image.isEmpty()) {
    throw new Error(`easy-button pixel diff could not decode ${path}`);
  }
  return image;
}

async function writeNativeImage(path, image) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, image.toPNG());
}

function verifyExactComparator() {
  const original = nativeImage.createFromBitmap(Buffer.from([4, 3, 2, 255]), {
    height: 1,
    width: 1,
  });
  const changed = nativeImage.createFromBitmap(Buffer.from([5, 3, 2, 255]), {
    height: 1,
    width: 1,
  });
  if (compareImages(original, original).changedPixels !== 0) {
    throw new Error("easy-button exact pixel comparator changed an identical image");
  }
  if (compareImages(original, changed).changedPixels !== 1) {
    throw new Error("easy-button exact pixel comparator missed a deliberate one-channel change");
  }
}

function requireState(metrics, state) {
  const captured = metrics.states[state];
  if (!captured) {
    throw new Error(`easy-button ${metrics.surface} image report has no ${state} state`);
  }
  return captured;
}

function summarizeRows(rows) {
  return {
    changedCropCount: rows.filter((row) => row.changedPixels > 0).length,
    comparedCropCount: rows.length,
    dimensionMismatchCount: rows.filter((row) => !row.dimensionMatch).length,
  };
}

function formatImageDiffReport(report) {
  return [
    "# Easy Button pixel image differences",
    "",
    `Comparator self-test: ${report.comparatorSelfTest}.`,
    "",
    "| pair | frame | crop | dimensions | changed pixels | ratio | max channel delta |",
    "| --- | ---: | --- | --- | ---: | ---: | ---: |",
    ...report.rows.map(
      (row) =>
        `| ${row.production} vs ${row.mockup} | ${row.timeMs} ms | ${row.crop} | ${formatDimensions(row)} | ${row.changedPixels} / ${row.totalPixels} | ${row.changedPixelRatio} | ${row.maxChannelDelta} |`,
    ),
    "",
  ].join("\n");
}

function formatDimensions(row) {
  const production = `${row.productionSize.width}×${row.productionSize.height}`;
  const mockup = `${row.mockupSize.width}×${row.mockupSize.height}`;
  return row.dimensionMatch ? production : `${production} vs ${mockup}`;
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
