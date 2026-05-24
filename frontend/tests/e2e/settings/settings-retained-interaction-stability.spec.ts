import { expect, test, type Page } from "@playwright/test";

import { ensureAppReady, postBackend } from "../helpers";
import {
  analyzeHoverCoverage,
  analyzeScreenshotContent,
} from "./settings-retained-interaction-analysis";
import {
  screenshotClip,
  waitForAnimationFrame,
} from "./settings-retained-visual-regression-helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const GUI_SECTION_ID = "settings-section__gui";
const CORE_SECTION_IDS = new Set([
  "settings-section__backend",
  "settings-section__gui",
  "settings-section__languageServer",
  "settings-section__sectionSizingPolicy",
  "settings-section__shortcuts",
]);
const GUI_CONTENT_SURFACE_ID = `${GUI_SECTION_ID}:param-content:unpinned`;
const LEFT_PANE_SHIFT_LABEL = "Left Side Pane Shifts Map";
const SETTINGS_PARAM_CONTENT_SUFFIX = ":param-content:unpinned";
const FAST_ZOOM_P95_FRAME_BUDGET_MS = 36;

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

type Point = {
  readonly x: number;
  readonly y: number;
};

type Rect = Point & {
  readonly height: number;
  readonly width: number;
};

type Bounds = Rect & {
  readonly bottom: number;
  readonly right: number;
};

type RetainedRowDebugEntry = {
  readonly clientRect: Rect;
  readonly controlClientPoint: Point | null;
  readonly controlKind: string | null;
  readonly labelClientPoint: Point;
  readonly rowId: string;
  readonly rowLabel: string;
  readonly surfaceId: string;
};

type RetainedRowTarget = {
  readonly controlClientPoint: Point | null;
  readonly fullRowClip: Rect;
  readonly labelClientPoint: Point;
  readonly rowId: string;
  readonly rowLabel: string;
  readonly surfaceId: string;
};

type RetainedHoverDiagnostics = {
  readonly activeViewMode: {
    readonly id: string | null;
    readonly name: string | null;
    readonly visibleSectionCount: number | null;
  } | null;
  readonly hoverVisualSurfaces: readonly {
    readonly kind: string;
    readonly surfaceId: string;
    readonly zIndex: number;
  }[];
  readonly hoveredRetainedHit: unknown;
  readonly lastPointer: unknown;
  readonly pointElement: unknown;
  readonly targetRow: RetainedRowDebugEntry | null;
  readonly viewport: unknown;
};

type FrameSamplerResult = {
  readonly intervalCount: number;
  readonly p95IntervalMs: number;
  readonly slowIntervalRatio: number;
  readonly worstIntervalMs: number;
};

test("hovering a settings row highlights the full visible row width", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  let target = await resolveGuiRowTarget(page, LEFT_PANE_SHIFT_LABEL);
  await performCloseZoom(page, target.labelClientPoint);
  await waitForViewportIdle(page);
  await page.waitForTimeout(600);

  target = await resolveGuiRowTarget(page, LEFT_PANE_SHIFT_LABEL);
  await moveAwayFromRetainedRows(page);
  const before = await screenshotClip({
    name: "retained-hover-before.png",
    page,
    rect: target.fullRowClip,
    testInfo,
  });

  await page.mouse.move(target.labelClientPoint.x, target.labelClientPoint.y);
  await waitForRetainedHoverVisual(page, target);
  await waitForAnimationFrame(page);
  await waitForAnimationFrame(page);
  const after = await screenshotClip({
    name: "retained-hover-after.png",
    page,
    rect: target.fullRowClip,
    testInfo,
  });

  const stats = await analyzeHoverCoverage(page, before, after);
  const diagnostics = await readRetainedHoverDiagnostics(page, target);
  const failureDetails = JSON.stringify(
    { diagnostics, stats, target },
    null,
    2,
  );
  expect(stats.changedPixelRatioByBand.length, failureDetails).toBe(4);
  expect(stats.changedPixelRatioByBand[0] ?? 0, failureDetails).toBeGreaterThan(
    0.07,
  );
  expect(stats.changedPixelRatioByBand[3] ?? 0, failureDetails).toBeGreaterThan(
    0.07,
  );
  expect(stats.meanDeltaByBand[0] ?? 0, failureDetails).toBeGreaterThan(4);
  expect(stats.meanDeltaByBand[3] ?? 0, failureDetails).toBeGreaterThan(4);
});

test("clicking a settings switch keeps retained section content visible", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  const target = await resolveGuiRowTarget(page, LEFT_PANE_SHIFT_LABEL);
  if (!target.controlClientPoint) {
    throw new Error(`Missing switch point for ${LEFT_PANE_SHIFT_LABEL}.`);
  }
  const beforeScreenshot = await screenshotClip({
    name: "retained-switch-before-click.png",
    page,
    rect: await resolveVisibleGuiContentClip(page),
    testInfo,
  });
  const beforeStats = await analyzeScreenshotContent(page, beforeScreenshot);
  expect(
    beforeStats.contrastPixelRatio,
    JSON.stringify({ beforeStats, target }, null, 2),
  ).toBeGreaterThan(0.006);
  expect(
    beforeStats.luminanceRange,
    JSON.stringify({ beforeStats, target }, null, 2),
  ).toBeGreaterThan(22);

  const initialValue = Boolean(
    await readGuiSetting(page, "leftSidePaneShiftsMap"),
  );
  await page.mouse.click(
    target.controlClientPoint.x,
    target.controlClientPoint.y,
  );
  await expect
    .poll(async () =>
      Boolean(await readGuiSetting(page, "leftSidePaneShiftsMap")),
    )
    .toBe(!initialValue);
  await page.waitForTimeout(240);

  const screenshot = await screenshotClip({
    name: "retained-switch-after-click.png",
    page,
    rect: await resolveVisibleGuiContentClip(page),
    testInfo,
  });

  const stats = await analyzeScreenshotContent(page, screenshot);
  const failureDetails = JSON.stringify(
    { beforeStats, stats, target },
    null,
    2,
  );
  expect(stats.contrastPixelRatio, failureDetails).toBeGreaterThan(0.008);
  expect(stats.luminanceRange, failureDetails).toBeGreaterThan(24);
});

test("zoom does not blank visible section content", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  await openAllSettings(page);
  await waitForRetainedRows(page);
  const zoomPoint = await resolveAnyVisibleRetainedRowPoint(page);
  await startFrameSampler(page);

  await performFastZoomBurst(page, zoomPoint);
  await waitForViewportIdle(page);
  await page.waitForTimeout(800);

  const frameStats = await stopFrameSampler(page);
  const screenshot = await screenshotClip({
    name: "retained-fast-zoom-after.png",
    page,
    rect: await resolveVisibleSettingsContentClip(page),
    testInfo,
  });
  const contentStats = await analyzeScreenshotContent(page, screenshot);
  const failureDetails = JSON.stringify(
    { contentStats, frameStats, zoomPoint },
    null,
    2,
  );
  expect(contentStats.contrastPixelRatio, failureDetails).toBeGreaterThan(
    0.006,
  );
  expect(contentStats.luminanceRange, failureDetails).toBeGreaterThan(22);
  expect(frameStats.intervalCount, failureDetails).toBeGreaterThan(20);
  expect(frameStats.p95IntervalMs, failureDetails).toBeLessThan(
    FAST_ZOOM_P95_FRAME_BUDGET_MS,
  );
  expect(frameStats.slowIntervalRatio, failureDetails).toBeLessThan(0.18);
});

async function openSettings(page: Page): Promise<void> {
  await ensureAppReady(page);
  await postBackend(page, "/setActiveViewMode", {
    activeViewModeId: "settings-core",
    projectConfigId: "settings",
  });
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  await page.getByRole("button", { exact: true, name: "Core" }).click();
  await waitForCoreSettingsView(page);
  await page.getByRole("button", { name: "fit view" }).click();
  await waitForViewportIdle(page);
  await expect(
    page.locator(`.setta-gpu-flow__node[data-id="${GUI_SECTION_ID}"]`),
  ).toBeVisible();
  await waitForCoreVisualScene(page);
  await waitForRetainedRows(page);
}

async function waitForCoreSettingsView(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    const { useProjectState } = await import("/src/state/definitions");
    const { activeViewModeId, viewModes } =
      useProjectState.getState().projectConfig;
    const activeViewMode =
      activeViewModeId !== null && activeViewModeId !== undefined
        ? viewModes[activeViewModeId]
        : null;
    return (
      activeViewMode?.name === "Core" &&
      document.querySelectorAll(".setta-gpu-flow__node").length === 5
    );
  });
}

async function waitForCoreVisualScene(page: Page): Promise<void> {
  try {
    await expect
      .poll(() => readCoreVisualSceneState(page), { timeout: 8_000 })
      .toMatchObject({
        allCore: true,
        guiPresent: true,
      });
  } catch (error) {
    throw new Error(
      JSON.stringify(
        {
          state: await readCoreVisualSceneState(page),
          waitError: String(error),
        },
        null,
        2,
      ),
    );
  }
}

async function readCoreVisualSceneState(page: Page): Promise<{
  readonly activeViewMode: {
    readonly id: string | null;
    readonly name: string | null;
  };
  readonly allCore: boolean;
  readonly committedSurfaceFrame: {
    readonly displayFrameId: number;
    readonly displayCompletenessStatus: string;
    readonly gpuNativeVisualActorCount: number;
    readonly htmlTextureActorCount: number;
    readonly publishabilityKind: string;
    readonly retainedPageActorCount: number;
    readonly sceneRevision: number;
  } | null;
  readonly guiPresent: boolean;
  readonly retainedRowSectionIds: readonly string[];
  readonly retainedSectionIds: readonly string[];
  readonly visualSurfaceCount: number;
}> {
  return await page.evaluate(
    async ({ coreSectionIds, guiSectionId, suffix }) => {
      const { useProjectState } = await import("/src/state/definitions");
      const { activeViewModeId, viewModes } =
        useProjectState.getState().projectConfig;
      const activeMode = activeViewModeId ? viewModes[activeViewModeId] : null;
      const surfaces =
        window.__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__?.() ?? [];
      const retainedSectionIds = new Set(
        surfaces
          .map((surface) =>
            surface.surfaceId.startsWith("settings-section__") &&
            surface.surfaceId.includes(suffix)
              ? surface.surfaceId.slice(0, surface.surfaceId.indexOf(suffix))
              : null,
          )
          .filter((id): id is string => id !== null),
      );
      const retainedRowSectionIds = new Set(
        (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []).map(
          (row) => row.ownerSectionId,
        ),
      );
      return {
        activeViewMode: {
          id: activeViewModeId ?? null,
          name: activeMode?.name ?? null,
        },
        allCore:
          retainedSectionIds.size > 0 &&
          [...retainedSectionIds].every((id) => coreSectionIds.includes(id)),
        committedSurfaceFrame: (() => {
          const frame =
            window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.()
              .committedSurfaceFrame ?? null;
          return frame
            ? {
                displayCompletenessStatus: frame.displayCompletenessStatus,
                displayFrameId: frame.displayFrameId,
                gpuNativeVisualActorCount: frame.gpuNativeVisualActorCount,
                htmlTextureActorCount: frame.htmlTextureActorCount,
                publishabilityKind: frame.publishabilityKind,
                retainedPageActorCount: frame.retainedPageActorCount,
                sceneRevision: frame.sceneRevision,
              }
            : null;
        })(),
        guiPresent: retainedSectionIds.has(guiSectionId),
        retainedRowSectionIds: [...retainedRowSectionIds].sort(),
        retainedSectionIds: [...retainedSectionIds].sort(),
        visualSurfaceCount: surfaces.length,
      };
    },
    {
      coreSectionIds: [...CORE_SECTION_IDS],
      guiSectionId: GUI_SECTION_ID,
      suffix: SETTINGS_PARAM_CONTENT_SUFFIX,
    },
  );
}

async function openAllSettings(page: Page): Promise<void> {
  const allSettingsTab = page.getByRole("button", {
    exact: true,
    name: "All Settings",
  });
  await expect(allSettingsTab).toBeVisible();
  await allSettingsTab.click();
  await page.waitForFunction(
    () => document.querySelectorAll(".setta-gpu-flow__node").length > 30,
  );
  await page.getByRole("button", { name: "fit view" }).click();
  await waitForViewportIdle(page);
  await waitForRetainedRows(page);
}

async function waitForRetainedRows(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        await page.evaluate(
          () => window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.().length ?? 0,
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(10);
}

async function resolveGuiRowTarget(
  page: Page,
  rowLabel: string,
): Promise<RetainedRowTarget> {
  return await page.evaluate(
    ({ rowLabel, surfaceId }) => {
      const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
      const row = rows.find(
        (candidate) =>
          candidate.surfaceId === surfaceId && candidate.rowLabel === rowLabel,
      );
      if (!row) {
        throw new Error(`Missing visible retained row ${rowLabel}.`);
      }
      const visibleSurfaceRect =
        resolveVisibleSurfaceRect(surfaceId, row.clientRect) ?? row.clientRect;
      const rowTop = clamp(
        row.clientRect.y,
        visibleSurfaceRect.y,
        visibleSurfaceRect.y + visibleSurfaceRect.height - 1,
      );
      const rowBottom = clamp(
        row.clientRect.y + row.clientRect.height,
        rowTop + 1,
        visibleSurfaceRect.y + visibleSurfaceRect.height,
      );
      const rowLeft = Math.min(row.clientRect.x, visibleSurfaceRect.x);
      const rowRight = Math.max(
        row.clientRect.x + row.clientRect.width,
        visibleSurfaceRect.x + visibleSurfaceRect.width,
      );
      const fullRowClip = clampScreenshotClip({
        height: Math.max(1, rowBottom - rowTop),
        width: Math.max(1, rowRight - rowLeft),
        x: rowLeft,
        y: rowTop,
      });
      return {
        controlClientPoint: row.controlClientPoint,
        fullRowClip,
        labelClientPoint: row.labelClientPoint,
        rowId: row.rowId,
        rowLabel: row.rowLabel,
        surfaceId: row.surfaceId,
      };

      function resolveVisibleSurfaceRect(
        targetSurfaceId: string,
        targetRowRect: Rect,
      ): Rect | null {
        const surfaces =
          window.__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__?.() ?? [];
        const matching = surfaces
          .filter((surface) => surface.surfaceId === targetSurfaceId)
          .map((surface) => surface.clientRect)
          .filter((rect) => intersects(rect, targetRowRect));
        if (matching.length === 0) {
          return null;
        }
        const left = Math.min(...matching.map((rect) => rect.x));
        const top = Math.min(...matching.map((rect) => rect.y));
        const right = Math.max(...matching.map((rect) => rect.x + rect.width));
        const bottom = Math.max(
          ...matching.map((rect) => rect.y + rect.height),
        );
        return {
          height: Math.max(1, bottom - top),
          width: Math.max(1, right - left),
          x: left,
          y: top,
        };
      }

      function intersects(left: Rect, right: Rect): boolean {
        return (
          left.x < right.x + right.width &&
          left.x + left.width > right.x &&
          left.y < right.y + right.height &&
          left.y + left.height > right.y
        );
      }

      function clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
      }

      function clampScreenshotClip(clip: Rect): Rect {
        const x = Math.max(0, Math.min(window.innerWidth - 1, clip.x));
        const y = Math.max(0, Math.min(window.innerHeight - 1, clip.y));
        return {
          height: Math.max(1, Math.min(clip.height, window.innerHeight - y)),
          width: Math.max(1, Math.min(clip.width, window.innerWidth - x)),
          x,
          y,
        };
      }
    },
    {
      rowLabel,
      surfaceId: GUI_CONTENT_SURFACE_ID,
    },
  );
}

async function moveAwayFromRetainedRows(page: Page): Promise<void> {
  const pane = page.locator(READY_SELECTOR).first();
  const box = await pane.boundingBox();
  if (!box) {
    throw new Error("Missing GPU pane bounds.");
  }
  await page.mouse.move(Math.max(1, box.x - 8), Math.max(1, box.y - 8));
  await waitForAnimationFrame(page);
  await waitForAnimationFrame(page);
}

async function waitForRetainedHoverVisual(
  page: Page,
  target: RetainedRowTarget,
): Promise<void> {
  let attempt = 0;
  try {
    await expect
      .poll(
        async () => {
          const xOffset = attempt % 2 === 0 ? 0 : 1;
          attempt += 1;
          await page.mouse.move(
            target.labelClientPoint.x + xOffset,
            target.labelClientPoint.y,
          );
          await waitForAnimationFrame(page);
          return await page.evaluate((target) => {
            const hoverSurfaceId = `${target.surfaceId}:row-hover:${target.rowId}`;
            return (
              window
                .__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__?.()
                .some((surface) => surface.surfaceId === hoverSurfaceId) ??
              false
            );
          }, target);
        },
        { timeout: 4_000 },
      )
      .toBe(true);
  } catch (error) {
    const diagnostics = await readRetainedHoverDiagnostics(page, target);
    throw new Error(
      JSON.stringify(
        { diagnostics, target, waitError: String(error) },
        null,
        2,
      ),
    );
  }
}

async function readRetainedHoverDiagnostics(
  page: Page,
  target: RetainedRowTarget,
): Promise<RetainedHoverDiagnostics> {
  return await page.evaluate(async (target) => {
    const snapshot = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.() ?? null;
    const { useProjectState } = await import("/src/state/definitions");
    const { activeViewModeId, viewModes } =
      useProjectState.getState().projectConfig;
    const activeMode = activeViewModeId ? viewModes[activeViewModeId] : null;
    const activeViewMode = {
      id: activeViewModeId ?? null,
      name: activeMode?.name ?? null,
      visibleSectionCount: activeMode
        ? Object.values(activeMode.visibilityBySectionId ?? {}).filter(Boolean)
            .length
        : null,
    };
    const targetRow =
      window
        .__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.()
        .find(
          (row) =>
            row.surfaceId === target.surfaceId && row.rowId === target.rowId,
        ) ?? null;
    const hoverVisualSurfaces = (
      window.__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__?.() ?? []
    )
      .filter(
        (surface) =>
          surface.surfaceId.includes(":row-hover:") ||
          surface.kind === "solid-rounded-rect",
      )
      .slice(0, 20)
      .map((surface) => ({
        kind: surface.kind,
        surfaceId: surface.surfaceId,
        zIndex: surface.zIndex,
      }));
    const pointElement = document.elementFromPoint(
      target.labelClientPoint.x,
      target.labelClientPoint.y,
    );
    return {
      activeViewMode,
      hoverVisualSurfaces,
      hoveredRetainedHit: snapshot?.hoveredRetainedHit ?? null,
      lastPointer: snapshot?.lastPointer ?? null,
      pointElement: pointElement
        ? {
            className:
              typeof pointElement.className === "string"
                ? pointElement.className
                : null,
            id: pointElement.id,
            tagName: pointElement.tagName,
            textContent: pointElement.textContent?.slice(0, 80) ?? "",
          }
        : null,
      targetRow,
      viewport: snapshot?.viewport ?? null,
    };
  }, target);
}

async function resolveAnyVisibleRetainedRowPoint(page: Page): Promise<Point> {
  return await page.evaluate((suffix) => {
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
    const candidate = rows
      .map((row) => {
        const visible = intersectRect(row.clientRect, bounds);
        return {
          distance: Math.hypot(
            row.labelClientPoint.x - center.x,
            row.labelClientPoint.y - center.y,
          ),
          row,
          visibleArea: visible.width * visible.height,
        };
      })
      .filter((candidate) => candidate.visibleArea > 4)
      .sort(
        (left, right) =>
          left.distance - right.distance ||
          right.visibleArea - left.visibleArea,
      )[0];
    if (!candidate) {
      throw new Error(
        `Missing visible retained row zoom target. Bounds: ${JSON.stringify(
          bounds,
        )}`,
      );
    }
    return candidate.row.labelClientPoint;

    function intersectsBounds(rect: Rect, bounds: Bounds) {
      return (
        rect.x < bounds.right &&
        rect.y < bounds.bottom &&
        rect.x + rect.width > bounds.x &&
        rect.y + rect.height > bounds.y
      );
    }

    function pointInsideBounds(point: Point, bounds: Bounds) {
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
  }, SETTINGS_PARAM_CONTENT_SUFFIX);
}

async function resolveVisibleGuiContentClip(page: Page): Promise<Rect> {
  return await page.evaluate((surfaceId) => {
    const bounds = resolveUnoccludedFlowBounds();
    const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter((row) => row.surfaceId === surfaceId)
      .map((row) => ({
        row,
        visible: intersectRect(row.clientRect, bounds),
      }))
      .filter(
        (candidate) => candidate.visible.width * candidate.visible.height > 64,
      );
    if (rows.length === 0) {
      throw new Error("Missing visible GUI retained rows.");
    }
    return rowsToScreenshotClip(rows);

    function rowsToScreenshotClip(rowsInput: typeof rows): Rect {
      const left = Math.max(
        0,
        Math.min(...rowsInput.map((candidate) => candidate.visible.x)),
      );
      const top = Math.max(
        0,
        Math.min(...rowsInput.map((candidate) => candidate.visible.y)),
      );
      const right = Math.min(
        window.innerWidth,
        Math.max(
          ...rowsInput.map(
            (candidate) => candidate.visible.x + candidate.visible.width,
          ),
        ),
      );
      const bottom = Math.min(
        window.innerHeight,
        Math.max(
          ...rowsInput.map(
            (candidate) => candidate.visible.y + candidate.visible.height,
          ),
        ),
      );
      return {
        height: Math.max(1, Math.min(360, bottom - top)),
        width: Math.max(1, right - left),
        x: left,
        y: top,
      };
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
  }, GUI_CONTENT_SURFACE_ID);
}

async function resolveVisibleSettingsContentClip(page: Page): Promise<Rect> {
  return await page.evaluate((suffix) => {
    const bounds = resolveUnoccludedFlowBounds();
    const candidates = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId.endsWith(suffix) &&
          row.rowLabel.trim().length > 0 &&
          row.clientRect.width > 2 &&
          row.clientRect.height > 2 &&
          intersectsBounds(row.clientRect, bounds),
      )
      .map((row) => ({
        row,
        visible: intersectRect(row.clientRect, bounds),
      }))
      .filter(
        (candidate) => candidate.visible.width * candidate.visible.height > 64,
      );
    if (candidates.length === 0) {
      throw new Error("Missing visible retained settings rows.");
    }
    const centerY = bounds.y + bounds.height * 0.5;
    const closest = [...candidates].sort(
      (left, right) =>
        Math.abs(left.visible.y + left.visible.height * 0.5 - centerY) -
        Math.abs(right.visible.y + right.visible.height * 0.5 - centerY),
    )[0];
    if (!closest) {
      throw new Error("Missing retained settings row candidate.");
    }
    const sameSurfaceRows = candidates.filter(
      (candidate) => candidate.row.surfaceId === closest.row.surfaceId,
    );
    const left = Math.max(
      0,
      Math.min(...sameSurfaceRows.map((candidate) => candidate.visible.x)),
    );
    const top = Math.max(
      0,
      Math.min(...sameSurfaceRows.map((candidate) => candidate.visible.y)),
    );
    const right = Math.min(
      window.innerWidth,
      Math.max(
        ...sameSurfaceRows.map(
          (candidate) => candidate.visible.x + candidate.visible.width,
        ),
      ),
    );
    const bottom = Math.min(
      window.innerHeight,
      Math.max(
        ...sameSurfaceRows.map(
          (candidate) => candidate.visible.y + candidate.visible.height,
        ),
      ),
    );
    return {
      height: Math.max(1, Math.min(420, bottom - top)),
      width: Math.max(1, right - left),
      x: left,
      y: top,
    };

    function intersectsBounds(rect: Rect, bounds: Bounds) {
      return (
        rect.x < bounds.right &&
        rect.y < bounds.bottom &&
        rect.x + rect.width > bounds.x &&
        rect.y + rect.height > bounds.y
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
  }, SETTINGS_PARAM_CONTENT_SUFFIX);
}

async function performFastZoomBurst(page: Page, point: Point): Promise<void> {
  await page.mouse.move(point.x, point.y);
  await page.keyboard.down("Control");
  try {
    for (let index = 0; index < 640; index += 1) {
      const cycle = index % 160;
      await page.mouse.wheel(0, cycle < 96 ? -5 : 7);
      if (index % 20 === 0) {
        await page.waitForTimeout(2);
      }
    }
  } finally {
    await page.keyboard.up("Control");
  }
}

async function performCloseZoom(page: Page, point: Point): Promise<void> {
  await page.mouse.move(point.x, point.y);
  await page.keyboard.down("Control");
  try {
    for (let index = 0; index < 320; index += 1) {
      await page.mouse.wheel(0, -5);
      if (index % 12 === 0) {
        await page.waitForTimeout(8);
      }
      if (index % 6 === 0 && (await readViewportZoom(page)) >= 4.2) {
        break;
      }
    }
  } finally {
    await page.keyboard.up("Control");
  }
  await expect.poll(() => readViewportZoom(page)).toBeGreaterThan(4);
}

async function waitForViewportIdle(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const viewport =
            window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport ?? null;
          return Boolean(
            viewport &&
              !viewport.viewportInteractionActive &&
              !viewport.wheelZooming &&
              !viewport.viewportAnimating,
          );
        }),
      { timeout: 5_000 },
    )
    .toBe(true);
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

async function readGuiSetting(page: Page, key: string): Promise<unknown> {
  return await page.evaluate(async (settingKey) => {
    const { useSettings } = await import("/src/state/definitions.ts");
    return (useSettings.getState().gui as Record<string, unknown>)[settingKey];
  }, key);
}

async function startFrameSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sampler = {
      intervals: [] as number[],
      running: true,
    };
    let lastTimestamp: number | null = null;
    const sample = (timestamp: number) => {
      if (!sampler.running) {
        return;
      }
      if (lastTimestamp !== null) {
        sampler.intervals.push(timestamp - lastTimestamp);
      }
      lastTimestamp = timestamp;
      window.requestAnimationFrame(sample);
    };
    (
      window as Window & {
        __SETTA_RETAINED_STABILITY_FRAME_SAMPLER__?: typeof sampler;
      }
    ).__SETTA_RETAINED_STABILITY_FRAME_SAMPLER__ = sampler;
    window.requestAnimationFrame(sample);
  });
}

async function stopFrameSampler(page: Page): Promise<FrameSamplerResult> {
  return await page.evaluate(() => {
    const sampler = (
      window as Window & {
        __SETTA_RETAINED_STABILITY_FRAME_SAMPLER__?: {
          intervals: number[];
          running: boolean;
        };
      }
    ).__SETTA_RETAINED_STABILITY_FRAME_SAMPLER__;
    if (!sampler) {
      throw new Error("Missing retained stability frame sampler.");
    }
    sampler.running = false;
    const intervals = [...sampler.intervals].sort(
      (left, right) => left - right,
    );
    const p95Index = Math.floor(Math.max(0, intervals.length - 1) * 0.95);
    const slowIntervals = intervals.filter((interval) => interval > 33.4);
    return {
      intervalCount: intervals.length,
      p95IntervalMs: intervals[p95Index] ?? 0,
      slowIntervalRatio:
        intervals.length === 0 ? 0 : slowIntervals.length / intervals.length,
      worstIntervalMs: intervals.at(-1) ?? 0,
    };
  });
}
