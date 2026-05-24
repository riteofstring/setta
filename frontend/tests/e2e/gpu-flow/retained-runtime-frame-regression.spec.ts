import { expect, test, type Page } from "@playwright/test";

import {
  applyProjectMutationsFromFrontend,
  changeParamImplFromFrontend,
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  openIsolatedProject,
  setCodeObjNameFromFrontend,
  setSectionSizesFromFrontend,
} from "../helpers";
import {
  centerRetainedCompositorSurface,
  readRetainedCompositorScrollSignature,
} from "../settings/settings-retained-compositor-helpers";
import {
  analyzeCodeMirrorTextInkBounds,
  compareScreenshots,
  type Rect,
  type RetainedRowDebugEntry,
} from "../settings/settings-retained-visual-analysis";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const GUI_SECTION_ID = "settings-section__gui";
const GUI_CONTENT_SURFACE_ID = `${GUI_SECTION_ID}:param-content:unpinned`;
const ZOOM_ROW_LABEL = "Max Zoom";
const RETAINED_RUNTIME_FRAME_PARAM_COUNT = 36;
const FRAME_P95_BUDGET_MS = 50;
const LONG_TASK_BUDGET_MS = 50;

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("retained section scroll, text activation, typing, and follow-up scroll share one rendered frame", async ({
  page,
}, testInfo) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  try {
    const surfaceId = await createDeepRetainedTextParamSurface(
      page,
      projectContext,
    );
    await centerRetainedCompositorSurface(page, surfaceId);
    await page.addStyleTag({
      content: ".cm-cursor,.cm-cursorLayer{opacity:0!important}",
    });
    const surfaceSummary = await readRetainedSurfaceSummary(page, surfaceId);
    const beforeDeepScrollSignature =
      await readRetainedCompositorScrollSignature(page, surfaceId);
    const row = await scrollRetainedSurfaceToVisibleTextLikeRow(
      page,
      surfaceId,
    );
    const afterDeepScrollSignature =
      await readRetainedCompositorScrollSignature(page, surfaceId);
    if (!row.controlClientPoint || !row.controlClientRect) {
      throw new Error(`Missing retained control for ${row.rowLabel}.`);
    }
    const contentClip = await resolveVisibleRetainedContentClip(
      page,
      surfaceId,
    );
    await waitForStableScreenshotClip(page, contentClip);
    const beforeFrame = await page.screenshot({
      clip: contentClip,
      path: testInfo.outputPath("retained-runtime-before-activation.png"),
    });
    await startFrameProbe(page);

    await page.mouse.click(row.controlClientPoint.x, row.controlClientPoint.y);
    await expect
      .poll(() => readActiveCodeMirrorId(page), { timeout: 5_000 })
      .toContain(row.rowId);
    const originalEditorText = await readActiveCodeMirrorText(page);
    await page.keyboard.press(selectAllShortcut());
    await page.keyboard.insertText(originalEditorText);
    await waitForAnimationFrame(page);
    const typedEditorText = await readActiveCodeMirrorText(page);

    const activeFrame = await page.screenshot({
      clip: contentClip,
      path: testInfo.outputPath("retained-runtime-after-activation.png"),
    });
    const visualDelta = await compareScreenshots(
      page,
      beforeFrame,
      activeFrame,
    );
    const rowAfterActivation = await resolveVisibleRetainedRowById(
      page,
      surfaceId,
      row.rowId,
    );
    const beforeFollowUpScrollSignature =
      await readRetainedCompositorScrollSignature(page, surfaceId);
    const beforeScrollY = rowAfterActivation.clientRect.y;

    await page.mouse.move(row.controlClientPoint.x, row.controlClientPoint.y);
    for (let index = 0; index < 5; index += 1) {
      await page.mouse.wheel(0, 48);
      await waitForAnimationFrame(page);
    }
    const afterFollowUpScrollSignature =
      await readRetainedCompositorScrollSignature(page, surfaceId);
    const rowAfterFollowUpScroll = await findVisibleRetainedRowById(
      page,
      surfaceId,
      row.rowId,
    );
    const frameProbe = await stopFrameProbe(page);
    const failureDetails = JSON.stringify(
      {
        afterDeepScrollSignature,
        afterFollowUpScrollSignature,
        beforeDeepScrollSignature,
        beforeFollowUpScrollSignature,
        beforeScrollY,
        frameProbe,
        row: {
          controlClientRect: row.controlClientRect,
          rowId: row.rowId,
          rowLabel: row.rowLabel,
        },
        rowAfterFollowUpScroll,
        surfaceId,
        surfaceSummary,
        typedEditorText,
        visualDelta,
      },
      null,
      2,
    );

    expect(surfaceSummary.logicalRowCount, failureDetails).toBeGreaterThan(
      surfaceSummary.visibleRowCount + 20,
    );
    expect(afterDeepScrollSignature, failureDetails).not.toEqual(
      beforeDeepScrollSignature,
    );
    expect(rowAfterActivation.rowId, failureDetails).toBe(row.rowId);
    expect(typedEditorText, failureDetails).toBe(originalEditorText);
    expect(visualDelta.meanDelta, failureDetails).toBeLessThan(5);
    expect(visualDelta.changedPixelRatio, failureDetails).toBeLessThan(0.12);
    expect(afterFollowUpScrollSignature, failureDetails).not.toEqual(
      beforeFollowUpScrollSignature,
    );
    if (rowAfterFollowUpScroll) {
      expect(rowAfterFollowUpScroll.clientRect.y, failureDetails).toBeLessThan(
        beforeScrollY - 4,
      );
    }
    expect(frameProbe.sampleCount, failureDetails).toBeGreaterThan(8);
    expect(frameProbe.p95IntervalMs, failureDetails).toBeLessThanOrEqual(
      FRAME_P95_BUDGET_MS,
    );
    expect(frameProbe.maxLongTaskMs, failureDetails).toBeLessThanOrEqual(
      LONG_TASK_BUDGET_MS,
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("retained text previews recover sharpness after close zoom settles", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  const row = await resolveVisibleGuiRow(page, ZOOM_ROW_LABEL);
  if (!row.controlClientPoint || !row.controlClientRect) {
    throw new Error(`Missing retained control for ${ZOOM_ROW_LABEL}.`);
  }
  await performCloseZoom(page, row.controlClientPoint);
  await waitForViewportIdle(page);
  await page.waitForTimeout(300);
  await startFrameProbe(page);
  await page.waitForTimeout(300);

  const zoomedRow = await resolveVisibleGuiRow(page, ZOOM_ROW_LABEL);
  if (!zoomedRow.controlClientRect) {
    throw new Error(`Missing zoomed retained control for ${ZOOM_ROW_LABEL}.`);
  }
  const clip = await clampScreenshotClipToViewport(
    page,
    expandRect(zoomedRow.controlClientRect, 10),
  );
  const screenshot = await page.screenshot({
    clip,
    path: testInfo.outputPath("retained-runtime-close-zoom.png"),
  });
  const ink = await analyzeCodeMirrorTextInkBounds(page, {
    clip,
    screenshot,
    searchRect: zoomedRow.controlClientRect,
  });
  const sharpness = await estimateScreenshotSharpness(page, {
    clip,
    screenshot,
    searchRect: zoomedRow.controlClientRect,
  });
  const frameProbe = await stopFrameProbe(page);
  const failureDetails = JSON.stringify(
    { frameProbe, ink, sharpness, zoom: await readViewportZoom(page) },
    null,
    2,
  );

  expect(ink, failureDetails).not.toBeNull();
  expect(ink?.pixelCount ?? 0, failureDetails).toBeGreaterThan(16);
  expect(sharpness.meanEdgeDelta, failureDetails).toBeGreaterThan(8);
  expect(frameProbe.sampleCount, failureDetails).toBeGreaterThan(8);
  expect(frameProbe.p95IntervalMs, failureDetails).toBeLessThanOrEqual(
    FRAME_P95_BUDGET_MS,
  );
  expect(frameProbe.maxLongTaskMs, failureDetails).toBeLessThanOrEqual(
    LONG_TASK_BUDGET_MS,
  );
});

async function openSettings(page: Page): Promise<void> {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  await page.getByRole("button", { exact: true, name: "Core" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".setta-gpu-flow__node").length <= 10,
  );
  await page.getByRole("button", { name: "fit view" }).click();
  await waitForViewportIdle(page);
  await expect(
    page.locator(`.setta-gpu-flow__node[data-id="${GUI_SECTION_ID}"]`),
  ).toBeVisible();
  await waitForRetainedRows(page);
}

async function createDeepRetainedTextParamSurface(
  page: Page,
  projectContext: Awaited<ReturnType<typeof openIsolatedProject>>,
): Promise<string> {
  const response = await createTopLevelSectionFromFrontend(page, {
    implType: "Dict",
    projectConfigId: projectContext.projectConfigId,
    position: { x: 80, y: 80 },
  });
  const sectionId = response?.sectionId;
  if (!sectionId) {
    throw new Error("Missing section id for retained runtime frame fixture.");
  }
  await createDeepTextParams(page, {
    projectConfigId: projectContext.projectConfigId,
    sectionId,
  });
  await setSectionSizesFromFrontend(page, {
    projectConfigId: projectContext.projectConfigId,
    sectionSizes: {
      [sectionId]: { height: 360, width: 620 },
    },
  });
  const surfaceId = `${sectionId}:param-content:unpinned`;
  await expect
    .poll(
      async () =>
        (await readRetainedSurfaceSummary(page, surfaceId)).logicalRowCount,
      {
        timeout: 10_000,
      },
    )
    .toBeGreaterThanOrEqual(RETAINED_RUNTIME_FRAME_PARAM_COUNT);
  await expect
    .poll(
      () =>
        readRetainedSurfaceSummary(page, surfaceId).then(
          (s) => s.scrollableHeight,
        ),
      {
        timeout: 10_000,
      },
    )
    .toBeGreaterThan(240);
  await expect
    .poll(
      () =>
        readRetainedSurfaceSummary(page, surfaceId).then(
          (s) => s.visibleRowCount,
        ),
      {
        timeout: 10_000,
      },
    )
    .toBeGreaterThan(0);
  return surfaceId;
}

async function createDeepTextParams(
  page: Page,
  {
    projectConfigId,
    sectionId,
  }: {
    readonly projectConfigId: string;
    readonly sectionId: string;
  },
): Promise<void> {
  for (let index = 0; index < RETAINED_RUNTIME_FRAME_PARAM_COUNT; index += 1) {
    const beforeIds = await readShownParamIds(page, sectionId);
    await applyProjectMutationsFromFrontend(page, {
      operations: [
        {
          body: { sectionId },
          operationName: "addKwarg",
        },
      ],
      projectConfigId,
    });
    const afterIds = await readShownParamIds(page, sectionId);
    const paramInfoId = findNewParamId(beforeIds, afterIds);
    const paramNumber = String(index + 1).padStart(2, "0");
    await setCodeObjNameFromFrontend(page, {
      codeObjId: paramInfoId,
      name: `runtime_frame_text_${paramNumber}`,
      projectConfigId,
    });
    await changeParamImplFromFrontend(page, {
      paramInfoId,
      projectConfigId,
      sectionId,
      selectedId: "TextParam",
    });
  }
}

async function readShownParamIds(
  page: Page,
  sectionId: string,
): Promise<string[]> {
  return await page.evaluate(async (sectionId) => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const state = useProjectState.getState();
    const sectionVariantId = state.projectConfig.sectionVariantMap[sectionId];
    const shown = sectionVariantId
      ? state.shownParamIds[sectionVariantId]
      : null;
    return [
      ...(shown?.pinned?.topLevelParamIds ?? []),
      ...(shown?.unpinned?.topLevelParamIds ?? []),
    ];
  }, sectionId);
}

function findNewParamId(
  beforeIds: readonly string[],
  afterIds: readonly string[],
): string {
  const before = new Set(beforeIds);
  const newIds = afterIds.filter((id) => !before.has(id));
  if (newIds.length !== 1 || !newIds[0]) {
    throw new Error(`Expected one new param id, found ${newIds.join(", ")}`);
  }
  return newIds[0];
}

async function readRetainedSurfaceSummary(
  page: Page,
  surfaceId: string,
): Promise<{
  readonly logicalRowCount: number;
  readonly rowCount: number;
  readonly scrollableHeight: number;
  readonly visibleRowCount: number;
}> {
  return await page.evaluate((surfaceId) => {
    const rows = getRetainedRows(surfaceId);
    const visibleRows = rows.filter(isVisibleRetainedRow);
    const firstRow = rows[0] ?? null;
    return {
      logicalRowCount: firstRow?.surfaceLogicalRowCount ?? 0,
      rowCount: rows.length,
      scrollableHeight: firstRow
        ? Math.max(
            0,
            firstRow.surfaceContentHeight - firstRow.surfaceViewportHeight,
          )
        : 0,
      visibleRowCount: visibleRows.length,
    };

    function getRetainedRows(
      targetSurfaceId: string,
    ): readonly RetainedRowDebugEntry[] {
      return (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []).filter(
        (row) => row.surfaceId === targetSurfaceId,
      );
    }

    function isVisibleRetainedRow(row: RetainedRowDebugEntry): boolean {
      return (
        row.canvasSamplePoint.x >= 0 &&
        row.canvasSamplePoint.y >= 0 &&
        row.canvasSamplePoint.x < row.canvasCssSize.width &&
        row.canvasSamplePoint.y < row.canvasCssSize.height &&
        row.clientRect.width > 16 &&
        row.clientRect.height > 8 &&
        row.clientRect.y < window.innerHeight &&
        row.clientRect.y + row.clientRect.height > 0
      );
    }
  }, surfaceId);
}

async function scrollRetainedSurfaceToVisibleTextLikeRow(
  page: Page,
  surfaceId: string,
): Promise<RetainedRowDebugEntry> {
  const wheelPoint = await resolveRetainedSurfaceWheelPoint(page, surfaceId);
  await page.mouse.move(wheelPoint.x, wheelPoint.y);
  const initialSignature = await readRetainedCompositorScrollSignature(
    page,
    surfaceId,
  );
  for (let index = 0; index < 28; index += 1) {
    await page.mouse.wheel(0, 96);
    await page.waitForTimeout(18);
    const signature = await readRetainedCompositorScrollSignature(
      page,
      surfaceId,
    );
    const row = await findVisibleRetainedTextLikeRow(page, surfaceId);
    if (
      row?.controlClientPoint &&
      signature.firstRowId !== initialSignature.firstRowId
    ) {
      return row;
    }
  }
  throw new Error(`Retained surface ${surfaceId} did not scroll.`);
}

async function resolveRetainedSurfaceWheelPoint(
  page: Page,
  surfaceId: string,
): Promise<{ readonly x: number; readonly y: number }> {
  return await page.evaluate((surfaceId) => {
    const rows = getVisibleRetainedRows(surfaceId);
    const targetRow = rows[Math.floor(rows.length / 2)];
    if (!targetRow) {
      throw new Error(`Missing visible retained rows for ${surfaceId}.`);
    }
    return {
      x:
        targetRow.controlClientPoint?.x ??
        targetRow.clientRect.x + targetRow.clientRect.width * 0.72,
      y:
        targetRow.controlClientPoint?.y ??
        targetRow.clientRect.y + targetRow.clientRect.height / 2,
    };

    function getVisibleRetainedRows(
      targetSurfaceId: string,
    ): readonly RetainedRowDebugEntry[] {
      return (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
        .filter((row) => row.surfaceId === targetSurfaceId)
        .filter(isVisibleRetainedRow);
    }

    function isVisibleRetainedRow(row: RetainedRowDebugEntry): boolean {
      return (
        row.canvasSamplePoint.x >= 0 &&
        row.canvasSamplePoint.y >= 0 &&
        row.canvasSamplePoint.x < row.canvasCssSize.width &&
        row.canvasSamplePoint.y < row.canvasCssSize.height &&
        row.clientRect.width > 16 &&
        row.clientRect.height > 8 &&
        row.clientRect.y < window.innerHeight &&
        row.clientRect.y + row.clientRect.height > 0
      );
    }
  }, surfaceId);
}

async function findVisibleRetainedTextLikeRow(
  page: Page,
  surfaceId: string,
): Promise<RetainedRowDebugEntry | null> {
  return await page.evaluate((surfaceId) => {
    return (
      (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []).find(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId === surfaceId &&
          row.controlKind === "text-like" &&
          Boolean(row.controlClientPoint) &&
          row.canvasSamplePoint.x >= 0 &&
          row.canvasSamplePoint.y >= 0 &&
          row.canvasSamplePoint.x < row.canvasCssSize.width &&
          row.canvasSamplePoint.y < row.canvasCssSize.height &&
          row.clientRect.width > 16 &&
          row.clientRect.height > 8 &&
          row.clientRect.y < window.innerHeight &&
          row.clientRect.y + row.clientRect.height > 0,
      ) ?? null
    );
  }, surfaceId);
}

async function resolveVisibleRetainedRowById(
  page: Page,
  surfaceId: string,
  rowId: string,
): Promise<RetainedRowDebugEntry> {
  const row = await findVisibleRetainedRowById(page, surfaceId, rowId);
  if (!row) {
    throw new Error(`Missing visible retained row ${rowId}.`);
  }
  return row;
}

async function findVisibleRetainedRowById(
  page: Page,
  surfaceId: string,
  rowId: string,
): Promise<RetainedRowDebugEntry | null> {
  return await page.evaluate(
    ({ rowId, surfaceId }) => {
      return (
        (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []).find(
          (row): row is RetainedRowDebugEntry =>
            row.surfaceId === surfaceId &&
            row.rowId === rowId &&
            row.canvasSamplePoint.x >= 0 &&
            row.canvasSamplePoint.y >= 0 &&
            row.canvasSamplePoint.x < row.canvasCssSize.width &&
            row.canvasSamplePoint.y < row.canvasCssSize.height &&
            row.clientRect.width > 16 &&
            row.clientRect.height > 8 &&
            row.clientRect.y < window.innerHeight &&
            row.clientRect.y + row.clientRect.height > 0,
        ) ?? null
      );
    },
    { rowId, surfaceId },
  );
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

async function resolveVisibleGuiRow(
  page: Page,
  label: string,
): Promise<RetainedRowDebugEntry> {
  const row = await findVisibleGuiRow(page, label);
  if (!row) {
    throw new Error(`Missing visible retained GUI row ${label}.`);
  }
  return row;
}

async function findVisibleGuiRow(
  page: Page,
  label: string,
): Promise<RetainedRowDebugEntry | null> {
  return await page.evaluate(
    ({ label, surfaceId }) => {
      return (
        (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []).find(
          (row): row is RetainedRowDebugEntry =>
            row.surfaceId === surfaceId &&
            row.rowLabel === label &&
            row.canvasSamplePoint.x >= 0 &&
            row.canvasSamplePoint.y >= 0 &&
            row.canvasSamplePoint.x < row.canvasCssSize.width &&
            row.canvasSamplePoint.y < row.canvasCssSize.height &&
            row.clientRect.width > 16 &&
            row.clientRect.height > 8 &&
            row.clientRect.y < window.innerHeight &&
            row.clientRect.y + row.clientRect.height > 0,
        ) ?? null
      );
    },
    { label, surfaceId: GUI_CONTENT_SURFACE_ID },
  );
}

async function resolveVisibleRetainedContentClip(
  page: Page,
  surfaceId: string,
): Promise<Rect> {
  return await page.evaluate((surfaceId) => {
    const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter((row) => row.surfaceId === surfaceId)
      .filter(
        (row) =>
          row.canvasSamplePoint.x >= 0 &&
          row.canvasSamplePoint.y >= 0 &&
          row.canvasSamplePoint.x < row.canvasCssSize.width &&
          row.canvasSamplePoint.y < row.canvasCssSize.height,
      )
      .map((row) => row.clientRect)
      .filter(
        (rect) =>
          rect.width > 16 &&
          rect.height > 8 &&
          rect.y < window.innerHeight &&
          rect.y + rect.height > 0,
      );
    if (rows.length === 0) {
      throw new Error(`Missing visible retained content for ${surfaceId}.`);
    }
    const left = Math.max(0, Math.min(...rows.map((rect) => rect.x)));
    const top = Math.max(0, Math.min(...rows.map((rect) => rect.y)));
    const right = Math.min(
      window.innerWidth,
      Math.max(...rows.map((rect) => rect.x + rect.width)),
    );
    const bottom = Math.min(
      window.innerHeight,
      Math.max(...rows.map((rect) => rect.y + rect.height)),
    );
    return {
      height: Math.max(1, bottom - top),
      width: Math.max(1, right - left - 28),
      x: left,
      y: top,
    };
  }, surfaceId);
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

async function performCloseZoom(
  page: Page,
  point: { readonly x: number; readonly y: number },
): Promise<void> {
  await page.mouse.move(point.x, point.y);
  await page.keyboard.down("Control");
  for (let index = 0; index < 320; index += 1) {
    await page.mouse.wheel(0, -5);
    if (index % 12 === 0) {
      await page.waitForTimeout(8);
    }
    if (index % 6 === 0 && (await readViewportZoom(page)) >= 4.2) {
      break;
    }
  }
  await page.keyboard.up("Control");
  await expect.poll(() => readViewportZoom(page)).toBeGreaterThan(4);
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

async function readActiveCodeMirrorText(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const activeElement = document.activeElement;
    const content =
      activeElement instanceof Element
        ? activeElement.closest(".cm-editor")?.querySelector(".cm-content")
        : null;
    return content?.textContent ?? "";
  });
}

async function waitForStableScreenshotClip(
  page: Page,
  clip: Rect,
): Promise<void> {
  await expect
    .poll(async () => {
      const first = await page.screenshot({ clip });
      await waitForAnimationFrame(page);
      const second = await page.screenshot({ clip });
      return (await compareScreenshots(page, first, second)).meanDelta;
    })
    .toBeLessThan(1.5);
}

async function waitForAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

async function startFrameProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __SETTA_RETAINED_RUNTIME_FRAME_PROBE__?: {
        active: boolean;
        intervals: number[];
        last: number | null;
        longTasks: number[];
        observer: PerformanceObserver | null;
      };
    };
    target.__SETTA_RETAINED_RUNTIME_FRAME_PROBE__?.observer?.disconnect();
    const probe = {
      active: true,
      intervals: [] as number[],
      last: null as number | null,
      longTasks: [] as number[],
      observer: null as PerformanceObserver | null,
    };
    if (
      "PerformanceObserver" in window &&
      PerformanceObserver.supportedEntryTypes?.includes("longtask")
    ) {
      probe.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          probe.longTasks.push(entry.duration);
        }
      });
      probe.observer.observe({ entryTypes: ["longtask"] });
    }
    target.__SETTA_RETAINED_RUNTIME_FRAME_PROBE__ = probe;
    const sample = (timestamp: number) => {
      if (!probe.active) {
        return;
      }
      if (probe.last !== null) {
        probe.intervals.push(timestamp - probe.last);
      }
      probe.last = timestamp;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function stopFrameProbe(page: Page): Promise<{
  readonly maxLongTaskMs: number;
  readonly p95IntervalMs: number;
  readonly sampleCount: number;
}> {
  return await page.evaluate(() => {
    const target = window as typeof window & {
      __SETTA_RETAINED_RUNTIME_FRAME_PROBE__?: {
        active: boolean;
        intervals: number[];
        longTasks: number[];
        observer: PerformanceObserver | null;
      };
    };
    const probe = target.__SETTA_RETAINED_RUNTIME_FRAME_PROBE__;
    if (!probe) {
      return { maxLongTaskMs: 0, p95IntervalMs: 0, sampleCount: 0 };
    }
    probe.active = false;
    probe.observer?.disconnect();
    const intervals = [...probe.intervals].sort((left, right) => left - right);
    const p95Index = Math.max(0, Math.ceil(intervals.length * 0.95) - 1);
    return {
      maxLongTaskMs: Math.max(0, ...probe.longTasks),
      p95IntervalMs: intervals[p95Index] ?? 0,
      sampleCount: intervals.length,
    };
  });
}

async function estimateScreenshotSharpness(
  page: Page,
  input: {
    readonly clip: Rect;
    readonly screenshot: Buffer;
    readonly searchRect: Rect;
  },
): Promise<{ readonly meanEdgeDelta: number }> {
  return await page.evaluate(
    async ({ clip, screenshotDataUrl, searchRect }) => {
      const image = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
          reject(new Error("Failed to decode sharpness screenshot."));
      });
      image.src = screenshotDataUrl;
      await loaded;
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Missing sharpness analysis canvas context.");
      }
      ctx.drawImage(image, 0, 0);
      const { data, height, width } = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const left = Math.max(1, Math.floor(searchRect.x - clip.x));
      const right = Math.min(
        width - 1,
        Math.ceil(searchRect.x + searchRect.width - clip.x),
      );
      const top = Math.max(1, Math.floor(searchRect.y - clip.y));
      const bottom = Math.min(
        height - 1,
        Math.ceil(searchRect.y + searchRect.height - clip.y),
      );
      let edgeTotal = 0;
      let edgeCount = 0;
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const center = lumaAt(x, y);
          const delta = Math.max(
            Math.abs(center - lumaAt(x + 1, y)),
            Math.abs(center - lumaAt(x, y + 1)),
          );
          if (delta < 12) {
            continue;
          }
          edgeTotal += delta;
          edgeCount += 1;
        }
      }
      return {
        meanEdgeDelta: edgeCount === 0 ? 0 : edgeTotal / edgeCount,
      };

      function lumaAt(x: number, y: number): number {
        const index = (y * width + x) * 4;
        return (
          0.2126 * (data[index] ?? 0) +
          0.7152 * (data[index + 1] ?? 0) +
          0.0722 * (data[index + 2] ?? 0)
        );
      }
    },
    {
      clip: input.clip,
      screenshotDataUrl: `data:image/png;base64,${input.screenshot.toString(
        "base64",
      )}`,
      searchRect: input.searchRect,
    },
  );
}

async function clampScreenshotClipToViewport(
  page: Page,
  rect: Rect,
): Promise<Rect> {
  return await page.evaluate((rect) => {
    const x = Math.max(0, Math.min(window.innerWidth - 1, rect.x));
    const y = Math.max(0, Math.min(window.innerHeight - 1, rect.y));
    const right = Math.max(
      x + 1,
      Math.min(window.innerWidth, rect.x + rect.width),
    );
    const bottom = Math.max(
      y + 1,
      Math.min(window.innerHeight, rect.y + rect.height),
    );
    return { height: bottom - y, width: right - x, x, y };
  }, rect);
}

function expandRect(rect: Rect, padding: number): Rect {
  return {
    height: rect.height + padding * 2,
    width: rect.width + padding * 2,
    x: rect.x - padding,
    y: rect.y - padding,
  };
}

function selectAllShortcut(): string {
  return process.platform === "darwin" ? "Meta+A" : "Control+A";
}
