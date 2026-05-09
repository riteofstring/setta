import { expect, test, type Page } from "@playwright/test";
import { allowExpectedApiError, ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const GUI_SECTION_ID = "settings-section__gui";
const GUI_CONTENT_SURFACE_ID = `${GUI_SECTION_ID}:param-content:unpinned`;

type RetainedControlTarget = {
  readonly canvasCssSize: { readonly height: number; readonly width: number };
  readonly canvasSamplePoint: { readonly x: number; readonly y: number };
  readonly clientPoint: { readonly x: number; readonly y: number };
  readonly label: string;
  readonly rowId: string;
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
};

type GpuFlowRetainedRowDebugEntry = {
  readonly canvasCssSize: { readonly height: number; readonly width: number };
  readonly canvasSamplePoint: { readonly x: number; readonly y: number };
  readonly controlClientPoint: {
    readonly x: number;
    readonly y: number;
  } | null;
  readonly rowId: string;
  readonly rowLabel: string;
  readonly surfaceId: string;
};

test("settings retained canvas controls do not leave row focus or stuck interaction state", async ({
  page,
}) => {
  await ensureAppReady(page);
  allowExpectedApiError(page, {
    count: 10,
    method: "POST",
    path: "/api/setActiveIds",
    statuses: [404],
  });
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  const guiNode = page.locator(
    `.setta-gpu-flow__node[data-id="${GUI_SECTION_ID}"]`,
  );
  await expect(guiNode).toBeVisible();

  const initialLeftPaneShift = await readGuiSetting(
    page,
    "leftSidePaneShiftsMap",
  );
  const leftPaneTarget = await resolveRetainedControlTarget(
    page,
    "Left Side Pane Shifts Map",
  );
  await page.mouse.click(
    leftPaneTarget.clientPoint.x,
    leftPaneTarget.clientPoint.y,
  );

  await expect
    .poll(() => readGuiSetting(page, "leftSidePaneShiftsMap"))
    .toBe(!initialLeftPaneShift);
  await expect
    .poll(() => pixelDistanceFromFocusedRowBackground(page, leftPaneTarget))
    .toBeGreaterThan(18);
  await expect
    .poll(async () => (await readGpuFlowDebugSnapshot(page))?.activeMode)
    .not.toBe("retained-content");
  await expect
    .poll(
      async () =>
        (await readGpuFlowDebugSnapshot(page))?.pointerCapture?.active ?? false,
    )
    .toBe(false);

  await page.mouse.click(
    leftPaneTarget.clientPoint.x,
    leftPaneTarget.clientPoint.y,
  );
  await expect
    .poll(() => readGuiSetting(page, "leftSidePaneShiftsMap"))
    .toBe(initialLeftPaneShift);

  await page.mouse.wheel(0, 160);
  await dragGuiSectionResizeHandle(page);

  const initialPanOnDrag = await readGuiSetting(page, "panOnDrag");
  const panOnDragTarget = await resolveRetainedControlTarget(
    page,
    "Pan On Drag",
  );
  await page.mouse.click(
    panOnDragTarget.clientPoint.x,
    panOnDragTarget.clientPoint.y,
  );

  await expect
    .poll(() => readGuiSetting(page, "panOnDrag"))
    .toBe(!initialPanOnDrag);
  await expect
    .poll(async () => (await readGpuFlowDebugSnapshot(page))?.activeMode)
    .not.toBe("retained-content");
});

async function resolveRetainedControlTarget(
  page: Page,
  label: string,
): Promise<RetainedControlTarget> {
  return await page.evaluate(
    ({ guiContentSurfaceId, label }) => {
      const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
      const row =
        (rows as readonly GpuFlowRetainedRowDebugEntry[]).find(
          (candidate) =>
            candidate.surfaceId === guiContentSurfaceId &&
            candidate.rowLabel === label,
        ) ?? null;
      if (!row) {
        throw new Error(`Missing retained settings row ${label}.`);
      }
      if (!row.controlClientPoint) {
        throw new Error(`Missing retained control hit for ${label}.`);
      }
      return {
        canvasCssSize: row.canvasCssSize,
        canvasSamplePoint: row.canvasSamplePoint,
        clientPoint: row.controlClientPoint,
        label,
        rowId: row.rowId,
        surfaceId: row.surfaceId,
      };
    },
    { guiContentSurfaceId: GUI_CONTENT_SURFACE_ID, label },
  );
}

async function readGuiSetting(
  page: Page,
  key: "leftSidePaneShiftsMap" | "panOnDrag",
): Promise<boolean> {
  return await page.evaluate(async (key) => {
    const { useSettings } = await import("/src/state/definitions.ts");
    return Boolean(useSettings.getState().gui[key]);
  }, key);
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
  return await page.evaluate((target) => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      `[data-gpu-flow-source-id="${CSS.escape(target.surfaceId)}"] ` +
        '[data-gpu-flow-retained-content-canvas="true"]',
    );
    if (!canvas) {
      throw new Error(`Missing retained source canvas ${target.surfaceId}.`);
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error(
        `Missing retained source canvas context ${target.surfaceId}.`,
      );
    }
    const scaleX = canvas.width / target.canvasCssSize.width;
    const scaleY = canvas.height / target.canvasCssSize.height;
    const x = Math.max(
      0,
      Math.min(
        canvas.width - 1,
        Math.floor(target.canvasSamplePoint.x * scaleX),
      ),
    );
    const y = Math.max(
      0,
      Math.min(
        canvas.height - 1,
        Math.floor(target.canvasSamplePoint.y * scaleY),
      ),
    );
    const data = ctx.getImageData(x, y, 1, 1).data;
    return {
      a: data[3] ?? 0,
      b: data[2] ?? 0,
      g: data[1] ?? 0,
      r: data[0] ?? 0,
    };
  }, target);
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

async function dragGuiSectionResizeHandle(page: Page): Promise<void> {
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
  await page.mouse.move(start.x + 24, start.y + 18, { steps: 6 });
  await page.mouse.up();
}
