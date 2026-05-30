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
  representativeSectionCropSsimMin: 0.92,
  representativeRowControlCropSsimMin: 0.92,
  sectionRectDeltaMax: 4,
  headerHeightDeltaMax: 2,
  rowHeightDeltaMax: 2,
  labelValueColumnDeltaMax: 3,
  minimapIoUMin: 0.95,
};

const args = parseArgs(process.argv.slice(2));
const referencePath = requireArg(args, "reference");
const currentPath = requireArg(args, "current");
const outPath = args.out;
const referenceAnchorsPath = args["reference-anchors"] ?? args.referenceAnchors;
const currentAnchorsPath = args["current-anchors"] ?? args.currentAnchors;
const requireAnchors = Boolean(args["require-anchors"] ?? args.requireAnchors);
const anchorOptions = parseAnchorOptions(args);
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
  representativeSectionCropSsimMin: parseNumberArg(
    args["representative-section-crop-ssim-min"] ??
      args.representativeSectionCropSsimMin,
    DEFAULT_THRESHOLDS.representativeSectionCropSsimMin,
  ),
  representativeRowControlCropSsimMin: parseNumberArg(
    args["representative-row-control-crop-ssim-min"] ??
      args.representativeRowControlCropSsimMin,
    DEFAULT_THRESHOLDS.representativeRowControlCropSsimMin,
  ),
  sectionRectDeltaMax: parseNumberArg(
    args["section-rect-delta-max"] ?? args.sectionRectDeltaMax,
    DEFAULT_THRESHOLDS.sectionRectDeltaMax,
  ),
  headerHeightDeltaMax: parseNumberArg(
    args["header-height-delta-max"] ?? args.headerHeightDeltaMax,
    DEFAULT_THRESHOLDS.headerHeightDeltaMax,
  ),
  rowHeightDeltaMax: parseNumberArg(
    args["row-height-delta-max"] ?? args.rowHeightDeltaMax,
    DEFAULT_THRESHOLDS.rowHeightDeltaMax,
  ),
  labelValueColumnDeltaMax: parseNumberArg(
    args["label-value-column-delta-max"] ?? args.labelValueColumnDeltaMax,
    DEFAULT_THRESHOLDS.labelValueColumnDeltaMax,
  ),
  minimapIoUMin: parseNumberArg(
    args["minimap-iou-min"] ?? args.minimapIoUMin,
    DEFAULT_THRESHOLDS.minimapIoUMin,
  ),
};
const representativeCropRequest = parseRepresentativeCropRequest(args);
const representativeCropResult = await prepareRepresentativeCrops({
  request: representativeCropRequest,
  referenceAnchorsPath,
  currentAnchorsPath,
});

const screenshotResult = await compareScreenshots({
  referencePath,
  currentPath,
  workspaceCrop,
  representativeCrops: representativeCropResult.crops,
  thresholds,
});
const anchorResult = await compareAnchorInputs({
  referenceAnchorsPath,
  currentAnchorsPath,
  requireAnchors,
  options: anchorOptions,
  thresholds,
});
const hardFailures = [
  ...screenshotResult.hardFailures,
  ...anchorResult.hardFailures,
  ...representativeCropResult.hardFailures,
];
const result = {
  ...screenshotResult,
  anchors: anchorResult.anchors,
  hardFailures,
  pass: hardFailures.length === 0,
};

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

function parseRepresentativeCropRequest(args) {
  const enabled = Boolean(
    args["representative-crops"] ?? args.representativeCrops,
  );
  return {
    enabled,
    includedKinds: parseStringList(args["crop-kinds"] ?? args.cropKinds),
    requiredKinds: parseStringList(
      args["required-crops"] ?? args.requiredCrops,
    ),
  };
}

function parseAnchorOptions(args) {
  return {
    minimapAnchors: parseEnumArg(
      args["minimap-anchors"] ?? args.minimapAnchors,
      ["required", "optional", "skip"],
      "required",
      "minimap-anchors",
    ),
  };
}

function parseEnumArg(value, allowedValues, fallback, name) {
  if (value === undefined || value === true) {
    return fallback;
  }
  if (allowedValues.includes(value)) {
    return value;
  }
  throw new Error(
    `Invalid --${name} '${String(value)}'. Expected ${allowedValues.join(
      ", ",
    )}.`,
  );
}

function parseStringList(value) {
  if (value === undefined || value === true) {
    return [];
  }
  if (typeof value !== "string") {
    throw new Error(`Expected comma-separated list, got ${String(value)}.`);
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

async function compareScreenshots({
  referencePath,
  currentPath,
  workspaceCrop,
  representativeCrops,
  thresholds,
}) {
  const [referenceBuffer, currentBuffer] = await Promise.all([
    fs.readFile(referencePath),
    fs.readFile(currentPath),
  ]);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const comparison = await page.evaluate(
    async ({
      referenceDataUrl,
      currentDataUrl,
      workspaceCrop,
      representativeCrops,
    }) => {
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
          representativeCrops: representativeCrops.map((crop) => ({
            ...crop,
            metrics: {
              ...calculateRgbMetrics(reference, current, crop.rect),
              local8x8GrayscaleSsim: calculateLocalGrayscaleSsim(
                reference,
                current,
                crop.rect,
              ),
            },
          })),
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
      representativeCrops,
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
      representativeCrops,
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
  for (const crop of comparison.metrics.representativeCrops ?? []) {
    const threshold =
      crop.thresholdKind === "section"
        ? thresholds.representativeSectionCropSsimMin
        : thresholds.representativeRowControlCropSsimMin;
    if (crop.metrics.local8x8GrayscaleSsim < threshold) {
      failures.push({
        code: "representative-crop-ssim",
        message: `Representative ${crop.kind} crop '${crop.id}' local SSIM ${crop.metrics.local8x8GrayscaleSsim.toFixed(
          3,
        )} is below threshold ${threshold}.`,
      });
    }
  }
  return failures;
}

async function prepareRepresentativeCrops({
  request,
  referenceAnchorsPath,
  currentAnchorsPath,
}) {
  if (!request.enabled) {
    return {
      crops: [],
      hardFailures: [],
    };
  }
  if (!referenceAnchorsPath || !currentAnchorsPath) {
    return {
      crops: [],
      hardFailures: [
        {
          code: "missing-representative-crop-anchors",
          message:
            "Representative crop comparison requires reference and current anchor inputs.",
        },
      ],
    };
  }
  const [referenceAnchors, currentAnchors] = await Promise.all([
    readJsonFile(referenceAnchorsPath),
    readJsonFile(currentAnchorsPath),
  ]);
  return deriveRepresentativeCrops({
    referenceAnchors,
    currentAnchors,
    includedKinds: request.includedKinds,
    requiredKinds: request.requiredKinds,
  });
}

function deriveRepresentativeCrops({
  referenceAnchors,
  currentAnchors,
  includedKinds,
  requiredKinds,
}) {
  const referenceSections = indexSectionsById(referenceAnchors);
  const currentSections = indexSectionsById(currentAnchors);
  const referenceRows = indexVisibleRowsByKey(referenceAnchors);
  const currentRows = indexVisibleRowsByKey(currentAnchors);
  const crops = [];
  const availableKinds = new Set();
  const knownKinds = new Set();
  const shouldDeriveKind = (kind) =>
    includedKinds.length === 0 || includedKinds.includes(kind);

  addCropIfAvailable(
    crops,
    availableKinds,
    knownKinds,
    "section",
    () =>
      deriveSectionCrop({
        referenceAnchors,
        referenceSections,
        currentSections,
      }),
    shouldDeriveKind,
  );
  addCropIfAvailable(
    crops,
    availableKinds,
    knownKinds,
    "selected-section",
    () =>
      deriveSelectedSectionCrop({
        referenceAnchors,
        referenceSections,
        currentSections,
      }),
    shouldDeriveKind,
  );
  addCropIfAvailable(
    crops,
    availableKinds,
    knownKinds,
    "text",
    () =>
      deriveRowCrop({
        kind: "text",
        referenceAnchors,
        referenceRows,
        currentRows,
        predicate: (row) =>
          row.paramType === "TextParam" && row.controlKind === "value-cell",
        rectName: "value",
      }),
    shouldDeriveKind,
  );
  addCropIfAvailable(
    crops,
    availableKinds,
    knownKinds,
    "switch",
    () =>
      deriveRowCrop({
        kind: "switch",
        referenceAnchors,
        referenceRows,
        currentRows,
        predicate: (row) => row.controlKind === "toggle",
        rectName: "control",
      }),
    shouldDeriveKind,
  );
  addCropIfAvailable(
    crops,
    availableKinds,
    knownKinds,
    "color-swatch",
    () =>
      deriveRowCrop({
        kind: "color-swatch",
        referenceAnchors,
        referenceRows,
        currentRows,
        predicate: (row) => row.controlKind === "color-swatch",
        rectName: "control",
      }),
    shouldDeriveKind,
  );
  addCropIfAvailable(
    crops,
    availableKinds,
    knownKinds,
    "dropdown",
    () =>
      deriveRowCrop({
        kind: "dropdown",
        referenceAnchors,
        referenceRows,
        currentRows,
        predicate: (row) => row.controlKind === "dropdown",
        rectName: "control",
      }),
    shouldDeriveKind,
  );
  addCropIfAvailable(
    crops,
    availableKinds,
    knownKinds,
    "nested-row",
    () =>
      deriveRowCrop({
        kind: "nested-row",
        referenceAnchors,
        referenceRows,
        currentRows,
        predicate: (row) => Boolean(row.containerRow) || row.depth > 0,
      }),
    shouldDeriveKind,
  );
  addCropIfAvailable(
    crops,
    availableKinds,
    knownKinds,
    "code-preview",
    () =>
      deriveRowCrop({
        kind: "code-preview",
        referenceAnchors,
        referenceRows,
        currentRows,
        predicate: isCodePreviewRow,
      }),
    shouldDeriveKind,
  );
  addCropIfAvailable(
    crops,
    availableKinds,
    knownKinds,
    "section-scrollbar",
    () =>
      deriveSectionScrollbarCrop({
        referenceAnchors,
        referenceSections,
        currentSections,
      }),
    shouldDeriveKind,
  );
  addCropIfAvailable(
    crops,
    availableKinds,
    knownKinds,
    "minimap",
    () => deriveMinimapCrop(referenceAnchors, currentAnchors),
    shouldDeriveKind,
  );

  const missingRequiredKinds = requiredKinds.filter(
    (kind) => !availableKinds.has(kind),
  );
  const unknownIncludedKinds = includedKinds.filter(
    (kind) => !knownKinds.has(kind),
  );
  return {
    crops,
    hardFailures: [
      ...unknownIncludedKinds.map((kind) => ({
        code: "unknown-representative-crop-kind",
        message: `Representative crop kind '${kind}' is not supported by the comparison harness.`,
      })),
      ...missingRequiredKinds.map((kind) => ({
        code: "missing-representative-crop",
        message: `Required representative crop '${kind}' could not be derived from the reference and current anchors.`,
      })),
    ],
  };
}

function addCropIfAvailable(
  crops,
  availableKinds,
  knownKinds,
  kind,
  derive,
  shouldDeriveKind,
) {
  knownKinds.add(kind);
  if (!shouldDeriveKind(kind)) {
    return;
  }
  const crop = derive();
  if (!crop) {
    return;
  }
  availableKinds.add(kind);
  crops.push(crop);
}

function deriveSectionCrop({
  referenceAnchors,
  referenceSections,
  currentSections,
}) {
  const workspaceBounds = getSnapshotWorkspaceBounds(referenceAnchors);
  for (const sectionId of Array.from(referenceSections.keys()).sort()) {
    const referenceSection = referenceSections.get(sectionId);
    if (
      !currentSections.has(sectionId) ||
      !isPositiveRect(referenceSection.bounds) ||
      !rectsIntersect(referenceSection.bounds, workspaceBounds)
    ) {
      continue;
    }
    return createRepresentativeCrop({
      kind: "section",
      id: sectionId,
      thresholdKind: "section",
      rect: referenceSection.bounds,
      padding: 4,
      bounds: workspaceBounds,
    });
  }
  return null;
}

function deriveSelectedSectionCrop({
  referenceAnchors,
  referenceSections,
  currentSections,
}) {
  const workspaceBounds = getSnapshotWorkspaceBounds(referenceAnchors);
  for (const sectionId of Array.from(referenceSections.keys()).sort()) {
    const referenceSection = referenceSections.get(sectionId);
    const currentSection = currentSections.get(sectionId);
    if (
      !currentSection ||
      !isSelectedSection(referenceSection) ||
      !isSelectedSection(currentSection) ||
      !isPositiveRect(referenceSection.bounds) ||
      !rectsIntersect(referenceSection.bounds, workspaceBounds)
    ) {
      continue;
    }
    const outlineBand = {
      x: referenceSection.bounds.x - 4,
      y: referenceSection.bounds.y - 4,
      width: referenceSection.bounds.width + 8,
      height: 8,
    };
    return {
      kind: "selected-section",
      id: sectionId,
      thresholdKind: "section",
      rect: clampRectToBounds(outlineBand, workspaceBounds),
    };
  }
  return null;
}

function isSelectedSection(section) {
  return Boolean(section?.selected || section?.active);
}

function deriveRowCrop({
  kind,
  referenceAnchors,
  referenceRows,
  currentRows,
  predicate,
  rectName = "row",
}) {
  const workspaceBounds = getSnapshotWorkspaceBounds(referenceAnchors);
  for (const rowKey of Array.from(referenceRows.keys()).sort()) {
    const referenceRow = referenceRows.get(rowKey);
    const currentRow = currentRows.get(rowKey);
    const referenceRect = referenceRow[rectName];
    const currentRect = currentRow?.[rectName];
    if (
      !currentRow ||
      !predicate(currentRow) ||
      !isPositiveRect(referenceRect) ||
      !isPositiveRect(currentRect) ||
      !rectContainedByBounds(referenceRect, workspaceBounds)
    ) {
      continue;
    }
    return createRepresentativeCrop({
      kind,
      id: rowKey,
      thresholdKind: "row-control",
      rect: referenceRect,
      padding: 3,
      bounds: workspaceBounds,
    });
  }
  return null;
}

function isCodePreviewRow(row) {
  if (row.passiveKind === "code" || /CodeParam/u.test(row.paramType ?? "")) {
    return true;
  }
  const stableId = String(row.paramId ?? row.id ?? "");
  return /(?:^|__)code(?:$|__)/u.test(stableId);
}

function deriveSectionScrollbarCrop({
  referenceAnchors,
  referenceSections,
  currentSections,
}) {
  const workspaceBounds = getSnapshotWorkspaceBounds(referenceAnchors);
  for (const sectionId of Array.from(referenceSections.keys()).sort()) {
    const referenceSection = referenceSections.get(sectionId);
    const currentSection = currentSections.get(sectionId);
    if (
      !currentSection ||
      !isPositiveRect(referenceSection.scrollbar) ||
      !isPositiveRect(currentSection.scrollbar) ||
      !rectsIntersect(referenceSection.scrollbar, workspaceBounds)
    ) {
      continue;
    }
    return createRepresentativeCrop({
      kind: "section-scrollbar",
      id: sectionId,
      thresholdKind: "row-control",
      rect: referenceSection.scrollbar,
      padding: 4,
      bounds: workspaceBounds,
    });
  }
  return null;
}

function deriveMinimapCrop(referenceAnchors, currentAnchors) {
  const referenceMinimap = referenceAnchors.minimap;
  const currentMinimap = currentAnchors.minimap;
  if (
    !referenceMinimap?.visible ||
    !currentMinimap?.visible ||
    !isPositiveRect(referenceMinimap.bounds) ||
    !isPositiveRect(currentMinimap.bounds)
  ) {
    return null;
  }
  return createRepresentativeCrop({
    kind: "minimap",
    id: "minimap",
    thresholdKind: "section",
    rect: referenceMinimap.bounds,
    padding: 2,
    bounds: getSnapshotWorkspaceBounds(referenceAnchors),
  });
}

function createRepresentativeCrop({
  kind,
  id,
  thresholdKind,
  rect,
  padding,
  bounds,
}) {
  return {
    kind,
    id,
    thresholdKind,
    rect: clampRectToBounds(expandRect(rect, padding), bounds),
  };
}

function expandRect(rect, padding) {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function clampRectToBounds(rect, bounds) {
  const boundsLeft = Math.ceil(bounds.x);
  const boundsTop = Math.ceil(bounds.y);
  const boundsRight = Math.floor(bounds.x + bounds.width);
  const boundsBottom = Math.floor(bounds.y + bounds.height);
  const left = Math.max(boundsLeft, Math.floor(rect.x));
  const top = Math.max(boundsTop, Math.floor(rect.y));
  const right = Math.min(boundsRight, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(boundsBottom, Math.ceil(rect.y + rect.height));
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

async function compareAnchorInputs({
  referenceAnchorsPath,
  currentAnchorsPath,
  requireAnchors,
  options,
  thresholds,
}) {
  const anchorComparisonRequested = Boolean(
    referenceAnchorsPath || currentAnchorsPath || requireAnchors,
  );
  if (!anchorComparisonRequested) {
    return {
      anchors: {
        enabled: false,
      },
      hardFailures: [],
    };
  }

  const missingInputLabels = [];
  if (!referenceAnchorsPath) {
    missingInputLabels.push("reference");
  }
  if (!currentAnchorsPath) {
    missingInputLabels.push("current");
  }
  if (missingInputLabels.length > 0) {
    return {
      anchors: {
        enabled: true,
        reference: referenceAnchorsPath ? { path: referenceAnchorsPath } : null,
        current: currentAnchorsPath ? { path: currentAnchorsPath } : null,
        metrics: null,
      },
      hardFailures: [
        {
          code: "missing-anchor-input",
          message: `Missing ${missingInputLabels.join(
            " and ",
          )} anchor input for workspace anchor comparison.`,
        },
      ],
    };
  }

  const [referenceAnchors, currentAnchors] = await Promise.all([
    readJsonFile(referenceAnchorsPath),
    readJsonFile(currentAnchorsPath),
  ]);
  const comparison = compareAnchorSnapshots({
    referenceAnchors,
    currentAnchors,
    options,
    thresholds,
  });
  return {
    anchors: {
      enabled: true,
      reference: summarizeAnchorSnapshot(
        referenceAnchorsPath,
        referenceAnchors,
      ),
      current: summarizeAnchorSnapshot(currentAnchorsPath, currentAnchors),
      metrics: comparison.metrics,
    },
    hardFailures: comparison.hardFailures,
  };
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function summarizeAnchorSnapshot(filePath, snapshot) {
  return {
    path: filePath,
    kind: snapshot.kind ?? null,
    sectionCount: Array.isArray(snapshot.sections)
      ? snapshot.sections.length
      : 0,
    visibleRowCount: countVisibleRows(snapshot),
    minimapVisible: Boolean(snapshot.minimap?.visible),
  };
}

function compareAnchorSnapshots({
  referenceAnchors,
  currentAnchors,
  options,
  thresholds,
}) {
  const hardFailures = [];
  const sectionMetrics = compareSectionAnchors({
    referenceAnchors,
    currentAnchors,
    hardFailures,
    thresholds,
  });
  const rowMetrics = compareRowAnchors({
    referenceAnchors,
    currentAnchors,
    hardFailures,
    thresholds,
  });
  const minimapMetrics = compareMinimapAnchors({
    referenceAnchors,
    currentAnchors,
    hardFailures,
    mode: options.minimapAnchors,
    thresholds,
  });
  return {
    metrics: {
      sections: sectionMetrics,
      rows: rowMetrics,
      minimap: minimapMetrics,
    },
    hardFailures,
  };
}

function compareSectionAnchors({
  referenceAnchors,
  currentAnchors,
  hardFailures,
  thresholds,
}) {
  const referenceSections = indexSectionsById(referenceAnchors);
  const currentSections = indexSectionsById(currentAnchors);
  const referenceSectionIds = Array.from(referenceSections.keys()).sort();
  const currentSectionIds = Array.from(currentSections.keys()).sort();
  const commonSectionIds = referenceSectionIds.filter((sectionId) =>
    currentSections.has(sectionId),
  );
  const missingCurrentSectionIds = referenceSectionIds.filter(
    (sectionId) => !currentSections.has(sectionId),
  );
  const extraCurrentSectionIds = currentSectionIds.filter(
    (sectionId) => !referenceSections.has(sectionId),
  );
  const metrics = {
    referenceCount: referenceSectionIds.length,
    currentCount: currentSectionIds.length,
    commonCount: commonSectionIds.length,
    missingCurrentSectionIds,
    extraCurrentSectionIds,
    maxRectDelta: createMaxMetric(),
    maxHeaderHeightDelta: createMaxMetric(),
  };

  if (referenceSectionIds.length === 0 || currentSectionIds.length === 0) {
    hardFailures.push({
      code: "missing-section-anchors",
      message: `Section anchors must be extractable from both captures; reference=${referenceSectionIds.length}, current=${currentSectionIds.length}.`,
    });
    return metrics;
  }
  if (
    missingCurrentSectionIds.length > 0 ||
    extraCurrentSectionIds.length > 0
  ) {
    hardFailures.push({
      code: "section-anchor-id-mismatch",
      message: `Section anchor ids differ. Missing current: ${
        formatIdList(missingCurrentSectionIds) || "none"
      }. Extra current: ${formatIdList(extraCurrentSectionIds) || "none"}.`,
    });
  }

  for (const sectionId of commonSectionIds) {
    const referenceSection = referenceSections.get(sectionId);
    const currentSection = currentSections.get(sectionId);
    updateMaxMetric(
      metrics.maxRectDelta,
      calculateMaxRectDelta(referenceSection.bounds, currentSection.bounds),
      {
        sectionId,
        rect: "bounds",
        reference: referenceSection.bounds,
        current: currentSection.bounds,
      },
    );
    updateMaxMetric(
      metrics.maxHeaderHeightDelta,
      shouldCompareSectionHeader({
        referenceAnchors,
        currentAnchors,
        referenceSection,
        currentSection,
      })
        ? Math.abs(
            (referenceSection.header?.height ?? 0) -
              (currentSection.header?.height ?? 0),
          )
        : 0,
      {
        sectionId,
        rect: "header",
        reference: referenceSection.header ?? null,
        current: currentSection.header ?? null,
      },
    );
  }

  if (metrics.maxRectDelta.value > thresholds.sectionRectDeltaMax) {
    hardFailures.push({
      code: "section-anchor-rect-delta",
      message: `Max section rect anchor delta ${metrics.maxRectDelta.value.toFixed(
        3,
      )} exceeds threshold ${thresholds.sectionRectDeltaMax}.`,
    });
  }
  if (metrics.maxHeaderHeightDelta.value > thresholds.headerHeightDeltaMax) {
    hardFailures.push({
      code: "section-anchor-header-height-delta",
      message: `Max section header height delta ${metrics.maxHeaderHeightDelta.value.toFixed(
        3,
      )} exceeds threshold ${thresholds.headerHeightDeltaMax}.`,
    });
  }
  return metrics;
}

function compareRowAnchors({
  referenceAnchors,
  currentAnchors,
  hardFailures,
  thresholds,
}) {
  const referenceRows = indexVisibleRowsByKey(referenceAnchors);
  const currentRows = indexVisibleRowsByKey(currentAnchors);
  const referenceRowKeys = Array.from(referenceRows.keys()).sort();
  const currentRowKeys = Array.from(currentRows.keys()).sort();
  const commonRowKeys = referenceRowKeys.filter((rowKey) =>
    currentRows.has(rowKey),
  );
  const missingCurrentRowKeys = referenceRowKeys.filter(
    (rowKey) => !currentRows.has(rowKey),
  );
  const extraCurrentRowKeys = currentRowKeys.filter(
    (rowKey) => !referenceRows.has(rowKey),
  );
  const metrics = {
    referenceVisibleCount: referenceRowKeys.length,
    currentVisibleCount: currentRowKeys.length,
    commonCount: commonRowKeys.length,
    missingCurrentRowKeys,
    extraCurrentRowKeys,
    maxRowHeightDelta: createMaxMetric(),
    maxLabelColumnDelta: createMaxMetric(),
    maxValueColumnDelta: createMaxMetric(),
  };

  if (referenceRowKeys.length === 0 || currentRowKeys.length === 0) {
    hardFailures.push({
      code: "missing-row-anchors",
      message: `Visible row anchors must be extractable from both captures; reference=${referenceRowKeys.length}, current=${currentRowKeys.length}.`,
    });
    return metrics;
  }
  if (missingCurrentRowKeys.length > 0 || extraCurrentRowKeys.length > 0) {
    hardFailures.push({
      code: "row-anchor-id-mismatch",
      message: `Visible row anchor ids differ. Missing current: ${
        formatIdList(missingCurrentRowKeys) || "none"
      }. Extra current: ${formatIdList(extraCurrentRowKeys) || "none"}.`,
    });
  }

  for (const rowKey of commonRowKeys) {
    const referenceRow = referenceRows.get(rowKey);
    const currentRow = currentRows.get(rowKey);
    if (referenceRow.containerRow || currentRow.containerRow) {
      continue;
    }
    updateMaxMetric(
      metrics.maxRowHeightDelta,
      Math.abs((referenceRow.row?.height ?? 0) - (currentRow.row?.height ?? 0)),
      {
        rowKey,
        rect: "row",
        reference: referenceRow.row ?? null,
        current: currentRow.row ?? null,
      },
    );
    updateMaxMetric(
      metrics.maxLabelColumnDelta,
      calculateColumnDelta(referenceRow.label, currentRow.label),
      {
        rowKey,
        rect: "label",
        reference: referenceRow.label ?? null,
        current: currentRow.label ?? null,
      },
    );
    updateMaxMetric(
      metrics.maxValueColumnDelta,
      referenceRow.valuePresent === false || currentRow.valuePresent === false
        ? 0
        : calculateValueColumnDelta(referenceRow.value, currentRow.value),
      {
        rowKey,
        rect: "value",
        reference: referenceRow.value ?? null,
        current: currentRow.value ?? null,
      },
    );
  }

  if (metrics.maxRowHeightDelta.value > thresholds.rowHeightDeltaMax) {
    hardFailures.push({
      code: "row-anchor-height-delta",
      message: `Max row height delta ${metrics.maxRowHeightDelta.value.toFixed(
        3,
      )} exceeds threshold ${thresholds.rowHeightDeltaMax}.`,
    });
  }
  const maxColumnDelta = Math.max(
    metrics.maxLabelColumnDelta.value,
    metrics.maxValueColumnDelta.value,
  );
  if (maxColumnDelta > thresholds.labelValueColumnDeltaMax) {
    hardFailures.push({
      code: "row-anchor-column-delta",
      message: `Max row label/value column delta ${maxColumnDelta.toFixed(
        3,
      )} exceeds threshold ${thresholds.labelValueColumnDeltaMax}.`,
    });
  }
  return metrics;
}

function compareMinimapAnchors({
  referenceAnchors,
  currentAnchors,
  hardFailures,
  mode,
  thresholds,
}) {
  const referenceMinimap = referenceAnchors.minimap ?? null;
  const currentMinimap = currentAnchors.minimap ?? null;
  const referenceVisible = Boolean(referenceMinimap?.visible);
  const currentVisible = Boolean(currentMinimap?.visible);
  const metrics = {
    referenceVisible,
    currentVisible,
    referencePreviewCount: referenceMinimap?.sectionPreviewCount ?? 0,
    currentPreviewCount: currentMinimap?.sectionPreviewCount ?? 0,
    boundsIoU: null,
    viewportMaskIoU: null,
    skipped: mode === "skip",
  };

  if (mode === "skip") {
    return metrics;
  }

  if (!referenceVisible || !currentVisible) {
    if (
      mode === "optional" &&
      referenceVisible === false &&
      currentVisible === false
    ) {
      return metrics;
    }
    hardFailures.push({
      code: "missing-minimap-anchors",
      message: `Minimap anchors must be visible and extractable from both captures; reference=${referenceVisible}, current=${currentVisible}.`,
    });
    return metrics;
  }
  if (
    !isPositiveRect(referenceMinimap.bounds) ||
    !isPositiveRect(currentMinimap.bounds) ||
    !isPositiveRect(referenceMinimap.viewportMask) ||
    !isPositiveRect(currentMinimap.viewportMask)
  ) {
    hardFailures.push({
      code: "invalid-minimap-anchors",
      message:
        "Minimap bounds and viewport-mask anchors must be positive rects.",
    });
    return metrics;
  }
  if (metrics.referencePreviewCount !== metrics.currentPreviewCount) {
    hardFailures.push({
      code: "minimap-anchor-preview-count",
      message: `Minimap section preview count ${metrics.currentPreviewCount} does not match reference ${metrics.referencePreviewCount}.`,
    });
  }

  metrics.boundsIoU = calculateRectIoU(
    referenceMinimap.bounds,
    currentMinimap.bounds,
  );
  metrics.viewportMaskIoU = calculateRectIoU(
    referenceMinimap.viewportMask,
    currentMinimap.viewportMask,
  );
  if (metrics.boundsIoU < thresholds.minimapIoUMin) {
    hardFailures.push({
      code: "minimap-anchor-bounds-iou",
      message: `Minimap bounds IoU ${metrics.boundsIoU.toFixed(
        3,
      )} is below threshold ${thresholds.minimapIoUMin}.`,
    });
  }
  if (metrics.viewportMaskIoU < thresholds.minimapIoUMin) {
    hardFailures.push({
      code: "minimap-anchor-mask-iou",
      message: `Minimap viewport-mask IoU ${metrics.viewportMaskIoU.toFixed(
        3,
      )} is below threshold ${thresholds.minimapIoUMin}.`,
    });
  }
  return metrics;
}

function indexSectionsById(snapshot) {
  const sections = Array.isArray(snapshot.sections) ? snapshot.sections : [];
  return new Map(
    sections
      .filter((section) => typeof section?.id === "string")
      .map((section) => [section.id, section]),
  );
}

function indexVisibleRowsByKey(snapshot) {
  const workspaceBounds = getSnapshotWorkspaceBounds(snapshot);
  const rows = new Map();
  for (const section of Array.isArray(snapshot.sections)
    ? snapshot.sections
    : []) {
    for (const row of Array.isArray(section.rows) ? section.rows : []) {
      if (
        row?.visible === false ||
        !isPositiveRect(row.row) ||
        !rectsIntersect(row.row, workspaceBounds)
      ) {
        continue;
      }
      const rowKey = getRowKey(row, section.id);
      if (rowKey) {
        rows.set(rowKey, row);
      }
    }
  }
  return rows;
}

function shouldCompareSectionHeader({
  referenceAnchors,
  currentAnchors,
  referenceSection,
  currentSection,
}) {
  return (
    sectionHasVisibleRows(referenceAnchors, referenceSection) &&
    sectionHasVisibleRows(currentAnchors, currentSection)
  );
}

function sectionHasVisibleRows(snapshot, section) {
  const workspaceBounds = getSnapshotWorkspaceBounds(snapshot);
  return (Array.isArray(section.rows) ? section.rows : []).some(
    (row) =>
      row?.visible !== false &&
      isPositiveRect(row.row) &&
      rectsIntersect(row.row, workspaceBounds),
  );
}

function getSnapshotWorkspaceBounds(snapshot) {
  if (isPositiveRect(snapshot.canvasBounds)) {
    return snapshot.canvasBounds;
  }
  const width = snapshot.viewportSize?.width;
  const height = snapshot.viewportSize?.height;
  if (typeof width === "number" && typeof height === "number") {
    return { x: 0, y: 0, width, height };
  }
  return {
    x: 0,
    y: 0,
    width: Number.MAX_SAFE_INTEGER,
    height: Number.MAX_SAFE_INTEGER,
  };
}

function countVisibleRows(snapshot) {
  return indexVisibleRowsByKey(snapshot).size;
}

function getRowKey(row, fallbackSectionId) {
  if (typeof row.sectionId === "string" && typeof row.paramId === "string") {
    return `${row.sectionId}:${row.paramId}`;
  }
  if (
    typeof fallbackSectionId === "string" &&
    typeof row.paramId === "string"
  ) {
    return `${fallbackSectionId}:${row.paramId}`;
  }
  return typeof row.id === "string" ? row.id : null;
}

function createMaxMetric() {
  return {
    value: 0,
    detail: null,
  };
}

function updateMaxMetric(metric, value, detail) {
  if (!Number.isFinite(value)) {
    return;
  }
  if (value > metric.value) {
    metric.value = value;
    metric.detail = detail;
  }
}

function calculateMaxRectDelta(referenceRect, currentRect) {
  if (!isRect(referenceRect) || !isRect(currentRect)) {
    return 1_000_000_000;
  }
  return Math.max(
    Math.abs(referenceRect.x - currentRect.x),
    Math.abs(referenceRect.y - currentRect.y),
    Math.abs(referenceRect.width - currentRect.width),
    Math.abs(referenceRect.height - currentRect.height),
  );
}

function calculateColumnDelta(referenceRect, currentRect) {
  if (!isRect(referenceRect) || !isRect(currentRect)) {
    return 1_000_000_000;
  }
  return Math.max(
    Math.abs(referenceRect.x - currentRect.x),
    Math.abs(referenceRect.width - currentRect.width),
  );
}

function calculateValueColumnDelta(referenceRect, currentRect) {
  if (!isRect(referenceRect) || !isRect(currentRect)) {
    return 1_000_000_000;
  }
  return Math.abs(referenceRect.x - currentRect.x);
}

function calculateRectIoU(referenceRect, currentRect) {
  const intersectionLeft = Math.max(referenceRect.x, currentRect.x);
  const intersectionTop = Math.max(referenceRect.y, currentRect.y);
  const intersectionRight = Math.min(
    referenceRect.x + referenceRect.width,
    currentRect.x + currentRect.width,
  );
  const intersectionBottom = Math.min(
    referenceRect.y + referenceRect.height,
    currentRect.y + currentRect.height,
  );
  const intersectionWidth = Math.max(0, intersectionRight - intersectionLeft);
  const intersectionHeight = Math.max(0, intersectionBottom - intersectionTop);
  const intersectionArea = intersectionWidth * intersectionHeight;
  const referenceArea = referenceRect.width * referenceRect.height;
  const currentArea = currentRect.width * currentRect.height;
  const unionArea = referenceArea + currentArea - intersectionArea;
  return unionArea > 0 ? intersectionArea / unionArea : 0;
}

function isPositiveRect(rect) {
  return isRect(rect) && rect.width > 0 && rect.height > 0;
}

function rectsIntersect(first, second) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function rectContainedByBounds(rect, bounds) {
  return (
    rect.x >= bounds.x &&
    rect.y >= bounds.y &&
    rect.x + rect.width <= bounds.x + bounds.width &&
    rect.y + rect.height <= bounds.y + bounds.height
  );
}

function isRect(rect) {
  return (
    typeof rect?.x === "number" &&
    typeof rect.y === "number" &&
    typeof rect.width === "number" &&
    typeof rect.height === "number" &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height)
  );
}

function formatIdList(ids) {
  const sorted = [...ids].sort();
  const visibleIds = sorted.slice(0, 20);
  const suffix =
    sorted.length > visibleIds.length
      ? `, ... (${sorted.length - visibleIds.length} more)`
      : "";
  return `${visibleIds.join(", ")}${suffix}`;
}
