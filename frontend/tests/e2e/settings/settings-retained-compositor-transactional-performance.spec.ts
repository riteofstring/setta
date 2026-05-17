import { expect, test, type Page } from "@playwright/test";

import {
  SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  captureRetainedCompositorVisualStats,
  centerRetainedCompositorSurface,
  dispatchRetainedCompositorWheelBurst,
  expectRetainedCompositorGestureWithinBudget,
  installOptionalRetainedCompositorFrameProbe,
  measureRetainedCompositorControlCadence,
  measureRetainedCompositorGesture,
  openAllSettingsForRetainedCompositor,
  readNativePageScrollY,
  readOptionalRetainedCompositorFrameProbe,
  readRetainedCompositorSceneSummary,
  readRetainedCompositorScrollSignature,
  readRetainedCompositorViewport,
  recordRetainedCompositorPerfSample,
  resolveRetainedCompositorCadenceBudget,
  resolveRetainedCompositorTarget,
  resolveRetainedCompositorViewportPoint,
  runNativeRetainedCompositorWheelBurst,
  waitForRetainedCompositorGestureIdle,
  type RetainedCompositorPoint,
} from "./settings-retained-compositor-helpers";

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("all-settings retained surface compositor publishes transactional gesture frames", async ({
  page,
}) => {
  await installOptionalRetainedCompositorFrameProbe(page);
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(
    page,
    SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  );
  const scene = await readRetainedCompositorSceneSummary(page);
  const retainedTarget = await resolveRetainedCompositorTarget(page);
  const viewportPoint = await resolveRetainedCompositorViewportPoint(page);
  const controlCadence = await measureRetainedCompositorControlCadence(page);
  const beforeViewport = await readRetainedCompositorViewport(page);
  const beforeScrollSignature = await readRetainedCompositorScrollSignature(
    page,
    retainedTarget.surfaceId,
  );
  const beforePageScrollY = await readNativePageScrollY(page);
  const beforeVisual = await captureRetainedCompositorVisualStats(
    page,
    retainedTarget.clip,
  );

  await waitForRetainedCompositorGestureIdle(page);
  const pan = await measureRetainedCompositorGesture(page, () =>
    dispatchRetainedCompositorWheelBurst(page, {
      deltaY: 1,
      eventCount: 96,
      point: viewportPoint,
    }),
  );
  await waitForRetainedCompositorGestureIdle(page);
  const zoom = await measureRetainedCompositorGesture(page, () =>
    dispatchRetainedCompositorWheelBurst(page, {
      ctrlKey: true,
      deltaY: -0.25,
      eventCount: 96,
      point: viewportPoint,
    }),
  );
  const afterZoomViewport = await readRetainedCompositorViewport(page);
  await waitForRetainedCompositorGestureIdle(page);
  const retainedHoverZoom = await measureRetainedCompositorGesture(page, () =>
    dispatchRetainedCompositorWheelBurst(page, {
      ctrlKey: true,
      deltaY: -0.25,
      eventCount: 96,
      point: retainedTarget.point,
    }),
  );
  await waitForRetainedCompositorGestureIdle(page);
  const retainedScroll = await measureRetainedCompositorGesture(page, () =>
    runNativeRetainedCompositorWheelBurst(page, {
      deltaY: 44,
      eventCount: 18,
      point: retainedTarget.point,
    }),
  );
  await waitForRetainedCompositorGestureIdle(page);
  const scrollThenZoom = await measureRetainedCompositorGesture(
    page,
    async () => {
      const scrollSpacing = await runNativeRetainedCompositorWheelBurst(page, {
        deltaY: 36,
        eventCount: 10,
        point: retainedTarget.point,
      });
      const zoomSpacing = await dispatchRetainedCompositorWheelBurst(page, {
        ctrlKey: true,
        deltaY: -0.25,
        eventCount: 48,
        point: retainedTarget.point,
      });
      return [...scrollSpacing, ...zoomSpacing];
    },
  );
  await waitForRetainedCompositorGestureIdle(page);
  await centerRetainedControlKind(page, "switch");
  await waitForRetainedTransactionCoverage(page);
  await waitForRetainedCompositorGestureIdle(page);
  const switchTarget = await resolveVisibleRetainedControl(page, "switch");
  await page.mouse.click(switchTarget.point.x, switchTarget.point.y);
  await waitForRetainedCompositorGestureIdle(page);
  const switchThenZoom = await measureRetainedCompositorGesture(page, () =>
    dispatchRetainedCompositorWheelBurst(page, {
      ctrlKey: true,
      deltaY: -0.25,
      eventCount: 48,
      point: viewportPoint,
    }),
  );
  await waitForRetainedCompositorGestureIdle(page);
  await centerRetainedControlKind(page, "text-like");
  await waitForRetainedTransactionCoverage(page);
  await waitForRetainedCompositorGestureIdle(page);
  const textLikeTarget = await resolveVisibleRetainedControl(page, "text-like");
  let textActivationLatencyMs = Number.POSITIVE_INFINITY;
  const textActivation = await measureRetainedCompositorGesture(
    page,
    async () => {
      const startedAtMs = await page.evaluate(() => performance.now());
      await page.mouse.click(textLikeTarget.point.x, textLikeTarget.point.y);
      await expect
        .poll(() => readFlowDomIslandRect(page), { timeout: 1_000 })
        .not.toBeNull();
      textActivationLatencyMs = await page.evaluate(
        (startedAtMs) => performance.now() - startedAtMs,
        startedAtMs,
      );
      return [controlCadence.p50Ms];
    },
  );
  const activeIslandRect = await readActiveDomIslandRect(page);
  const afterScrollSignature = await readRetainedCompositorScrollSignature(
    page,
    retainedTarget.surfaceId,
  );
  const afterPageScrollY = await readNativePageScrollY(page);
  const afterViewport = await readRetainedCompositorViewport(page);
  const afterVisual = await captureRetainedCompositorVisualStats(
    page,
    retainedTarget.clip,
  );
  const retainedFrameProbe =
    await readOptionalRetainedCompositorFrameProbe(page);
  const budgets = {
    pan: resolveRetainedCompositorCadenceBudget({
      controlCadence,
      eventSpacing: pan.eventSpacing,
    }),
    retainedHoverZoom: resolveRetainedCompositorCadenceBudget({
      controlCadence,
      eventSpacing: retainedHoverZoom.eventSpacing,
    }),
    retainedScroll: resolveRetainedCompositorCadenceBudget({
      controlCadence,
      eventSpacing: retainedScroll.eventSpacing,
    }),
    scrollThenZoom: resolveRetainedCompositorCadenceBudget({
      controlCadence,
      eventSpacing: scrollThenZoom.eventSpacing,
    }),
    switchThenZoom: resolveRetainedCompositorCadenceBudget({
      controlCadence,
      eventSpacing: switchThenZoom.eventSpacing,
    }),
    textActivation: resolveRetainedCompositorCadenceBudget({
      controlCadence,
      eventSpacing: textActivation.eventSpacing,
    }),
    zoom: resolveRetainedCompositorCadenceBudget({
      controlCadence,
      eventSpacing: zoom.eventSpacing,
    }),
  };
  const holdStats = summarizeRetainedTransactionHoldProbe(retainedFrameProbe);
  const details = JSON.stringify(
    {
      activeIslandRect,
      budgets,
      controlCadence,
      gestures: {
        pan,
        retainedHoverZoom,
        retainedScroll,
        scrollThenZoom,
        switchThenZoom,
        textActivation,
        zoom,
      },
      holdStats,
      pageScroll: { after: afterPageScrollY, before: beforePageScrollY },
      retainedFrameProbe,
      scene,
      scrollSignatures: {
        after: afterScrollSignature,
        before: beforeScrollSignature,
      },
      switchTarget,
      textActivationLatencyMs,
      textLikeTarget,
      viewport: { after: afterViewport, before: beforeViewport },
      viewportAfterZoom: afterZoomViewport,
      viewportPoint,
      visual: { after: afterVisual, before: beforeVisual },
    },
    null,
    2,
  );
  recordRetainedCompositorPerfSample({
    name: "all-settings transactional retained compositor",
    sample: JSON.parse(details),
  });

  expect(scene.nodeCount, details).toBeGreaterThan(30);
  expect(scene.retainedRowCount, details).toBeGreaterThan(400);
  expect(scene.surfaceCount, details).toBeGreaterThan(4);
  expect(scene.controlKinds, details).toEqual(
    expect.arrayContaining([
      "color-picker",
      "dropdown",
      "nested",
      "switch",
      "text-like",
    ]),
  );
  expect(afterPageScrollY, details).toBe(beforePageScrollY);
  expect(afterScrollSignature, details).not.toEqual(beforeScrollSignature);
  expect(afterZoomViewport.zoom, details).not.toBeCloseTo(
    beforeViewport.zoom,
    3,
  );
  expect(beforeVisual.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(afterVisual.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(activeIslandRect, details).not.toBeNull();
  expect(
    activeIslandRect
      ? distanceBetweenCenters(activeIslandRect, textLikeTarget.rect)
      : Number.POSITIVE_INFINITY,
    details,
  ).toBeLessThan(96);
  expect(holdStats.repeatedDivergedHoldCount, details).toBe(0);
  expect(holdStats.maxDivergedHeldMotionAgeMs, details).toBeLessThanOrEqual(
    Math.max(
      ...Object.values(budgets).map((budget) => budget.p99FrameBudgetMs),
    ),
  );

  expectRetainedCompositorGestureWithinBudget({
    budget: budgets.pan,
    details,
    gesture: pan,
  });
  expectRetainedCompositorGestureWithinBudget({
    budget: budgets.zoom,
    details,
    gesture: zoom,
  });
  expectRetainedCompositorGestureWithinBudget({
    budget: budgets.retainedHoverZoom,
    details,
    gesture: retainedHoverZoom,
  });
  expectRetainedCompositorGestureWithinBudget({
    budget: budgets.retainedScroll,
    details,
    gesture: retainedScroll,
  });
  expectRetainedCompositorGestureWithinBudget({
    budget: budgets.scrollThenZoom,
    details,
    gesture: scrollThenZoom,
  });
  expectRetainedCompositorGestureWithinBudget({
    budget: budgets.switchThenZoom,
    details,
    gesture: switchThenZoom,
  });
});

type RetainedControlTarget = {
  readonly point: RetainedCompositorPoint;
  readonly rect: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly rowId: string;
  readonly surfaceId: string;
};

async function resolveVisibleRetainedControl(
  page: Page,
  controlKind: string,
): Promise<RetainedControlTarget> {
  return await page.evaluate((controlKind) => {
    const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
    const row = rows.find((candidate) => {
      const rect = candidate.controlClientRect ?? candidate.clientRect;
      return (
        candidate.controlKind === controlKind &&
        candidate.controlClientPoint &&
        rect.width > 10 &&
        rect.height > 8 &&
        rect.x + rect.width > 0 &&
        rect.y + rect.height > 0 &&
        rect.x < window.innerWidth &&
        rect.y < window.innerHeight
      );
    });
    if (!row?.controlClientPoint) {
      throw new Error(`Missing visible retained ${controlKind} control.`);
    }
    return {
      point: row.controlClientPoint,
      rect: row.controlClientRect ?? row.clientRect,
      rowId: row.rowId,
      surfaceId: row.surfaceId,
    };
  }, controlKind);
}

async function centerRetainedControlKind(
  page: Page,
  controlKind: string,
): Promise<void> {
  await page.evaluate(async (controlKind) => {
    const pane = document.querySelector<HTMLElement>(".setta-gpu-flow__pane");
    const transform =
      window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport.transform;
    const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
    const row = rows.find((candidate) => candidate.controlKind === controlKind);
    if (!pane || !transform || !row) {
      throw new Error(`Missing retained ${controlKind} control to center.`);
    }
    const rect = row.controlClientRect ?? row.clientRect;
    const paneRect = pane.getBoundingClientRect();
    const flowCenter = {
      x:
        (rect.x + rect.width / 2 - paneRect.left - transform.x) /
        transform.zoom,
      y:
        (rect.y + rect.height / 2 - paneRect.top - transform.y) /
        transform.zoom,
    };
    const zoom = 1;
    const { gpuFlowViewportStore } = await import(
      "/src/gpuFlow/viewportStore.ts"
    );
    const viewportStore = gpuFlowViewportStore.getState();
    viewportStore.setTransform({
      x: paneRect.width * 0.5 - flowCenter.x * zoom,
      y: paneRect.height * 0.48 - flowCenter.y * zoom,
      zoom,
    });
    viewportStore.setFitViewInitializationState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
    });
    window.settaGpuFlowZoom = zoom;
  }, controlKind);
}

async function waitForRetainedTransactionCoverage(page: Page): Promise<void> {
  await expect
    .poll(() => readLatestRetainedTransactionCovered(page), {
      timeout: 5_000,
    })
    .toBe(true);
}

async function readLatestRetainedTransactionCovered(
  page: Page,
): Promise<boolean> {
  return await page.evaluate(() => {
    const samples =
      (
        window as Window & {
          readonly __settaRetainedCompositorFrameProbe?: readonly unknown[];
        }
      ).__settaRetainedCompositorFrameProbe ?? [];
    const latest = samples.at(-1);
    if (!latest || typeof latest !== "object") {
      return false;
    }
    const entry = latest as Record<string, unknown>;
    return (
      entry.retainedTexturePageTransactionOutcome !== "hold-previous" &&
      Number(entry.retainedTexturePageTrueHoleRectCount ?? 0) === 0
    );
  });
}

async function readActiveDomIslandRect(page: Page): Promise<{
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
} | null> {
  return await page.evaluate(() => {
    const island = document.querySelector<HTMLElement>(
      '[data-gpu-project-param-dom-island="true"], [data-gpu-project-param-name-dom-island="true"]',
    );
    if (!island) {
      return null;
    }
    const rect = island.getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    };
  });
}

async function readFlowDomIslandRect(page: Page): Promise<{
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
} | null> {
  return await page.evaluate(() => {
    const island = document.querySelector<HTMLElement>(
      '[data-gpu-flow-dom-island="true"]',
    );
    if (!island) {
      return null;
    }
    const rect = island.getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    };
  });
}

function summarizeRetainedTransactionHoldProbe(probe: unknown): {
  readonly maxDivergedHeldMotionAgeMs: number;
  readonly repeatedDivergedHoldCount: number;
} {
  if (!Array.isArray(probe)) {
    return { maxDivergedHeldMotionAgeMs: 0, repeatedDivergedHoldCount: 0 };
  }
  let maxDivergedHeldMotionAgeMs = 0;
  let consecutiveDivergedHolds = 0;
  let repeatedDivergedHoldCount = 0;
  for (const sample of probe) {
    const entry = isRecord(sample) ? sample : {};
    const heldCount = numericValue(
      entry.retainedTexturePageTransactionHeldTransactionCount,
    );
    const heldAge = numericValue(
      entry.retainedTexturePageTransactionMaxHeldMotionAgeMs,
    );
    const diverged =
      heldCount > 0 &&
      (numericValue(entry.retainedTexturePageTransactionDesiredScrollOffset) !==
        numericValue(
          entry.retainedTexturePageTransactionPublishedScrollOffset,
        ) ||
        !viewportsEqual(
          entry.retainedTexturePageTransactionDesiredViewport,
          entry.retainedTexturePageTransactionPublishedViewport,
        ));
    if (diverged) {
      maxDivergedHeldMotionAgeMs = Math.max(
        maxDivergedHeldMotionAgeMs,
        heldAge,
      );
    }
    consecutiveDivergedHolds = diverged ? consecutiveDivergedHolds + 1 : 0;
    if (consecutiveDivergedHolds > 1) {
      repeatedDivergedHoldCount += 1;
    }
  }
  return { maxDivergedHeldMotionAgeMs, repeatedDivergedHoldCount };
}

function distanceBetweenCenters(
  left: RetainedControlTarget["rect"],
  right: RetainedControlTarget["rect"],
): number {
  return Math.hypot(
    left.x + left.width / 2 - (right.x + right.width / 2),
    left.y + left.height / 2 - (right.y + right.height / 2),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function numericValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function viewportsEqual(left: unknown, right: unknown): boolean {
  if (!isRecord(left) || !isRecord(right)) {
    return true;
  }
  return (
    numericValue(left.x) === numericValue(right.x) &&
    numericValue(left.y) === numericValue(right.y) &&
    numericValue(left.zoom) === numericValue(right.zoom)
  );
}
