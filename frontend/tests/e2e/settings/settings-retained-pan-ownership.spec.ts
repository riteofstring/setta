import { expect, test, type Page } from "@playwright/test";

import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const GUI_SECTION_ID = "settings-section__gui";
const GUI_CONTENT_SURFACE_ID = `${GUI_SECTION_ID}:param-content:unpinned`;

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

const WHEEL_PAN_DELTA_Y = 48;

test("viewport scroll pan continues after the mouse moves over the retained gui section", async ({
  page,
}) => {
  await openSettings(page);
  const surfaceClip = await resolveVisibleGuiSurfaceClip(page);
  const canvas = page.locator(".setta-gpu-flow__canvas").first();
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error("Missing GPU flow canvas bounds.");
  }
  const start = resolveScrollPanStart({
    canvasBox,
    surfaceClip,
  });
  const path = [
    {
      name: "section-center",
      x: surfaceClip.x + surfaceClip.width * 0.5,
      y: surfaceClip.y + surfaceClip.height * 0.5,
    },
    {
      name: "section-control-column",
      x: surfaceClip.x + surfaceClip.width - 32,
      y: surfaceClip.y + surfaceClip.height * 0.5,
    },
  ];
  const samples: Awaited<ReturnType<typeof readPanSnapshot>>[] = [];

  await page.mouse.move(start.x, start.y);
  samples.push(await readPanSnapshot(page, "start"));
  await page.mouse.wheel(0, WHEEL_PAN_DELTA_Y);
  samples.push(await readPanSnapshot(page, "blank-canvas-wheel"));
  for (const point of path) {
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, WHEEL_PAN_DELTA_Y);
    samples.push(await readPanSnapshot(page, point.name));
  }

  const deltas = samples.slice(1).map((sample, index) => {
    const previous = samples[index] ?? sample;
    return {
      dx: sample.transform.x - previous.transform.x,
      dy: sample.transform.y - previous.transform.y,
      expectedDx: 0,
      expectedDy: -WHEEL_PAN_DELTA_Y,
      from: previous.name,
      to: sample.name,
    };
  });
  const stalledSegments = deltas.filter(
    (delta) => Math.abs(delta.dx) + Math.abs(delta.dy) < 1,
  );
  const inactiveSamples = samples.filter(
    (sample) =>
      sample.name !== "start" && !sample.viewport.panScrolling,
  );
  const retainedHoverDuringPan = samples.filter(
    (sample) => sample.hoveredRetainedHit !== null,
  );
  const mismatchedSegments = deltas.filter(
    (delta) =>
      Math.abs(delta.dx - delta.expectedDx) > 2 ||
      Math.abs(delta.dy - delta.expectedDy) > 2,
  );
  const failureDetails = JSON.stringify(
    {
      deltas,
      inactiveSamples,
      retainedHoverDuringPan,
      samples,
      stalledSegments,
      surfaceClip,
    },
    null,
    2,
  );
  expect(stalledSegments, failureDetails).toHaveLength(0);
  expect(mismatchedSegments, failureDetails).toHaveLength(0);
  expect(inactiveSamples, failureDetails).toHaveLength(0);
  expect(retainedHoverDuringPan, failureDetails).toHaveLength(0);
});

function resolveScrollPanStart({
  canvasBox,
  surfaceClip,
}: {
  readonly canvasBox: Rect;
  readonly surfaceClip: Rect;
}): { readonly x: number; readonly y: number } {
  return {
    x: clampNumber(
      surfaceClip.x + surfaceClip.width * 0.65,
      canvasBox.x + 80,
      canvasBox.x + canvasBox.width - 120,
    ),
    y: Math.min(
      canvasBox.y + canvasBox.height - 18,
      Math.max(canvasBox.y + 24, surfaceClip.y + surfaceClip.height + 48),
    ),
  };
}

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

async function resolveVisibleGuiSurfaceClip(page: Page): Promise<Rect> {
  return await page.evaluate((surfaceId) => {
    const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter((row) => row.surfaceId === surfaceId)
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function readPanSnapshot(page: Page, name: string) {
  return await page.evaluate((sampleName) => {
    const snapshot = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.();
    if (!snapshot) {
      throw new Error("Missing GPU flow debug snapshot.");
    }
    return {
      activeMode: snapshot.activeMode,
      hoveredRetainedHit: snapshot.hoveredRetainedHit,
      name: sampleName,
      transform: {
        x: snapshot.viewport.transform.x,
        y: snapshot.viewport.transform.y,
      },
      viewport: {
        paneDragging: snapshot.viewport.paneDragging,
        panScrolling: snapshot.viewport.panScrolling,
        pointerPanning: snapshot.viewport.pointerPanning,
      },
    };
  }, name);
}
