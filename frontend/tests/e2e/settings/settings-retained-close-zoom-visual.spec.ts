import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const SETTINGS_PARAM_CONTENT_SUFFIX = ":param-content:unpinned";

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

type Rect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

type Bounds = Rect & {
  readonly bottom: number;
  readonly right: number;
};

type RetainedRowDebugEntry = {
  readonly clientRect: Rect;
  readonly controlClientPoint: {
    readonly x: number;
    readonly y: number;
  } | null;
  readonly controlKind: string | null;
  readonly labelClientPoint: {
    readonly x: number;
    readonly y: number;
  };
  readonly rowId: string;
  readonly rowLabel: string;
  readonly surfaceId: string;
};

type RetainedContentZoomTarget = {
  readonly rowId: string;
  readonly rowLabel: string;
  readonly screenPoint: { readonly x: number; readonly y: number };
  readonly surfaceId: string;
};

type RetainedContentPatch = {
  readonly row: {
    readonly rowId: string;
    readonly rowLabel: string;
    readonly surfaceId: string;
  };
  readonly screenClip: Rect;
  readonly zoom: number;
};

type RetainedContentVisibilityState = {
  readonly rowCount: number;
  readonly targetRowVisible: boolean | null;
  readonly unoccludedBounds: Bounds;
  readonly visibleRowCount: number;
  readonly visibleRows: ReadonlyArray<{
    readonly clientRect: Rect;
    readonly controlClientPoint: {
      readonly x: number;
      readonly y: number;
    } | null;
    readonly controlKind: string | null;
    readonly labelClientPoint: {
      readonly x: number;
      readonly y: number;
    };
    readonly rowId: string;
    readonly rowLabel: string;
    readonly surfaceId: string;
  }>;
  readonly zoom: number;
};

type VisualContentStats = {
  readonly contrastPixelCount: number;
  readonly contrastPixelRatio: number;
  readonly height: number;
  readonly luminanceRange: number;
  readonly meanContrast: number;
  readonly pixelCount: number;
  readonly width: number;
};

type VisualSurfaceDebugEntry = {
  readonly clientRect: Rect;
  readonly flowRect: Rect;
  readonly kind: string;
  readonly surfaceId: string;
  readonly zIndex: number;
};

type VisualSurfaceState = {
  readonly flatSurfaceCount: number;
  readonly intersectingSurfaces: readonly VisualSurfaceDebugEntry[];
  readonly lateFlatSurfaceCount: number;
  readonly nearestSurfaces: readonly VisualSurfaceDebugEntry[];
  readonly totalSurfaceCount: number;
};

type RetainedTextureFrameSample = {
  readonly frame: number;
  readonly frameReasons: readonly string[];
  readonly retainedTexturePageBudgetExhausted: boolean;
  readonly retainedTexturePageDrawQuadCount: number;
  readonly retainedTexturePageCompatibleDrawQuadCount: number;
  readonly retainedTexturePageMemoryCommittedCount: number;
  readonly retainedTexturePageMemoryRetiredBytes: number;
  readonly retainedTexturePageMemoryRetiredCount: number;
  readonly retainedTexturePageRefinementPageCount: number;
  readonly retainedTexturePageTrueHoleRectCount: number;
  readonly retainedTexturePageUploadedDrawCommandCount: number;
  readonly retainedTexturePageUploadCount: number;
  readonly viewportZoom: number;
};

test("settings close zoom paints retained section content", async ({
  page,
}, testInfo) => {
  await installGpuFrameProbe(page);
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  await openAllSettings(page);

  const zoomTarget = await resolveCloseZoomTarget(page);
  await performCloseZoom(page, zoomTarget.screenPoint);
  await page.waitForTimeout(240);

  const visibilityState = await readRetainedContentVisibilityState(
    page,
    zoomTarget,
  );
  const visibilityFailureDetails = JSON.stringify(visibilityState, null, 2);
  expect(visibilityState.zoom, visibilityFailureDetails).toBeGreaterThan(4);
  expect(
    visibilityState.visibleRowCount,
    visibilityFailureDetails,
  ).toBeGreaterThan(0);
  expect(visibilityState.targetRowVisible, visibilityFailureDetails).toBe(true);

  const paneScreenshot = await page
    .locator(READY_SELECTOR)
    .first()
    .screenshot({
      path: testInfo.outputPath("settings-close-zoom-pane.png"),
    });
  await attachScreenshot(
    testInfo,
    "settings-close-zoom-pane.png",
    paneScreenshot,
  );

  const patch = await resolveZoomedRetainedContentPatch(page, zoomTarget);
  const contentScreenshot = await page.screenshot({
    clip: patch.screenClip,
    path: testInfo.outputPath("settings-close-zoom-retained-content.png"),
  });
  await attachScreenshot(
    testInfo,
    "settings-close-zoom-retained-content.png",
    contentScreenshot,
  );
  const screenStats = await analyzeScreenshotContent(page, contentScreenshot);
  const retainedFrameSamples = await readGpuFrameProbe(page);
  const visualSurfaceState = await readVisualSurfaceState(
    page,
    patch.screenClip,
  );
  const failureDetails = JSON.stringify(
    {
      patch,
      retainedFrameSamples,
      screenStats,
      visibilityState,
      visualSurfaceState,
      zoomTarget,
    },
    null,
    2,
  );

  expect(screenStats.contrastPixelRatio, failureDetails).toBeGreaterThan(0.01);
  expect(screenStats.luminanceRange, failureDetails).toBeGreaterThan(28);
});

test("settings zoomed-out retained section content stays visible before hover", async ({
  page,
}, testInfo) => {
  await installGpuFrameProbe(page);
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  await openAllSettings(page);

  const zoomTarget = await resolveCloseZoomTarget(page);
  await performZoomOut(page, zoomTarget.screenPoint);
  await expect.poll(() => readViewportZoom(page)).toBeLessThan(0.51);

  const visibilityState = await readRetainedContentVisibilityState(
    page,
    zoomTarget,
  );
  const patch = await resolveScreenPointRetainedContentPatch(page, zoomTarget);
  const contentScreenshot = await page.screenshot({
    clip: patch.screenClip,
    path: testInfo.outputPath("settings-zoomed-out-retained-content.png"),
  });
  await attachScreenshot(
    testInfo,
    "settings-zoomed-out-retained-content.png",
    contentScreenshot,
  );
  const screenStats = await analyzeScreenshotContent(page, contentScreenshot);
  const retainedFrameSamples = await readGpuFrameProbe(page);
  const zoomedOutFrameSamples = retainedFrameSamples.filter(
    (sample) => sample.viewportZoom < 0.51,
  );
  const retainedContentDrawn = zoomedOutFrameSamples.some(
    (sample) => sample.retainedTexturePageDrawQuadCount > 0,
  );
  const visualSurfaceState = await readVisualSurfaceState(
    page,
    patch.screenClip,
  );
  const failureDetails = JSON.stringify(
    {
      patch,
      retainedFrameSamples,
      screenStats,
      visibilityState,
      visualSurfaceState,
      zoomTarget,
      zoomedOutFrameSamples,
    },
    null,
    2,
  );

  expect(retainedContentDrawn, failureDetails).toBe(true);
  expect(screenStats.contrastPixelRatio, failureDetails).toBeGreaterThan(0.002);
  expect(screenStats.luminanceRange, failureDetails).toBeGreaterThan(20);
});

async function installGpuFrameProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const retainedFrameSamples: RetainedTextureFrameSample[] = [];
    const probe = {
      getFrames() {
        return retainedFrameSamples;
      },
      recordNodeLayerFrame(event: {
        readonly frame: number;
        readonly frameReasons: readonly string[];
        readonly retainedTexturePageBudgetExhausted: boolean;
        readonly retainedTexturePageDrawQuadCount: number;
        readonly retainedTexturePageCompatibleDrawQuadCount: number;
        readonly retainedTexturePageMemoryCommittedCount: number;
        readonly retainedTexturePageMemoryRetiredBytes: number;
        readonly retainedTexturePageMemoryRetiredCount: number;
        readonly retainedTexturePageRefinementPageCount: number;
        readonly retainedTexturePageTrueHoleRectCount: number;
        readonly retainedTexturePageUploadedDrawCommandCount: number;
        readonly retainedTexturePageUploadCount: number;
        readonly viewport: { readonly zoom: number };
      }) {
        retainedFrameSamples.push({
          frame: event.frame,
          frameReasons: [...event.frameReasons],
          retainedTexturePageBudgetExhausted:
            event.retainedTexturePageBudgetExhausted,
          retainedTexturePageDrawQuadCount:
            event.retainedTexturePageDrawQuadCount,
          retainedTexturePageCompatibleDrawQuadCount:
            event.retainedTexturePageCompatibleDrawQuadCount,
          retainedTexturePageMemoryCommittedCount:
            event.retainedTexturePageMemoryCommittedCount,
          retainedTexturePageMemoryRetiredBytes:
            event.retainedTexturePageMemoryRetiredBytes,
          retainedTexturePageMemoryRetiredCount:
            event.retainedTexturePageMemoryRetiredCount,
          retainedTexturePageRefinementPageCount:
            event.retainedTexturePageRefinementPageCount,
          retainedTexturePageTrueHoleRectCount:
            event.retainedTexturePageTrueHoleRectCount,
          retainedTexturePageUploadedDrawCommandCount:
            event.retainedTexturePageUploadedDrawCommandCount,
          retainedTexturePageUploadCount: event.retainedTexturePageUploadCount,
          viewportZoom: event.viewport.zoom,
        });
        if (retainedFrameSamples.length > 80) {
          retainedFrameSamples.shift();
        }
      },
    };
    (
      window as Window & {
        __settaGpuFlowPerformanceProbe?: typeof probe;
      }
    ).__settaGpuFlowPerformanceProbe = probe;
  });
}

async function readGpuFrameProbe(
  page: Page,
): Promise<readonly RetainedTextureFrameSample[]> {
  return await page.evaluate(() => {
    const probe = (
      window as Window & {
        readonly __settaGpuFlowPerformanceProbe?: {
          readonly getFrames?: () => readonly RetainedTextureFrameSample[];
        };
      }
    ).__settaGpuFlowPerformanceProbe;
    return probe?.getFrames?.() ?? [];
  });
}

async function readVisualSurfaceState(
  page: Page,
  screenClip: Rect,
): Promise<VisualSurfaceState> {
  return await page.evaluate((clip) => {
    const surfaces = window.__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__?.() ?? [];
    const clipCenter = {
      x: clip.x + clip.width / 2,
      y: clip.y + clip.height / 2,
    };
    const intersectingSurfaces = surfaces
      .filter((surface) => intersects(surface.clientRect, clip))
      .slice(-24)
      .map((surface) => ({
        clientRect: surface.clientRect,
        flowRect: surface.flowRect,
        kind: surface.kind,
        surfaceId: surface.surfaceId,
        zIndex: surface.zIndex,
      }));
    const nearestSurfaces = [...surfaces]
      .sort(
        (left, right) =>
          surfaceDistanceSquared(left.clientRect, clipCenter) -
          surfaceDistanceSquared(right.clientRect, clipCenter),
      )
      .slice(0, 12)
      .map((surface) => ({
        clientRect: surface.clientRect,
        flowRect: surface.flowRect,
        kind: surface.kind,
        surfaceId: surface.surfaceId,
        zIndex: surface.zIndex,
      }));
    return {
      flatSurfaceCount: surfaces.filter((surface) => surface.kind === "flat")
        .length,
      intersectingSurfaces,
      lateFlatSurfaceCount: surfaces.filter(
        (surface) => surface.kind === "late-flat",
      ).length,
      nearestSurfaces,
      totalSurfaceCount: surfaces.length,
    };

    function intersects(left: Rect, right: Rect) {
      return (
        left.x < right.x + right.width &&
        left.x + left.width > right.x &&
        left.y < right.y + right.height &&
        left.y + left.height > right.y
      );
    }

    function surfaceDistanceSquared(
      rect: Rect,
      point: { readonly x: number; readonly y: number },
    ) {
      const dx =
        point.x < rect.x
          ? rect.x - point.x
          : point.x > rect.x + rect.width
            ? point.x - (rect.x + rect.width)
            : 0;
      const dy =
        point.y < rect.y
          ? rect.y - point.y
          : point.y > rect.y + rect.height
            ? point.y - (rect.y + rect.height)
            : 0;
      return dx * dx + dy * dy;
    }
  }, screenClip);
}

async function openAllSettings(page: Page): Promise<void> {
  const allSettingsTab = page.getByRole("button", {
    exact: true,
    name: "All Settings",
  });
  await expect(allSettingsTab).toBeVisible();
  await page.getByRole("button", { name: "fit view" }).click();
  await allSettingsTab.click();
  await page.waitForFunction(
    () => document.querySelectorAll(".setta-gpu-flow__node").length > 30,
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.().length ?? 0,
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(50);
}

async function resolveCloseZoomTarget(
  page: Page,
): Promise<RetainedContentZoomTarget> {
  return await page.evaluate(
    ({ suffix }) => {
      const bounds = resolveUnoccludedFlowBounds();
      const rows = (
        window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []
      ).filter(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId.endsWith(suffix) &&
          row.rowLabel.trim().length > 0 &&
          row.clientRect.width > 2 &&
          row.clientRect.height > 2 &&
          pointInsideBounds(row.labelClientPoint, bounds) &&
          intersectsBounds(row.clientRect, bounds),
      );
      const center = {
        x: bounds.x + bounds.width * 0.5,
        y: bounds.y + bounds.height * 0.5,
      };
      const candidates = rows
        .map((row) => {
          const visible = intersectRect(row.clientRect, bounds);
          const screenPoint = {
            x: row.labelClientPoint.x,
            y: row.labelClientPoint.y,
          };
          return {
            distance: Math.hypot(
              screenPoint.x - center.x,
              screenPoint.y - center.y,
            ),
            row,
            screenPoint,
            visibleArea: visible.width * visible.height,
          };
        })
        .filter((candidate) => candidate.visibleArea > 4)
        .sort(
          (left, right) =>
            left.distance - right.distance ||
            right.visibleArea - left.visibleArea,
        );
      const candidate = candidates[0];
      if (!candidate) {
        throw new Error("Unable to find a visible retained row to zoom into.");
      }
      return {
        rowId: candidate.row.rowId,
        rowLabel: candidate.row.rowLabel,
        screenPoint: candidate.screenPoint,
        surfaceId: candidate.row.surfaceId,
      };

      function intersectsBounds(rect: Rect, bounds: Bounds) {
        return (
          rect.x < bounds.right &&
          rect.y < bounds.bottom &&
          rect.x + rect.width > bounds.x &&
          rect.y + rect.height > bounds.y
        );
      }

      function pointInsideBounds(
        point: { readonly x: number; readonly y: number },
        bounds: Bounds,
      ) {
        return (
          point.x >= bounds.x &&
          point.x <= bounds.right &&
          point.y >= bounds.y &&
          point.y <= bounds.bottom
        );
      }

      function intersectRect(rect: Rect, bounds: Bounds): Rect {
        const x = Math.max(bounds.x, rect.x);
        const y = Math.max(bounds.y, rect.y);
        const right = Math.min(bounds.right, rect.x + rect.width);
        const bottom = Math.min(bounds.bottom, rect.y + rect.height);
        return {
          height: Math.max(0, bottom - y),
          width: Math.max(0, right - x),
          x,
          y,
        };
      }

      function resolveUnoccludedFlowBounds(): Bounds {
        const canvas = document.querySelector<HTMLElement>(
          ".setta-gpu-flow__canvas",
        );
        const rect = canvas?.getBoundingClientRect();
        const canvasBounds = rect
          ? {
              bottom: rect.bottom,
              height: rect.height,
              right: rect.right,
              width: rect.width,
              x: rect.x,
              y: rect.y,
            }
          : {
              bottom: window.innerHeight,
              height: window.innerHeight,
              right: window.innerWidth,
              width: window.innerWidth,
              x: 0,
              y: 0,
            };
        const occludingLeftEdge = Array.from(
          document.querySelectorAll<HTMLElement>(".setta-gpu-flow__panel"),
        ).reduce((leftEdge, panel) => {
          const panelRect = panel.getBoundingClientRect();
          if (
            panelRect.width <= 0 ||
            panelRect.height <= 0 ||
            panelRect.right <= canvasBounds.x ||
            panelRect.left >=
              canvasBounds.x + (canvasBounds.right - canvasBounds.x) * 0.5 ||
            panelRect.bottom <= canvasBounds.y ||
            panelRect.top >= canvasBounds.bottom
          ) {
            return leftEdge;
          }
          return Math.max(leftEdge, panelRect.right);
        }, canvasBounds.x);
        const x = Math.min(canvasBounds.right - 1, occludingLeftEdge);
        return {
          bottom: canvasBounds.bottom,
          height: Math.max(1, canvasBounds.bottom - canvasBounds.y),
          right: canvasBounds.right,
          width: Math.max(1, canvasBounds.right - x),
          x,
          y: canvasBounds.y,
        };
      }
    },
    { suffix: SETTINGS_PARAM_CONTENT_SUFFIX },
  );
}

async function performCloseZoom(
  page: Page,
  point: { readonly x: number; readonly y: number },
): Promise<void> {
  const modifier = "Control";
  await page.mouse.move(point.x, point.y);
  await page.keyboard.down(modifier);
  try {
    for (let index = 0; index < 320; index += 1) {
      await page.mouse.wheel(0, -5);
      if (index % 12 === 0) {
        await page.waitForTimeout(8);
      }
      if ((await readViewportZoom(page)) >= 4.2) {
        break;
      }
    }
  } finally {
    await page.keyboard.up(modifier);
  }
  await expect.poll(() => readViewportZoom(page)).toBeGreaterThan(4);
}

async function performZoomOut(
  page: Page,
  point: { readonly x: number; readonly y: number },
): Promise<void> {
  const modifier = "Control";
  await page.mouse.move(point.x, point.y);
  await page.keyboard.down(modifier);
  try {
    for (let index = 0; index < 160; index += 1) {
      await page.mouse.wheel(0, 5);
      if (index % 12 === 0) {
        await page.waitForTimeout(8);
      }
      if (index % 4 === 0 && (await readViewportZoom(page)) < 0.51) {
        break;
      }
    }
  } finally {
    await page.keyboard.up(modifier);
  }
}

async function readViewportZoom(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const transform =
      window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport.transform;
    if (!transform) {
      throw new Error("Missing GPU flow debug transform.");
    }
    return transform.zoom;
  });
}

async function readRetainedContentVisibilityState(
  page: Page,
  zoomTarget?: RetainedContentZoomTarget,
): Promise<RetainedContentVisibilityState> {
  return await page.evaluate(
    ({ suffix, target }) => {
      const snapshot = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.();
      const zoom = snapshot?.viewport.transform.zoom;
      if (!zoom) {
        throw new Error("Missing GPU flow zoom.");
      }
      const bounds = resolveUnoccludedFlowBounds();
      const rows = (
        window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []
      ).filter(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId.endsWith(suffix) && row.rowLabel.trim().length > 0,
      );
      const visibleRows = rows.filter((row) => isVisibleRow(row, bounds));
      const targetRow = target
        ? rows.find(
            (row) =>
              row.rowId === target.rowId && row.surfaceId === target.surfaceId,
          )
        : null;
      return {
        rowCount: rows.length,
        targetRowVisible: target
          ? Boolean(targetRow && isVisibleRow(targetRow, bounds))
          : null,
        unoccludedBounds: bounds,
        visibleRowCount: visibleRows.length,
        visibleRows: visibleRows.slice(0, 12).map((row) => ({
          clientRect: row.clientRect,
          controlClientPoint: row.controlClientPoint,
          controlKind: row.controlKind,
          labelClientPoint: row.labelClientPoint,
          rowId: row.rowId,
          rowLabel: row.rowLabel,
          surfaceId: row.surfaceId,
        })),
        zoom,
      };

      function isVisibleRow(row: RetainedRowDebugEntry, bounds: Bounds) {
        return (
          row.clientRect.width > 80 &&
          row.clientRect.height > 24 &&
          row.clientRect.x < bounds.right &&
          row.clientRect.y < bounds.bottom &&
          row.clientRect.x + row.clientRect.width > bounds.x &&
          row.clientRect.y + row.clientRect.height > bounds.y
        );
      }

      function resolveUnoccludedFlowBounds(): Bounds {
        const canvas = document.querySelector<HTMLElement>(
          ".setta-gpu-flow__canvas",
        );
        const rect = canvas?.getBoundingClientRect();
        const canvasBounds = rect
          ? {
              bottom: rect.bottom,
              height: rect.height,
              right: rect.right,
              width: rect.width,
              x: rect.x,
              y: rect.y,
            }
          : {
              bottom: window.innerHeight,
              height: window.innerHeight,
              right: window.innerWidth,
              width: window.innerWidth,
              x: 0,
              y: 0,
            };
        const occludingLeftEdge = Array.from(
          document.querySelectorAll<HTMLElement>(".setta-gpu-flow__panel"),
        ).reduce((leftEdge, panel) => {
          const panelRect = panel.getBoundingClientRect();
          if (
            panelRect.width <= 0 ||
            panelRect.height <= 0 ||
            panelRect.right <= canvasBounds.x ||
            panelRect.left >=
              canvasBounds.x + (canvasBounds.right - canvasBounds.x) * 0.5 ||
            panelRect.bottom <= canvasBounds.y ||
            panelRect.top >= canvasBounds.bottom
          ) {
            return leftEdge;
          }
          return Math.max(leftEdge, panelRect.right);
        }, canvasBounds.x);
        const x = Math.min(canvasBounds.right - 1, occludingLeftEdge);
        return {
          bottom: canvasBounds.bottom,
          height: Math.max(1, canvasBounds.bottom - canvasBounds.y),
          right: canvasBounds.right,
          width: Math.max(1, canvasBounds.right - x),
          x,
          y: canvasBounds.y,
        };
      }
    },
    { suffix: SETTINGS_PARAM_CONTENT_SUFFIX, target: zoomTarget },
  );
}

async function resolveZoomedRetainedContentPatch(
  page: Page,
  zoomTarget?: RetainedContentZoomTarget,
): Promise<RetainedContentPatch> {
  return await page.evaluate(
    ({ suffix, target }) => {
      const snapshot = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.();
      const zoom = snapshot?.viewport.transform.zoom;
      if (!zoom) {
        throw new Error("Missing GPU flow zoom.");
      }
      const bounds = resolveUnoccludedFlowBounds();
      const rows = (
        window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []
      ).filter(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId.endsWith(suffix) &&
          row.rowLabel.trim().length > 0 &&
          pointInsideBounds(row.labelClientPoint, bounds) &&
          row.clientRect.width > 80 &&
          row.clientRect.height > 24 &&
          intersectsBounds(row.clientRect, bounds),
      );
      const targetRows = target
        ? rows.filter(
            (row) =>
              row.rowId === target.rowId && row.surfaceId === target.surfaceId,
          )
        : [];
      const candidates = (targetRows.length > 0 ? targetRows : rows)
        .map((row) => ({
          row,
          visible: intersectRect(row.clientRect, bounds),
        }))
        .filter(
          (candidate) =>
            candidate.visible.width * candidate.visible.height > 3_000,
        )
        .sort(
          (left, right) =>
            right.visible.width * right.visible.height -
            left.visible.width * left.visible.height,
        );
      for (const { row, visible } of candidates) {
        const screenClip = resolveRetainedRowContentClip(row, visible, bounds);
        if (screenClip) {
          return {
            row: {
              rowId: row.rowId,
              rowLabel: row.rowLabel,
              surfaceId: row.surfaceId,
            },
            screenClip,
            zoom,
          };
        }
      }
      throw new Error(
        `Unable to find a visible retained row after close zoom. Candidates: ${candidates
          .slice(0, 8)
          .map(
            ({ row, visible }) =>
              `${row.surfaceId}/${row.rowLabel}/${Math.round(
                visible.width * visible.height,
              )}`,
          )
          .join(", ")}`,
      );

      function resolveRetainedRowContentClip(
        row: RetainedRowDebugEntry,
        visible: Rect,
        bounds: Bounds,
      ): Rect | null {
        const anchor = row.labelClientPoint;
        const x = clamp(
          anchor.x - 110,
          visible.x,
          Math.min(bounds.right - 1, visible.x + visible.width - 1),
        );
        const y = clamp(
          anchor.y - 36,
          visible.y,
          Math.min(bounds.bottom - 1, visible.y + visible.height - 1),
        );
        const width = Math.max(
          1,
          Math.min(220, bounds.right - x, visible.x + visible.width - x),
        );
        const height = Math.max(
          1,
          Math.min(72, bounds.bottom - y, visible.y + visible.height - y),
        );
        if (width < 24 || height < 12) {
          return null;
        }
        return { height, width, x, y };
      }

      function intersectsBounds(rect: Rect, bounds: Bounds) {
        return (
          rect.x < bounds.right &&
          rect.y < bounds.bottom &&
          rect.x + rect.width > bounds.x &&
          rect.y + rect.height > bounds.y
        );
      }

      function pointInsideBounds(
        point: { readonly x: number; readonly y: number },
        bounds: Bounds,
      ) {
        return (
          point.x >= bounds.x &&
          point.x <= bounds.right &&
          point.y >= bounds.y &&
          point.y <= bounds.bottom
        );
      }

      function intersectRect(rect: Rect, bounds: Bounds): Rect {
        const x = Math.max(bounds.x, rect.x);
        const y = Math.max(bounds.y, rect.y);
        const right = Math.min(bounds.right, rect.x + rect.width);
        const bottom = Math.min(bounds.bottom, rect.y + rect.height);
        return {
          height: Math.max(0, bottom - y),
          width: Math.max(0, right - x),
          x,
          y,
        };
      }

      function clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(max, value));
      }

      function resolveUnoccludedFlowBounds(): Bounds {
        const canvas = document.querySelector<HTMLElement>(
          ".setta-gpu-flow__canvas",
        );
        const rect = canvas?.getBoundingClientRect();
        const canvasBounds = rect
          ? {
              bottom: rect.bottom,
              height: rect.height,
              right: rect.right,
              width: rect.width,
              x: rect.x,
              y: rect.y,
            }
          : {
              bottom: window.innerHeight,
              height: window.innerHeight,
              right: window.innerWidth,
              width: window.innerWidth,
              x: 0,
              y: 0,
            };
        const occludingLeftEdge = Array.from(
          document.querySelectorAll<HTMLElement>(".setta-gpu-flow__panel"),
        ).reduce((leftEdge, panel) => {
          const panelRect = panel.getBoundingClientRect();
          if (
            panelRect.width <= 0 ||
            panelRect.height <= 0 ||
            panelRect.right <= canvasBounds.x ||
            panelRect.left >=
              canvasBounds.x + (canvasBounds.right - canvasBounds.x) * 0.5 ||
            panelRect.bottom <= canvasBounds.y ||
            panelRect.top >= canvasBounds.bottom
          ) {
            return leftEdge;
          }
          return Math.max(leftEdge, panelRect.right);
        }, canvasBounds.x);
        const x = Math.min(canvasBounds.right - 1, occludingLeftEdge);
        return {
          bottom: canvasBounds.bottom,
          height: Math.max(1, canvasBounds.bottom - canvasBounds.y),
          right: canvasBounds.right,
          width: Math.max(1, canvasBounds.right - x),
          x,
          y: canvasBounds.y,
        };
      }
    },
    { suffix: SETTINGS_PARAM_CONTENT_SUFFIX, target: zoomTarget },
  );
}

async function resolveScreenPointRetainedContentPatch(
  page: Page,
  zoomTarget: RetainedContentZoomTarget,
): Promise<RetainedContentPatch> {
  return await page.evaluate((target) => {
    const snapshot = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.();
    const zoom = snapshot?.viewport.transform.zoom;
    if (!zoom) {
      throw new Error("Missing GPU flow zoom.");
    }
    const bounds = resolveUnoccludedFlowBounds();
    const clipWidth = Math.min(280, bounds.width);
    const clipHeight = Math.min(140, bounds.height);
    const x = clamp(
      target.screenPoint.x - clipWidth * 0.5,
      bounds.x,
      Math.max(bounds.x, bounds.right - clipWidth),
    );
    const y = clamp(
      target.screenPoint.y - clipHeight * 0.5,
      bounds.y,
      Math.max(bounds.y, bounds.bottom - clipHeight),
    );
    return {
      row: {
        rowId: target.rowId,
        rowLabel: target.rowLabel,
        surfaceId: target.surfaceId,
      },
      screenClip: {
        height: Math.max(1, Math.min(clipHeight, bounds.bottom - y)),
        width: Math.max(1, Math.min(clipWidth, bounds.right - x)),
        x,
        y,
      },
      zoom,
    };

    function clamp(value: number, min: number, max: number) {
      return Math.max(min, Math.min(max, value));
    }

    function resolveUnoccludedFlowBounds(): Bounds {
      const canvas = document.querySelector<HTMLElement>(
        ".setta-gpu-flow__canvas",
      );
      const rect = canvas?.getBoundingClientRect();
      const canvasBounds = rect
        ? {
            bottom: rect.bottom,
            height: rect.height,
            right: rect.right,
            width: rect.width,
            x: rect.x,
            y: rect.y,
          }
        : {
            bottom: window.innerHeight,
            height: window.innerHeight,
            right: window.innerWidth,
            width: window.innerWidth,
            x: 0,
            y: 0,
          };
      const occludingLeftEdge = Array.from(
        document.querySelectorAll<HTMLElement>(".setta-gpu-flow__panel"),
      ).reduce((leftEdge, panel) => {
        const panelRect = panel.getBoundingClientRect();
        if (
          panelRect.width <= 0 ||
          panelRect.height <= 0 ||
          panelRect.right <= canvasBounds.x ||
          panelRect.left >=
            canvasBounds.x + (canvasBounds.right - canvasBounds.x) * 0.5 ||
          panelRect.bottom <= canvasBounds.y ||
          panelRect.top >= canvasBounds.bottom
        ) {
          return leftEdge;
        }
        return Math.max(leftEdge, panelRect.right);
      }, canvasBounds.x);
      const x = Math.min(canvasBounds.right - 1, occludingLeftEdge);
      return {
        bottom: canvasBounds.bottom,
        height: Math.max(1, canvasBounds.bottom - canvasBounds.y),
        right: canvasBounds.right,
        width: Math.max(1, canvasBounds.right - x),
        x,
        y: canvasBounds.y,
      };
    }
  }, zoomTarget);
}

async function analyzeScreenshotContent(
  page: Page,
  screenshot: Buffer,
): Promise<VisualContentStats> {
  const dataUrl = `data:image/png;base64,${screenshot.toString("base64")}`;
  return await page.evaluate(async (url) => {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Failed to decode close-zoom screenshot."));
    });
    image.src = url;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Missing close-zoom screenshot analysis context.");
    }
    ctx.drawImage(image, 0, 0);
    const { data, height, width } = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const luminances: number[] = [];
    for (let index = 0; index < data.length; index += 4) {
      const a = data[index + 3] ?? 0;
      if (a < 64) {
        continue;
      }
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      luminances.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
    return summarizeLuminances(luminances, { height, width });

    function summarizeLuminances(
      luminances: readonly number[],
      size: { readonly height: number; readonly width: number },
    ): VisualContentStats {
      const pixelCount = size.height * size.width;
      if (luminances.length === 0) {
        return {
          contrastPixelCount: 0,
          contrastPixelRatio: 0,
          height: size.height,
          luminanceRange: 0,
          meanContrast: 0,
          pixelCount,
          width: size.width,
        };
      }
      const sorted = [...luminances].sort((left, right) => left - right);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      let contrastPixelCount = 0;
      let contrastTotal = 0;
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (const luminance of luminances) {
        const contrast = Math.abs(luminance - median);
        contrastTotal += contrast;
        min = Math.min(min, luminance);
        max = Math.max(max, luminance);
        if (contrast >= 24) {
          contrastPixelCount += 1;
        }
      }
      return {
        contrastPixelCount,
        contrastPixelRatio:
          pixelCount === 0 ? 0 : contrastPixelCount / pixelCount,
        height: size.height,
        luminanceRange: max - min,
        meanContrast: contrastTotal / luminances.length,
        pixelCount,
        width: size.width,
      };
    }
  }, dataUrl);
}

async function attachScreenshot(
  testInfo: TestInfo,
  name: string,
  screenshot: Buffer,
): Promise<void> {
  await testInfo.attach(name, {
    body: screenshot,
    contentType: "image/png",
  });
}
