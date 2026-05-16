import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  centerRetainedCompositorSurface,
  measureRetainedCompositorControlCadence,
  measureRetainedCompositorGesture,
  openAllSettingsForRetainedCompositor,
  readRetainedCompositorScrollSignature,
  recordRetainedCompositorPerfSample,
  resolveRetainedCompositorCadenceBudget,
  resolveRetainedCompositorTarget,
  runNativeRetainedCompositorWheelBurst,
  type RetainedCompositorIntervalStats,
  type RetainedCompositorTarget,
} from "./settings-retained-compositor-helpers";

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("retained section scroll moves continuously while texture work is pending", async ({
  page,
}, testInfo) => {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page);
  const target = await resolveRetainedCompositorTarget(page);
  const controlCadence = await measureRetainedCompositorControlCadence(page);
  const beforeSignature = await readRetainedCompositorScrollSignature(
    page,
    target.surfaceId,
  );
  const baseline = await captureRetainedCompositorMotionSample({
    page,
    phase: "moderate-baseline",
    target,
    testInfo,
  });
  let motionSamples: readonly RetainedCompositorMotionSample[] = [];

  const gesture = await measureRetainedCompositorGesture(page, async () => {
    const [eventSpacing, samples] = await Promise.all([
      runNativeRetainedCompositorWheelBurst(page, {
        deltaY: 72,
        eventCount: 28,
        point: target.point,
      }),
      captureRetainedCompositorMotionSequence({
        intervalMs: 34,
        page,
        phase: "moderate",
        sampleCount: 10,
        target,
        testInfo,
      }),
    ]);
    motionSamples = samples;
    return eventSpacing;
  });
  const afterSignature = await readRetainedCompositorScrollSignature(
    page,
    target.surfaceId,
  );
  const analysis = analyzeRetainedCompositorMotion({
    baseline,
    samples: motionSamples,
  });
  const budget = resolveRetainedCompositorCadenceBudget({
    controlCadence,
    eventSpacing: gesture.eventSpacing,
  });
  const details = createScrollContinuityDetails({
    analysis,
    budget,
    controlCadence,
    gesture,
    scrollSignatures: {
      after: afterSignature,
      before: beforeSignature,
    },
    target,
  });
  recordRetainedCompositorPerfSample({
    name: "retained section scroll visual continuity",
    sample: JSON.parse(details),
  });

  expect(afterSignature, details).not.toEqual(beforeSignature);
  expect(target.visibleRowCount, details).toBeGreaterThan(3);
  expect(analysis.finalDisplacementPx, details).toBeGreaterThan(12);
  expect(
    analysis.intermediateDisplacementCount,
    details,
  ).toBeGreaterThanOrEqual(3);
  expect(analysis.maxStationaryDurationMs, details).toBeLessThanOrEqual(
    Math.max(70, budget.p95FrameBudgetMs * 3),
  );
  expect(analysis.largestStepRatio, details).toBeLessThan(0.82);
  expect(gesture.frame.p95Ms, details).toBeLessThanOrEqual(
    budget.p95FrameBudgetMs,
  );
  expect(gesture.longTasks.maxDurationMs, details).toBeLessThanOrEqual(
    budget.longTaskBudgetMs,
  );
});

test("fast retained section scroll does not jump directly to the final state", async ({
  page,
}, testInfo) => {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page);
  const target = await resolveRetainedCompositorTarget(page);
  const controlCadence = await measureRetainedCompositorControlCadence(page);
  const baseline = await captureRetainedCompositorMotionSample({
    page,
    phase: "fast-baseline",
    target,
    testInfo,
  });
  let motionSamples: readonly RetainedCompositorMotionSample[] = [];

  const gesture = await measureRetainedCompositorGesture(page, async () => {
    const [eventSpacing, samples] = await Promise.all([
      runFastDownUpRetainedScroll(page, target),
      captureRetainedCompositorMotionSequence({
        intervalMs: 32,
        page,
        phase: "fast",
        sampleCount: 14,
        target,
        testInfo,
      }),
    ]);
    motionSamples = samples;
    return eventSpacing;
  });
  const analysis = analyzeRetainedCompositorMotion({
    baseline,
    samples: motionSamples,
  });
  const budget = resolveRetainedCompositorCadenceBudget({
    controlCadence,
    eventSpacing: gesture.eventSpacing,
  });
  const details = createScrollContinuityDetails({
    analysis,
    budget,
    controlCadence,
    gesture,
    scrollSignatures: null,
    target,
  });
  recordRetainedCompositorPerfSample({
    name: "fast retained section scroll visual continuity",
    sample: JSON.parse(details),
  });

  expect(analysis.maxAbsoluteDisplacementPx, details).toBeGreaterThan(20);
  expect(analysis.directionChangeCount, details).toBeGreaterThanOrEqual(1);
  expect(
    analysis.intermediateDisplacementCount,
    details,
  ).toBeGreaterThanOrEqual(4);
  expect(analysis.maxStationaryDurationMs, details).toBeLessThanOrEqual(
    Math.max(80, budget.p95FrameBudgetMs * 3),
  );
  expect(analysis.largestStepRatio, details).toBeLessThan(0.86);
  expect(gesture.frame.p95Ms, details).toBeLessThanOrEqual(
    budget.p95FrameBudgetMs,
  );
  expect(gesture.longTasks.maxDurationMs, details).toBeLessThanOrEqual(
    budget.longTaskBudgetMs,
  );
});

type RetainedCompositorMotionSample = {
  readonly elapsedMs: number;
  readonly nonblankRatio: number;
  readonly profile: readonly number[];
  readonly rowDisplacementAnchor: number;
  readonly rows: readonly RetainedCompositorMotionRowSample[];
};

type RetainedCompositorMotionRowSample = {
  readonly rowId: string;
  readonly y: number;
};

type RetainedCompositorMotionAnalysis = {
  readonly directionChangeCount: number;
  readonly displacementsPx: readonly number[];
  readonly finalDisplacementPx: number;
  readonly intermediateDisplacementCount: number;
  readonly largestStepPx: number;
  readonly largestStepRatio: number;
  readonly maxAbsoluteDisplacementPx: number;
  readonly maxStationaryDurationMs: number;
  readonly profileDisplacementsPx: readonly number[];
  readonly rowDisplacementsPx: readonly number[];
  readonly sampleCount: number;
};

async function runFastDownUpRetainedScroll(
  page: Page,
  target: RetainedCompositorTarget,
): Promise<readonly number[]> {
  const down = await runNativeRetainedCompositorWheelBurst(page, {
    deltaY: 128,
    eventCount: 22,
    point: target.point,
  });
  const up = await runNativeRetainedCompositorWheelBurst(page, {
    deltaY: -104,
    eventCount: 14,
    point: target.point,
  });
  return [...down, ...up];
}

async function captureRetainedCompositorMotionSequence({
  intervalMs,
  page,
  phase,
  sampleCount,
  target,
  testInfo,
}: {
  readonly intervalMs: number;
  readonly page: Page;
  readonly phase: string;
  readonly sampleCount: number;
  readonly target: RetainedCompositorTarget;
  readonly testInfo: TestInfo;
}): Promise<readonly RetainedCompositorMotionSample[]> {
  const startedAt = Date.now();
  const samples: RetainedCompositorMotionSample[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    samples.push(
      await captureRetainedCompositorMotionSample({
        page,
        phase: `${phase}-${index}`,
        target,
        testInfo,
        elapsedMs: Date.now() - startedAt,
      }),
    );
    await page.waitForTimeout(intervalMs);
  }
  return samples;
}

async function captureRetainedCompositorMotionSample({
  elapsedMs = 0,
  page,
  phase,
  target,
  testInfo,
}: {
  readonly elapsedMs?: number | undefined;
  readonly page: Page;
  readonly phase: string;
  readonly target: RetainedCompositorTarget;
  readonly testInfo: TestInfo;
}): Promise<RetainedCompositorMotionSample> {
  const screenshot = await page.screenshot({
    clip: target.clip,
    path: testInfo.outputPath(`retained-compositor-motion-${phase}.png`),
  });
  if (
    phase.endsWith("-0") ||
    phase.endsWith("-4") ||
    phase.endsWith("-8") ||
    phase.endsWith("-13") ||
    phase.endsWith("baseline")
  ) {
    await testInfo.attach(`retained-compositor-motion-${phase}.png`, {
      body: screenshot,
      contentType: "image/png",
    });
  }
  return await page.evaluate(
    async ({ elapsedMs, screenshotDataUrl, surfaceId }) => {
      const image = await loadImage(screenshotDataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Missing retained compositor motion analysis context.");
      }
      ctx.drawImage(image, 0, 0);
      const { data, height, width } = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const scanLeft = Math.floor(width * 0.08);
      const scanRight = Math.floor(width * 0.86);
      const profile: number[] = [];
      let nonblankPixels = 0;
      let scannedPixels = 0;
      for (let y = 0; y < height; y += 1) {
        let rowInk = 0;
        for (let x = scanLeft; x < scanRight; x += 2) {
          const offset = (y * width + x) * 4;
          const r = data[offset] ?? 0;
          const g = data[offset + 1] ?? 0;
          const b = data[offset + 2] ?? 0;
          const a = data[offset + 3] ?? 0;
          const contrast = Math.max(r, g, b) - Math.min(r, g, b);
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const ink = a > 120 && (contrast > 14 || luminance > 92) ? 1 : 0;
          rowInk += ink;
          nonblankPixels += ink;
          scannedPixels += 1;
        }
        profile.push(rowInk);
      }
      const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
        .filter((row) => row.surfaceId === surfaceId)
        .sort((left, right) => left.clientRect.y - right.clientRect.y);
      const rowDisplacementAnchor = rows[0]?.surfaceScrollOffset.y ?? 0;
      return {
        elapsedMs,
        nonblankRatio: scannedPixels === 0 ? 0 : nonblankPixels / scannedPixels,
        profile,
        rowDisplacementAnchor,
        rows: rows.slice(0, 24).map((row) => ({
          rowId: row.rowId,
          y: row.clientRect.y,
        })),
      };

      function loadImage(dataUrl: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () =>
            reject(new Error("Could not decode retained motion screenshot."));
          image.src = dataUrl;
        });
      }
    },
    {
      elapsedMs,
      screenshotDataUrl: `data:image/png;base64,${screenshot.toString(
        "base64",
      )}`,
      surfaceId: target.surfaceId,
    },
  );
}

function analyzeRetainedCompositorMotion({
  baseline,
  samples,
}: {
  readonly baseline: RetainedCompositorMotionSample;
  readonly samples: readonly RetainedCompositorMotionSample[];
}): RetainedCompositorMotionAnalysis {
  const profileDisplacements = samples.map((sample) =>
    estimateProfileShiftPx(baseline.profile, sample.profile),
  );
  const rowDisplacements = samples.map((sample) =>
    estimateRetainedRowMotionDisplacementPx({
      baseline,
      sample,
    }),
  );
  const displacements = rowDisplacements;
  const absoluteDisplacements = displacements.map((value) => Math.abs(value));
  const maxAbsoluteDisplacementPx = Math.max(0, ...absoluteDisplacements);
  const finalDisplacementPx = absoluteDisplacements.at(-1) ?? 0;
  const largestStepPx = maxConsecutiveDelta(absoluteDisplacements);
  const largestStepRatio =
    maxAbsoluteDisplacementPx <= 0
      ? 0
      : largestStepPx / maxAbsoluteDisplacementPx;
  const intermediateDisplacementCount = absoluteDisplacements.filter(
    (value) =>
      value > 3 &&
      (maxAbsoluteDisplacementPx < 8 || value < maxAbsoluteDisplacementPx - 3),
  ).length;
  return {
    directionChangeCount: countDirectionChanges(displacements),
    displacementsPx: displacements,
    finalDisplacementPx,
    intermediateDisplacementCount,
    largestStepPx,
    largestStepRatio,
    maxAbsoluteDisplacementPx,
    maxStationaryDurationMs: getMaxStationaryDurationMs({
      displacements: absoluteDisplacements,
      samples,
    }),
    profileDisplacementsPx: profileDisplacements,
    rowDisplacementsPx: rowDisplacements,
    sampleCount: samples.length,
  };
}

function estimateRetainedRowMotionDisplacementPx({
  baseline,
  sample,
}: {
  readonly baseline: RetainedCompositorMotionSample;
  readonly sample: RetainedCompositorMotionSample;
}): number {
  const baselineRowsById = new Map(
    baseline.rows.map((row) => [row.rowId, row.y] as const),
  );
  const sharedRowDeltas = sample.rows
    .flatMap((row) => {
      const baselineY = baselineRowsById.get(row.rowId);
      return baselineY === undefined ? [] : [baselineY - row.y];
    })
    .sort((left, right) => left - right);
  if (sharedRowDeltas.length > 0) {
    return sharedRowDeltas[Math.floor(sharedRowDeltas.length / 2)] ?? 0;
  }
  return sample.rowDisplacementAnchor - baseline.rowDisplacementAnchor;
}

function estimateProfileShiftPx(
  baseline: readonly number[],
  sample: readonly number[],
): number {
  const maxShift = Math.min(
    180,
    Math.floor(Math.min(baseline.length, sample.length) / 2),
  );
  let bestShift = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let shift = -maxShift; shift <= maxShift; shift += 1) {
    let score = 0;
    let count = 0;
    for (let y = 0; y < baseline.length; y += 1) {
      const sampleY = y + shift;
      if (sampleY < 0 || sampleY >= sample.length) {
        continue;
      }
      score += baseline[y] * (sample[sampleY] ?? 0);
      count += 1;
    }
    const normalizedScore = count === 0 ? 0 : score / count;
    if (normalizedScore > bestScore) {
      bestScore = normalizedScore;
      bestShift = shift;
    }
  }
  return bestShift;
}

function maxConsecutiveDelta(values: readonly number[]): number {
  let largest = 0;
  for (let index = 1; index < values.length; index += 1) {
    largest = Math.max(largest, Math.abs(values[index] - values[index - 1]));
  }
  return largest;
}

function getMaxStationaryDurationMs({
  displacements,
  samples,
}: {
  readonly displacements: readonly number[];
  readonly samples: readonly RetainedCompositorMotionSample[];
}): number {
  const maxDisplacement = Math.max(0, ...displacements);
  const terminalDisplacementThreshold = Math.max(
    0,
    maxDisplacement - Math.max(4, maxDisplacement * 0.03),
  );
  let lastMovingIndex = 0;
  for (let index = 1; index < displacements.length; index += 1) {
    if (Math.abs(displacements[index] - displacements[index - 1]) > 1.5) {
      lastMovingIndex = index;
    }
  }
  let runStart: number | null = null;
  let maxDuration = 0;
  for (let index = 1; index <= lastMovingIndex; index += 1) {
    if (
      displacements[index - 1] >= terminalDisplacementThreshold &&
      displacements[index] >= terminalDisplacementThreshold
    ) {
      runStart = null;
      continue;
    }
    const delta = Math.abs(displacements[index] - displacements[index - 1]);
    if (delta <= 1.5) {
      runStart = runStart ?? samples[index - 1]?.elapsedMs ?? 0;
      maxDuration = Math.max(
        maxDuration,
        (samples[index]?.elapsedMs ?? runStart) - runStart,
      );
      continue;
    }
    runStart = null;
  }
  return maxDuration;
}

function countDirectionChanges(values: readonly number[]): number {
  let direction = 0;
  let changes = 0;
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    if (Math.abs(delta) < 2) {
      continue;
    }
    const nextDirection = Math.sign(delta);
    if (direction !== 0 && nextDirection !== direction) {
      changes += 1;
    }
    direction = nextDirection;
  }
  return changes;
}

function createScrollContinuityDetails({
  analysis,
  budget,
  controlCadence,
  gesture,
  scrollSignatures,
  target,
}: {
  readonly analysis: RetainedCompositorMotionAnalysis;
  readonly budget: {
    readonly lane: string;
    readonly longTaskBudgetMs: number;
    readonly p95FrameBudgetMs: number;
  };
  readonly controlCadence: unknown;
  readonly gesture: {
    readonly eventSpacing: RetainedCompositorIntervalStats;
    readonly frame: RetainedCompositorIntervalStats;
    readonly longTasks: {
      readonly count: number;
      readonly maxDurationMs: number;
    };
  };
  readonly scrollSignatures: unknown;
  readonly target: RetainedCompositorTarget;
}): string {
  return JSON.stringify(
    {
      analysis,
      budget,
      controlCadence,
      gesture,
      scrollSignatures,
      target: {
        clip: target.clip,
        controlKinds: target.controlKinds,
        rowCount: target.rowCount,
        surfaceId: target.surfaceId,
        visibleRowCount: target.visibleRowCount,
      },
    },
    null,
    2,
  );
}
