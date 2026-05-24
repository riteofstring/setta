import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { ensureAppReady } from "../helpers";
import {
  resolveLabelInkSearchRect,
  resolveValueInkSearchRect,
  resolveVisibleLabelInkSearchRect,
  viewportScreenshotClip,
} from "./settings-retained-codemirror-scroll-geometry";
import { analyzeTextPreviewValueColumnPixelCount } from "./settings-retained-codemirror-visual-analysis";
import { waitForAnimationFrame } from "./settings-retained-frame-helpers";
import {
  analyzeCodeMirrorTextInkBounds,
  analyzeRetainedLabelTextInkBounds,
  type Rect,
  type RetainedRowDebugEntry,
  type TextInkBounds,
} from "./settings-retained-visual-analysis";
import {
  clampScreenshotClip,
  screenshotClip,
  waitForStableScreenshotClip,
} from "./settings-retained-visual-regression-helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const GUI_SECTION_ID = "settings-section__gui";
const GUI_CONTENT_SURFACE_ID = `${GUI_SECTION_ID}:param-content:unpinned`;
const SCROLL_TEXT_PREVIEW_LABEL = "Pan On Scroll Speed";
const TEXT_PREVIEW_ROW_ALIGNMENT_TOLERANCE_PX = 4;
const GUI_SCROLL_LABEL_ORDER = [
  "Default Zoom Level",
  "Grid Color",
  "Grid Color Dark Mode",
  "Grid Pattern",
  "Grid Pattern Size",
  "Left Side Pane Shifts Map",
  "Max Zoom",
  "Min Zoom",
  "Pan On Drag",
  "Pan On Scroll",
  "Pan On Scroll Mode",
  "Pan On Scroll Speed",
  "Section Tag Color Choices",
  "Selection Mode",
  "Show Grid Lines",
] as const;

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("retained passive text editor previews stay attached during section scroll", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  await resetGuiContentScrollToTop(page);
  const row = await resolveVisibleGuiRow(page, "Grid Pattern Size");
  await page.mouse.move(row.labelClientPoint.x, row.labelClientPoint.y);
  const surfaceClip = await resolveVisibleGuiSurfaceClip(page);
  const contentClip = clampScreenshotClip({
    height: surfaceClip.height,
    width: Math.max(160, surfaceClip.width - 36),
    x: surfaceClip.x,
    y: surfaceClip.y,
  });
  await waitForStableScreenshotClip(page, contentClip);

  const frames = [
    await captureTextPreviewScrollFrame({
      name: "initial",
      page,
      rect: contentClip,
      testInfo,
    }),
  ];
  for (let index = 0; index < 8; index += 1) {
    await page.mouse.wheel(0, 48);
    await waitForAnimationFrame(page);
    await waitForAnimationFrame(page);
    frames.push(
      await captureTextPreviewScrollFrame({
        name: `wheel-${index}`,
        page,
        rect: contentClip,
        testInfo,
      }),
    );
  }

  const framesWithoutRows = frames.filter(
    (frame) => frame.textRows.length === 0,
  );
  const framesWithoutVisibleText = frames.filter(
    (frame) =>
      frame.visibleValueTextPixelCount < 1 &&
      !frame.textRows.some(
        (row) => row.visibleTextPixelCount >= row.minimumTextPixelCount,
      ),
  );
  const frameDetails = frames.map((frame) => ({
    name: frame.name,
    textRows: frame.textRows,
    visibleValueTextPixelCount: frame.visibleValueTextPixelCount,
  }));
  const failureDetails = JSON.stringify(
    {
      contentClip,
      frames: frameDetails,
      framesWithoutRows: framesWithoutRows.map((frame) => frame.name),
      framesWithoutVisibleText: framesWithoutVisibleText.map(
        (frame) => frame.name,
      ),
      surfaceClip,
    },
    null,
    2,
  );
  expect(framesWithoutRows, failureDetails).toHaveLength(0);
  expect(framesWithoutVisibleText, failureDetails).toHaveLength(0);
});

test("high zoom retained coverage is visible-first", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  await resetGuiContentScrollToTop(page);
  const zoomTarget = await resolveVisibleGuiRow(page, "Max Zoom");
  if (!zoomTarget.controlClientPoint) {
    throw new Error("Missing Max Zoom control point for close zoom test.");
  }
  await performCloseZoom(page, zoomTarget.controlClientPoint);
  await waitForViewportIdle(page);
  const surfaceClip = await resolveVisibleGuiSurfaceClip(page);
  const contentClip = clampScreenshotClip({
    height: surfaceClip.height,
    width: Math.max(160, surfaceClip.width - 36),
    x: surfaceClip.x,
    y: surfaceClip.y,
  });
  await waitForStableScreenshotClip(page, contentClip);
  const frame = await captureTextPreviewScrollFrame({
    name: "close-zoom",
    page,
    rect: contentClip,
    testInfo,
  });
  const visibleTrackedLabels = new Set(frame.textRows.map((row) => row.label));
  const maxZoomTextRow = frame.textRows.find((row) => row.label === "Max Zoom");
  const failureDetails = JSON.stringify(
    {
      contentClip,
      maxZoomTextRow,
      textRows: frame.textRows,
      visibleTrackedLabels: [...visibleTrackedLabels],
      zoom: await readViewportZoom(page),
    },
    null,
    2,
  );

  expect(visibleTrackedLabels.has("Max Zoom"), failureDetails).toBe(true);
  expect(
    maxZoomTextRow?.visibleTextPixelCount ?? 0,
    failureDetails,
  ).toBeGreaterThanOrEqual(maxZoomTextRow?.minimumTextPixelCount ?? 1);
});

test("retained passive text editor preview ink moves with its retained row during section scroll", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  await resetGuiContentScrollToTop(page);
  await centerGuiRowControlAtZoom(page, SCROLL_TEXT_PREVIEW_LABEL, 1.5);
  await waitForStableScreenshotClip(page, await viewportScreenshotClip(page));
  const initialRow = await resolveVisibleGuiRow(
    page,
    SCROLL_TEXT_PREVIEW_LABEL,
  );
  if (!initialRow.controlClientRect) {
    throw new Error(
      `Missing ${SCROLL_TEXT_PREVIEW_LABEL} control rect before scroll.`,
    );
  }
  const initialFrame = await captureTextInkAlignmentFrame({
    name: "scroll-ink-initial",
    page,
    row: initialRow,
    testInfo,
  });
  if (!initialFrame.labelInk || !initialFrame.valueInk) {
    throw new Error(
      `Missing initial Max Zoom text ink: ${JSON.stringify(initialFrame)}`,
    );
  }
  const initialInkOffsetY =
    initialFrame.valueInk.centerY - initialFrame.labelInk.centerY;
  const frames = [initialFrame];

  await page.mouse.move(
    initialRow.labelClientPoint.x,
    initialRow.labelClientPoint.y,
  );
  for (let index = 0; index < 6; index += 1) {
    await page.mouse.wheel(0, 24);
    await waitForAnimationFrame(page);
    await waitForAnimationFrame(page);
    frames.push(
      await captureTextInkAlignmentFrameForLabel({
        label: SCROLL_TEXT_PREVIEW_LABEL,
        name: `scroll-ink-wheel-${index}`,
        page,
        testInfo,
      }),
    );
  }

  const failures = frames.slice(1).flatMap((frame) => {
    if (!frame.labelInk || !frame.valueInk) {
      return [{ frame: frame.name, reason: "missing-text-ink" }];
    }
    const offsetY = frame.valueInk.centerY - frame.labelInk.centerY;
    const offsetDeltaY = offsetY - initialInkOffsetY;
    return Math.abs(offsetDeltaY) > TEXT_PREVIEW_ROW_ALIGNMENT_TOLERANCE_PX
      ? [
          {
            frame: frame.name,
            labelInk: frame.labelInk,
            offsetDeltaY,
            offsetY,
            row: frame.row,
            valueInk: frame.valueInk,
          },
        ]
      : [];
  });
  const failureDetails = JSON.stringify(
    {
      failures,
      frames: frames.map((frame) => ({
        labelInk: frame.labelInk,
        name: frame.name,
        row: frame.row,
        valueInk: frame.valueInk,
      })),
      initialInkOffsetY,
    },
    null,
    2,
  );
  expect(failures, failureDetails).toHaveLength(0);
});

test("focused input does not degrade section scroll cadence", async ({
  page,
}) => {
  await openSettings(page);
  await resetGuiContentScrollToTop(page);
  const row = await resolveVisibleGuiRow(page, SCROLL_TEXT_PREVIEW_LABEL);
  if (!row.controlClientPoint || !row.controlClientRect) {
    throw new Error(
      `Missing ${SCROLL_TEXT_PREVIEW_LABEL} control geometry for active wheel test.`,
    );
  }

  await page.mouse.click(row.controlClientPoint.x, row.controlClientPoint.y);
  await expect
    .poll(() => readActiveCodeMirrorId(page), { timeout: 5_000 })
    .toContain(row.rowId);
  const beforeY = await readRetainedRowClientY(page, SCROLL_TEXT_PREVIEW_LABEL);

  await page.mouse.move(row.controlClientPoint.x, row.controlClientPoint.y);
  for (let index = 0; index < 5; index += 1) {
    await page.mouse.wheel(0, 48);
    await waitForAnimationFrame(page);
  }

  await expect
    .poll(() => readActiveCodeMirrorId(page), { timeout: 2_000 })
    .toContain(row.rowId);
  const afterY = await readRetainedRowClientY(page, SCROLL_TEXT_PREVIEW_LABEL);
  const editorState = await readActiveCodeMirrorWheelState(page);
  const rowDomControlState = await readRetainedDomControlStateForRow(
    page,
    row.rowId,
  );
  const failureDetails = JSON.stringify(
    {
      afterY,
      beforeY,
      editorState,
      rowDomControlState,
      row: {
        controlClientPoint: row.controlClientPoint,
        controlClientRect: row.controlClientRect,
        rowId: row.rowId,
        rowLabel: row.rowLabel,
      },
    },
    null,
    2,
  );

  if (editorState.activeEditorId === null) {
    throw new Error(failureDetails);
  }
  expect(editorState.activeEditorId, failureDetails).toContain(row.rowId);
  expect(editorState.verticalScrollRoom, failureDetails).toBeLessThanOrEqual(1);
  expect(afterY, failureDetails).toBeLessThan(beforeY - 12);
});

test("retained rows move monotonically during one-direction section wheel input", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  await resetGuiContentScrollToTop(page);
  const label = "Pan On Scroll";
  const initialRow = await resolveVisibleGuiRow(page, label);
  await page.mouse.move(
    initialRow.labelClientPoint.x,
    initialRow.labelClientPoint.y,
  );
  await waitForStableScreenshotClip(page, await viewportScreenshotClip(page));

  const frames = [
    await captureRetainedLabelMotionFrame({
      label,
      name: "monotonic-initial",
      page,
      testInfo,
    }),
  ];
  for (let index = 0; index < 16; index += 1) {
    await page.mouse.wheel(0, 8);
    await waitForAnimationFrame(page);
    frames.push(
      await captureRetainedLabelMotionFrame({
        label,
        name: `monotonic-wheel-${index}`,
        page,
        testInfo,
      }),
    );
  }

  const failures = frames.slice(1).flatMap((frame, index) => {
    const previous = frames[index];
    if (!previous) {
      return [];
    }
    if (!previous.labelInk || !frame.labelInk) {
      return [
        {
          frame: frame.name,
          previousFrame: previous.name,
          reason: "missing-label-ink",
        },
      ];
    }
    const deltaY = frame.labelInk.centerY - previous.labelInk.centerY;
    return deltaY > 1.5
      ? [
          {
            deltaY,
            frame,
            previousFrame: previous,
          },
        ]
      : [];
  });
  const failureDetails = JSON.stringify(
    {
      failures,
      frames: frames.map((frame) => ({
        labelInk: frame.labelInk,
        name: frame.name,
        row: frame.row,
      })),
    },
    null,
    2,
  );
  expect(failures, failureDetails).toHaveLength(0);
});

async function openSettings(page: Page): Promise<void> {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  await page.getByRole("button", { exact: true, name: "Core" }).click();
  await waitForCoreSettingsView(page);
  await page.getByRole("button", { name: "fit view" }).click();
  await waitForViewportIdle(page);
  await expect(
    page.locator(`.setta-gpu-flow__node[data-id="${GUI_SECTION_ID}"]`),
  ).toBeVisible();
  await waitForRetainedRows(page);
}

async function waitForCoreSettingsView(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelectorAll(".setta-gpu-flow__node").length <= 10,
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
  const rows = await page.evaluate(
    ({ label, surfaceId }) => {
      return (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []).filter(
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
      );
    },
    { label, surfaceId: GUI_CONTENT_SURFACE_ID },
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`Missing visible retained GUI row ${label}`);
  }
  return row;
}

async function resolveVisibleGuiSurfaceClip(page: Page): Promise<Rect> {
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
      throw new Error("Missing visible GUI retained surface.");
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
      width: Math.max(1, right - left),
      x: left,
      y: top,
    };
  }, GUI_CONTENT_SURFACE_ID);
}

async function resetGuiContentScrollToTop(page: Page): Promise<void> {
  const row = await resolveVisibleGuiRow(page, "Pan On Scroll Mode");
  await page.mouse.move(row.labelClientPoint.x, row.labelClientPoint.y);
  for (let index = 0; index < 12; index += 1) {
    await page.mouse.wheel(0, -96);
    await page.waitForTimeout(12);
  }
  await expect
    .poll(async () => {
      return await page.evaluate((surfaceId) => {
        return (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []).filter(
          (candidate): candidate is RetainedRowDebugEntry =>
            candidate.surfaceId === surfaceId &&
            candidate.rowLabel === "Grid Pattern Size" &&
            candidate.canvasSamplePoint.x >= 0 &&
            candidate.canvasSamplePoint.y >= 0 &&
            candidate.canvasSamplePoint.x < candidate.canvasCssSize.width &&
            candidate.canvasSamplePoint.y < candidate.canvasCssSize.height &&
            candidate.clientRect.y > 0 &&
            candidate.clientRect.y < window.innerHeight,
        ).length;
      }, GUI_CONTENT_SURFACE_ID);
    })
    .toBeGreaterThan(0);
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

async function centerGuiRowControlAtZoom(
  page: Page,
  label: string,
  zoom: number,
): Promise<void> {
  await page.evaluate(
    async ({ label, surfaceId, zoom }) => {
      const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
      const row = rows.find(
        (candidate): candidate is RetainedRowDebugEntry =>
          candidate.surfaceId === surfaceId &&
          candidate.rowLabel === label &&
          candidate.controlClientPoint !== null,
      );
      const pane = document.querySelector(".setta-gpu-flow__pane");
      const transform =
        window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport.transform;
      if (!row || !pane || !transform || !row.controlClientPoint) {
        throw new Error(`Missing retained row zoom target for ${label}.`);
      }
      const paneRect = pane.getBoundingClientRect();
      const flowCenter = {
        x:
          (row.controlClientPoint.x - paneRect.left - transform.x) /
          transform.zoom,
        y:
          (row.controlClientPoint.y - paneRect.top - transform.y) /
          transform.zoom,
      };
      const { gpuFlowViewportStore } = await import(
        "/src/gpuFlow/viewportStore.ts"
      );
      gpuFlowViewportStore.getState().setTransform({
        x: paneRect.width * 0.9 - flowCenter.x * zoom,
        y: paneRect.height * 0.46 - flowCenter.y * zoom,
        zoom,
      });
    },
    { label, surfaceId: GUI_CONTENT_SURFACE_ID, zoom },
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

async function performCloseZoom(
  page: Page,
  point: { readonly x: number; readonly y: number },
): Promise<void> {
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
        ?.getAttribute("data-gpu-flow-control") ??
      activeElement
        .closest("[data-gpu-flow-dom-control-row-id]")
        ?.getAttribute("data-gpu-flow-dom-control-row-id") ??
      activeElement.closest("[data-param-id]")?.getAttribute("data-param-id") ??
      null
    );
  });
}

async function readActiveCodeMirrorWheelState(page: Page): Promise<{
  readonly activeEditorId: string | null;
  readonly activeElementPath: readonly ActiveElementDebugEntry[];
  readonly verticalScrollRoom: number;
}> {
  return await page.evaluate(() => {
    const activeElement = document.activeElement;
    const activeEditorId =
      activeElement instanceof Element
        ? activeElement
            .closest("[data-gpu-flow-control]")
            ?.getAttribute("data-gpu-flow-control") ??
          activeElement
            .closest("[data-gpu-flow-dom-control-row-id]")
            ?.getAttribute("data-gpu-flow-dom-control-row-id") ??
          activeElement
            .closest("[data-param-id]")
            ?.getAttribute("data-param-id") ??
          null
        : null;
    const scroller =
      activeElement instanceof Element
        ? activeElement.closest(".cm-editor")?.querySelector(".cm-scroller")
        : null;
    const verticalScrollRoom =
      scroller instanceof HTMLElement
        ? Math.max(0, scroller.scrollHeight - scroller.clientHeight)
        : 0;
    return {
      activeEditorId,
      activeElementPath:
        activeElement instanceof Element
          ? describeActiveElementPath(activeElement)
          : [],
      verticalScrollRoom,
    };

    function describeActiveElementPath(
      element: Element,
    ): readonly ActiveElementDebugEntry[] {
      const path: ActiveElementDebugEntry[] = [];
      let current: Element | null = element;
      while (current && path.length < 10) {
        path.push({
          className:
            typeof current.className === "string" ? current.className : "",
          gpuFlowControl: current.getAttribute("data-gpu-flow-control"),
          gpuFlowDomControlRowId: current.getAttribute(
            "data-gpu-flow-dom-control-row-id",
          ),
          paramId: current.getAttribute("data-param-id"),
          role: current.getAttribute("role"),
          tagName: current.tagName.toLowerCase(),
        });
        current = current.parentElement;
      }
      return path;
    }
  });
}

type ActiveElementDebugEntry = {
  readonly className: string;
  readonly gpuFlowControl: string | null;
  readonly gpuFlowDomControlRowId: string | null;
  readonly paramId: string | null;
  readonly role: string | null;
  readonly tagName: string;
};

async function readRetainedDomControlStateForRow(
  page: Page,
  rowId: string,
): Promise<{
  readonly diagnostics: unknown;
  readonly hosts: readonly RetainedDomControlHostDebugEntry[];
}> {
  return await page.evaluate((rowId) => {
    const view = window as Window & {
      __settaGpuFlowDomControlPlaneDiagnostics?: () => unknown;
    };
    const diagnostics =
      view.__settaGpuFlowDomControlPlaneDiagnostics?.() ?? null;
    const hosts = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-gpu-flow-dom-control-row-id]",
      ),
    ]
      .filter(
        (element) =>
          element.getAttribute("data-gpu-flow-dom-control-row-id") === rowId,
      )
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          active: element.getAttribute("data-gpu-flow-dom-control-active"),
          controlId: element.getAttribute("data-gpu-flow-dom-control-id"),
          display: getComputedStyle(element).display,
          focusedDescendant: element.contains(document.activeElement),
          gpuFlowControls: [
            ...element.querySelectorAll<HTMLElement>("[data-gpu-flow-control]"),
          ].map((control) => control.getAttribute("data-gpu-flow-control")),
          paramIds: [
            ...element.querySelectorAll<HTMLElement>("[data-param-id]"),
          ].map((control) => control.getAttribute("data-param-id")),
          rect: {
            height: rect.height,
            width: rect.width,
            x: rect.x,
            y: rect.y,
          },
          rowId: element.getAttribute("data-gpu-flow-dom-control-row-id"),
        };
      });
    return {
      diagnostics,
      hosts,
    };
  }, rowId);
}

type RetainedDomControlHostDebugEntry = {
  readonly active: string | null;
  readonly controlId: string | null;
  readonly display: string;
  readonly focusedDescendant: boolean;
  readonly gpuFlowControls: readonly (string | null)[];
  readonly paramIds: readonly (string | null)[];
  readonly rect: Rect;
  readonly rowId: string | null;
};

async function readRetainedRowClientY(
  page: Page,
  label: string,
): Promise<number> {
  return await page.evaluate(
    ({ label, surfaceId }) => {
      const row = (
        window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []
      ).find(
        (candidate): candidate is RetainedRowDebugEntry =>
          candidate.surfaceId === surfaceId && candidate.rowLabel === label,
      );
      if (!row) {
        throw new Error(`Missing retained row ${label}.`);
      }
      return row.clientRect.y;
    },
    { label, surfaceId: GUI_CONTENT_SURFACE_ID },
  );
}

async function captureTextPreviewScrollFrame({
  name,
  page,
  rect,
  testInfo,
}: {
  readonly name: string;
  readonly page: Page;
  readonly rect: Rect;
  readonly testInfo: TestInfo;
}): Promise<{
  readonly name: string;
  readonly textRows: readonly TextPreviewRowStats[];
  readonly visibleValueTextPixelCount: number;
}> {
  const screenshot = await screenshotClip({
    name: `visual-scroll-text-preview-${name}.png`,
    page,
    rect,
    testInfo,
  });
  const [textRows, visibleValueTextPixelCount] = await Promise.all([
    analyzeVisibleTextPreviewRows(page, {
      clip: rect,
      screenshot,
    }),
    analyzeTextPreviewValueColumnPixelCount(page, {
      screenshot,
    }),
  ]);
  return {
    name,
    textRows,
    visibleValueTextPixelCount,
  };
}

async function captureTextInkAlignmentFrame({
  name,
  page,
  row,
  testInfo,
}: {
  readonly name: string;
  readonly page: Page;
  readonly row: RetainedRowDebugEntry & { readonly controlClientRect: Rect };
  readonly testInfo: TestInfo;
}): Promise<{
  readonly labelInk: TextInkBounds | null;
  readonly name: string;
  readonly row: {
    readonly controlClientRect: Rect;
    readonly rowLabel: string;
    readonly rowY: number;
    readonly valueClientRect: Rect;
  };
  readonly valueInk: TextInkBounds | null;
}> {
  const valueClientRect =
    (await resolveProjectedDomControlHostRectForRow(page, row)) ??
    row.controlClientRect;
  if (!valueClientRect) {
    throw new Error(`Missing retained value rect for ${row.rowLabel}.`);
  }
  const clip = await viewportScreenshotClip(page);
  const screenshot = await screenshotClip({
    name: `visual-scroll-text-ink-${name}.png`,
    page,
    rect: clip,
    testInfo,
  });
  const [labelInk, valueInk] = await Promise.all([
    analyzeRetainedLabelTextInkBounds(page, {
      clip,
      screenshot,
      searchRect: resolveLabelInkSearchRect(row),
    }),
    analyzeCodeMirrorTextInkBounds(page, {
      clip,
      screenshot,
      searchRect: resolveValueInkSearchRect(valueClientRect),
    }),
  ]);
  return {
    labelInk,
    name,
    row: {
      controlClientRect: row.controlClientRect,
      rowLabel: row.rowLabel,
      rowY: row.clientRect.y,
      valueClientRect,
    },
    valueInk,
  };
}

async function captureTextInkAlignmentFrameForLabel({
  label,
  name,
  page,
  testInfo,
}: {
  readonly label: string;
  readonly name: string;
  readonly page: Page;
  readonly testInfo: TestInfo;
}): Promise<{
  readonly labelInk: TextInkBounds | null;
  readonly name: string;
  readonly row: {
    readonly controlClientRect: Rect;
    readonly rowLabel: string;
    readonly rowY: number;
    readonly valueClientRect: Rect;
  };
  readonly valueInk: TextInkBounds | null;
}> {
  const row = await resolveVisibleGuiRow(page, label);
  if (!row.controlClientRect) {
    throw new Error(`Missing ${label} control rect for ${name}.`);
  }
  const valueClientRect =
    (await resolveProjectedDomControlHostRectForRow(page, row)) ??
    row.controlClientRect;
  if (!valueClientRect) {
    throw new Error(`Missing retained value rect for ${label}.`);
  }
  const clip = await viewportScreenshotClip(page);
  const screenshot = await screenshotClip({
    name: `visual-scroll-text-ink-${name}.png`,
    page,
    rect: clip,
    testInfo,
  });
  const [labelInk, valueInk] = await Promise.all([
    analyzeRetainedLabelTextInkBounds(page, {
      clip,
      screenshot,
      searchRect: resolveLabelInkSearchRect(row),
    }),
    analyzeCodeMirrorTextInkBounds(page, {
      clip,
      screenshot,
      searchRect: resolveValueInkSearchRect(valueClientRect),
    }),
  ]);
  return {
    labelInk,
    name,
    row: {
      controlClientRect: row.controlClientRect,
      rowLabel: row.rowLabel,
      rowY: row.clientRect.y,
      valueClientRect,
    },
    valueInk,
  };
}

async function resolveProjectedDomControlHostRectForRow(
  page: Page,
  row: RetainedRowDebugEntry,
): Promise<Rect | null> {
  return await page.evaluate(
    ({ rowId, surfaceId }) => {
      const host = [
        ...document.querySelectorAll('[data-gpu-flow-dom-control="true"]'),
      ].find(
        (element): element is HTMLElement =>
          element instanceof HTMLElement &&
          element.getAttribute("data-gpu-flow-dom-control-surface-id") ===
            surfaceId &&
          element.getAttribute("data-gpu-flow-dom-control-row-id") === rowId,
      );
      if (!host || getComputedStyle(host).display === "none") {
        return null;
      }
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      return {
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      };
    },
    { rowId: row.rowId, surfaceId: GUI_CONTENT_SURFACE_ID },
  );
}

async function captureRetainedLabelMotionFrame({
  label,
  name,
  page,
  testInfo,
}: {
  readonly label: string;
  readonly name: string;
  readonly page: Page;
  readonly testInfo: TestInfo;
}): Promise<{
  readonly labelInk: TextInkBounds | null;
  readonly name: string;
  readonly row: {
    readonly rowLabel: string;
    readonly rowY: number;
  };
}> {
  const clip = await viewportScreenshotClip(page);
  const screenshot = await screenshotClip({
    name: `visual-scroll-label-motion-${name}.png`,
    page,
    rect: clip,
    testInfo,
  });
  const row = await resolveVisibleGuiRow(page, label);
  const labelInk = await analyzeRetainedLabelTextInkBounds(page, {
    clip,
    screenshot,
    searchRect: resolveVisibleLabelInkSearchRect(row),
  });
  return {
    labelInk,
    name,
    row: {
      rowLabel: row.rowLabel,
      rowY: row.clientRect.y,
    },
  };
}

type TextPreviewRowStats = {
  readonly label: string;
  readonly minimumTextPixelCount: number;
  readonly rowY: number;
  readonly valueClientRect: Rect;
  readonly visibleTextPixelCount: number;
};

async function analyzeVisibleTextPreviewRows(
  page: Page,
  input: {
    readonly clip: Rect;
    readonly screenshot: Buffer;
  },
): Promise<readonly TextPreviewRowStats[]> {
  return await page.evaluate(
    async ({ clip, screenshotDataUrl, surfaceId, trackedLabels }) => {
      const trackedLabelSet = new Set(trackedLabels);
      const hostRectByRowId = new Map<string, Rect>();
      for (const element of document.querySelectorAll(
        '[data-gpu-flow-dom-control="true"]',
      )) {
        if (!(element instanceof HTMLElement)) {
          continue;
        }
        if (
          element.getAttribute("data-gpu-flow-dom-control-surface-id") !==
          surfaceId
        ) {
          continue;
        }
        const rowId = element.getAttribute("data-gpu-flow-dom-control-row-id");
        if (!rowId || getComputedStyle(element).display === "none") {
          continue;
        }
        const rect = element.getBoundingClientRect();
        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          rect.y < clip.y + 1 ||
          rect.y + rect.height > clip.y + clip.height - 1
        ) {
          continue;
        }
        hostRectByRowId.set(rowId, {
          height: rect.height,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        });
      }
      const resolveValueRect = (row: RetainedRowDebugEntry): Rect | null =>
        hostRectByRowId.get(row.rowId) ?? row.controlClientRect;
      const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
        .filter(
          (row): row is RetainedRowDebugEntry =>
            row.surfaceId === surfaceId &&
            trackedLabelSet.has(row.rowLabel) &&
            row.controlKind === "text-like" &&
            resolveValueRect(row) !== null &&
            row.canvasSamplePoint.x >= 0 &&
            row.canvasSamplePoint.y >= 0 &&
            row.canvasSamplePoint.x < row.canvasCssSize.width &&
            row.canvasSamplePoint.y < row.canvasCssSize.height &&
            row.clientRect.width > 16 &&
            row.clientRect.height > 8 &&
            row.clientRect.y < clip.y + clip.height &&
            row.clientRect.y + row.clientRect.height > clip.y,
        )
        .sort((left, right) => left.clientRect.y - right.clientRect.y);
      const image = await loadImage(screenshotDataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Missing text preview analysis canvas context.");
      }
      ctx.drawImage(image, 0, 0);
      const { data, height, width } = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      return rows.map((row) => {
        const controlRect = resolveValueRect(row);
        if (!controlRect) {
          throw new Error(`Missing retained value rect for ${row.rowLabel}`);
        }
        const left = Math.max(0, Math.floor(controlRect.x - clip.x));
        const right = Math.min(
          width,
          Math.ceil(controlRect.x + Math.min(controlRect.width, 260) - clip.x),
        );
        const top = Math.max(0, Math.floor(controlRect.y - clip.y));
        const bottom = Math.min(
          height,
          Math.ceil(controlRect.y + controlRect.height - clip.y),
        );
        let visibleTextPixelCount = 0;
        for (let y = top; y < bottom; y += 1) {
          for (let x = left; x < right; x += 1) {
            const index = (y * width + x) * 4;
            const r = data[index] ?? 0;
            const g = data[index + 1] ?? 0;
            const b = data[index + 2] ?? 0;
            if (isCodeMirrorTextPixel(r, g, b)) {
              visibleTextPixelCount += 1;
            }
          }
        }
        return {
          label: row.rowLabel,
          minimumTextPixelCount: 1,
          rowY: row.clientRect.y,
          valueClientRect: controlRect,
          visibleTextPixelCount,
        };
      });

      async function loadImage(url: string): Promise<HTMLImageElement> {
        const image = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error("Failed to decode text preview screenshot."));
        });
        image.src = url;
        await loaded;
        return image;
      }

      function isCodeMirrorTextPixel(r: number, g: number, b: number): boolean {
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const slateCanvasText =
          luma >= 35 && luma < 95 && g - r > 8 && b - g > 8 && b - r > 20;
        const darkCanvasText =
          luma >= 15 && luma < 70 && g >= r && b > g && b - r > 14;
        if (slateCanvasText || darkCanvasText) {
          return true;
        }
        if (luma < 70) {
          return false;
        }
        const coolText = b > 95 && g > 75 && b - r > 18;
        const purpleText = r > 115 && b > 115 && b - g > 10;
        const warmText = r > 120 && r - g > 25 && r - b > 15;
        return coolText || purpleText || warmText;
      }
    },
    {
      clip: input.clip,
      screenshotDataUrl: `data:image/png;base64,${input.screenshot.toString(
        "base64",
      )}`,
      surfaceId: GUI_CONTENT_SURFACE_ID,
      trackedLabels: GUI_SCROLL_LABEL_ORDER,
    },
  );
}
