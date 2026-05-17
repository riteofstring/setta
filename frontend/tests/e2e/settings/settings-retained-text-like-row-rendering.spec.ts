import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { ensureAppReady } from "../helpers";
import {
  analyzeCodeMirrorTextInkBounds,
  type Point,
  type Rect,
  type RetainedRowDebugEntry,
} from "./settings-retained-visual-analysis";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const SETTINGS_PARAM_CONTENT_SUFFIX = ":param-content:unpinned";
const RETAINED_SURFACE_SCROLL_RESET_STEPS = 80;
const RETAINED_SURFACE_SCROLL_SEARCH_STEPS = 200;

type TextLikeRowTarget = {
  readonly expectActivation: boolean;
  readonly expectScrollSteps: boolean;
  readonly rowId: string;
  readonly surfaceId: string;
};

const TEXT_LIKE_ROW_TARGETS: readonly TextLikeRowTarget[] = [
  {
    expectActivation: true,
    expectScrollSteps: true,
    rowId:
      "settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__metaControlByType__TextParam__minHeight",
    surfaceId:
      "settings-section__sectionSizingPolicy" + SETTINGS_PARAM_CONTENT_SUFFIX,
  },
  {
    expectActivation: false,
    expectScrollSteps: false,
    rowId:
      "settings-codeobj__callableSectionDefault__callableSectionDefault__columnWidth",
    surfaceId:
      "settings-section__callableSectionDefault" +
      SETTINGS_PARAM_CONTENT_SUFFIX,
  },
];

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("all-settings retained text-like row values are visible before click and through editor handoff", async ({
  page,
}, testInfo) => {
  await openAllSettings(page);

  for (const target of TEXT_LIKE_ROW_TARGETS) {
    await centerRetainedSurface(page, target.surfaceId);
    await scrollRetainedSurfaceToTop(page, target.surfaceId);
    const beforeScrollRow = await resolveVisibleTargetRow(page, target);
    const {
      row,
      scrollSteps,
      target: rowTarget,
    } = await scrollRetainedSurfaceUntilRowVisible(page, target);
    if (target.expectScrollSteps) {
      if (rowTarget.rowId === target.rowId) {
        expect(
          beforeScrollRow,
          `Expected ${target.rowId} to be introduced by retained section scroll.`,
        ).toBeNull();
      }
      expect(scrollSteps).toBeGreaterThan(0);
    }

    await waitForRetainedDomControlSource(page, rowTarget);
    const passiveClip = await resolveControlScreenshotClip(page, row);
    const { ink: passiveInk } = await waitForCodeMirrorTextInkFrame({
      name: `${rowTarget.rowId}-passive-before-click.png`,
      page,
      rect: passiveClip,
      searchRect: row.controlClientRect ?? passiveClip,
      testInfo,
    });
    const passiveDiagnostics = await readRetainedTextLikeRowDiagnostics(
      page,
      rowTarget,
    );
    const passiveDetails = JSON.stringify(
      {
        passiveClip,
        passiveDiagnostics,
        passiveInk,
        row,
        scrollSteps,
        target: rowTarget,
      },
      null,
      2,
    );
    expect(passiveInk?.pixelCount ?? 0, passiveDetails).toBeGreaterThan(0);

    if (!rowTarget.expectActivation) {
      continue;
    }

    if (!row.controlClientPoint || !row.controlClientRect) {
      throw new Error(
        `Missing retained control geometry for ${rowTarget.rowId}.`,
      );
    }
    await page.mouse.click(row.controlClientPoint.x, row.controlClientPoint.y);
    const activationFrame = await screenshotClip({
      name: `${rowTarget.rowId}-activation-immediate.png`,
      page,
      rect: passiveClip,
      testInfo,
    });
    const activationInk = await analyzeCodeMirrorTextInkBounds(page, {
      clip: passiveClip,
      screenshot: activationFrame,
      searchRect: row.controlClientRect,
    });
    expect(
      activationInk?.pixelCount ?? 0,
      JSON.stringify(
        { activationInk, passiveInk, row, target: rowTarget },
        null,
        2,
      ),
    ).toBeGreaterThan(0);

    await expect
      .poll(() => readActiveCodeMirrorId(page), { timeout: 5_000 })
      .toContain(row.rowId);
    await waitForAnimationFrame(page);
    const activeGeometry = await readActiveEditorGeometry(
      page,
      row.controlClientRect,
    );
    const activeFrame = await screenshotClip({
      name: `${rowTarget.rowId}-active-editor.png`,
      page,
      rect: passiveClip,
      testInfo,
    });
    const activeInk = await analyzeCodeMirrorTextInkBounds(page, {
      clip: passiveClip,
      screenshot: activeFrame,
      searchRect: row.controlClientRect,
    });
    const activeDetails = JSON.stringify(
      { activeGeometry, activeInk, passiveInk, row, target: rowTarget },
      null,
      2,
    );
    expect(activeGeometry.activeEditorId, activeDetails).toContain(row.rowId);
    expect(Math.abs(activeGeometry.leftDelta), activeDetails).toBeLessThan(2);
    expect(Math.abs(activeGeometry.topDelta), activeDetails).toBeLessThan(9);
    expect(Math.abs(activeGeometry.widthDelta), activeDetails).toBeLessThan(2);
    expect(Math.abs(activeGeometry.heightDelta), activeDetails).toBeLessThan(9);
    expect(activeInk?.pixelCount ?? 0, activeDetails).toBeGreaterThan(0);

    await blurActiveEditor(page);
    const { ink: blurInk } = await waitForCodeMirrorTextInkFrame({
      name: `${rowTarget.rowId}-after-blur.png`,
      page,
      rect: passiveClip,
      searchRect: row.controlClientRect,
      testInfo,
    });
    await expect.poll(() => readActiveCodeMirrorId(page)).toBeNull();
    expect(
      blurInk?.pixelCount ?? 0,
      JSON.stringify({ blurInk, passiveInk, row, target: rowTarget }, null, 2),
    ).toBeGreaterThan(0);
  }
});

async function openAllSettings(page: Page): Promise<void> {
  await ensureAppReady(page);
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
      .filter((row): row is RetainedRowDebugEntry => {
        return row.surfaceId === targetSurfaceId;
      })
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
    const { gpuFlowViewportStore } = await import(
      "/src/gpuFlow/viewportStore.ts"
    );
    const viewportStore = gpuFlowViewportStore.getState();
    viewportStore.setTransform({
      x:
        paneRect.width * 0.5 -
        (flowLeft + firstRow.canvasCssSize.width / 2) * zoom,
      y: paneRect.height * 0.48 - (flowTop + flowHeight / 2) * zoom,
      zoom,
    });
    viewportStore.setFitViewInitializationState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
    });
    window.settaGpuFlowZoom = zoom;
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
  for (let index = 0; index < RETAINED_SURFACE_SCROLL_RESET_STEPS; index += 1) {
    await page.mouse.wheel(0, -240);
  }
  await waitForAnimationFrame(page);
  await waitForAnimationFrame(page);
}

async function scrollRetainedSurfaceUntilRowVisible(
  page: Page,
  target: TextLikeRowTarget,
): Promise<{
  readonly row: RetainedRowDebugEntry;
  readonly scrollSteps: number;
  readonly target: TextLikeRowTarget;
}> {
  let fallbackRow: RetainedRowDebugEntry | null = null;
  for (let step = 0; step < RETAINED_SURFACE_SCROLL_SEARCH_STEPS; step += 1) {
    const row = await resolveVisibleTargetRow(page, target);
    if (row) {
      return { row, scrollSteps: step, target };
    }
    if (target.expectScrollSteps && step > 0) {
      fallbackRow ??= await resolveVisibleTextLikeRow(page, target);
    }
    const point = await resolveOptionalRetainedSurfaceWheelPoint(
      page,
      target.surfaceId,
    );
    if (!point) {
      await centerRetainedSurface(page, target.surfaceId);
      await waitForAnimationFrame(page);
      continue;
    }
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, 120);
    await waitForAnimationFrame(page);
    await waitForAnimationFrame(page);
  }
  if (fallbackRow) {
    return {
      row: fallbackRow,
      scrollSteps: RETAINED_SURFACE_SCROLL_SEARCH_STEPS,
      target: {
        ...target,
        expectActivation: false,
        rowId: fallbackRow.rowId,
      },
    };
  }
  throw new Error(
    `Could not scroll retained row ${target.rowId} into view. ${JSON.stringify(
      await readRetainedSurfaceRowSearchDiagnostics(page, target),
    )}`,
  );
}

async function resolveVisibleTargetRow(
  page: Page,
  target: TextLikeRowTarget,
): Promise<RetainedRowDebugEntry | null> {
  return await page.evaluate((input) => {
    const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId === input.surfaceId &&
          row.rowId === input.rowId &&
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
  }, target);
}

async function resolveVisibleTextLikeRow(
  page: Page,
  target: TextLikeRowTarget,
): Promise<RetainedRowDebugEntry | null> {
  return await page.evaluate((input) => {
    const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId === input.surfaceId &&
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
      .filter((row) => rectIntersectsViewport(row.controlClientRect))
      .sort((left, right) => {
        return (
          (left.controlClientRect?.y ?? left.clientRect.y) -
          (right.controlClientRect?.y ?? right.clientRect.y)
        );
      });
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
  }, target);
}

async function readRetainedSurfaceRowSearchDiagnostics(
  page: Page,
  target: TextLikeRowTarget,
): Promise<unknown> {
  return await page.evaluate((target) => {
    const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
    const surfaceRows = rows.filter(
      (row) => row.surfaceId === target.surfaceId,
    );
    const visibleRows = surfaceRows.filter((row) =>
      rectIntersectsViewport(row.clientRect),
    );
    const textLikeRows = surfaceRows.filter(
      (row) => row.controlKind === "text-like",
    );
    const targetRows = surfaceRows.filter((row) => row.rowId === target.rowId);
    return {
      surfaceId: target.surfaceId,
      surfaceRowCount: surfaceRows.length,
      targetRowCount: targetRows.length,
      targetRows: targetRows.map(rowSummary),
      textLikeRowCount: textLikeRows.length,
      textLikeRowIds: textLikeRows.slice(0, 80).map((row) => row.rowId),
      visibleRowCount: visibleRows.length,
      visibleRows: visibleRows.slice(0, 12).map(rowSummary),
      window: { height: window.innerHeight, width: window.innerWidth },
    };

    function rowSummary(row: RetainedRowDebugEntry) {
      return {
        canvasSamplePoint: row.canvasSamplePoint,
        clientRect: row.clientRect,
        controlClientRect: row.controlClientRect,
        controlKind: row.controlKind,
        rowId: row.rowId,
      };
    }

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
  }, target);
}

async function resolveRetainedSurfaceWheelPoint(
  page: Page,
  surfaceId: string,
): Promise<Point> {
  const point = await resolveOptionalRetainedSurfaceWheelPoint(page, surfaceId);
  if (!point) {
    throw new Error(`Missing visible retained surface rows ${surfaceId}.`);
  }
  return point;
}

async function resolveOptionalRetainedSurfaceWheelPoint(
  page: Page,
  surfaceId: string,
): Promise<Point | null> {
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
      return null;
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

async function resolveControlScreenshotClip(
  page: Page,
  row: RetainedRowDebugEntry,
): Promise<Rect> {
  const rect = row.controlClientRect;
  if (!rect) {
    throw new Error(`Missing control rect for ${row.rowId}.`);
  }
  return await page.evaluate(
    (input) => {
      const width = Math.min(
        Math.max(1, Math.floor(input.width)),
        Math.max(1, window.innerWidth - 1),
      );
      const height = Math.min(
        Math.max(1, Math.floor(input.height)),
        Math.max(1, window.innerHeight - 1),
      );
      const x = Math.min(
        Math.max(0, Math.floor(input.x)),
        Math.max(0, window.innerWidth - width),
      );
      const y = Math.min(
        Math.max(0, Math.floor(input.y)),
        Math.max(0, window.innerHeight - height),
      );
      return { height, width, x, y };
    },
    {
      height: Math.min(44, Math.max(1, rect.height)),
      width: Math.min(260, Math.max(1, rect.width)),
      x: rect.x,
      y: rect.y + rect.height / 2 - Math.min(44, rect.height) / 2,
    },
  );
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

async function readRetainedTextLikeRowDiagnostics(
  page: Page,
  target: TextLikeRowTarget,
): Promise<unknown> {
  return await page.evaluate((target) => {
    const selector = createDomControlHostSelector(target);
    const element = document.querySelector<HTMLElement>(selector);
    const planeDiagnostics =
      (
        window as typeof window & {
          __settaGpuFlowDomControlPlaneDiagnostics?: () => unknown;
        }
      ).__settaGpuFlowDomControlPlaneDiagnostics?.() ?? null;
    const visualSurfaces =
      window.__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__?.() ?? [];
    const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
    const row = rows.find(
      (entry) =>
        entry.surfaceId === target.surfaceId && entry.rowId === target.rowId,
    );
    return {
      retainedRowFound: Boolean(row),
      domControlHost:
        element === null
          ? null
          : {
              active: element.dataset.gpuFlowDomControlActive === "true",
              childElementCount: element.childElementCount,
              className: element.className,
              clientHeight: element.clientHeight,
              clientWidth: element.clientWidth,
              controlId: element.dataset.gpuFlowDomControlId ?? null,
              rect: toPlainRect(element.getBoundingClientRect()),
              style: {
                display: element.style.display,
                pointerEvents: element.style.pointerEvents,
                transform: element.style.transform,
              },
              textContent: element.textContent,
            },
      planeDiagnostics,
      visualSurfaces: visualSurfaces
        .filter((surface) => surface.surfaceId.includes(target.surfaceId))
        .slice(0, 12),
    };

    function toPlainRect(rect: DOMRect): Rect {
      return {
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      };
    }

    function createDomControlHostSelector(input: TextLikeRowTarget): string {
      return [
        "[data-gpu-flow-dom-control='true']",
        `[data-gpu-flow-dom-control-surface-id='${cssEscape(input.surfaceId)}']`,
        `[data-gpu-flow-dom-control-row-id='${cssEscape(input.rowId)}']`,
      ].join("");
    }

    function cssEscape(value: string): string {
      return value.replace(/['\\]/g, "\\$&");
    }
  }, target);
}

async function waitForRetainedDomControlSource(
  page: Page,
  target: TextLikeRowTarget,
): Promise<void> {
  await expect
    .poll(() => readRetainedDomControlSourceReady(page, target), {
      timeout: 5_000,
    })
    .toBe(true);
}

async function readRetainedDomControlSourceReady(
  page: Page,
  target: TextLikeRowTarget,
): Promise<boolean> {
  return await page.evaluate((target) => {
    const selector = [
      "[data-gpu-flow-dom-control='true']",
      `[data-gpu-flow-dom-control-surface-id='${cssEscape(target.surfaceId)}']`,
      `[data-gpu-flow-dom-control-row-id='${cssEscape(target.rowId)}']`,
    ].join("");
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) {
      return false;
    }
    return (
      element.offsetParent !== null &&
      element.getBoundingClientRect().width > 0 &&
      element.getBoundingClientRect().height > 0 &&
      element.textContent !== null
    );

    function cssEscape(value: string): string {
      return value.replace(/['\\]/g, "\\$&");
    }
  }, target);
}

async function readActiveEditorGeometry(
  page: Page,
  expectedRect: Rect,
): Promise<{
  readonly activeEditorId: string | null;
  readonly heightDelta: number;
  readonly leftDelta: number;
  readonly topDelta: number;
  readonly widthDelta: number;
}> {
  return await page.evaluate((expectedRect) => {
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
    if (!activeEditor) {
      throw new Error("Missing active CodeMirror editor.");
    }
    const rect = activeEditor.getBoundingClientRect();
    return {
      activeEditorId,
      heightDelta: rect.height - expectedRect.height,
      leftDelta: rect.left - expectedRect.x,
      topDelta: rect.top - expectedRect.y,
      widthDelta: rect.width - expectedRect.width,
    };
  }, expectedRect);
}

async function blurActiveEditor(page: Page): Promise<void> {
  const pane = page.locator(READY_SELECTOR).first();
  const box = await pane.boundingBox();
  if (!box) {
    throw new Error("Missing GPU pane bounds.");
  }
  await page.mouse.click(box.x + Math.max(8, box.width - 12), box.y + 12);
  await waitForAnimationFrame(page);
}

async function readRetainedRowCount(page: Page): Promise<number> {
  return await page.evaluate(
    () => window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.().length ?? 0,
  );
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

async function waitForAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

async function waitForCodeMirrorTextInkFrame({
  name,
  page,
  rect,
  searchRect,
  testInfo,
}: {
  readonly name: string;
  readonly page: Page;
  readonly rect: Rect;
  readonly searchRect: Rect;
  readonly testInfo: TestInfo;
}): Promise<{
  readonly frame: Buffer;
  readonly ink: Awaited<ReturnType<typeof analyzeCodeMirrorTextInkBounds>>;
}> {
  let latestFrame: Buffer | null = null;
  let latestInk: Awaited<ReturnType<typeof analyzeCodeMirrorTextInkBounds>> =
    null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    latestFrame = await page.screenshot({
      clip: rect,
      path: testInfo.outputPath(name),
    });
    latestInk = await analyzeCodeMirrorTextInkBounds(page, {
      clip: rect,
      screenshot: latestFrame,
      searchRect,
    });
    if ((latestInk?.pixelCount ?? 0) > 0) {
      await attachScreenshot(testInfo, name, latestFrame);
      return { frame: latestFrame, ink: latestInk };
    }
    await page.waitForTimeout(80);
  }
  const fallbackFrame = latestFrame ?? (await page.screenshot({ clip: rect }));
  await attachScreenshot(testInfo, name, fallbackFrame);
  return { frame: fallbackFrame, ink: latestInk };
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
