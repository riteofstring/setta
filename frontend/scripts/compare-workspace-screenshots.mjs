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

const screenshotResult = await compareScreenshots({
  referencePath,
  currentPath,
  workspaceCrop,
  thresholds,
});
const anchorResult = await compareAnchorInputs({
  referenceAnchorsPath,
  currentAnchorsPath,
  requireAnchors,
  thresholds,
});
const hardFailures = [
  ...screenshotResult.hardFailures,
  ...anchorResult.hardFailures,
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

async function compareAnchorInputs({
  referenceAnchorsPath,
  currentAnchorsPath,
  requireAnchors,
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
      Math.abs(
        (referenceSection.header?.height ?? 0) -
          (currentSection.header?.height ?? 0),
      ),
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
      calculateColumnDelta(referenceRow.value, currentRow.value),
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
  };

  if (!referenceVisible || !currentVisible) {
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
  const rows = new Map();
  for (const section of Array.isArray(snapshot.sections)
    ? snapshot.sections
    : []) {
    for (const row of Array.isArray(section.rows) ? section.rows : []) {
      if (row?.visible === false || !isPositiveRect(row.row)) {
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
