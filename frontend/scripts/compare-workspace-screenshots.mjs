import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_WORKSPACE_CROP = {
  x: 39,
  y: 36,
  width: 1361,
  height: 1128,
};
const DEFAULT_THRESHOLDS = {
  workspaceMeanAbsRgbDeltaMax: 8,
  fullWorkspaceSsimMin: 0.9,
};

const args = parseArgs(process.argv.slice(2));
const referencePath = requireArg(args, "reference");
const currentPath = requireArg(args, "current");
const outPath = args.out;
const workspaceCrop = parseCrop(
  args["workspace-crop"] ?? args.workspaceCrop,
  DEFAULT_WORKSPACE_CROP,
);
const thresholds = {
  workspaceMeanAbsRgbDeltaMax: parseNumberArg(
    args["workspace-mean-max"] ?? args.workspaceMeanMax,
    DEFAULT_THRESHOLDS.workspaceMeanAbsRgbDeltaMax,
  ),
  fullWorkspaceSsimMin: parseNumberArg(
    args["full-ssim-min"] ?? args.fullSsimMin,
    DEFAULT_THRESHOLDS.fullWorkspaceSsimMin,
  ),
};

const result = await compareScreenshots({
  referencePath,
  currentPath,
  workspaceCrop,
  thresholds,
});

const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (outPath) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, serialized, "utf8");
} else {
  process.stdout.write(serialized);
}

if (!result.pass && !args["allow-fail"]) {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${raw}`);
    }
    const withoutPrefix = raw.slice(2);
    const equalsIndex = withoutPrefix.indexOf("=");
    if (equalsIndex >= 0) {
      const key = withoutPrefix.slice(0, equalsIndex);
      parsed[key] = withoutPrefix.slice(equalsIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[withoutPrefix] = true;
      continue;
    }
    parsed[withoutPrefix] = next;
    index += 1;
  }
  return parsed;
}

function requireArg(args, key) {
  const value = args[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required --${key} argument.`);
  }
  return value;
}

function parseNumberArg(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected numeric threshold, got ${String(value)}.`);
  }
  return parsed;
}

function parseCrop(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string") {
    throw new Error("Crop must be a comma-separated string.");
  }
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`Invalid crop '${value}'. Expected x,y,width,height.`);
  }
  const [x, y, width, height] = parts;
  return { x, y, width, height };
}

async function compareScreenshots({
  referencePath,
  currentPath,
  workspaceCrop,
  thresholds,
}) {
  const [referenceBuffer, currentBuffer] = await Promise.all([
    fs.readFile(referencePath),
    fs.readFile(currentPath),
  ]);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const comparison = await page.evaluate(
    async ({ referenceDataUrl, currentDataUrl, workspaceCrop }) => {
      const [reference, current] = await Promise.all([
        loadImageData(referenceDataUrl),
        loadImageData(currentDataUrl),
      ]);
      const dimensions = {
        reference: { width: reference.width, height: reference.height },
        current: { width: current.width, height: current.height },
      };
      if (
        reference.width !== current.width ||
        reference.height !== current.height
      ) {
        return { dimensions, metrics: null };
      }
      return {
        dimensions,
        metrics: {
          workspaceCrop: {
            ...calculateRgbMetrics(reference, current, workspaceCrop),
            local8x8GrayscaleSsim: calculateLocalGrayscaleSsim(
              reference,
              current,
              workspaceCrop,
            ),
          },
          fullViewport: {
            ...calculateRgbMetrics(reference, current, {
              x: 0,
              y: 0,
              width: reference.width,
              height: reference.height,
            }),
            local8x8GrayscaleSsim: calculateLocalGrayscaleSsim(
              reference,
              current,
              {
                x: 0,
                y: 0,
                width: reference.width,
                height: reference.height,
              },
            ),
          },
        },
      };

      async function loadImageData(dataUrl) {
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("2D canvas context is unavailable.");
        }
        context.drawImage(image, 0, 0);
        const rgba = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        const gray = new Float64Array(canvas.width * canvas.height);
        for (let index = 0, pixel = 0; index < rgba.length; index += 4) {
          gray[pixel] =
            0.2126 * rgba[index] +
            0.7152 * rgba[index + 1] +
            0.0722 * rgba[index + 2];
          pixel += 1;
        }
        return {
          width: canvas.width,
          height: canvas.height,
          rgba,
          gray,
        };
      }

      function calculateRgbMetrics(reference, current, crop) {
        validateCrop(crop, reference.width, reference.height);
        let absoluteDelta = 0;
        let squaredDelta = 0;
        let pixelCount = 0;
        for (let y = crop.y; y < crop.y + crop.height; y += 1) {
          for (let x = crop.x; x < crop.x + crop.width; x += 1) {
            const offset = (y * reference.width + x) * 4;
            for (let channel = 0; channel < 3; channel += 1) {
              const delta =
                reference.rgba[offset + channel] -
                current.rgba[offset + channel];
              absoluteDelta += Math.abs(delta);
              squaredDelta += delta * delta;
            }
            pixelCount += 1;
          }
        }
        return {
          meanAbsRgbDelta: absoluteDelta / (pixelCount * 3),
          rmsRgbDelta: Math.sqrt(squaredDelta / (pixelCount * 3)),
        };
      }

      function calculateLocalGrayscaleSsim(reference, current, crop) {
        validateCrop(crop, reference.width, reference.height);
        const windowSize = 8;
        const stride = 8;
        const c1 = 6.5025;
        const c2 = 58.5225;
        let total = 0;
        let count = 0;
        for (
          let y = crop.y;
          y <= crop.y + crop.height - windowSize;
          y += stride
        ) {
          for (
            let x = crop.x;
            x <= crop.x + crop.width - windowSize;
            x += stride
          ) {
            const window = calculateSsimWindow(
              reference,
              current,
              x,
              y,
              windowSize,
            );
            total +=
              ((2 * window.meanReference * window.meanCurrent + c1) *
                (2 * window.covariance + c2)) /
              ((window.meanReference * window.meanReference +
                window.meanCurrent * window.meanCurrent +
                c1) *
                (window.varianceReference + window.varianceCurrent + c2));
            count += 1;
          }
        }
        return total / count;
      }

      function calculateSsimWindow(reference, current, x, y, windowSize) {
        let referenceSum = 0;
        let currentSum = 0;
        let referenceSquaredSum = 0;
        let currentSquaredSum = 0;
        let crossSum = 0;
        let count = 0;
        for (let yy = 0; yy < windowSize; yy += 1) {
          const rowOffset = (y + yy) * reference.width + x;
          for (let xx = 0; xx < windowSize; xx += 1) {
            const offset = rowOffset + xx;
            const referenceGray = reference.gray[offset];
            const currentGray = current.gray[offset];
            referenceSum += referenceGray;
            currentSum += currentGray;
            referenceSquaredSum += referenceGray * referenceGray;
            currentSquaredSum += currentGray * currentGray;
            crossSum += referenceGray * currentGray;
            count += 1;
          }
        }
        const meanReference = referenceSum / count;
        const meanCurrent = currentSum / count;
        return {
          meanReference,
          meanCurrent,
          varianceReference:
            referenceSquaredSum / count - meanReference * meanReference,
          varianceCurrent:
            currentSquaredSum / count - meanCurrent * meanCurrent,
          covariance: crossSum / count - meanReference * meanCurrent,
        };
      }

      function validateCrop(crop, width, height) {
        if (
          crop.x < 0 ||
          crop.y < 0 ||
          crop.width <= 0 ||
          crop.height <= 0 ||
          crop.x + crop.width > width ||
          crop.y + crop.height > height
        ) {
          throw new Error(
            `Crop ${JSON.stringify(crop)} is outside ${width}x${height}.`,
          );
        }
      }
    },
    {
      referenceDataUrl: `data:image/png;base64,${referenceBuffer.toString(
        "base64",
      )}`,
      currentDataUrl: `data:image/png;base64,${currentBuffer.toString(
        "base64",
      )}`,
      workspaceCrop,
    },
  );
  await browser.close();
  const hardFailures = collectHardFailures(comparison, thresholds);
  return {
    reference: {
      screenshot: referencePath,
    },
    current: {
      screenshot: currentPath,
    },
    capture: {
      workspaceCrop,
    },
    thresholds,
    dimensions: comparison.dimensions,
    metrics: comparison.metrics,
    hardFailures,
    pass: hardFailures.length === 0,
  };
}

function collectHardFailures(comparison, thresholds) {
  const failures = [];
  const dimensions = comparison.dimensions;
  if (
    dimensions.reference.width !== dimensions.current.width ||
    dimensions.reference.height !== dimensions.current.height
  ) {
    failures.push({
      code: "dimension-mismatch",
      message: `Reference ${dimensions.reference.width}x${dimensions.reference.height} does not match current ${dimensions.current.width}x${dimensions.current.height}.`,
    });
    return failures;
  }
  if (!comparison.metrics) {
    failures.push({
      code: "missing-metrics",
      message: "Screenshot metrics were not produced.",
    });
    return failures;
  }
  if (
    comparison.metrics.workspaceCrop.meanAbsRgbDelta >
    thresholds.workspaceMeanAbsRgbDeltaMax
  ) {
    failures.push({
      code: "workspace-mean-rgb-delta",
      message: `Workspace mean RGB delta ${comparison.metrics.workspaceCrop.meanAbsRgbDelta.toFixed(
        3,
      )} exceeds threshold ${thresholds.workspaceMeanAbsRgbDeltaMax}.`,
    });
  }
  if (
    comparison.metrics.fullViewport.local8x8GrayscaleSsim <
    thresholds.fullWorkspaceSsimMin
  ) {
    failures.push({
      code: "full-workspace-ssim",
      message: `Full viewport local SSIM ${comparison.metrics.fullViewport.local8x8GrayscaleSsim.toFixed(
        3,
      )} is below threshold ${thresholds.fullWorkspaceSsimMin}.`,
    });
  }
  return failures;
}
