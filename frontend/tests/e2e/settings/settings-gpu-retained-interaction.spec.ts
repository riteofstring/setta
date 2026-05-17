import { expect, test, type Page } from "@playwright/test";
import {
  applyProjectMutationsFromFrontend,
  ensureAppReady,
  setParamEnteredValueFromFrontend,
} from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const GUI_SECTION_ID = "settings-section__gui";
const GUI_CONTENT_SURFACE_ID = `${GUI_SECTION_ID}:param-content:unpinned`;

type RetainedControlTarget = {
  readonly canvasCssSize: { readonly height: number; readonly width: number };
  readonly canvasSamplePoint: { readonly x: number; readonly y: number };
  readonly clientRect: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly clientPoint: { readonly x: number; readonly y: number };
  readonly label: string;
  readonly rowId: string;
  readonly rowState: {
    readonly controlFocused?: boolean;
    readonly focused?: boolean;
  };
  readonly surfaceId: string;
};

type Pixel = {
  readonly a: number;
  readonly b: number;
  readonly g: number;
  readonly r: number;
};

type GpuFlowDebugSnapshot = {
  readonly activeMode: string;
  readonly pointerCapture: { readonly active: boolean } | null;
  readonly viewport: {
    readonly nodeResizing?: boolean;
    readonly nodesSelectionBounds: unknown;
    readonly retainedContentScrolling?: boolean;
    readonly viewportAnimating?: boolean;
    readonly viewportInteractionActive?: boolean;
    readonly wheelZooming?: boolean;
  };
};

type TopLevelSectionsSnapshot = Record<string, unknown>;

type GpuFlowRetainedRowDebugEntry = {
  readonly canvasCssSize: { readonly height: number; readonly width: number };
  readonly canvasSamplePoint: { readonly x: number; readonly y: number };
  readonly clientRect: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly controlClientPoint: {
    readonly x: number;
    readonly y: number;
  } | null;
  readonly labelClientPoint: {
    readonly x: number;
    readonly y: number;
  };
  readonly rowId: string;
  readonly rowLabel: string;
  readonly rowState: {
    readonly controlFocused?: boolean;
    readonly focused?: boolean;
  };
  readonly surfaceScrollOffset: {
    readonly x: number;
    readonly y: number;
  };
  readonly surfaceId: string;
};

test("settings retained controls and text editors stay local to the row", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  const guiNode = page.locator(
    `.setta-gpu-flow__node[data-id="${GUI_SECTION_ID}"]`,
  );
  await expect(guiNode).toBeVisible();
  await expect.poll(() => readNodesSelectionBounds(page)).toBeNull();
  await waitForGpuFlowIdle(page);

  const initialLeftPaneShift = Boolean(
    await readGuiSetting(page, "leftSidePaneShiftsMap"),
  );
  const initialMaxZoom = Number(await readGuiSetting(page, "maxZoom"));
  const initialPanOnDrag = Boolean(await readGuiSetting(page, "panOnDrag"));
  const initialTopLevelSections = await readTopLevelSections(page);
  let leftPaneTarget: RetainedControlTarget | null = null;
  let maxZoomTarget: RetainedControlTarget | null = null;
  let panOnDragTarget: RetainedControlTarget | null = null;
  let guiSectionResizeDelta: { x: number; y: number } | null = null;

  try {
    leftPaneTarget = await resolveRetainedControlTarget(
      page,
      "Left Side Pane Shifts Map",
    );
    await clickRetainedControlUntilGuiSetting(
      page,
      leftPaneTarget,
      "leftSidePaneShiftsMap",
      !initialLeftPaneShift,
    );
    await expect
      .poll(() => pixelDistanceFromFocusedRowBackground(page, leftPaneTarget))
      .toBeGreaterThan(18);
    await expect
      .poll(() => readRetainedRowFocused(page, leftPaneTarget))
      .toBe(false);
    await expect.poll(() => readNodesSelectionBounds(page)).toBeNull();
    await expect
      .poll(async () => (await readGpuFlowDebugSnapshot(page))?.activeMode)
      .not.toBe("retained-content");
    await expect
      .poll(
        async () =>
          (await readGpuFlowDebugSnapshot(page))?.pointerCapture?.active ??
          false,
      )
      .toBe(false);

    await page.mouse.click(
      leftPaneTarget.clientPoint.x,
      leftPaneTarget.clientPoint.y,
    );
    await expect
      .poll(async () =>
        Boolean(await readGuiSetting(page, "leftSidePaneShiftsMap")),
      )
      .toBe(initialLeftPaneShift);

    maxZoomTarget = await resolveRetainedControlTarget(page, "Max Zoom");
    await page.mouse.click(
      maxZoomTarget.clientPoint.x,
      maxZoomTarget.clientPoint.y,
    );
    await expect
      .poll(() => readActiveGpuFlowControl(page))
      .toContain(maxZoomTarget.rowId);
    await expect
      .poll(() => pixelDistanceFromFocusedRowBackground(page, maxZoomTarget))
      .toBeGreaterThan(18);
    await expect
      .poll(() => readRetainedRowFocused(page, maxZoomTarget))
      .toBe(false);
    await expect.poll(() => readNodesSelectionBounds(page)).toBeNull();

    await page.keyboard.press(selectAllShortcut());
    await page.keyboard.type("12");
    await expect
      .poll(async () => Number(await readGuiSetting(page, "maxZoom")))
      .toBe(12);
    await expect
      .poll(() => readActiveGpuFlowControl(page))
      .toContain(maxZoomTarget.rowId);

    await page.keyboard.press(selectAllShortcut());
    await page.keyboard.type("10");
    await expect
      .poll(async () => Number(await readGuiSetting(page, "maxZoom")))
      .toBe(10);

    await page.mouse.move(
      leftPaneTarget.clientPoint.x,
      leftPaneTarget.clientPoint.y,
    );
    await scrollGuiContentRowIntoView(page, "Pan On Drag");
    await waitForGpuFlowIdle(page);
    guiSectionResizeDelta = { x: 24, y: 18 };
    await dragGuiSectionResizeHandle(page, guiSectionResizeDelta);
    await waitForGpuFlowIdle(page);

    panOnDragTarget = await resolveRetainedControlTarget(page, "Pan On Drag");
    await clickRetainedControlUntilGuiSetting(
      page,
      panOnDragTarget,
      "panOnDrag",
      !initialPanOnDrag,
    );
    await expect
      .poll(() => readRetainedRowFocused(page, panOnDragTarget))
      .toBe(false);
    await expect.poll(() => readNodesSelectionBounds(page)).toBeNull();
    await expect
      .poll(async () => (await readGpuFlowDebugSnapshot(page))?.activeMode)
      .not.toBe("retained-content");

    panOnDragTarget = await resolveRetainedControlTarget(page, "Pan On Drag");
    await clickRetainedControlUntilGuiSetting(
      page,
      panOnDragTarget,
      "panOnDrag",
      initialPanOnDrag,
    );
  } finally {
    if (guiSectionResizeDelta) {
      await dragGuiSectionResizeHandle(page, {
        x: -guiSectionResizeDelta.x,
        y: -guiSectionResizeDelta.y,
      });
      await settleDebouncedTopLevelLayoutWrite(page);
      await restoreTopLevelSections(page, initialTopLevelSections);
    }
    await resetGuiContentScrollToTop(page);
    if (leftPaneTarget) {
      await restoreGuiSetting(
        page,
        "leftSidePaneShiftsMap",
        leftPaneTarget.rowId,
        initialLeftPaneShift,
      );
    }
    if (panOnDragTarget) {
      await restoreGuiSetting(
        page,
        "panOnDrag",
        panOnDragTarget.rowId,
        initialPanOnDrag,
      );
    }
    if (maxZoomTarget) {
      await restoreGuiSetting(
        page,
        "maxZoom",
        maxZoomTarget.rowId,
        initialMaxZoom,
      );
    }
  }
});

async function resolveRetainedControlTarget(
  page: Page,
  label: string,
): Promise<RetainedControlTarget> {
  return await page.evaluate(
    ({ guiContentSurfaceId, label }) => {
      const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
      const matchingRows = (rows as readonly GpuFlowRetainedRowDebugEntry[])
        .filter(
          (candidate) =>
            candidate.surfaceId === guiContentSurfaceId &&
            candidate.rowLabel === label,
        )
        .filter(isVisibleRetainedRow);
      const row = matchingRows[0] ?? null;
      if (!row) {
        throw new Error(`Missing retained settings row ${label}.`);
      }
      if (!row.controlClientPoint) {
        throw new Error(`Missing retained control hit for ${label}.`);
      }
      return {
        canvasCssSize: row.canvasCssSize,
        canvasSamplePoint: row.canvasSamplePoint,
        clientRect: row.clientRect,
        clientPoint: row.controlClientPoint,
        label,
        rowId: row.rowId,
        rowState: row.rowState,
        surfaceId: row.surfaceId,
      };

      function isVisibleRetainedRow(
        candidate: GpuFlowRetainedRowDebugEntry,
      ): boolean {
        return (
          candidate.clientRect.x + candidate.clientRect.width > 0 &&
          candidate.clientRect.x < window.innerWidth &&
          candidate.clientRect.y + candidate.clientRect.height > 0 &&
          candidate.clientRect.y < window.innerHeight
        );
      }
    },
    { guiContentSurfaceId: GUI_CONTENT_SURFACE_ID, label },
  );
}

type GuiSettingKey = "leftSidePaneShiftsMap" | "maxZoom" | "panOnDrag";

async function readGuiSetting(
  page: Page,
  key: GuiSettingKey,
): Promise<unknown> {
  return await page.evaluate(async (key) => {
    const { useSettings } = await import("/src/state/definitions.ts");
    return (useSettings.getState().gui as Record<string, unknown>)[key];
  }, key);
}

async function readTopLevelSections(
  page: Page,
): Promise<TopLevelSectionsSnapshot> {
  return await page.evaluate(async () => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    return JSON.parse(
      JSON.stringify(useProjectState.getState().projectConfig.topLevelSections),
    ) as TopLevelSectionsSnapshot;
  });
}

async function restoreTopLevelSections(
  page: Page,
  topLevelSections: TopLevelSectionsSnapshot,
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: "settings",
    operations: [
      {
        operationName: "setTopLevelSectionLayout",
        body: {
          topLevelSections,
          frontendOpId: null,
        },
      },
    ],
  });
}

async function restoreGuiSetting(
  page: Page,
  key: GuiSettingKey,
  rowId: string,
  value: boolean | number,
): Promise<void> {
  if (String(await readGuiSetting(page, key)) === String(value)) {
    return;
  }
  await setParamEnteredValueFromFrontend(page, {
    projectConfigId: "settings",
    sectionId: GUI_SECTION_ID,
    paramInfoId: rowId,
    value: String(value),
  });
  await expect
    .poll(async () => String(await readGuiSetting(page, key)))
    .toBe(String(value));
}

async function clickRetainedControlUntilGuiSetting(
  page: Page,
  target: RetainedControlTarget,
  key: GuiSettingKey,
  expectedValue: boolean,
): Promise<void> {
  const deadlineMs = Date.now() + 5_000;
  let value = Boolean(await readGuiSetting(page, key));
  let currentTarget = target;
  const attempts: unknown[] = [];
  while (Date.now() < deadlineMs) {
    currentTarget = await resolveRetainedControlTarget(page, target.label);
    const before = Boolean(await readGuiSetting(page, key));
    const hitTarget = await readElementAtPoint(page, currentTarget.clientPoint);
    await page.mouse.move(
      currentTarget.clientPoint.x,
      currentTarget.clientPoint.y,
    );
    await page.mouse.down();
    await page.waitForTimeout(16);
    const pointerDownSnapshot = await readGpuFlowDebugSnapshot(page);
    await page.mouse.up();
    const settleDeadlineMs = Date.now() + 500;
    while (Date.now() < settleDeadlineMs) {
      value = Boolean(await readGuiSetting(page, key));
      if (value === expectedValue) {
        return;
      }
      await page.waitForTimeout(50);
    }
    const snapshot = await readGpuFlowDebugSnapshot(page);
    attempts.push({
      after: value,
      before,
      debug: snapshot
        ? {
            activeMode: snapshot.activeMode,
            activeRetainedHit: snapshot.activeRetainedHit,
            lastPointer: snapshot.lastPointer,
          }
        : null,
      hitTarget,
      pointerDownDebug: pointerDownSnapshot
        ? {
            activeMode: pointerDownSnapshot.activeMode,
            activeRetainedHit: pointerDownSnapshot.activeRetainedHit,
            lastPointer: pointerDownSnapshot.lastPointer,
          }
        : null,
      target: currentTarget,
    });
  }
  expect(
    value,
    JSON.stringify({ attempts, expectedValue, key, value }, null, 2),
  ).toBe(expectedValue);
}

async function readElementAtPoint(
  page: Page,
  point: { readonly x: number; readonly y: number },
): Promise<unknown> {
  return await page.evaluate((point) => {
    const element = document.elementFromPoint(point.x, point.y);
    if (!(element instanceof Element)) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    return {
      className: typeof element.className === "string" ? element.className : "",
      gpuFlowControl: element
        .closest("[data-gpu-flow-control]")
        ?.getAttribute("data-gpu-flow-control"),
      retainedDomControlRowId: element
        .closest("[data-gpu-flow-dom-control-row-id]")
        ?.getAttribute("data-gpu-flow-dom-control-row-id"),
      tagName: element.tagName.toLowerCase(),
      rect: {
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      },
    };
  }, point);
}

async function readRetainedRowFocused(
  page: Page,
  target: RetainedControlTarget,
): Promise<boolean | null> {
  const row = await readRetainedRowDebugEntry(page, target);
  return row?.rowState.focused ?? null;
}

async function readRetainedRowDebugEntry(
  page: Page,
  target: Pick<RetainedControlTarget, "rowId" | "surfaceId">,
): Promise<GpuFlowRetainedRowDebugEntry | null> {
  return await page.evaluate((target) => {
    const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
    return (
      (rows as readonly GpuFlowRetainedRowDebugEntry[]).find(
        (row) =>
          row.surfaceId === target.surfaceId && row.rowId === target.rowId,
      ) ?? null
    );
  }, target);
}

async function pixelDistanceFromFocusedRowBackground(
  page: Page,
  target: RetainedControlTarget,
): Promise<number> {
  const [actual, focused] = await Promise.all([
    readRetainedCanvasPixel(page, target),
    readFocusedRowBackgroundPixel(page),
  ]);
  return pixelDistance(actual, focused);
}

async function readRetainedCanvasPixel(
  page: Page,
  target: RetainedControlTarget,
): Promise<Pixel> {
  const clip = await clampScreenshotClipToViewport(page, {
    height: 1,
    width: 1,
    x: target.clientRect.x + 5,
    y:
      target.clientRect.y +
      Math.max(3, Math.min(target.clientRect.height - 3, 12)),
  });
  const screenshot = await page.screenshot({ clip });
  return await page.evaluate(
    async (dataUrl) => {
      const image = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
          reject(new Error("Failed to decode retained row screenshot."));
      });
      image.src = dataUrl;
      await loaded;
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Missing retained row screenshot context.");
      }
      ctx.drawImage(image, 0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      return {
        a: data[3] ?? 0,
        b: data[2] ?? 0,
        g: data[1] ?? 0,
        r: data[0] ?? 0,
      };
    },
    `data:image/png;base64,${screenshot.toString("base64")}`,
  );
}

async function clampScreenshotClipToViewport(
  page: Page,
  rect: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  },
): Promise<{
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}> {
  return await page.evaluate((input) => {
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
  }, rect);
}

async function readFocusedRowBackgroundPixel(page: Page): Promise<Pixel> {
  return await page.evaluate(async () => {
    const { getGpuRetainedContentCanvasPalette } = await import(
      "/src/gpuFlow/retainedContentCanvasTheme.ts"
    );
    const palette = getGpuRetainedContentCanvasPalette(
      document.documentElement.classList.contains("dark"),
    );
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Missing scratch canvas context.");
    }
    ctx.fillStyle = palette.surfaceBackground;
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = palette.rowFocusedBackground;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    return {
      a: data[3] ?? 0,
      b: data[2] ?? 0,
      g: data[1] ?? 0,
      r: data[0] ?? 0,
    };
  });
}

function pixelDistance(left: Pixel, right: Pixel): number {
  return Math.sqrt(
    (left.r - right.r) ** 2 +
      (left.g - right.g) ** 2 +
      (left.b - right.b) ** 2 +
      (left.a - right.a) ** 2,
  );
}

async function readGpuFlowDebugSnapshot(
  page: Page,
): Promise<GpuFlowDebugSnapshot | null> {
  return await page.evaluate(() => {
    return window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.() ?? null;
  });
}

async function readNodesSelectionBounds(page: Page): Promise<unknown> {
  return (
    (await readGpuFlowDebugSnapshot(page))?.viewport.nodesSelectionBounds ??
    null
  );
}

async function readActiveGpuFlowControl(page: Page): Promise<string | null> {
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

function selectAllShortcut(): string {
  return process.platform === "darwin" ? "Meta+A" : "Control+A";
}

async function dragGuiSectionResizeHandle(
  page: Page,
  delta: { readonly x: number; readonly y: number },
): Promise<void> {
  const guiNode = page.locator(
    `.setta-gpu-flow__node[data-id="${GUI_SECTION_ID}"]`,
  );
  const box = await guiNode.boundingBox();
  if (!box) {
    throw new Error("Missing GUI section bounding box.");
  }
  const start = {
    x: box.x + box.width - 5,
    y: box.y + box.height - 5,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 6 });
  await page.mouse.up();
}

async function waitForGpuFlowIdle(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const viewport =
            window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport ?? null;
          return Boolean(
            viewport &&
              !viewport.nodeResizing &&
              !viewport.retainedContentScrolling &&
              !viewport.viewportAnimating &&
              !viewport.viewportInteractionActive &&
              !viewport.wheelZooming,
          );
        }),
      { timeout: 5_000 },
    )
    .toBe(true);
}

async function resetGuiContentScrollToTop(page: Page): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    const scrollY = await readGuiContentScrollY(page);
    if (scrollY <= 1) {
      return;
    }
    const point = await resolveVisibleGuiContentPoint(page);
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, -160);
    await page.waitForTimeout(16);
  }
  await expect.poll(() => readGuiContentScrollY(page)).toBeLessThanOrEqual(1);
}

async function readGuiContentScrollY(page: Page): Promise<number> {
  return await page.evaluate((surfaceId) => {
    const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
    const row = (rows as readonly GpuFlowRetainedRowDebugEntry[]).find(
      (candidate) => candidate.surfaceId === surfaceId,
    );
    return row?.surfaceScrollOffset.y ?? 0;
  }, GUI_CONTENT_SURFACE_ID);
}

async function scrollGuiContentRowIntoView(
  page: Page,
  label: string,
): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    if (await hasVisibleGuiContentRow(page, label)) {
      return;
    }
    const point = await resolveVisibleGuiContentPoint(page);
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, 160);
    await page.waitForTimeout(24);
  }
  await expect.poll(() => hasVisibleGuiContentRow(page, label)).toBe(true);
}

async function hasVisibleGuiContentRow(
  page: Page,
  label: string,
): Promise<boolean> {
  return await page.evaluate(
    ({ label, surfaceId }) => {
      const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
      return (rows as readonly GpuFlowRetainedRowDebugEntry[]).some(
        (candidate) =>
          candidate.surfaceId === surfaceId &&
          candidate.rowLabel === label &&
          candidate.clientRect.x + candidate.clientRect.width > 0 &&
          candidate.clientRect.x < window.innerWidth &&
          candidate.clientRect.y + candidate.clientRect.height > 0 &&
          candidate.clientRect.y < window.innerHeight,
      );
    },
    { label, surfaceId: GUI_CONTENT_SURFACE_ID },
  );
}

async function resolveVisibleGuiContentPoint(
  page: Page,
): Promise<{ readonly x: number; readonly y: number }> {
  return await page.evaluate((surfaceId) => {
    const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
    const row = (rows as readonly GpuFlowRetainedRowDebugEntry[]).find(
      (candidate) =>
        candidate.surfaceId === surfaceId &&
        candidate.labelClientPoint.y > 0 &&
        candidate.labelClientPoint.y < window.innerHeight,
    );
    if (!row) {
      throw new Error("Missing visible GUI retained row for scroll reset.");
    }
    return row.labelClientPoint;
  }, GUI_CONTENT_SURFACE_ID);
}

async function settleDebouncedTopLevelLayoutWrite(page: Page): Promise<void> {
  const layoutWrite = page
    .waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/setTopLevelSectionLayout") &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 2_000 },
    )
    .catch(() => null);
  await page.waitForTimeout(650);
  await layoutWrite;
}
