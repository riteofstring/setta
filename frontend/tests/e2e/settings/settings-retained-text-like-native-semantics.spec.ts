import { expect, test, type Page } from "@playwright/test";

import {
  centerRetainedCompositorSurface,
  openAllSettingsForRetainedCompositor,
  SETTINGS_PARAM_CONTENT_SUFFIX,
} from "./settings-retained-compositor-helpers";
import { waitForAnimationFrame } from "./settings-retained-frame-helpers";
import type {
  Point,
  Rect,
  RetainedRowDebugEntry,
} from "./settings-retained-visual-analysis";

const RETAINED_SURFACE_SCROLL_RESET_STEPS = 80;
const RETAINED_SURFACE_SCROLL_SEARCH_STEPS = 200;
const SECTION_SIZING_SURFACE_ID =
  "settings-section__sectionSizingPolicy" + SETTINGS_PARAM_CONTENT_SUFFIX;
const TARGET_TEXT_ROW_ID =
  "settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__metaControlByType__TextParam__minHeight";

type TextLikeNativeSemanticsTarget = {
  readonly rowId: string;
  readonly surfaceId: string;
};

type NativeTextSelectionState = {
  readonly activeEditorId: string | null;
  readonly caretRect: Rect | null;
  readonly editorRect: Rect;
  readonly editorRowDelta: Rect;
  readonly rowControlRect: Rect;
  readonly rowId: string;
  readonly selectedText: string;
  readonly selectionCollapsed: boolean;
  readonly selectionRect: Rect | null;
  readonly selectionWithinEditor: boolean;
};

type NativeCompositionState = {
  readonly activeCompositionControlId: string | null;
  readonly activeEditorId: string | null;
  readonly compositionEventCount: number;
  readonly compositionUpdateCount: number;
  readonly editorRect: Rect;
  readonly editorRowDelta: Rect;
  readonly lastCompositionData: string | null;
  readonly rowControlRect: Rect;
  readonly rowId: string;
};

const TARGET_TEXT_LIKE_ROW: TextLikeNativeSemanticsTarget = {
  rowId: TARGET_TEXT_ROW_ID,
  surfaceId: SECTION_SIZING_SURFACE_ID,
};

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("native selection and caret stay with a retained text-like editor across projection frames", async ({
  page,
}) => {
  const { row, target } = await openNativeTextLikeRow(page);

  await page.mouse.click(row.controlClientPoint.x, row.controlClientPoint.y);
  await expect
    .poll(() => readActiveCodeMirrorId(page), { timeout: 5_000 })
    .toContain(row.rowId);
  await page.keyboard.press(selectAllShortcut());
  const selectedBefore = await waitForNativeTextSelectionState(page, {
    expectedCollapsed: false,
    rowId: row.rowId,
  });

  await applyViewportTransformDelta(page, { dx: 58, dy: -34 });
  await waitForAnimationFrame(page);
  const selectedAfterPan = await waitForNativeTextSelectionState(page, {
    expectedCollapsed: false,
    rowId: row.rowId,
  });
  await applyViewportTransformDelta(page, { zoomFactor: 1.1 });
  await waitForAnimationFrame(page);
  const selectedAfterZoom = await waitForNativeTextSelectionState(page, {
    expectedCollapsed: false,
    rowId: row.rowId,
  });

  const selectionDetails = JSON.stringify(
    { row, selectedAfterPan, selectedAfterZoom, selectedBefore, target },
    null,
    2,
  );
  expect(selectedBefore.selectedText.length, selectionDetails).toBeGreaterThan(
    0,
  );
  expect(selectedAfterPan.selectedText, selectionDetails).toBe(
    selectedBefore.selectedText,
  );
  expect(selectedAfterZoom.selectedText, selectionDetails).toBe(
    selectedBefore.selectedText,
  );
  expect(
    Math.abs(selectedAfterPan.editorRect.x - selectedBefore.editorRect.x),
    selectionDetails,
  ).toBeGreaterThan(12);
  expect(
    Math.abs(
      selectedAfterZoom.editorRect.width - selectedAfterPan.editorRect.width,
    ),
    selectionDetails,
  ).toBeGreaterThan(4);
  expectNativeTextStateAlignedToRow(selectedBefore, selectionDetails);
  expectNativeTextStateAlignedToRow(selectedAfterPan, selectionDetails);
  expectNativeTextStateAlignedToRow(selectedAfterZoom, selectionDetails);

  await page.keyboard.press("ArrowRight");
  const caretBefore = await waitForNativeTextSelectionState(page, {
    expectedCollapsed: true,
    rowId: row.rowId,
  });
  await applyViewportTransformDelta(page, { dx: -44, dy: 26 });
  await waitForAnimationFrame(page);
  const caretAfterPan = await waitForNativeTextSelectionState(page, {
    expectedCollapsed: true,
    rowId: row.rowId,
  });
  const caretDetails = JSON.stringify(
    { caretAfterPan, caretBefore, row, target },
    null,
    2,
  );
  expect(caretAfterPan.selectedText, caretDetails).toBe("");
  expect(caretBefore.selectedText, caretDetails).toBe("");
  expect(
    Math.abs(caretAfterPan.editorRect.x - caretBefore.editorRect.x),
    caretDetails,
  ).toBeGreaterThan(12);
  expectNativeTextStateAlignedToRow(caretBefore, caretDetails);
  expectNativeTextStateAlignedToRow(caretAfterPan, caretDetails);
});

test("IME composition stays live and aligned through retained scroll and viewport projection", async ({
  page,
}) => {
  const { row, target } = await openNativeTextLikeRow(page);

  await installNativeCompositionProbe(page);
  await page.mouse.click(row.controlClientPoint.x, row.controlClientPoint.y);
  await expect
    .poll(() => readActiveCodeMirrorId(page), { timeout: 5_000 })
    .toContain(row.rowId);
  await dispatchSyntheticCompositionEvent(page, {
    data: "ka",
    kind: "compositionstart",
    rowId: row.rowId,
  });
  const composingBefore = await dispatchSyntheticCompositionEvent(page, {
    data: "kana",
    kind: "compositionupdate",
    rowId: row.rowId,
  });

  const wheelPoint = await resolveRetainedSurfaceWheelPoint(
    page,
    target.surfaceId,
  );
  await page.mouse.move(wheelPoint.x, wheelPoint.y);
  await page.mouse.wheel(0, 28);
  await waitForAnimationFrame(page);
  const composingAfterScroll = await dispatchSyntheticCompositionEvent(page, {
    data: "kana-scroll",
    kind: "compositionupdate",
    rowId: row.rowId,
  });
  await applyViewportTransformDelta(page, { dx: 52, dy: -28 });
  await waitForAnimationFrame(page);
  const composingAfterPan = await dispatchSyntheticCompositionEvent(page, {
    data: "kana-pan",
    kind: "compositionupdate",
    rowId: row.rowId,
  });
  await applyViewportTransformDelta(page, { zoomFactor: 1.08 });
  await waitForAnimationFrame(page);
  const composingAfterZoom = await dispatchSyntheticCompositionEvent(page, {
    data: "kana-zoom",
    kind: "compositionupdate",
    rowId: row.rowId,
  });
  await dispatchSyntheticCompositionEvent(page, {
    data: "kana-zoom",
    kind: "compositionend",
    rowId: row.rowId,
  });

  const details = JSON.stringify(
    {
      composingAfterPan,
      composingAfterScroll,
      composingAfterZoom,
      composingBefore,
      row,
      target,
    },
    null,
    2,
  );
  expect(composingBefore.activeCompositionControlId, details).toContain(
    row.rowId,
  );
  expect(composingAfterScroll.activeCompositionControlId, details).toContain(
    row.rowId,
  );
  expect(composingAfterPan.activeCompositionControlId, details).toContain(
    row.rowId,
  );
  expect(composingAfterZoom.activeCompositionControlId, details).toContain(
    row.rowId,
  );
  expect(composingAfterZoom.compositionUpdateCount, details).toBeGreaterThan(2);
  expect(composingAfterZoom.lastCompositionData, details).toBe("kana-zoom");
  expect(
    Math.abs(
      composingAfterPan.editorRect.x - composingAfterScroll.editorRect.x,
    ),
    details,
  ).toBeGreaterThan(12);
  expect(
    Math.abs(
      composingAfterZoom.editorRect.width - composingAfterPan.editorRect.width,
    ),
    details,
  ).toBeGreaterThan(4);
  expectNativeCompositionStateAlignedToRow(composingBefore, details);
  expectNativeCompositionStateAlignedToRow(composingAfterScroll, details);
  expectNativeCompositionStateAlignedToRow(composingAfterPan, details);
  expectNativeCompositionStateAlignedToRow(composingAfterZoom, details);
});

async function openNativeTextLikeRow(page: Page): Promise<{
  readonly row: RetainedRowDebugEntry & {
    readonly controlClientPoint: Point;
    readonly controlClientRect: Rect;
  };
  readonly target: TextLikeNativeSemanticsTarget;
}> {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page, TARGET_TEXT_LIKE_ROW.surfaceId);
  await scrollRetainedSurfaceToTop(page, TARGET_TEXT_LIKE_ROW.surfaceId);
  const row = await scrollRetainedSurfaceUntilTargetRowVisible(
    page,
    TARGET_TEXT_LIKE_ROW,
  );
  if (!row.controlClientPoint || !row.controlClientRect) {
    throw new Error(`Missing retained control geometry for ${row.rowId}.`);
  }
  return {
    row: {
      ...row,
      controlClientPoint: row.controlClientPoint,
      controlClientRect: row.controlClientRect,
    },
    target: TARGET_TEXT_LIKE_ROW,
  };
}

function expectNativeTextStateAlignedToRow(
  state: NativeTextSelectionState,
  details: string,
): void {
  expect(state.activeEditorId, details).toContain(state.rowId);
  expect(state.selectionWithinEditor, details).toBe(true);
  expect(Math.abs(state.editorRowDelta.x), details).toBeLessThanOrEqual(3);
  expect(Math.abs(state.editorRowDelta.y), details).toBeLessThanOrEqual(9);
  expect(Math.abs(state.editorRowDelta.width), details).toBeLessThanOrEqual(3);
  expect(Math.abs(state.editorRowDelta.height), details).toBeLessThanOrEqual(9);
  const visualRect = state.selectionRect ?? state.caretRect;
  expect(visualRect, details).not.toBeNull();
  if (visualRect) {
    expect(rectIntersectsRect(visualRect, state.editorRect), details).toBe(
      true,
    );
    expect(rectIntersectsRect(visualRect, state.rowControlRect), details).toBe(
      true,
    );
  }
}

function expectNativeCompositionStateAlignedToRow(
  state: NativeCompositionState,
  details: string,
): void {
  expect(state.activeEditorId, details).toContain(state.rowId);
  expect(Math.abs(state.editorRowDelta.x), details).toBeLessThanOrEqual(3);
  expect(Math.abs(state.editorRowDelta.y), details).toBeLessThanOrEqual(9);
  expect(Math.abs(state.editorRowDelta.width), details).toBeLessThanOrEqual(3);
  expect(Math.abs(state.editorRowDelta.height), details).toBeLessThanOrEqual(9);
  expect(
    rectIntersectsRect(state.editorRect, state.rowControlRect),
    details,
  ).toBe(true);
}

function rectIntersectsRect(left: Rect, right: Rect): boolean {
  return (
    left.x + left.width > right.x &&
    left.y + left.height > right.y &&
    left.x < right.x + right.width &&
    left.y < right.y + right.height
  );
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

async function scrollRetainedSurfaceUntilTargetRowVisible(
  page: Page,
  target: TextLikeNativeSemanticsTarget,
): Promise<RetainedRowDebugEntry> {
  for (let step = 0; step < RETAINED_SURFACE_SCROLL_SEARCH_STEPS; step += 1) {
    const row = await resolveVisibleTargetRow(page, target);
    if (row) {
      return row;
    }
    const point = await resolveOptionalRetainedSurfaceWheelPoint(
      page,
      target.surfaceId,
    );
    if (!point) {
      await centerRetainedCompositorSurface(page, target.surfaceId);
      await waitForAnimationFrame(page);
      continue;
    }
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, 120);
    await waitForAnimationFrame(page);
    await waitForAnimationFrame(page);
  }
  throw new Error(
    `Could not scroll retained row ${target.rowId} into view. ${JSON.stringify(
      await readRetainedSurfaceRowSearchDiagnostics(page, target),
      null,
      2,
    )}`,
  );
}

async function resolveVisibleTargetRow(
  page: Page,
  target: TextLikeNativeSemanticsTarget,
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
    const row = rows[Math.floor(rows.length / 2)] ?? rows[0];
    if (!row) {
      return null;
    }
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

async function readRetainedSurfaceRowSearchDiagnostics(
  page: Page,
  target: TextLikeNativeSemanticsTarget,
): Promise<unknown> {
  return await page.evaluate((target) => {
    const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId === target.surfaceId,
      )
      .map((row) => ({
        canvasSamplePoint: row.canvasSamplePoint,
        clientRect: row.clientRect,
        controlClientRect: row.controlClientRect,
        controlKind: row.controlKind,
        rowId: row.rowId,
      }));
    return {
      matchingRow: rows.find((row) => row.rowId === target.rowId) ?? null,
      rowCount: rows.length,
      rows: rows.slice(0, 20),
      target,
      window: { height: window.innerHeight, width: window.innerWidth },
    };
  }, target);
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

async function waitForNativeTextSelectionState(
  page: Page,
  {
    expectedCollapsed,
    rowId,
  }: {
    readonly expectedCollapsed: boolean;
    readonly rowId: string;
  },
): Promise<NativeTextSelectionState> {
  const deadline = Date.now() + 5_000;
  let latestState: NativeTextSelectionState | null = null;
  while (Date.now() < deadline) {
    latestState = await readNativeTextSelectionState(page, rowId);
    if (isExpectedNativeTextSelectionState(latestState, expectedCollapsed)) {
      return latestState;
    }
    await page.waitForTimeout(80);
  }
  throw new Error(
    `Native text selection did not reach the expected state. ${JSON.stringify(
      { expectedCollapsed, latestState, rowId },
      null,
      2,
    )}`,
  );
}

async function readNativeTextSelectionState(
  page: Page,
  rowId: string,
): Promise<NativeTextSelectionState | null> {
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
    const content = activeEditor?.querySelector(".cm-content") ?? null;
    const row = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []).find(
      (candidate): candidate is RetainedRowDebugEntry =>
        candidate.rowId === rowId && candidate.controlClientRect !== null,
    );
    if (!activeEditor || !content || !row?.controlClientRect) {
      return null;
    }
    const selection = document.getSelection();
    const range =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const editorRect = toPlainRect(activeEditor.getBoundingClientRect());
    const rowControlRect = row.controlClientRect;
    const selectionRect =
      range && !selection?.isCollapsed
        ? combineClientRects(Array.from(range.getClientRects()))
        : null;
    const cursor = activeEditor.querySelector<HTMLElement>(
      ".cm-cursorLayer .cm-cursor, .cm-cursor",
    );
    const caretRangeRect =
      range && selection?.isCollapsed
        ? combineClientRects(Array.from(range.getClientRects()))
        : null;
    const caretRect =
      cursor && selection?.isCollapsed
        ? toPlainRect(cursor.getBoundingClientRect())
        : caretRangeRect;
    return {
      activeEditorId,
      caretRect,
      editorRect,
      editorRowDelta: rectDelta(editorRect, rowControlRect),
      rowControlRect,
      rowId,
      selectedText: selection?.toString() ?? "",
      selectionCollapsed: selection?.isCollapsed ?? true,
      selectionRect,
      selectionWithinEditor: Boolean(
        selection?.anchorNode &&
          selection.focusNode &&
          content.contains(selection.anchorNode) &&
          content.contains(selection.focusNode),
      ),
    };

    function combineClientRects(rects: readonly DOMRect[]): Rect | null {
      const visibleRects = rects.filter(
        (rect) => rect.width > 0 && rect.height > 0,
      );
      if (visibleRects.length === 0) {
        return null;
      }
      const left = Math.min(...visibleRects.map((rect) => rect.left));
      const top = Math.min(...visibleRects.map((rect) => rect.top));
      const right = Math.max(...visibleRects.map((rect) => rect.right));
      const bottom = Math.max(...visibleRects.map((rect) => rect.bottom));
      return {
        height: bottom - top,
        width: right - left,
        x: left,
        y: top,
      };
    }

    function rectDelta(left: Rect, right: Rect): Rect {
      return {
        height: left.height - right.height,
        width: left.width - right.width,
        x: left.x - right.x,
        y: left.y - right.y,
      };
    }

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

function isExpectedNativeTextSelectionState(
  state: NativeTextSelectionState | null,
  expectedCollapsed: boolean,
): state is NativeTextSelectionState {
  if (!state?.activeEditorId?.includes(state.rowId)) {
    return false;
  }
  if (!state.selectionWithinEditor) {
    return false;
  }
  if (state.selectionCollapsed !== expectedCollapsed) {
    return false;
  }
  if (expectedCollapsed) {
    return state.selectedText === "" && state.caretRect !== null;
  }
  return state.selectedText.length > 0 && state.selectionRect !== null;
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

async function installNativeCompositionProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const view = window as typeof window & {
      __SETTA_GPU_FLOW_TEST_COMPOSITION__?: {
        activeControlId: string | null;
        compositionEventCount: number;
        compositionUpdateCount: number;
        lastCompositionData: string | null;
      };
    };
    if (view.__SETTA_GPU_FLOW_TEST_COMPOSITION__) {
      return;
    }
    const state = {
      activeControlId: null,
      compositionEventCount: 0,
      compositionUpdateCount: 0,
      lastCompositionData: null,
    };
    view.__SETTA_GPU_FLOW_TEST_COMPOSITION__ = state;
    const handleComposition = (event: CompositionEvent) => {
      const controlId = getCompositionEventControlId(event);
      state.compositionEventCount += 1;
      state.lastCompositionData = event.data;
      if (event.type === "compositionend") {
        if (state.activeControlId === controlId) {
          state.activeControlId = null;
        }
        return;
      }
      state.activeControlId = controlId;
      if (event.type === "compositionupdate") {
        state.compositionUpdateCount += 1;
      }
    };
    document.addEventListener("compositionstart", handleComposition, true);
    document.addEventListener("compositionupdate", handleComposition, true);
    document.addEventListener("compositionend", handleComposition, true);

    function getCompositionEventControlId(
      event: CompositionEvent,
    ): string | null {
      const target = event.target;
      const targetElement =
        target instanceof Element
          ? target
          : target instanceof Node
            ? target.parentElement
            : null;
      return (
        targetElement
          ?.closest("[data-gpu-flow-control]")
          ?.getAttribute("data-gpu-flow-control") ?? null
      );
    }
  });
}

async function dispatchSyntheticCompositionEvent(
  page: Page,
  {
    data,
    kind,
    rowId,
  }: {
    readonly data: string;
    readonly kind: "compositionend" | "compositionstart" | "compositionupdate";
    readonly rowId: string;
  },
): Promise<NativeCompositionState> {
  await page.evaluate(
    ({ data, kind }) => {
      const activeElement = document.activeElement;
      const content =
        activeElement instanceof Element
          ? activeElement.closest(".cm-editor")?.querySelector(".cm-content")
          : null;
      if (!content) {
        throw new Error("Missing active CodeMirror composition target.");
      }
      content.dispatchEvent(
        new CompositionEvent(kind, {
          bubbles: true,
          cancelable: true,
          data,
        }),
      );
      if (kind !== "compositionend") {
        content.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            data,
            inputType: "insertCompositionText",
            isComposing: true,
          } as InputEventInit),
        );
      }
    },
    { data, kind },
  );
  const state = await readNativeCompositionState(page, rowId);
  if (!state) {
    throw new Error(`Missing native composition state for ${rowId}.`);
  }
  return state;
}

async function readNativeCompositionState(
  page: Page,
  rowId: string,
): Promise<NativeCompositionState | null> {
  return await page.evaluate((rowId) => {
    const probe = (
      window as typeof window & {
        __SETTA_GPU_FLOW_TEST_COMPOSITION__?: {
          activeControlId: string | null;
          compositionEventCount: number;
          compositionUpdateCount: number;
          lastCompositionData: string | null;
        };
      }
    ).__SETTA_GPU_FLOW_TEST_COMPOSITION__;
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
      (candidate): candidate is RetainedRowDebugEntry =>
        candidate.rowId === rowId && candidate.controlClientRect !== null,
    );
    if (!activeEditor || !row?.controlClientRect) {
      return null;
    }
    const editorRect = toPlainRect(activeEditor.getBoundingClientRect());
    const rowControlRect = row.controlClientRect;
    return {
      activeCompositionControlId: probe?.activeControlId ?? null,
      activeEditorId,
      compositionEventCount: probe?.compositionEventCount ?? 0,
      compositionUpdateCount: probe?.compositionUpdateCount ?? 0,
      editorRect,
      editorRowDelta: rectDelta(editorRect, rowControlRect),
      lastCompositionData: probe?.lastCompositionData ?? null,
      rowControlRect,
      rowId,
    };

    function rectDelta(left: Rect, right: Rect): Rect {
      return {
        height: left.height - right.height,
        width: left.width - right.width,
        x: left.x - right.x,
        y: left.y - right.y,
      };
    }

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

function selectAllShortcut(): string {
  return process.platform === "darwin" ? "Meta+A" : "Control+A";
}
