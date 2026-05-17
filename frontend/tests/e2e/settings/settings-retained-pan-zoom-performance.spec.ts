import { expect, test, type Page } from "@playwright/test";

import {
  ensureGpuFlowPerformanceQueueWrappers,
  installGpuFlowPerformanceProbe,
  readGpuFlowPerformanceSnapshot,
  resetGpuFlowPerformanceProbe,
  setGpuFlowPerformanceSourceMutationRecording,
  type GpuFlowPerformanceSnapshot,
} from "../gpuFlowPerformanceProbe";
import { ensureAppReady, postBackend } from "../helpers";
import {
  measurePageRafCadence,
  percentile,
  waitForAnimationFrame,
} from "./settings-retained-frame-helpers";
import {
  activateRetainedEditor,
  readActiveEditorText,
  resolveControlScreenshotClip,
  waitForActiveEditorGeometry,
  waitForViewportIdle,
} from "./settings-retained-pan-zoom-editor-helpers";
import {
  readViewportRuntimeDebug,
  readViewportSample,
} from "./settings-retained-pan-zoom-viewport-helpers";
import {
  analyzeCodeMirrorTextInkBounds,
  type Rect,
  type RetainedRowDebugEntry,
} from "./settings-retained-visual-analysis";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const SETTINGS_PARAM_CONTENT_SUFFIX = ":param-content:unpinned";
const SETTINGS_SCROLL_TEST_SURFACE_ID = `settings-section__shortcuts${SETTINGS_PARAM_CONTENT_SUFFIX}`;
const GESTURE_EVENT_SPACING_MS = 8;
const ZOOM_WHEEL_DELTA_Y = -0.25;
const PAN_ZOOM_P95_FRAME_BUDGET_MS = 8.5;
const PAN_ZOOM_CAPPED_P95_FRAME_BUDGET_MS = 20;
const CAPPED_P95_FRAME_BUDGET_SLACK_MS = 4;
const CAPPED_GESTURE_P95_FRAME_BUDGET_SLACK_MS = 4;
const STRICT_GESTURE_EVENT_P95_BUDGET_MS = 9;
const STRICT_RAF_P95_BUDGET_MS = 10;
const PAN_ZOOM_MAX_FRAME_BUDGET_MS = 60;
const PAN_ZOOM_LONG_TASK_BUDGET_MS = 60;
const TEXT_ROW_TARGET = {
  rowId: "settings-codeobj__gui__gui__maxZoom",
  surfaceId: "settings-section__gui" + SETTINGS_PARAM_CONTENT_SUFFIX,
};

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("active retained text editor stays aligned and editable during zoom", async ({
  page,
}) => {
  await installGpuFlowPerformanceProbe(page);
  await openAllSettings(page);
  await setGpuFlowPerformanceSourceMutationRecording(page, false);
  await centerRetainedSurface(page, TEXT_ROW_TARGET.surfaceId);
  await scrollRetainedSurfaceToTop(page, TEXT_ROW_TARGET.surfaceId);
  const row = await scrollRetainedSurfaceUntilRowVisible(page);
  if (!row.controlClientPoint || !row.controlClientRect) {
    throw new Error(`Missing retained control geometry for ${row.rowId}.`);
  }

  const beforeGeometry = await activateRetainedEditor(page, row);
  const zoomPoint = await resolveCanvasGesturePoint(page);
  const beforeViewport = await readViewportSample(page);
  await page.mouse.move(zoomPoint.x, zoomPoint.y);
  await resetGpuFlowPerformanceProbe(page);
  await runWheelZoomBurst(page, {
    eventCount: 48,
    point: zoomPoint,
  });
  await waitForViewportIdle(page);
  const afterViewport = await readViewportSample(page);
  const afterRow = await resolveVisibleTargetRow(page);
  if (!afterRow?.controlClientRect) {
    throw new Error("The active retained row disappeared after zoom.");
  }
  const afterGeometry = await waitForActiveEditorGeometry(
    page,
    afterRow.controlClientRect,
  );
  const editorClip = await resolveControlScreenshotClip(page, afterRow);
  const editorFrame = await page.screenshot({ clip: editorClip });
  const editorInk = await analyzeCodeMirrorTextInkBounds(page, {
    clip: editorClip,
    screenshot: editorFrame,
    searchRect: afterRow.controlClientRect,
  });

  await page.keyboard.type("8");
  const editorText = await readActiveEditorText(page);
  const details = JSON.stringify(
    {
      afterGeometry,
      beforeGeometry,
      viewport: { after: afterViewport, before: beforeViewport },
      editorInk,
      editorText,
      zoomPoint,
      row: afterRow,
    },
    null,
    2,
  );

  expect(Math.abs(afterGeometry.leftDelta), details).toBeLessThan(2);
  expect(Math.abs(afterGeometry.topDelta), details).toBeLessThan(9);
  expect(Math.abs(afterGeometry.widthDelta), details).toBeLessThan(2);
  expect(Math.abs(afterGeometry.heightDelta), details).toBeLessThan(10);
  expect(afterViewport.zoom, details).not.toBeCloseTo(beforeViewport.zoom, 3);
  expect(editorInk?.pixelCount ?? 0, details).toBeGreaterThan(0);
  expect(editorText, details).toContain("8");
});

test("all-settings retained pan and zoom sustain frame cadence without blanks", async ({
  page,
}) => {
  await installGpuFlowPerformanceProbe(page);
  await openAllSettings(page);
  await setGpuFlowPerformanceSourceMutationRecording(page, false);
  expect(await ensureGpuFlowPerformanceQueueWrappers(page)).toBe(true);

  const canvasPoint = await resolveCanvasGesturePoint(page);
  await page.mouse.move(canvasPoint.x, canvasPoint.y);
  await resetViewportForMeasurement(page);
  await waitForAnimationFrame(page);

  const before = await readViewportSample(page);
  const beforeScrollY = await page.evaluate(() => window.scrollY);
  const beforeCanvasVisual = await captureNonblankClip(
    page,
    await resolveCanvasClip(page),
  );
  const beforeRows = await captureVisibleRetainedRowVisuals(page);
  const beforeZoomRafCadence = await measurePageRafCadence(page);

  await resetGpuFlowPerformanceProbe(page);
  const zoomGesture = await runWheelZoomBurst(page, {
    eventCount: 128,
    point: canvasPoint,
  });
  await waitForAnimationFrame(page);
  const zoomSnapshot = await readGpuFlowPerformanceSnapshot(page);
  await waitForViewportIdle(page);
  const afterZoom = await readViewportSample(page);
  const zoomCanvasVisual = await captureNonblankClip(
    page,
    await resolveCanvasClip(page),
  );
  const zoomRows = await captureVisibleRetainedRowVisuals(page);

  const beforePanRafCadence = await measurePageRafCadence(page);
  await resetGpuFlowPerformanceProbe(page);
  const panGesture = await runWheelPanBurst(page, {
    eventCount: 128,
    point: canvasPoint,
  });
  await waitForAnimationFrame(page);
  const panSnapshot = await readGpuFlowPerformanceSnapshot(page);
  await waitForViewportIdle(page);
  const afterPan = await readViewportSample(page);
  const afterScrollY = await page.evaluate(() => window.scrollY);
  const panCanvasVisual = await captureNonblankClip(
    page,
    await resolveCanvasClip(page),
  );
  const panRows = await captureVisibleRetainedRowVisuals(page);

  const zoomStats = summarizeMeasuredFrames(zoomSnapshot);
  const panStats = summarizeMeasuredFrames(panSnapshot);
  const zoomP95BudgetMs = resolveCappedP95FrameBudget({
    gesture: zoomGesture,
    rafCadence: beforeZoomRafCadence,
  });
  const panP95BudgetMs = resolveCappedP95FrameBudget({
    gesture: panGesture,
    rafCadence: beforePanRafCadence,
  });
  const zoomRenderedViewport = readLatestRenderedViewport(zoomSnapshot);
  const panRenderedViewport = readLatestRenderedViewport(panSnapshot);
  const viewportRuntimeDebug = await readViewportRuntimeDebug(page);
  const details = JSON.stringify(
    {
      canvasPoint,
      gesture: { pan: panGesture, zoom: zoomGesture },
      nativeScroll: { afterScrollY, beforeScrollY },
      renderedViewport: {
        afterPan: panRenderedViewport,
        afterZoom: zoomRenderedViewport,
      },
      retainedRows: { afterPan: panRows, afterZoom: zoomRows, beforeRows },
      visuals: {
        afterPan: panCanvasVisual,
        afterZoom: zoomCanvasVisual,
        before: beforeCanvasVisual,
      },
      viewport: { afterPan, afterZoom, before },
      viewportRuntimeDebug,
      budgets: { panP95BudgetMs, zoomP95BudgetMs },
      panStats,
      rafCadence: {
        beforePan: beforePanRafCadence,
        beforeZoom: beforeZoomRafCadence,
      },
      zoomStats,
    },
    null,
    2,
  );

  expect(afterZoom.zoom, details).not.toBeCloseTo(before.zoom, 3);
  expect(zoomRenderedViewport?.zoom ?? before.zoom, details).not.toBeCloseTo(
    before.zoom,
    3,
  );
  expect(Math.abs(afterPan.y - afterZoom.y), details).toBeGreaterThan(12);
  expect(
    Math.abs(
      (panRenderedViewport?.y ?? afterZoom.y) -
        (zoomRenderedViewport?.y ?? afterZoom.y),
    ),
    details,
  ).toBeGreaterThan(12);
  expect(afterScrollY, details).toBe(beforeScrollY);
  expect(beforeCanvasVisual.nonblankRatio, details).toBeGreaterThan(0.02);
  expect(zoomCanvasVisual.nonblankRatio, details).toBeGreaterThan(0.02);
  expect(panCanvasVisual.nonblankRatio, details).toBeGreaterThan(0.02);
  expect(beforeRows.length, details).toBeGreaterThan(0);
  expect(zoomRows.length, details).toBeGreaterThan(0);
  expect(panRows.length, details).toBeGreaterThan(0);
  expect(
    beforeRows.every((row) => row.nonblankRatio > 0.01),
    details,
  ).toBe(true);
  expect(
    zoomRows.every((row) => row.nonblankRatio > 0.01),
    details,
  ).toBe(true);
  expect(
    panRows.every((row) => row.nonblankRatio > 0.01),
    details,
  ).toBe(true);
  expect(zoomStats.excludingWarmup.p95Ms, details).toBeLessThanOrEqual(
    zoomP95BudgetMs,
  );
  expect(zoomStats.excludingWarmup.maxMs, details).toBeLessThanOrEqual(
    PAN_ZOOM_MAX_FRAME_BUDGET_MS,
  );
  expect(panStats.excludingWarmup.p95Ms, details).toBeLessThanOrEqual(
    panP95BudgetMs,
  );
  expect(panStats.excludingWarmup.maxMs, details).toBeLessThanOrEqual(
    PAN_ZOOM_MAX_FRAME_BUDGET_MS,
  );
  expect(zoomStats.longTasks.maxDurationMs, details).toBeLessThanOrEqual(
    PAN_ZOOM_LONG_TASK_BUDGET_MS,
  );
  expect(panStats.longTasks.maxDurationMs, details).toBeLessThanOrEqual(
    PAN_ZOOM_LONG_TASK_BUDGET_MS,
  );
});

test("retained section stays nonblank through native scroll then viewport pan and zoom", async ({
  page,
}) => {
  await installGpuFlowPerformanceProbe(page);
  await openAllSettings(page);
  await setGpuFlowPerformanceSourceMutationRecording(page, false);
  await centerRetainedSurface(page, SETTINGS_SCROLL_TEST_SURFACE_ID);
  await scrollRetainedSurfaceToTop(page, SETTINGS_SCROLL_TEST_SURFACE_ID);
  await waitForViewportIdle(page);

  const scrollPoint = await resolveRetainedSurfaceWheelPoint(
    page,
    SETTINGS_SCROLL_TEST_SURFACE_ID,
  );
  const canvasPoint = await resolveCanvasGesturePoint(page);
  const beforeViewport = await readViewportSample(page);
  const beforeSignature = await readRetainedSurfaceScrollSignature(
    page,
    SETTINGS_SCROLL_TEST_SURFACE_ID,
  );
  const beforeRows = await captureRetainedSurfaceRowVisuals(
    page,
    SETTINGS_SCROLL_TEST_SURFACE_ID,
  );

  await resetGpuFlowPerformanceProbe(page);
  const scrollGesture = await runRetainedScrollBurst(page, {
    deltaY: 44,
    eventCount: 18,
    point: scrollPoint,
  });
  await waitForAnimationFrame(page);
  const afterScrollSignature = await readRetainedSurfaceScrollSignature(
    page,
    SETTINGS_SCROLL_TEST_SURFACE_ID,
  );
  const afterScrollRows = await captureRetainedSurfaceRowVisuals(
    page,
    SETTINGS_SCROLL_TEST_SURFACE_ID,
  );
  const beforePanRafCadence = await measurePageRafCadence(page);
  await resetGpuFlowPerformanceProbe(page);
  const panGesture = await runWheelPanBurst(page, {
    eventCount: 48,
    point: canvasPoint,
  });
  await waitForAnimationFrame(page);
  const panSnapshot = await readGpuFlowPerformanceSnapshot(page);
  const afterPanViewport = await readViewportSample(page);

  const beforeZoomRafCadence = await measurePageRafCadence(page);
  await resetGpuFlowPerformanceProbe(page);
  const zoomGesture = await runWheelZoomBurst(page, {
    eventCount: 48,
    point: canvasPoint,
  });
  await waitForAnimationFrame(page);
  const zoomSnapshot = await readGpuFlowPerformanceSnapshot(page);
  await waitForViewportIdle(page);
  const afterViewport = await readViewportSample(page);
  const afterRows = await captureRetainedSurfaceRowVisuals(
    page,
    SETTINGS_SCROLL_TEST_SURFACE_ID,
  );
  const panStats = summarizeMeasuredFrames(panSnapshot);
  const zoomStats = summarizeMeasuredFrames(zoomSnapshot);
  const panP95BudgetMs = resolveCappedP95FrameBudget({
    gesture: panGesture,
    rafCadence: beforePanRafCadence,
  });
  const zoomP95BudgetMs = resolveCappedP95FrameBudget({
    gesture: zoomGesture,
    rafCadence: beforeZoomRafCadence,
  });
  const details = JSON.stringify(
    {
      canvasPoint,
      budgets: {
        panP95BudgetMs,
        zoomP95BudgetMs,
      },
      gestures: { pan: panGesture, scroll: scrollGesture, zoom: zoomGesture },
      retainedRows: {
        after: afterRows,
        afterScroll: afterScrollRows,
        before: beforeRows,
      },
      scrollSignatures: {
        afterScroll: afterScrollSignature,
        before: beforeSignature,
      },
      panStats,
      panProbe: summarizeProbeForDetails(panSnapshot),
      zoomStats,
      zoomProbe: summarizeProbeForDetails(zoomSnapshot),
      rafCadence: {
        beforePan: beforePanRafCadence,
        beforeZoom: beforeZoomRafCadence,
      },
      viewport: {
        after: afterViewport,
        afterPan: afterPanViewport,
        before: beforeViewport,
      },
    },
    null,
    2,
  );

  expect(afterScrollSignature, details).not.toEqual(beforeSignature);
  expect(
    Math.abs(afterPanViewport.y - beforeViewport.y),
    details,
  ).toBeGreaterThan(8);
  expect(afterViewport.zoom, details).not.toBeCloseTo(beforeViewport.zoom, 3);
  expect(beforeRows.length, details).toBeGreaterThan(0);
  expect(afterScrollRows.length, details).toBeGreaterThan(0);
  expect(afterRows.length, details).toBeGreaterThan(0);
  expect(
    beforeRows.every((row) => row.nonblankRatio > 0.01),
    details,
  ).toBe(true);
  expect(
    afterScrollRows.every((row) => row.nonblankRatio > 0.01),
    details,
  ).toBe(true);
  expect(
    afterRows.every((row) => row.nonblankRatio > 0.01),
    details,
  ).toBe(true);
  expect(panStats.excludingWarmup.p95Ms, details).toBeLessThanOrEqual(
    panP95BudgetMs,
  );
  expect(panStats.excludingWarmup.maxMs, details).toBeLessThanOrEqual(
    PAN_ZOOM_MAX_FRAME_BUDGET_MS,
  );
  expect(zoomStats.excludingWarmup.p95Ms, details).toBeLessThanOrEqual(
    zoomP95BudgetMs,
  );
  expect(zoomStats.excludingWarmup.maxMs, details).toBeLessThanOrEqual(
    PAN_ZOOM_MAX_FRAME_BUDGET_MS,
  );
  expect(panStats.longTasks.maxDurationMs, details).toBeLessThanOrEqual(
    PAN_ZOOM_LONG_TASK_BUDGET_MS,
  );
  expect(zoomStats.longTasks.maxDurationMs, details).toBeLessThanOrEqual(
    PAN_ZOOM_LONG_TASK_BUDGET_MS,
  );
});

test("viewport gesture continues while minimap and debug observers are active", async ({
  page,
}) => {
  await installGpuFlowPerformanceProbe(page);
  await openAllSettings(page);
  await setGpuFlowPerformanceSourceMutationRecording(page, false);
  expect(await ensureGpuFlowPerformanceQueueWrappers(page)).toBe(true);
  await resetViewportForMeasurement(page);
  const point = await resolveCanvasGesturePoint(page);
  await page.mouse.move(point.x, point.y);
  const before = await readViewportSample(page);
  const rafCadence = await measurePageRafCadence(page);
  await resetGpuFlowPerformanceProbe(page);
  const gesture = await runWheelPanBurst(page, {
    eventCount: 128,
    point,
  });
  await waitForAnimationFrame(page);
  const snapshot = await readGpuFlowPerformanceSnapshot(page);
  await waitForViewportIdle(page);
  const after = await readViewportSample(page);
  const rows = await captureVisibleRetainedRowVisuals(page);
  const stats = summarizeMeasuredFrames(snapshot);
  const p95BudgetMs = resolveCappedP95FrameBudget({ gesture, rafCadence });
  const details = JSON.stringify(
    {
      after,
      before,
      budget: { p95BudgetMs },
      gesture,
      rafCadence,
      rows,
      stats,
    },
    null,
    2,
  );

  expect(Math.abs(after.y - before.y), details).toBeGreaterThan(12);
  expect(rows.length, details).toBeGreaterThan(0);
  expect(
    rows.every((row) => row.nonblankRatio > 0.01),
    details,
  ).toBe(true);
  expect(stats.excludingWarmup.p95Ms, details).toBeLessThanOrEqual(p95BudgetMs);
  expect(stats.excludingWarmup.maxMs, details).toBeLessThanOrEqual(
    PAN_ZOOM_MAX_FRAME_BUDGET_MS,
  );
});

async function openAllSettings(page: Page): Promise<void> {
  await ensureAppReady(page);
  await postBackend(page, "/setActiveViewMode", {
    activeViewModeId: "settings-all",
    projectConfigId: "settings",
  });
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  await page.getByRole("button", { name: "fit view" }).click();
  await waitForViewportIdle(page);
  await page.getByRole("button", { exact: true, name: "All Settings" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".setta-gpu-flow__node").length > 30,
  );
  await expect
    .poll(() => readRetainedRowCount(page), { timeout: 10_000 })
    .toBeGreaterThan(50);
  await expect
    .poll(() => readGpuFlowNodeLayerFrameCount(page), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await waitForAnimationFrame(page);
}

async function resetViewportForMeasurement(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const [{ setViewport }, { gpuFlowViewportStore }] = await Promise.all([
      import("/src/gpuFlow/viewportActions.ts"),
      import("/src/gpuFlow/viewportStore.ts"),
    ]);
    setViewport({ x: 0, y: 0, zoom: 1 }, { store: gpuFlowViewportStore });
  });
  await waitForAnimationFrame(page);
  await waitForAnimationFrame(page);
}

type WheelViewportBurstResult = {
  readonly durationMs: number;
  readonly eventCount: number;
  readonly eventSpacingMs: readonly number[];
};

async function runWheelZoomBurst(
  page: Page,
  input: {
    readonly eventCount: number;
    readonly point: { readonly x: number; readonly y: number };
  },
): Promise<WheelViewportBurstResult> {
  return await runWheelBurst(page, {
    deltaX: 0,
    deltaY: ZOOM_WHEEL_DELTA_Y,
    eventCount: input.eventCount,
    modifiers: 2,
    point: input.point,
  });
}

async function runWheelPanBurst(
  page: Page,
  input: {
    readonly eventCount: number;
    readonly point: { readonly x: number; readonly y: number };
  },
): Promise<WheelViewportBurstResult> {
  return await runWheelBurst(page, {
    deltaX: 0,
    deltaY: 1,
    eventCount: input.eventCount,
    modifiers: 0,
    point: input.point,
  });
}

async function runRetainedScrollBurst(
  page: Page,
  input: {
    readonly deltaY: number;
    readonly eventCount: number;
    readonly point: { readonly x: number; readonly y: number };
  },
): Promise<WheelViewportBurstResult> {
  const timestamps: number[] = [];
  const startedAt = performance.now();
  await page.mouse.move(input.point.x, input.point.y);
  for (let index = 0; index < input.eventCount; index += 1) {
    timestamps.push(performance.now());
    await page.mouse.wheel(0, input.deltaY);
    await waitForGestureEventSpacing();
  }
  const finishedAt = performance.now();
  return {
    durationMs: finishedAt - startedAt,
    eventCount: input.eventCount,
    eventSpacingMs: timestamps.slice(1).map((timestamp, index) => {
      const previous = timestamps[index] ?? timestamp;
      return timestamp - previous;
    }),
  };
}

async function runWheelBurst(
  page: Page,
  input: {
    readonly deltaX: number;
    readonly deltaY: number;
    readonly eventCount: number;
    readonly modifiers: number;
    readonly point: { readonly x: number; readonly y: number };
  },
): Promise<WheelViewportBurstResult> {
  return await page.evaluate(
    async ({ deltaX, deltaY, eventCount, modifiers, point, spacingMs }) => {
      const target = document.elementFromPoint(point.x, point.y);
      if (!target) {
        throw new Error(
          `Missing wheel target at (${point.x.toFixed(1)}, ${point.y.toFixed(
            1,
          )}).`,
        );
      }
      const timestamps: number[] = [];
      const startedAt = performance.now();
      for (let index = 0; index < eventCount; index += 1) {
        timestamps.push(performance.now());
        target.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: point.x,
            clientY: point.y,
            ctrlKey: (modifiers & 2) !== 0,
            deltaMode: WheelEvent.DOM_DELTA_PIXEL,
            deltaX,
            deltaY,
            metaKey: (modifiers & 4) !== 0,
            shiftKey: (modifiers & 8) !== 0,
            view: window,
          }),
        );
        await new Promise<void>((resolve) => setTimeout(resolve, spacingMs));
      }
      const finishedAt = performance.now();
      return {
        durationMs: finishedAt - startedAt,
        eventCount,
        eventSpacingMs: timestamps.slice(1).map((timestamp, index) => {
          const previous = timestamps[index] ?? timestamp;
          return timestamp - previous;
        }),
      };
    },
    {
      ...input,
      spacingMs: GESTURE_EVENT_SPACING_MS,
    },
  );
}

async function waitForGestureEventSpacing(): Promise<void> {
  await new Promise<void>((resolve) =>
    setTimeout(resolve, GESTURE_EVENT_SPACING_MS),
  );
}

function summarizeMeasuredFrames(snapshot: GpuFlowPerformanceSnapshot) {
  const raw = summarizeIntervals(snapshot.frameIntervalsMs);
  const warmupCount =
    snapshot.frameIntervalsMs.length >= 80
      ? Math.min(10, snapshot.frameIntervalsMs.length)
      : 0;
  const excludingWarmup = summarizeIntervals(
    snapshot.frameIntervalsMs.slice(warmupCount),
  );
  return {
    excludingWarmup,
    longTasks: {
      count: snapshot.longTasks.length,
      maxDurationMs: Math.max(
        0,
        ...snapshot.longTasks.map((task) => task.durationMs),
      ),
    },
    raw,
    warmupCount,
  };
}

function summarizeProbeForDetails(snapshot: GpuFlowPerformanceSnapshot) {
  const textureUploads = snapshot.queueCalls.filter(
    (call) => call.method === "copyElementImageToTexture",
  );
  const writeBufferCalls = snapshot.queueCalls.filter(
    (call) => call.method === "writeBuffer",
  );
  return {
    frameCount: snapshot.frameCount,
    latestNodeLayerFrame:
      snapshot.nodeLayerFrames[snapshot.nodeLayerFrames.length - 1] ?? null,
    nodeLayerFrameCount: snapshot.nodeLayerFrames.length,
    textureUploadCount: textureUploads.length,
    textureUploadsBySourceId: countByString(
      textureUploads.map((call) => call.sourceNodeId ?? "unknown"),
    ),
    writeBufferCallCount: writeBufferCalls.length,
    writeBufferBytesByLabel: sumByString(
      writeBufferCalls.map((call) => ({
        key: call.bufferLabel ?? "unknown",
        value: call.byteLength ?? 0,
      })),
    ),
  };
}

function resolveCappedP95FrameBudget({
  gesture,
  rafCadence,
}: {
  readonly gesture: WheelViewportBurstResult;
  readonly rafCadence: { readonly p95Ms: number };
}) {
  const gestureP95Ms = percentile(
    [...gesture.eventSpacingMs].sort((left, right) => left - right),
    0.95,
  );
  const measuredBudgetMs = Math.max(
    PAN_ZOOM_P95_FRAME_BUDGET_MS,
    rafCadence.p95Ms + CAPPED_P95_FRAME_BUDGET_SLACK_MS,
    gestureP95Ms + CAPPED_GESTURE_P95_FRAME_BUDGET_SLACK_MS,
  );
  if (
    rafCadence.p95Ms <= STRICT_RAF_P95_BUDGET_MS &&
    gestureP95Ms <= STRICT_GESTURE_EVENT_P95_BUDGET_MS
  ) {
    return measuredBudgetMs;
  }
  return Math.max(PAN_ZOOM_CAPPED_P95_FRAME_BUDGET_MS, measuredBudgetMs);
}

function countByString(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function sumByString(
  values: readonly { readonly key: string; readonly value: number }[],
): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const { key, value } of values) {
    sums[key] = (sums[key] ?? 0) + value;
  }
  return sums;
}

function readLatestRenderedViewport(
  snapshot: GpuFlowPerformanceSnapshot,
): GpuFlowPerformanceSnapshot["nodeLayerFrames"][number]["viewport"] | null {
  return (
    snapshot.nodeLayerFrames[snapshot.nodeLayerFrames.length - 1]?.viewport ??
    null
  );
}

function summarizeIntervals(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: values.length,
    maxMs: sorted[sorted.length - 1] ?? 0,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
  };
}

async function resolveCanvasGesturePoint(page: Page) {
  return await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>(
      ".setta-gpu-flow__canvas",
    );
    if (!canvas) {
      throw new Error("Missing GPU flow canvas bounds.");
    }
    const box = canvas.getBoundingClientRect();
    const candidates = [
      [0.08, 0.92],
      [0.92, 0.92],
      [0.08, 0.08],
      [0.92, 0.08],
      [0.55, 0.52],
      [0.82, 0.86],
      [0.18, 0.86],
      [0.88, 0.18],
      [0.12, 0.18],
      [0.5, 0.92],
      [0.92, 0.5],
      [0.08, 0.5],
    ] as const;
    const blockedRects = getViewportGestureBlockedRects();
    for (const [xRatio, yRatio] of candidates) {
      const x = box.left + box.width * xRatio;
      const y = box.top + box.height * yRatio;
      if (isViewportWheelTarget(x, y)) {
        return { x, y };
      }
    }
    for (let yStep = 1; yStep < 20; yStep += 1) {
      for (let xStep = 1; xStep < 20; xStep += 1) {
        const x = box.left + box.width * (xStep / 20);
        const y = box.top + box.height * (yStep / 20);
        if (isViewportWheelTarget(x, y)) {
          return { x, y };
        }
      }
    }
    throw new Error(
      `Missing unblocked viewport wheel target in canvas ${JSON.stringify({
        blockedRectCount: blockedRects.length,
        height: box.height,
        width: box.width,
        x: box.x,
        y: box.y,
      })}.`,
    );

    function isViewportWheelTarget(x: number, y: number): boolean {
      const target = document.elementFromPoint(x, y);
      if (!(target instanceof Element)) {
        return false;
      }
      const pane = target.closest(".setta-gpu-flow__pane");
      if (!pane) {
        return false;
      }
      if (blockedRects.some((rect) => rectContainsPoint(rect, x, y))) {
        return false;
      }
      return !target.closest(".nowheel, .nopan");
    }

    function getViewportGestureBlockedRects(): Rect[] {
      const retainedRowRects = (
        window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []
      ).flatMap((row) => {
        const rects = [row.clientRect];
        if (row.controlClientRect) {
          rects.push(row.controlClientRect);
        }
        return rects;
      });
      const nodeRects = [
        ...document.querySelectorAll<HTMLElement>(".setta-gpu-flow__node"),
      ].map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          height: rect.height,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        };
      });
      return [...retainedRowRects, ...nodeRects].filter(
        (rect) => rect.width > 0 && rect.height > 0,
      );
    }

    function rectContainsPoint(rect: Rect, x: number, y: number): boolean {
      return (
        x >= rect.x &&
        x <= rect.x + rect.width &&
        y >= rect.y &&
        y <= rect.y + rect.height
      );
    }
  });
}

async function resolveCanvasClip(page: Page): Promise<Rect> {
  const box = await page
    .locator(".setta-gpu-flow__canvas")
    .first()
    .boundingBox();
  if (!box) {
    throw new Error("Missing GPU flow canvas bounds.");
  }
  return {
    height: Math.min(260, box.height),
    width: Math.min(420, box.width),
    x: box.x + Math.max(0, box.width / 2 - 210),
    y: box.y + Math.max(0, box.height / 2 - 130),
  };
}

async function captureVisibleRetainedRowVisuals(page: Page) {
  const rows = await page.evaluate(() => {
    return (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter((row): row is RetainedRowDebugEntry => {
        const rect = row.clientRect;
        return (
          rect.width > 20 &&
          rect.height > 8 &&
          rect.x + rect.width > 0 &&
          rect.y + rect.height > 0 &&
          rect.x < window.innerWidth &&
          rect.y < window.innerHeight
        );
      })
      .slice(0, 4)
      .map((row) => ({
        rect: row.clientRect,
        rowId: row.rowId,
        surfaceId: row.surfaceId,
      }));
  });
  const visuals = [];
  for (const row of rows) {
    visuals.push({
      rowId: row.rowId,
      surfaceId: row.surfaceId,
      ...(await captureNonblankClip(page, normalizeClip(row.rect))),
    });
  }
  return visuals;
}

async function captureRetainedSurfaceRowVisuals(page: Page, surfaceId: string) {
  const rows = await page.evaluate((targetSurfaceId) => {
    return (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter((row): row is RetainedRowDebugEntry => {
        const rect = row.clientRect;
        return (
          row.surfaceId === targetSurfaceId &&
          rect.width > 20 &&
          rect.height > 8 &&
          rect.x + rect.width > 0 &&
          rect.y + rect.height > 0 &&
          rect.x < window.innerWidth &&
          rect.y < window.innerHeight
        );
      })
      .slice(0, 4)
      .map((row) => ({
        rect: row.clientRect,
        rowId: row.rowId,
        surfaceId: row.surfaceId,
      }));
  }, surfaceId);
  const visuals = [];
  for (const row of rows) {
    visuals.push({
      rowId: row.rowId,
      surfaceId: row.surfaceId,
      ...(await captureNonblankClip(page, normalizeClip(row.rect))),
    });
  }
  return visuals;
}

async function captureNonblankClip(page: Page, clip: Rect) {
  const screenshot = await page.screenshot({ clip: normalizeClip(clip) });
  return await page.evaluate(
    async ({ screenshotDataUrl }) => {
      const image = await loadImage(screenshotDataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Missing nonblank analysis canvas context.");
      }
      ctx.drawImage(image, 0, 0);
      const { data, height, width } = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      let nonblankPixels = 0;
      for (let index = 0; index < data.length; index += 4) {
        const r = data[index] ?? 0;
        const g = data[index + 1] ?? 0;
        const b = data[index + 2] ?? 0;
        const a = data[index + 3] ?? 0;
        if (
          a > 12 &&
          (Math.max(r, g, b) - Math.min(r, g, b) > 8 || Math.max(r, g, b) > 32)
        ) {
          nonblankPixels += 1;
        }
      }
      return {
        height,
        nonblankPixels,
        nonblankRatio:
          width * height === 0 ? 0 : nonblankPixels / (width * height),
        width,
      };

      function loadImage(dataUrl: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () =>
            reject(new Error("Could not decode screenshot."));
          image.src = dataUrl;
        });
      }
    },
    {
      screenshotDataUrl: `data:image/png;base64,${screenshot.toString("base64")}`,
    },
  );
}

async function readRetainedSurfaceScrollSignature(
  page: Page,
  surfaceId: string,
) {
  return await page.evaluate((targetSurfaceId) => {
    const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId === targetSurfaceId,
      )
      .sort((left, right) => left.clientRect.y - right.clientRect.y);
    return {
      firstRowId: rows[0]?.rowId ?? null,
      firstRowY: rows[0] ? Math.round(rows[0].clientRect.y * 10) / 10 : null,
      lastRowId: rows.at(-1)?.rowId ?? null,
      rowCount: rows.length,
    };
  }, surfaceId);
}

function normalizeClip(rect: Rect): Rect {
  return {
    height: Math.max(1, Math.floor(rect.height)),
    width: Math.max(1, Math.floor(rect.width)),
    x: Math.max(0, Math.floor(rect.x)),
    y: Math.max(0, Math.floor(rect.y)),
  };
}

async function centerRetainedSurface(
  page: Page,
  surfaceId: string,
): Promise<void> {
  await page.evaluate(async (targetSurfaceId) => {
    const pane = document.querySelector<HTMLElement>(".setta-gpu-flow__pane");
    const transform =
      window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport.transform;
    const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId === targetSurfaceId,
      )
      .sort((left, right) => left.clientRect.y - right.clientRect.y);
    const firstRow = rows[0];
    if (!pane || !transform || !firstRow) {
      throw new Error(`Missing retained surface ${targetSurfaceId}.`);
    }
    const paneRect = pane.getBoundingClientRect();
    const left = Math.min(...rows.map((row) => row.clientRect.x));
    const top = Math.min(...rows.map((row) => row.clientRect.y));
    const bottom = Math.max(
      ...rows.map((row) => row.clientRect.y + row.clientRect.height),
    );
    const flowLeft = (left - paneRect.left - transform.x) / transform.zoom;
    const flowTop = (top - paneRect.top - transform.y) / transform.zoom;
    const flowHeight = Math.max(
      firstRow.canvasCssSize.height,
      (bottom - top) / transform.zoom,
    );
    const zoom = 1;
    const { setViewport } = await import("/src/gpuFlow/viewportActions.ts");
    const { gpuFlowViewportStore } = await import(
      "/src/gpuFlow/viewportStore.ts"
    );
    setViewport(
      {
        x:
          paneRect.width * 0.5 -
          (flowLeft + firstRow.canvasCssSize.width / 2) * zoom,
        y: paneRect.height * 0.48 - (flowTop + flowHeight / 2) * zoom,
        zoom,
      },
      { store: gpuFlowViewportStore },
    );
    gpuFlowViewportStore.getState().setFitViewInitializationState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
    });
  }, surfaceId);
  await waitForAnimationFrame(page);
  await waitForAnimationFrame(page);
}

async function scrollRetainedSurfaceToTop(
  page: Page,
  surfaceId: string,
): Promise<void> {
  const point = await resolveRetainedSurfaceWheelPoint(page, surfaceId);
  await page.mouse.move(point.x, point.y);
  for (let index = 0; index < 20; index += 1) {
    await page.mouse.wheel(0, -240);
  }
  await waitForAnimationFrame(page);
  await waitForAnimationFrame(page);
}

async function scrollRetainedSurfaceUntilRowVisible(
  page: Page,
): Promise<RetainedRowDebugEntry> {
  for (let step = 0; step < 80; step += 1) {
    const row = await resolveVisibleTargetRow(page);
    if (row) {
      return row;
    }
    const point = await resolveRetainedSurfaceWheelPoint(
      page,
      TEXT_ROW_TARGET.surfaceId,
    );
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, 120);
    await waitForAnimationFrame(page);
  }
  throw new Error(
    `Could not scroll retained row ${TEXT_ROW_TARGET.rowId} into view.`,
  );
}

async function resolveVisibleTargetRow(
  page: Page,
): Promise<RetainedRowDebugEntry | null> {
  return await page.evaluate((target) => {
    const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId === target.surfaceId &&
          row.rowId === target.rowId &&
          row.controlKind === "text-like" &&
          row.controlClientPoint !== null &&
          row.controlClientRect !== null &&
          row.canvasSamplePoint.x >= 0 &&
          row.canvasSamplePoint.y >= 0 &&
          row.canvasSamplePoint.x < row.canvasCssSize.width &&
          row.canvasSamplePoint.y < row.canvasCssSize.height &&
          row.controlClientRect.width > 8 &&
          row.controlClientRect.height > 8,
      )
      .filter((row) => rectIntersectsViewport(row.controlClientRect));
    return rows[0] ?? null;

    function rectIntersectsViewport(rect: Rect | null): boolean {
      if (!rect) {
        return false;
      }
      return (
        rect.x + rect.width > 0 &&
        rect.y + rect.height > 0 &&
        rect.x < window.innerWidth &&
        rect.y < window.innerHeight
      );
    }
  }, TEXT_ROW_TARGET);
}

async function resolveRetainedSurfaceWheelPoint(page: Page, surfaceId: string) {
  return await page.evaluate((targetSurfaceId) => {
    const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId === targetSurfaceId &&
          row.clientRect.width > 8 &&
          row.clientRect.height > 8 &&
          row.clientRect.x + row.clientRect.width > 0 &&
          row.clientRect.y + row.clientRect.height > 0 &&
          row.clientRect.x < window.innerWidth &&
          row.clientRect.y < window.innerHeight,
      )
      .sort((left, right) => left.clientRect.y - right.clientRect.y);
    if (rows.length === 0) {
      throw new Error(
        `Missing visible retained surface rows ${targetSurfaceId}.`,
      );
    }
    const row = rows[Math.floor(rows.length / 2)] ?? rows[0];
    return {
      x: Math.min(
        window.innerWidth - 4,
        Math.max(4, row.clientRect.x + row.clientRect.width * 0.65),
      ),
      y: Math.min(
        window.innerHeight - 4,
        Math.max(4, row.clientRect.y + row.clientRect.height / 2),
      ),
    };
  }, surfaceId);
}

async function readRetainedRowCount(page: Page): Promise<number> {
  return await page.evaluate(
    () => window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.().length ?? 0,
  );
}

async function readGpuFlowNodeLayerFrameCount(page: Page): Promise<number> {
  return (await readGpuFlowPerformanceSnapshot(page)).nodeLayerFrames.length;
}
