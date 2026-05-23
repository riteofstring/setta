import { expect, type Page } from "@playwright/test";

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

type CommittedTextActorProof = {
  readonly active: boolean;
  readonly actorId: string;
  readonly actualInteraction: string | null;
  readonly actualVisual: string | null;
  readonly projectionCoverage: string | null;
  readonly requiredInteraction: string | null;
  readonly requiredVisual: string | null;
  readonly rowId: string | null;
  readonly visualProof: string | null;
};

const TARGET_TEXT_LIKE_ROW: TextLikeNativeSemanticsTarget = {
  rowId: TARGET_TEXT_ROW_ID,
  surfaceId: SECTION_SIZING_SURFACE_ID,
};

export async function openNativeTextLikeRow(page: Page): Promise<{
  readonly row: RetainedRowDebugEntry & {
    readonly controlClientPoint: Point;
    readonly controlClientRect: Rect;
  };
  readonly target: TextLikeNativeSemanticsTarget;
}> {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page, TARGET_TEXT_LIKE_ROW.surfaceId);
  const row =
    (await resolveVisibleTargetRow(page, TARGET_TEXT_LIKE_ROW)) ??
    (await resolveVisibleNativeTextLikeRow(
      page,
      TARGET_TEXT_LIKE_ROW.surfaceId,
    )) ??
    (await scrollRetainedSurfaceUntilTargetRowVisible(
      page,
      TARGET_TEXT_LIKE_ROW,
    ));
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

export function expectNativeTextStateAlignedToRow(
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

export function expectNativeCompositionStateAlignedToRow(
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

export async function activateNativeTextLikeEditor(
  page: Page,
  row: RetainedRowDebugEntry & {
    readonly controlClientPoint: Point;
    readonly controlClientRect: Rect;
  },
): Promise<void> {
  const points = [
    row.controlClientPoint,
    {
      x: row.controlClientRect.x + row.controlClientRect.width / 2,
      y: row.controlClientRect.y + row.controlClientRect.height / 2,
    },
  ];
  for (const point of points) {
    await page.mouse.click(point.x, point.y);
    try {
      await expect
        .poll(() => readActiveCodeMirrorId(page), { timeout: 2_000 })
        .toContain(row.rowId);
      return;
    } catch {
      await waitForAnimationFrame(page);
    }
  }
  throw new Error(
    `Could not activate native text-like editor. ${JSON.stringify(
      await readNativeTextActivationDiagnostics(page, row),
      null,
      2,
    )}`,
  );
}

async function readNativeTextActivationDiagnostics(
  page: Page,
  row: RetainedRowDebugEntry & {
    readonly controlClientPoint: Point;
    readonly controlClientRect: Rect;
  },
): Promise<unknown> {
  return await page.evaluate((row) => {
    const host = document.querySelector<HTMLElement>(
      `[data-gpu-flow-dom-control-row-id="${CSS.escape(row.rowId)}"]`,
    );
    const hostRect = host ? toPlainRect(host.getBoundingClientRect()) : null;
    const pointTarget = document.elementFromPoint(
      row.controlClientPoint.x,
      row.controlClientPoint.y,
    );
    const centerTarget = document.elementFromPoint(
      row.controlClientRect.x + row.controlClientRect.width / 2,
      row.controlClientRect.y + row.controlClientRect.height / 2,
    );
    const lastBlockedEvent =
      (
        window as typeof window & {
          readonly __SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__?: readonly {
            readonly blockedReasons?: readonly {
              readonly actorId?: string | null;
              readonly reason?: string | null;
            }[];
          }[];
        }
      ).__SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__?.at(-1) ?? null;
    const readBrowserVisualPreparation = (
      window as typeof window & {
        __settaGpuFlowBrowserVisualPreparationDiagnostics?: (
          actorId?: string | null,
        ) => unknown;
      }
    ).__settaGpuFlowBrowserVisualPreparationDiagnostics;
    const blockedActorPreparations =
      lastBlockedEvent?.blockedReasons
        ?.map((reason) => ({
          actorId: reason.actorId ?? null,
          preparation: readBrowserVisualPreparation?.(reason.actorId) ?? null,
          reason: reason.reason ?? null,
        }))
        .slice(0, 10) ?? [];
    return {
      activeElement: describeElement(document.activeElement),
      activeElementInsideHost:
        host && document.activeElement instanceof Element
          ? host.contains(document.activeElement)
          : false,
      activeEditorId:
        document.activeElement instanceof Element
          ? document.activeElement
              .closest("[data-gpu-flow-control]")
              ?.getAttribute("data-gpu-flow-control") ?? null
          : null,
      centerTarget: describeElement(centerTarget),
      domControlPlaneDiagnostics:
        (
          window as typeof window & {
            __settaGpuFlowDomControlPlaneDiagnostics?: () => unknown;
          }
        ).__settaGpuFlowDomControlPlaneDiagnostics?.() ?? null,
      browserVisualPreparation:
        readBrowserVisualPreparation?.(
          `retained-dom-control:${row.surfaceId}:${row.rowId}`,
        ) ?? null,
      blockedActorPreparations,
      coldStartShell: document.querySelector<HTMLElement>(
        '[data-gpu-flow-cold-start-shell="true"]',
      )
        ? true
        : false,
      lastBlockedEvent,
      host: host ? describeElement(host) : null,
      hostControls: host
        ? Array.from(
            host.querySelectorAll<HTMLElement>("[data-gpu-flow-control]"),
          )
            .slice(0, 5)
            .map((element) => ({
              ...(describeElement(element) as Record<string, unknown>),
              rect: toPlainRect(element.getBoundingClientRect()),
            }))
        : [],
      hostEditors: host
        ? Array.from(host.querySelectorAll<HTMLElement>(".cm-editor"))
            .slice(0, 5)
            .map((element) => ({
              ...(describeElement(element) as Record<string, unknown>),
              rect: toPlainRect(element.getBoundingClientRect()),
            }))
        : [],
      hostRect,
      pointTarget: describeElement(pointTarget),
      row: {
        controlClientPoint: row.controlClientPoint,
        controlClientRect: row.controlClientRect,
        rowId: row.rowId,
        surfaceId: row.surfaceId,
      },
    };

    function describeElement(element: Element | null): unknown {
      if (!(element instanceof HTMLElement)) {
        return null;
      }
      return {
        className: element.className,
        contentEditable: element.contentEditable,
        domControlActive: element.dataset.gpuFlowDomControlActive ?? null,
        domControlId: element.dataset.gpuFlowDomControlId ?? null,
        domControlRowId: element.dataset.gpuFlowDomControlRowId ?? null,
        gpuFlowControl: element.dataset.gpuFlowControl ?? null,
        id: element.id,
        pointerEvents: getComputedStyle(element).pointerEvents,
        tabIndex: element.tabIndex,
        tagName: element.tagName,
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
  }, row);
}

function rectIntersectsRect(left: Rect, right: Rect): boolean {
  return (
    left.x + left.width > right.x &&
    left.y + left.height > right.y &&
    left.x < right.x + right.width &&
    left.y < right.y + right.height
  );
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

async function resolveVisibleNativeTextLikeRow(
  page: Page,
  surfaceId: string,
): Promise<RetainedRowDebugEntry | null> {
  return await page.evaluate((surfaceId) => {
    const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId === surfaceId &&
          row.controlKind === "text-like" &&
          row.controlClientPoint !== null &&
          row.controlClientRect !== null &&
          row.controlClientRect.width > 8 &&
          row.controlClientRect.height > 8 &&
          rectIntersectsViewport(row.controlClientRect),
      )
      .sort(
        (left, right) =>
          (left.controlClientRect?.y ?? 0) - (right.controlClientRect?.y ?? 0),
      );
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
  }, surfaceId);
}

export async function resolveRetainedSurfaceWheelPoint(
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

export async function waitForNativeTextSelectionState(
  page: Page,
  {
    expectedCollapsed,
    minEditorWidthDeltaFrom,
    minEditorXDeltaFrom,
    rowId,
  }: {
    readonly expectedCollapsed: boolean;
    readonly minEditorWidthDeltaFrom?: NativeTextSelectionState | undefined;
    readonly minEditorXDeltaFrom?: NativeTextSelectionState | undefined;
    readonly rowId: string;
  },
): Promise<NativeTextSelectionState> {
  const deadline = Date.now() + 5_000;
  let latestState: NativeTextSelectionState | null = null;
  while (Date.now() < deadline) {
    latestState = await readNativeTextSelectionState(page, rowId);
    if (
      isExpectedNativeTextSelectionState(latestState, {
        expectedCollapsed,
        minEditorWidthDeltaFrom,
        minEditorXDeltaFrom,
      })
    ) {
      return latestState;
    }
    await page.waitForTimeout(80);
  }
  throw new Error(
    `Native text selection did not reach the expected state. ${JSON.stringify(
      {
        expectedCollapsed,
        latestState,
        minEditorWidthDeltaFrom,
        minEditorXDeltaFrom,
        rowId,
      },
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

export async function waitForActiveNativeTextValue(
  page: Page,
  {
    expectedText,
    rowId,
  }: {
    readonly expectedText: string;
    readonly rowId: string;
  },
): Promise<{
  readonly activeEditorId: string;
  readonly text: string;
}> {
  const deadline = Date.now() + 5_000;
  let latestValue: {
    activeEditorId: string | null;
    text: string | null;
  } | null = null;
  while (Date.now() < deadline) {
    latestValue = await readActiveNativeTextValue(page);
    if (
      latestValue?.activeEditorId?.includes(rowId) &&
      latestValue.text?.includes(expectedText)
    ) {
      return {
        activeEditorId: latestValue.activeEditorId,
        text: latestValue.text,
      };
    }
    await page.waitForTimeout(80);
  }
  throw new Error(
    `Native text value did not reach the expected text. ${JSON.stringify(
      { expectedText, latestValue, rowId },
      null,
      2,
    )}`,
  );
}

async function readActiveNativeTextValue(page: Page): Promise<{
  readonly activeEditorId: string | null;
  readonly text: string | null;
}> {
  return await page.evaluate(() => {
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
    return {
      activeEditorId,
      text: activeEditor?.querySelector(".cm-content")?.textContent ?? null,
    };
  });
}

export async function waitForCommittedActiveEditorTextProof(
  page: Page,
  { rowId }: { readonly rowId: string },
): Promise<CommittedTextActorProof> {
  const deadline = Date.now() + 5_000;
  let latestProof: CommittedTextActorProof | null = null;
  while (Date.now() < deadline) {
    latestProof = await readCommittedTextActorProof(page, rowId);
    if (isActiveEditorCommittedTextProof(latestProof)) {
      return latestProof;
    }
    await page.waitForTimeout(80);
  }
  throw new Error(
    `Committed text actor proof did not become active-editor capable. ${JSON.stringify(
      { latestProof, rowId },
      null,
      2,
    )}`,
  );
}

async function readCommittedTextActorProof(
  page: Page,
  rowId: string,
): Promise<CommittedTextActorProof | null> {
  return await page.evaluate((rowId) => {
    const proofs =
      window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().committedSurfaceFrame
        ?.textActorProofs ?? [];
    return (
      proofs.find((proof) => proof.rowId === rowId && proof.active) ??
      proofs.find((proof) => proof.rowId === rowId) ??
      null
    );
  }, rowId);
}

function isActiveEditorCommittedTextProof(
  proof: CommittedTextActorProof | null,
): proof is CommittedTextActorProof {
  return Boolean(
    proof?.active &&
      proof.requiredVisual === "browser-visual" &&
      proof.requiredInteraction === "active-editor-live" &&
      proof.actualInteraction === "active-editor-live" &&
      (proof.actualVisual === "exact-live-host" ||
        proof.actualVisual === "same-live-host-compatible-projection") &&
      proof.projectionCoverage === "exact-live-dom",
  );
}

function isExpectedNativeTextSelectionState(
  state: NativeTextSelectionState | null,
  options: {
    readonly expectedCollapsed: boolean;
    readonly minEditorWidthDeltaFrom?: NativeTextSelectionState | undefined;
    readonly minEditorXDeltaFrom?: NativeTextSelectionState | undefined;
  },
): state is NativeTextSelectionState {
  if (!state?.activeEditorId?.includes(state.rowId)) {
    return false;
  }
  if (!state.selectionWithinEditor) {
    return false;
  }
  if (state.selectionCollapsed !== options.expectedCollapsed) {
    return false;
  }
  if (
    options.minEditorXDeltaFrom &&
    Math.abs(state.editorRect.x - options.minEditorXDeltaFrom.editorRect.x) <=
      12
  ) {
    return false;
  }
  if (
    options.minEditorWidthDeltaFrom &&
    Math.abs(
      state.editorRect.width - options.minEditorWidthDeltaFrom.editorRect.width,
    ) <= 4
  ) {
    return false;
  }
  if (!isNativeTextStateAlignedToRow(state)) {
    return false;
  }
  if (options.expectedCollapsed) {
    return state.selectedText === "" && state.caretRect !== null;
  }
  return state.selectedText.length > 0 && state.selectionRect !== null;
}

function isNativeTextStateAlignedToRow(
  state: NativeTextSelectionState,
): boolean {
  return (
    Math.abs(state.editorRowDelta.x) <= 3 &&
    Math.abs(state.editorRowDelta.y) <= 9 &&
    Math.abs(state.editorRowDelta.width) <= 3 &&
    Math.abs(state.editorRowDelta.height) <= 9
  );
}

export async function applyViewportTransformDelta(
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

export async function installNativeCompositionProbe(page: Page): Promise<void> {
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

export async function dispatchSyntheticCompositionEvent(
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
  options: {
    readonly minEditorWidthDeltaFrom?: NativeCompositionState | undefined;
    readonly minEditorXDeltaFrom?: NativeCompositionState | undefined;
  } = {},
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
  if (kind !== "compositionend") {
    return await waitForNativeCompositionState(page, {
      expectedLastCompositionData: data,
      minEditorWidthDeltaFrom: options.minEditorWidthDeltaFrom,
      minEditorXDeltaFrom: options.minEditorXDeltaFrom,
      rowId,
    });
  }
  const state = await readNativeCompositionState(page, rowId);
  if (!state) {
    throw new Error(`Missing native composition state for ${rowId}.`);
  }
  return state;
}

async function waitForNativeCompositionState(
  page: Page,
  {
    expectedLastCompositionData,
    minEditorWidthDeltaFrom,
    minEditorXDeltaFrom,
    rowId,
  }: {
    readonly expectedLastCompositionData: string;
    readonly minEditorWidthDeltaFrom?: NativeCompositionState | undefined;
    readonly minEditorXDeltaFrom?: NativeCompositionState | undefined;
    readonly rowId: string;
  },
): Promise<NativeCompositionState> {
  const deadline = Date.now() + 5_000;
  let latestState: NativeCompositionState | null = null;
  while (Date.now() < deadline) {
    latestState = await readNativeCompositionState(page, rowId);
    if (
      isExpectedNativeCompositionState(latestState, {
        expectedLastCompositionData,
        minEditorWidthDeltaFrom,
        minEditorXDeltaFrom,
      })
    ) {
      return latestState;
    }
    await page.waitForTimeout(80);
  }
  throw new Error(
    `Native composition did not reach the expected state. ${JSON.stringify(
      {
        expectedLastCompositionData,
        latestState,
        minEditorWidthDeltaFrom,
        minEditorXDeltaFrom,
        rowId,
      },
      null,
      2,
    )}`,
  );
}

function isExpectedNativeCompositionState(
  state: NativeCompositionState | null,
  options: {
    readonly expectedLastCompositionData: string;
    readonly minEditorWidthDeltaFrom?: NativeCompositionState | undefined;
    readonly minEditorXDeltaFrom?: NativeCompositionState | undefined;
  },
): state is NativeCompositionState {
  if (!state?.activeEditorId?.includes(state.rowId)) {
    return false;
  }
  if (!state.activeCompositionControlId?.includes(state.rowId)) {
    return false;
  }
  if (state.lastCompositionData !== options.expectedLastCompositionData) {
    return false;
  }
  if (
    options.minEditorXDeltaFrom &&
    Math.abs(state.editorRect.x - options.minEditorXDeltaFrom.editorRect.x) <=
      12
  ) {
    return false;
  }
  if (
    options.minEditorWidthDeltaFrom &&
    Math.abs(
      state.editorRect.width - options.minEditorWidthDeltaFrom.editorRect.width,
    ) <= 4
  ) {
    return false;
  }
  return isNativeCompositionStateAlignedToRow(state);
}

function isNativeCompositionStateAlignedToRow(
  state: NativeCompositionState,
): boolean {
  return (
    Math.abs(state.editorRowDelta.x) <= 3 &&
    Math.abs(state.editorRowDelta.y) <= 9 &&
    Math.abs(state.editorRowDelta.width) <= 3 &&
    Math.abs(state.editorRowDelta.height) <= 9
  );
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

export function selectAllShortcut(): string {
  return process.platform === "darwin" ? "Meta+A" : "Control+A";
}
