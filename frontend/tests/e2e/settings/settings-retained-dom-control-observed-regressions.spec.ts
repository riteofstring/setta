import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  SETTINGS_PARAM_CONTENT_SUFFIX,
  centerRetainedCompositorSurface,
  dispatchRetainedCompositorWheelBurst,
  openAllSettingsForRetainedCompositor,
  resolveRetainedCompositorTarget,
} from "./settings-retained-compositor-helpers";
import { waitForAnimationFrame } from "./settings-retained-frame-helpers";
import {
  readActiveEditorText,
  waitForViewportIdle,
} from "./settings-retained-pan-zoom-editor-helpers";
import {
  analyzeCodeMirrorTextInkBounds,
  analyzeHorizontalPlaceholderBands,
  type HorizontalPlaceholderBandStats,
  type Rect,
  type RetainedRowDebugEntry,
} from "./settings-retained-visual-analysis";

const SECTION_SIZING_SURFACE_ID =
  "settings-section__sectionSizingPolicy" + SETTINGS_PARAM_CONTENT_SUFFIX;
const TARGET_TEXT_ROW_ID =
  "settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__metaControlByType__TextAreaParam__minHeight";
const ACTIVE_EDITOR_TRACKING_TOLERANCE_PX = 3;

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("focused retained text-like editor follows its owning section during pan and zoom", async ({
  page,
}) => {
  await openObservedRegressionSettings(page);
  const row = await scrollTargetTextRowIntoView(page);
  await activateObservedRetainedEditor(page, row);
  const before = await readActiveEditorTrackingState(page, row.rowId);

  await applyViewportTransformDelta(page, { dx: 64, dy: -38 });
  await waitForAnimationFrame(page);
  const afterPan = await readActiveEditorTrackingState(page, row.rowId);

  await applyViewportTransformDelta(page, { zoomFactor: 1.12 });
  await waitForAnimationFrame(page);
  const afterZoom = await readActiveEditorTrackingState(page, row.rowId);

  const details = JSON.stringify({ afterPan, afterZoom, before, row }, null, 2);
  expect(before.activeEditorId, details).toContain(row.rowId);
  expect(afterPan.activeEditorId, details).toContain(row.rowId);
  expect(afterZoom.activeEditorId, details).toContain(row.rowId);
  expect(
    Math.abs(afterPan.editorRect.x - before.editorRect.x),
    details,
  ).toBeGreaterThan(12);
  expect(
    Math.abs(afterZoom.editorRect.width - afterPan.editorRect.width),
    details,
  ).toBeGreaterThan(4);
  expectTrackingDeltasWithinTolerance(afterPan, details);
  expectTrackingDeltasWithinTolerance(afterZoom, details);
});

test("canvas-first retained text-like values remain visible before click after section scroll", async ({
  page,
}, testInfo) => {
  await openObservedRegressionSettings(page);
  const row = await scrollTargetTextRowIntoView(page);
  const clip = await resolveControlClip(page, row);
  const beforeFrame = await screenshotClip({
    name: "dom-control-before-click-after-scroll.png",
    page,
    rect: clip,
    testInfo,
  });
  const beforeInk = await analyzeCodeMirrorTextInkBounds(page, {
    clip,
    screenshot: beforeFrame,
    searchRect: row.controlClientRect ?? clip,
  });

  await page.mouse.click(row.controlClientPoint!.x, row.controlClientPoint!.y);
  await waitForAnimationFrame(page);
  const afterFrame = await screenshotClip({
    name: "dom-control-after-click.png",
    page,
    rect: clip,
    testInfo,
  });
  const afterInk = await analyzeCodeMirrorTextInkBounds(page, {
    clip,
    screenshot: afterFrame,
    searchRect: row.controlClientRect ?? clip,
  });
  const details = JSON.stringify({ afterInk, beforeInk, clip, row }, null, 2);

  expect(beforeInk?.pixelCount ?? 0, details).toBeGreaterThan(0);
  expect(afterInk?.pixelCount ?? 0, details).toBeGreaterThan(0);
  expect(afterInk?.pixelCount ?? 0, details).toBeLessThanOrEqual(
    Math.max(8, (beforeInk?.pixelCount ?? 0) * 5),
  );
});

test("clicking a retained text-like value does not blank surrounding retained content", async ({
  page,
}, testInfo) => {
  await openObservedRegressionSettings(page);
  const row = await scrollTargetTextRowIntoView(page);
  const target = await resolveRetainedCompositorTarget(
    page,
    SECTION_SIZING_SURFACE_ID,
  );
  const before = await capturePlaceholderStats({
    clip: target.clip,
    name: "dom-control-click-surrounding-before.png",
    page,
    testInfo,
  });

  const frames: Array<{
    readonly name: string;
    readonly stats: HorizontalPlaceholderBandStats;
  }> = [];
  await page.mouse.click(row.controlClientPoint!.x, row.controlClientPoint!.y);
  for (let index = 0; index < 6; index += 1) {
    await waitForAnimationFrame(page);
    frames.push(
      await capturePlaceholderStats({
        clip: target.clip,
        name: `dom-control-click-surrounding-${index}.png`,
        page,
        testInfo,
      }),
    );
  }

  const details = JSON.stringify({ before, frames, row, target }, null, 2);
  expect(before.stats.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(
    frames.filter((frame) => frame.stats.highConfidencePlaceholder),
    details,
  ).toEqual([]);
  expect(
    Math.min(...frames.map((frame) => frame.stats.nonblankRatio)),
    details,
  ).toBeGreaterThan(before.stats.nonblankRatio * 0.55);
});

test("retained text-like interaction keeps passive DOM scale bounded", async ({
  page,
}) => {
  await openObservedRegressionSettings(page);
  let row = await scrollTargetTextRowIntoView(page);
  await activateObservedRetainedEditor(page, row);
  const editorText = await readActiveEditorText(page);
  await page.mouse.click(row.controlClientPoint.x, row.controlClientPoint.y);
  await page.keyboard.press(selectAllShortcut());
  await page.keyboard.insertText(editorText);
  await waitForViewportIdle(page);
  const beforeCounts = await readDomControlScale(
    page,
    SECTION_SIZING_SURFACE_ID,
  );

  row = await resolveVisibleTextLikeRow(page, SECTION_SIZING_SURFACE_ID, {
    rowId: row.rowId,
  });
  const eventSpacing = await dispatchRetainedCompositorWheelBurst(page, {
    deltaY: 3,
    eventCount: 16,
    point: retainedRowSectionScrollPoint(row),
  });
  await waitForViewportIdle(page);
  const afterCounts = await readDomControlScale(
    page,
    SECTION_SIZING_SURFACE_ID,
  );
  const details = JSON.stringify(
    { afterCounts, beforeCounts, eventSpacing },
    null,
    2,
  );

  expectMountedDomControlsBounded(beforeCounts, details);
  expectMountedDomControlsBounded(afterCounts, details);
  expect(eventSpacing.length, details).toBeGreaterThan(6);
});

async function openObservedRegressionSettings(page: Page): Promise<void> {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page, SECTION_SIZING_SURFACE_ID);
  await page.addStyleTag({
    content: ".cm-cursor,.cm-cursorLayer{opacity:0!important}",
  });
}

function expectMountedDomControlsBounded(
  counts: Awaited<ReturnType<typeof readDomControlScale>>,
  details: string,
) {
  expect(counts.totalSurfaceLogicalRowCount, details).toBeGreaterThan(100);
  expect(counts.mountedControlCount, details).toBeLessThan(
    counts.totalSurfaceLogicalRowCount,
  );
  expect(counts.mountedControlCount, details).toBeLessThanOrEqual(
    counts.visibleControlRectCount + 8,
  );
}

async function activateObservedRetainedEditor(
  page: Page,
  row: RetainedRowDebugEntry & {
    readonly controlClientPoint: { readonly x: number; readonly y: number };
    readonly controlClientRect: Rect;
  },
): Promise<void> {
  const hostBox = await readDomControlHostRect(page, row);
  const attempts = [
    row.controlClientPoint,
    hostBox
      ? {
          x: hostBox.x + hostBox.width / 2,
          y: hostBox.y + hostBox.height / 2,
        }
      : null,
    {
      x:
        row.controlClientRect.x + Math.min(48, row.controlClientRect.width / 3),
      y: row.controlClientRect.y + row.controlClientRect.height / 2,
    },
  ].filter((point): point is { readonly x: number; readonly y: number } =>
    Boolean(point),
  );
  for (const point of attempts) {
    await page.mouse.click(point.x, point.y);
    try {
      await expect
        .poll(() => readActiveCodeMirrorId(page), { timeout: 2_000 })
        .toContain(row.rowId);
      return;
    } catch {
      await waitForAnimationFrame(page);
    }
  }
  throw new Error(
    `Could not activate retained text-like editor: ${JSON.stringify(
      await readDomControlActivationDiagnostics(page, row),
      null,
      2,
    )}`,
  );
}

async function readDomControlHostRect(
  page: Page,
  row: RetainedRowDebugEntry,
): Promise<Rect | null> {
  return await page.evaluate(({ rowId, surfaceId }) => {
    const selector = [
      "[data-gpu-flow-dom-control='true']",
      `[data-gpu-flow-dom-control-surface-id='${cssEscape(surfaceId)}']`,
      `[data-gpu-flow-dom-control-row-id='${cssEscape(rowId)}']`,
    ].join("");
    const host = document.querySelector<HTMLElement>(selector);
    if (!host) {
      return null;
    }
    const rect = host.getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    };

    function cssEscape(value: string): string {
      return value.replace(/['\\]/g, "\\$&");
    }
  }, row);
}

async function scrollTargetTextRowIntoView(page: Page): Promise<
  RetainedRowDebugEntry & {
    readonly controlClientPoint: { readonly x: number; readonly y: number };
    readonly controlClientRect: Rect;
  }
> {
  let fallbackRow:
    | (RetainedRowDebugEntry & {
        readonly controlClientPoint: { readonly x: number; readonly y: number };
        readonly controlClientRect: Rect;
      })
    | null = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const row = await findVisibleTextLikeRow(page, SECTION_SIZING_SURFACE_ID, {
      rowId: TARGET_TEXT_ROW_ID,
    });
    if (row) {
      return row;
    }
    if (attempt > 8) {
      fallbackRow ??= await findVisibleTextLikeRow(
        page,
        SECTION_SIZING_SURFACE_ID,
      );
      if (fallbackRow) {
        return fallbackRow;
      }
    }
    const point = await resolveSurfaceScrollPoint(
      page,
      SECTION_SIZING_SURFACE_ID,
    );
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, attempt < 10 ? -180 : 120);
    await waitForAnimationFrame(page);
  }
  return await resolveVisibleTextLikeRow(page, SECTION_SIZING_SURFACE_ID);
}

async function readActiveCodeMirrorId(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof Element)) {
      return null;
    }
    return (
      activeElement
        .closest("[data-gpu-flow-control]")
        ?.getAttribute("data-gpu-flow-control") ?? null
    );
  });
}

async function readDomControlActivationDiagnostics(
  page: Page,
  row: RetainedRowDebugEntry,
): Promise<unknown> {
  return await page.evaluate(({ rowId, surfaceId }) => {
    const selector = [
      "[data-gpu-flow-dom-control='true']",
      `[data-gpu-flow-dom-control-surface-id='${cssEscape(surfaceId)}']`,
      `[data-gpu-flow-dom-control-row-id='${cssEscape(rowId)}']`,
    ].join("");
    const host = document.querySelector<HTMLElement>(selector);
    const activeElement = document.activeElement;
    const planeDiagnostics =
      (
        window as typeof window & {
          __settaGpuFlowDomControlPlaneDiagnostics?: () => unknown;
        }
      ).__settaGpuFlowDomControlPlaneDiagnostics?.() ?? null;
    return {
      activeElement: summarizeElement(activeElement),
      activeGpuFlowControl:
        activeElement instanceof Element
          ? activeElement
              .closest("[data-gpu-flow-control]")
              ?.getAttribute("data-gpu-flow-control") ?? null
          : null,
      elementAtControlPoint: summarizeElement(
        document.elementFromPoint(
          host?.getBoundingClientRect().x ?? 0,
          host?.getBoundingClientRect().y ?? 0,
        ),
      ),
      host: summarizeElement(host),
      hostDataset:
        host === null
          ? null
          : {
              active: host.dataset.gpuFlowDomControlActive ?? null,
              controlId: host.dataset.gpuFlowDomControlId ?? null,
              rowId: host.dataset.gpuFlowDomControlRowId ?? null,
              surfaceId: host.dataset.gpuFlowDomControlSurfaceId ?? null,
            },
      hostSamples: [
        ...document.querySelectorAll<HTMLElement>(
          "[data-gpu-flow-dom-control='true']",
        ),
      ]
        .filter(
          (candidate) =>
            candidate.dataset.gpuFlowDomControlSurfaceId === surfaceId,
        )
        .slice(0, 12)
        .map((candidate) => ({
          active: candidate.dataset.gpuFlowDomControlActive ?? null,
          rowId: candidate.dataset.gpuFlowDomControlRowId ?? null,
          textLength: candidate.textContent?.length ?? 0,
        })),
      planeDiagnostics,
      selector,
    };

    function summarizeElement(element: Element | null): unknown {
      if (!(element instanceof HTMLElement)) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        className: element.className,
        dataset: {
          gpuFlowControl: element.dataset.gpuFlowControl ?? null,
          gpuFlowDomControl: element.dataset.gpuFlowDomControl ?? null,
          gpuFlowDomControlActive:
            element.dataset.gpuFlowDomControlActive ?? null,
          gpuFlowInteractive: element.dataset.gpuFlowInteractive ?? null,
        },
        id: element.id,
        rect: {
          height: rect.height,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        },
        tagName: element.tagName,
      };
    }

    function cssEscape(value: string): string {
      return value.replace(/['\\]/g, "\\$&");
    }
  }, row);
}

async function resolveVisibleTextLikeRow(
  page: Page,
  surfaceId: string,
  options: { readonly rowId?: string | undefined } = {},
): Promise<
  RetainedRowDebugEntry & {
    readonly controlClientPoint: { readonly x: number; readonly y: number };
    readonly controlClientRect: Rect;
  }
> {
  const row = await findVisibleTextLikeRow(page, surfaceId, options);
  if (!row) {
    throw new Error(
      `Missing visible retained text-like row ${options.rowId ?? ""} for ${surfaceId}.`,
    );
  }
  return row;
}

async function findVisibleTextLikeRow(
  page: Page,
  surfaceId: string,
  options: { readonly rowId?: string | undefined } = {},
): Promise<
  | (RetainedRowDebugEntry & {
      readonly controlClientPoint: { readonly x: number; readonly y: number };
      readonly controlClientRect: Rect;
    })
  | null
> {
  return await page.evaluate(
    ({ rowId, surfaceId }) => {
      const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
        .filter(
          (
            row,
          ): row is RetainedRowDebugEntry & {
            readonly controlClientPoint: {
              readonly x: number;
              readonly y: number;
            };
            readonly controlClientRect: Rect;
          } =>
            row.surfaceId === surfaceId &&
            (!rowId || row.rowId === rowId) &&
            row.controlKind === "text-like" &&
            row.controlClientPoint !== null &&
            row.controlClientRect !== null &&
            row.controlClientRect.width > 8 &&
            row.controlClientRect.height > 8 &&
            rectIntersectsUsableViewport(row.controlClientRect),
        )
        .sort(
          (left, right) => left.controlClientRect.y - right.controlClientRect.y,
        );
      return rows[0] ?? null;

      function rectIntersectsUsableViewport(rect: Rect): boolean {
        return (
          rect.x + rect.width > 0 &&
          rect.y + rect.height > 48 &&
          rect.x < window.innerWidth &&
          rect.y < window.innerHeight - 88
        );
      }
    },
    { rowId: options.rowId, surfaceId },
  );
}

async function resolveSurfaceScrollPoint(
  page: Page,
  surfaceId: string,
): Promise<{ readonly x: number; readonly y: number }> {
  return await page.evaluate((surfaceId) => {
    const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId === surfaceId &&
          row.clientRect.width > 8 &&
          row.clientRect.height > 8 &&
          row.clientRect.x + row.clientRect.width > 0 &&
          row.clientRect.y + row.clientRect.height > 0 &&
          row.clientRect.x < window.innerWidth &&
          row.clientRect.y < window.innerHeight,
      )
      .sort((left, right) => left.clientRect.y - right.clientRect.y);
    const row = rows[Math.floor(rows.length / 2)] ?? rows[0];
    if (!row) {
      throw new Error(`Missing visible retained rows for ${surfaceId}.`);
    }
    return {
      x: row.clientRect.x + row.clientRect.width * 0.32,
      y: row.clientRect.y + row.clientRect.height / 2,
    };
  }, surfaceId);
}

function retainedRowSectionScrollPoint(row: RetainedRowDebugEntry): {
  readonly x: number;
  readonly y: number;
} {
  return row.labelClientPoint;
}

async function applyViewportTransformDelta(
  page: Page,
  delta: {
    readonly dx?: number | undefined;
    readonly dy?: number | undefined;
    readonly zoomFactor?: number | undefined;
  },
): Promise<void> {
  await page.evaluate(async (delta) => {
    const snapshot = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.();
    const transform = snapshot?.viewport.transform;
    if (!transform) {
      throw new Error("Missing GPU flow viewport transform.");
    }
    const { gpuFlowViewportStore } = await import(
      "/src/gpuFlow/viewportStore.ts"
    );
    const nextZoom = transform.zoom * (delta.zoomFactor ?? 1);
    gpuFlowViewportStore.getState().setTransform({
      x: transform.x + (delta.dx ?? 0),
      y: transform.y + (delta.dy ?? 0),
      zoom: nextZoom,
    });
    window.settaGpuFlowZoom = nextZoom;
  }, delta);
}

async function readActiveEditorTrackingState(
  page: Page,
  rowId: string,
): Promise<{
  readonly activeEditorId: string | null;
  readonly editorRect: Rect;
  readonly heightDelta: number;
  readonly rowControlRect: Rect;
  readonly widthDelta: number;
  readonly xDelta: number;
  readonly yDelta: number;
}> {
  return await page.evaluate((rowId) => {
    const activeElement = document.activeElement;
    const activeEditor =
      activeElement instanceof Element
        ? activeElement.closest(".cm-editor")
        : null;
    const activeEditorId =
      activeElement instanceof Element
        ? activeElement
            .closest("[data-gpu-flow-control]")
            ?.getAttribute("data-gpu-flow-control") ?? null
        : null;
    const row = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []).find(
      (candidate) => candidate.rowId === rowId,
    );
    if (!activeEditor || !row?.controlClientRect) {
      throw new Error(`Missing active editor tracking state for ${rowId}.`);
    }
    const editorRect = toPlainRect(activeEditor.getBoundingClientRect());
    const rowControlRect = row.controlClientRect;
    return {
      activeEditorId,
      editorRect,
      heightDelta: editorRect.height - rowControlRect.height,
      rowControlRect,
      widthDelta: editorRect.width - rowControlRect.width,
      xDelta: editorRect.x - rowControlRect.x,
      yDelta: editorRect.y - rowControlRect.y,
    };

    function toPlainRect(rect: DOMRect): Rect {
      return {
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      };
    }
  }, rowId);
}

function expectTrackingDeltasWithinTolerance(
  state: Awaited<ReturnType<typeof readActiveEditorTrackingState>>,
  details: string,
): void {
  expect(Math.abs(state.xDelta), details).toBeLessThanOrEqual(
    ACTIVE_EDITOR_TRACKING_TOLERANCE_PX,
  );
  expect(Math.abs(state.yDelta), details).toBeLessThanOrEqual(
    ACTIVE_EDITOR_TRACKING_TOLERANCE_PX + 6,
  );
  expect(Math.abs(state.widthDelta), details).toBeLessThanOrEqual(
    ACTIVE_EDITOR_TRACKING_TOLERANCE_PX,
  );
  expect(Math.abs(state.heightDelta), details).toBeLessThanOrEqual(
    ACTIVE_EDITOR_TRACKING_TOLERANCE_PX + 6,
  );
}

async function resolveControlClip(
  page: Page,
  row: RetainedRowDebugEntry & { readonly controlClientRect: Rect },
): Promise<Rect> {
  return await page.evaluate((rect) => {
    const width = Math.min(
      Math.max(1, Math.floor(rect.width)),
      Math.max(1, window.innerWidth - 1),
    );
    const height = Math.min(
      Math.max(1, Math.floor(rect.height)),
      Math.max(1, window.innerHeight - 1),
    );
    return {
      height,
      width,
      x: Math.min(
        Math.max(0, Math.floor(rect.x)),
        Math.max(0, window.innerWidth - width),
      ),
      y: Math.min(
        Math.max(0, Math.floor(rect.y)),
        Math.max(0, window.innerHeight - height),
      ),
    };
  }, row.controlClientRect);
}

async function screenshotClip({
  name,
  page,
  rect,
  testInfo,
}: {
  readonly name: string;
  readonly page: Page;
  readonly rect: Rect;
  readonly testInfo: TestInfo;
}): Promise<Buffer> {
  const screenshot = await page.screenshot({
    clip: rect,
    path: testInfo.outputPath(name),
  });
  await testInfo.attach(name, {
    body: screenshot,
    contentType: "image/png",
  });
  return screenshot;
}

async function capturePlaceholderStats({
  clip,
  name,
  page,
  testInfo,
}: {
  readonly clip: Rect;
  readonly name: string;
  readonly page: Page;
  readonly testInfo: TestInfo;
}): Promise<{
  readonly name: string;
  readonly stats: HorizontalPlaceholderBandStats;
}> {
  const screenshot = await screenshotClip({ name, page, rect: clip, testInfo });
  return {
    name,
    stats: await analyzeHorizontalPlaceholderBands(page, { screenshot }),
  };
}

async function readDomControlScale(
  page: Page,
  surfaceId: string,
): Promise<{
  readonly mountedControlCount: number;
  readonly planeDiagnostics: unknown;
  readonly totalSurfaceLogicalRowCount: number;
  readonly visibleControlRectCount: number;
  readonly visibleTextLikeRowCount: number;
}> {
  return await page.evaluate((surfaceId) => {
    const planeDiagnostics =
      (
        window as typeof window & {
          __settaGpuFlowDomControlPlaneDiagnostics?: () => {
            readonly mountedControlCount: number;
            readonly visibleControlRectCount: number;
          };
        }
      ).__settaGpuFlowDomControlPlaneDiagnostics?.() ?? null;
    const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
    const textLikeRows = rows.filter(
      (row) => row.surfaceId === surfaceId && row.controlKind === "text-like",
    );
    const visibleTextLikeRows = textLikeRows.filter(
      (row) =>
        row.controlClientRect !== null &&
        row.controlClientRect.x + row.controlClientRect.width > 0 &&
        row.controlClientRect.y + row.controlClientRect.height > 0 &&
        row.controlClientRect.x < window.innerWidth &&
        row.controlClientRect.y < window.innerHeight,
    );
    return {
      mountedControlCount:
        planeDiagnostics?.mountedControlCount ??
        document.querySelectorAll("[data-gpu-flow-dom-control='true']").length,
      planeDiagnostics,
      totalSurfaceLogicalRowCount: Math.max(
        0,
        ...rows
          .filter((row) => row.surfaceId === surfaceId)
          .map((row) => row.surfaceLogicalRowCount),
      ),
      visibleControlRectCount: planeDiagnostics?.visibleControlRectCount ?? 0,
      visibleTextLikeRowCount: visibleTextLikeRows.length,
    };
  }, surfaceId);
}

function selectAllShortcut(): string {
  return process.platform === "darwin" ? "Meta+A" : "Control+A";
}
