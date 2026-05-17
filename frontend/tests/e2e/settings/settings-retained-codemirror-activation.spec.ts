import { expect, test, type Page } from "@playwright/test";

import { ensureAppReady, setParamEnteredValueFromFrontend } from "../helpers";
import {
  analyzeCodeMirrorTextInkBounds,
  compareScreenshots,
  type Point,
  type Rect,
  type RetainedRowDebugEntry,
} from "./settings-retained-visual-analysis";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const GUI_SECTION_ID = "settings-section__gui";
const GUI_CONTENT_SURFACE_ID = `${GUI_SECTION_ID}:param-content:unpinned`;
const MAX_ZOOM_LABEL = "Max Zoom";

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("retained settings text editors show live CodeMirror feedback before persistence", async ({
  page,
}) => {
  await openSettings(page);
  const row = await resolveVisibleGuiRow(page, MAX_ZOOM_LABEL);
  if (!row.controlClientPoint || !row.controlClientRect) {
    throw new Error(`Missing retained control geometry for ${MAX_ZOOM_LABEL}`);
  }
  const originalMaxZoom = String(await readGuiSetting(page, "maxZoom"));
  const replacementValue = originalMaxZoom === "8" ? "9" : "8";
  const clip = await resolveEditorClipFromControlRect(
    page,
    row.controlClientRect,
  );

  let releaseBackendConfirmation!: () => void;
  const backendConfirmationReleased = new Promise<void>((resolve) => {
    releaseBackendConfirmation = resolve;
  });
  let delayedBackendRequests = 0;
  let backendConfirmationReleasedForTest = false;
  await page.route("**/setParamEnteredValue", async (route) => {
    delayedBackendRequests += 1;
    await backendConfirmationReleased;
    await route.continue();
  });

  try {
    await clickRetainedRowUntilActiveEditor(page, row);

    await page.keyboard.press(selectAllShortcut());
    await waitForAnimationFrame(page);
    const selectedFrame = await page.screenshot({ clip });

    await page.keyboard.insertText(replacementValue);
    await waitForAnimationFrame(page);
    const typedState = await readActiveEditorState(
      page,
      row.controlClientPoint,
    );
    const typedFrame = await page.screenshot({ clip });
    const visualChange = await compareScreenshots(
      page,
      selectedFrame,
      typedFrame,
    );
    const failureDetails = JSON.stringify(
      {
        activeEditorId: typedState.activeEditorId,
        delayedBackendRequests,
        editorText: typedState.text,
        elementAtControlPoint: typedState.elementAtControlPoint,
        replacementValue,
        visualChange,
      },
      null,
      2,
    );

    expect(typedState.text, failureDetails).toBe(replacementValue);
    expect(typedState.activeEditorId, failureDetails).toContain(row.rowId);
    expect(
      typedState.elementAtControlPoint?.insideActiveEditor,
      failureDetails,
    ).toBe(true);
    expect(visualChange.meanDelta, failureDetails).toBeGreaterThan(1.5);
    expect(delayedBackendRequests, failureDetails).toBe(0);

    await page.keyboard.press(selectAllShortcut());
    await page.keyboard.type("12", { delay: 75 });
    await waitForAnimationFrame(page);
    const rapidTypingState = await readActiveEditorState(
      page,
      row.controlClientPoint,
    );
    expect(rapidTypingState.text, failureDetails).toBe("12");
    expect(delayedBackendRequests, failureDetails).toBe(0);
    await expect.poll(() => delayedBackendRequests, { timeout: 2_000 }).toBe(1);
  } finally {
    backendConfirmationReleasedForTest = true;
    releaseBackendConfirmation();
    await page.waitForTimeout(0);
    await page.unroute("**/setParamEnteredValue");
    await restoreMaxZoom(page, row.rowId, originalMaxZoom);
  }

  expect(backendConfirmationReleasedForTest).toBe(true);
});

test("focusing a text input does not blank surrounding section content", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  await page.addStyleTag({
    content: ".cm-cursor,.cm-cursorLayer{opacity:0!important}",
  });
  const row = await resolveVisibleGuiRow(page, MAX_ZOOM_LABEL);
  if (!row.controlClientPoint || !row.controlClientRect) {
    throw new Error(`Missing retained control geometry for ${MAX_ZOOM_LABEL}`);
  }
  const clip = await resolveEditorClipFromControlRect(
    page,
    row.controlClientRect,
  );
  await waitForStableScreenshotClip(page, clip);
  const passiveFrame = await page.screenshot({
    clip,
    path: testInfo.outputPath("codemirror-passive-frame.png"),
  });

  await page.mouse.click(row.controlClientPoint.x, row.controlClientPoint.y);
  await expect
    .poll(() => readActiveCodeMirrorId(page), { timeout: 5_000 })
    .toContain(row.rowId);
  await waitForAnimationFrame(page);
  const activeGeometry = await readActiveEditorGeometry(
    page,
    row.controlClientRect,
  );
  const activeFrame = await page.screenshot({
    clip,
    path: testInfo.outputPath("codemirror-active-frame.png"),
  });
  const visualDelta = await compareScreenshots(page, passiveFrame, activeFrame);
  const failureDetails = JSON.stringify(
    {
      activeGeometry,
      clip,
      row: {
        controlClientRect: row.controlClientRect,
        rowId: row.rowId,
        rowLabel: row.rowLabel,
      },
      visualDelta,
    },
    null,
    2,
  );

  expect(activeGeometry.activeEditorId, failureDetails).toContain(row.rowId);
  expect(Math.abs(activeGeometry.leftDelta), failureDetails).toBeLessThan(2);
  expect(Math.abs(activeGeometry.topDelta), failureDetails).toBeLessThan(4);
  expect(Math.abs(activeGeometry.widthDelta), failureDetails).toBeLessThan(2);
  expect(Math.abs(activeGeometry.heightDelta), failureDetails).toBeLessThan(4);
  expect(visualDelta.meanDelta, failureDetails).toBeLessThan(4);
  expect(visualDelta.changedPixelRatio, failureDetails).toBeLessThan(0.08);
});

test("retained settings text editor activation keeps text ink aligned with the passive preview", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  await centerGuiRowAtZoom(page, MAX_ZOOM_LABEL, 1.5);
  await page.addStyleTag({
    content: ".cm-cursor,.cm-cursorLayer{opacity:0!important}",
  });
  const row = await resolveVisibleGuiRow(page, MAX_ZOOM_LABEL);
  if (!row.controlClientPoint || !row.controlClientRect) {
    throw new Error(`Missing retained control geometry for ${MAX_ZOOM_LABEL}`);
  }
  const clip = await clampScreenshotClipToViewport(
    page,
    expandRect(row.controlClientRect, 12),
  );
  const searchRect = resolveValueInkSearchRect(row.controlClientRect);
  await waitForStableScreenshotClip(page, clip);
  const passiveFrame = await page.screenshot({
    clip,
    path: testInfo.outputPath("codemirror-passive-ink-frame.png"),
  });
  const passiveInk = await analyzeCodeMirrorTextInkBounds(page, {
    clip,
    screenshot: passiveFrame,
    searchRect,
  });

  await page.mouse.click(row.controlClientPoint.x, row.controlClientPoint.y);
  await expect
    .poll(() => readActiveCodeMirrorId(page), { timeout: 5_000 })
    .toContain(row.rowId);
  await waitForAnimationFrame(page);
  const activeFrame = await page.screenshot({
    clip,
    path: testInfo.outputPath("codemirror-active-ink-frame.png"),
  });
  const activeInk = await analyzeCodeMirrorTextInkBounds(page, {
    clip,
    screenshot: activeFrame,
    searchRect,
  });
  const failureDetails = JSON.stringify(
    {
      activeInk,
      clip,
      passiveInk,
      row: {
        controlClientRect: row.controlClientRect,
        rowId: row.rowId,
        rowLabel: row.rowLabel,
      },
      searchRect,
    },
    null,
    2,
  );

  expect(passiveInk, failureDetails).not.toBeNull();
  expect(activeInk, failureDetails).not.toBeNull();
  expect(
    Math.abs((activeInk?.x ?? 0) - (passiveInk?.x ?? 0)),
    failureDetails,
  ).toBeLessThanOrEqual(1.5);
  expect(
    Math.abs((activeInk?.centerY ?? 0) - (passiveInk?.centerY ?? 0)),
    failureDetails,
  ).toBeLessThanOrEqual(1.5);
});

async function openSettings(page: Page): Promise<void> {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  await disableMinimapIfEnabled(page);
  await page.getByRole("button", { exact: true, name: "Core" }).click();
  await waitForCoreSettingsView(page);
  await page.getByRole("button", { name: "fit view" }).click();
  await waitForViewportIdle(page);
  await expect(
    page.locator(`.setta-gpu-flow__node[data-id="${GUI_SECTION_ID}"]`),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        await page.evaluate(
          () => window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.().length ?? 0,
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(10);
  await scrollGuiRowIntoView(page, MAX_ZOOM_LABEL);
}

async function disableMinimapIfEnabled(page: Page): Promise<void> {
  const minimapToggle = page.getByRole("button", { name: "toggle minimap" });
  if ((await minimapToggle.count()) === 0) {
    return;
  }
  if ((await minimapToggle.first().getAttribute("aria-pressed")) !== "true") {
    return;
  }
  await minimapToggle.first().click();
  await waitForAnimationFrame(page);
}

async function waitForCoreSettingsView(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelectorAll(".setta-gpu-flow__node").length <= 10,
  );
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

async function scrollGuiRowIntoView(page: Page, label: string): Promise<void> {
  for (let index = 0; index < 16; index += 1) {
    const scroll = await page.evaluate(
      ({ label, surfaceId }) => {
        const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
        const surfaceRows = rows.filter(
          (row): row is RetainedRowDebugEntry => row.surfaceId === surfaceId,
        );
        const target = surfaceRows.find((row) => row.rowLabel === label);
        if (!target) {
          return null;
        }
        if (
          target.clientRect.width > 16 &&
          target.clientRect.height > 8 &&
          target.clientRect.y < window.innerHeight &&
          target.clientRect.y + target.clientRect.height > 0
        ) {
          return { kind: "visible" as const };
        }
        const visibleRow = surfaceRows.find(
          (row) =>
            row.clientRect.width > 16 &&
            row.clientRect.height > 8 &&
            row.labelClientPoint.y > 0 &&
            row.labelClientPoint.y < window.innerHeight,
        );
        if (!visibleRow) {
          return null;
        }
        const targetAboveViewport = target.clientRect.y < 0;
        return {
          deltaY: targetAboveViewport ? -240 : 240,
          kind: "scroll" as const,
          point: visibleRow.labelClientPoint,
        };
      },
      { label, surfaceId: GUI_CONTENT_SURFACE_ID },
    );
    if (scroll?.kind === "visible") {
      return;
    }
    if (!scroll) {
      await waitForAnimationFrame(page);
      continue;
    }
    await page.mouse.move(scroll.point.x, scroll.point.y);
    await page.mouse.wheel(0, scroll.deltaY);
    await waitForAnimationFrame(page);
  }
  await expect
    .poll(async () => {
      const rows = await page.evaluate(
        ({ label, surfaceId }) => {
          return (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []).some(
            (row): row is RetainedRowDebugEntry =>
              row.surfaceId === surfaceId &&
              row.rowLabel === label &&
              row.clientRect.width > 16 &&
              row.clientRect.height > 8 &&
              row.clientRect.y < window.innerHeight &&
              row.clientRect.y + row.clientRect.height > 0,
          );
        },
        { label, surfaceId: GUI_CONTENT_SURFACE_ID },
      );
      return rows;
    })
    .toBe(true);
}

async function readGuiSetting(page: Page, key: "maxZoom"): Promise<unknown> {
  return await page.evaluate(async (key) => {
    const { useSettings } = await import("/src/state/definitions.ts");
    return (useSettings.getState().gui as Record<string, unknown>)[key];
  }, key);
}

async function centerGuiRowAtZoom(
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
        x: paneRect.width * 0.68 - flowCenter.x * zoom,
        y: paneRect.height * 0.46 - flowCenter.y * zoom,
        zoom,
      });
    },
    { label, surfaceId: GUI_CONTENT_SURFACE_ID, zoom },
  );
  await waitForAnimationFrame(page);
  await waitForAnimationFrame(page);
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

async function clickRetainedRowUntilActiveEditor(
  page: Page,
  row: RetainedRowDebugEntry,
): Promise<void> {
  if (!row.controlClientPoint) {
    throw new Error(`Missing retained control point for ${row.rowLabel}.`);
  }
  const deadlineMs = Date.now() + 5_000;
  let activeEditorState: Awaited<
    ReturnType<typeof readActiveEditorState>
  > | null = null;
  while (Date.now() < deadlineMs) {
    await page.mouse.click(row.controlClientPoint.x, row.controlClientPoint.y);
    await waitForAnimationFrame(page);
    activeEditorState = await readActiveEditorState(
      page,
      row.controlClientPoint,
    );
    if (
      activeEditorState.activeEditorId?.includes(row.rowId) &&
      activeEditorState.elementAtControlPoint?.insideActiveEditor
    ) {
      return;
    }
  }
  expect(activeEditorState?.activeEditorId).toContain(row.rowId);
  expect(activeEditorState?.elementAtControlPoint?.insideActiveEditor).toBe(
    true,
  );
}

async function readActiveEditorState(
  page: Page,
  point: Point,
): Promise<{
  activeEditorId: string | null;
  elementAtControlPoint: {
    insideActiveEditor: boolean;
    className: string;
    tagName: string;
  } | null;
  text: string;
}> {
  return await page.evaluate(({ x, y }) => {
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
    const content =
      activeEditor?.querySelector(".cm-content") ??
      activeEditor?.querySelector(".cm-line");
    const elementAtPoint = document.elementFromPoint(x, y);
    return {
      activeEditorId,
      elementAtControlPoint:
        elementAtPoint instanceof Element
          ? {
              className: String(elementAtPoint.className),
              insideActiveEditor: Boolean(
                activeEditor && activeEditor.contains(elementAtPoint),
              ),
              tagName: elementAtPoint.tagName,
            }
          : null,
      text: content?.textContent ?? activeEditor?.textContent ?? "",
    };
  }, point);
}

async function resolveEditorClipFromControlRect(
  page: Page,
  rect: Rect,
): Promise<Rect> {
  return await clampScreenshotClipToViewport(page, {
    height: Math.min(44, Math.max(1, rect.height)),
    width: Math.min(220, Math.max(1, rect.width)),
    x: rect.x,
    y: rect.y + rect.height / 2 - Math.min(44, rect.height) / 2,
  });
}

async function readActiveEditorGeometry(
  page: Page,
  expectedRect: Rect,
): Promise<{
  activeEditorId: string | null;
  heightDelta: number;
  leftDelta: number;
  topDelta: number;
  widthDelta: number;
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

async function waitForStableScreenshotClip(
  page: Page,
  rect: Rect,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const first = await page.screenshot({ clip: rect });
        await page.waitForTimeout(80);
        const second = await page.screenshot({ clip: rect });
        return (await compareScreenshots(page, first, second)).meanDelta;
      },
      {
        intervals: [80, 120, 180, 240],
        timeout: 2_000,
      },
    )
    .toBeLessThan(1);
}

async function clampScreenshotClipToViewport(
  page: Page,
  rect: Rect,
): Promise<Rect> {
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

function expandRect(rect: Rect, padding: number): Rect {
  return {
    height: rect.height + padding * 2,
    width: rect.width + padding * 2,
    x: rect.x - padding,
    y: rect.y - padding,
  };
}

function resolveValueInkSearchRect(rect: Rect): Rect {
  return {
    height: rect.height,
    width: Math.min(rect.width, 220),
    x: rect.x,
    y: rect.y,
  };
}

async function restoreMaxZoom(
  page: Page,
  paramInfoId: string,
  value: string,
): Promise<void> {
  await setParamEnteredValueFromFrontend(page, {
    projectConfigId: "settings",
    sectionId: GUI_SECTION_ID,
    paramInfoId,
    value,
  });
  await expect.poll(() => readGuiSetting(page, "maxZoom")).toBe(Number(value));
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

function selectAllShortcut(): string {
  return process.platform === "darwin" ? "Meta+A" : "Control+A";
}
