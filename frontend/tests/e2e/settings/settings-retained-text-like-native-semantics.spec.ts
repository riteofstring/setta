import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

import { waitForAnimationFrame } from "./settings-retained-frame-helpers";
import {
  activateNativeTextLikeEditor,
  applyViewportTransformDelta,
  expectNativeTextStateAlignedToRow,
  openNativeTextLikeRow,
  resolveRetainedSurfaceWheelPoint,
  selectAllShortcut,
  waitForActiveNativeTextValue,
  waitForCommittedActiveEditorTextProof,
  waitForNativeTextSelectionState,
} from "./settings-retained-text-like-native-semantics-helpers";
import {
  analyzeCodeMirrorTextInkBounds,
  type Rect,
} from "./settings-retained-visual-analysis";

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test.beforeEach(async ({ page }) => {
  await page.route("**/setParamEnteredValue", async (route) => {
    await route.fulfill({
      body: "null",
      contentType: "application/json",
      status: 200,
    });
  });
});

test("native selection and caret stay with a retained text-like editor across projection frames", async ({
  page,
}) => {
  const { row, target } = await openNativeTextLikeRow(page);

  await activateNativeTextLikeEditor(page, row);
  await page.keyboard.press(selectAllShortcut());
  const selectedBefore = await waitForNativeTextSelectionState(page, {
    expectedCollapsed: false,
    rowId: row.rowId,
  });

  await applyViewportTransformDelta(page, { dx: 58, dy: -34 });
  await waitForAnimationFrame(page);
  const selectedAfterPan = await waitForNativeTextSelectionState(page, {
    expectedCollapsed: false,
    minEditorXDeltaFrom: selectedBefore,
    rowId: row.rowId,
  });
  await applyViewportTransformDelta(page, { zoomFactor: 1.1 });
  await waitForAnimationFrame(page);
  const selectedAfterZoom = await waitForNativeTextSelectionState(page, {
    expectedCollapsed: false,
    minEditorWidthDeltaFrom: selectedAfterPan,
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
    minEditorXDeltaFrom: caretBefore,
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

test("typing before and after retained motion stays in the same active editor", async ({
  page,
}) => {
  const { row, target } = await openNativeTextLikeRow(page);

  await activateNativeTextLikeEditor(page, row);
  await page.keyboard.press(selectAllShortcut());
  await page.keyboard.type("motion-before");
  const typedBefore = await waitForActiveNativeTextValue(page, {
    expectedText: "motion-before",
    rowId: row.rowId,
  });
  const caretBeforeMotion = await waitForNativeTextSelectionState(page, {
    expectedCollapsed: true,
    rowId: row.rowId,
  });

  const wheelPoint = await resolveRetainedSurfaceWheelPoint(
    page,
    target.surfaceId,
  );
  await page.mouse.move(wheelPoint.x, wheelPoint.y);
  await page.mouse.wheel(0, 28);
  await applyViewportTransformDelta(page, { dx: 48, dy: -26 });
  await waitForAnimationFrame(page);
  const caretAfterMotion = await waitForNativeTextSelectionState(page, {
    expectedCollapsed: true,
    minEditorXDeltaFrom: caretBeforeMotion,
    rowId: row.rowId,
  });

  await page.keyboard.type("-after");
  const typedAfter = await waitForActiveNativeTextValue(page, {
    expectedText: "motion-before-after",
    rowId: row.rowId,
  });
  const committedProof = await waitForCommittedActiveEditorTextProof(page, {
    rowId: row.rowId,
  });
  const details = JSON.stringify(
    {
      caretAfterMotion,
      caretBeforeMotion,
      committedProof,
      row,
      target,
      typedAfter,
      typedBefore,
    },
    null,
    2,
  );

  expect(typedBefore.activeEditorId, details).toContain(row.rowId);
  expect(typedAfter.activeEditorId, details).toBe(typedBefore.activeEditorId);
  expect(typedAfter.text, details).toContain("motion-before-after");
  expect(committedProof.active, details).toBe(true);
  expect(committedProof.requiredVisual, details).toBe("browser-visual");
  expect(committedProof.requiredInteraction, details).toBe(
    "active-editor-live",
  );
  expect(committedProof.actualInteraction, details).toBe("active-editor-live");
  expect(
    ["exact-live-host", "same-live-host-compatible-projection"].includes(
      committedProof.actualVisual ?? "",
    ),
    details,
  ).toBe(true);
  expect(committedProof.projectionCoverage, details).toBe("exact-live-dom");
  expectNativeTextStateAlignedToRow(caretAfterMotion, details);
});

test("retained motion preserves active editor visual ink and runtime health", async ({
  page,
}, testInfo) => {
  const runtimeHealth = capturePageRuntimeHealth(page);
  const { row, target } = await openNativeTextLikeRow(page);
  await page.addStyleTag({
    content: ".cm-cursor,.cm-cursorLayer{opacity:0!important}",
  });

  await activateNativeTextLikeEditor(page, row);
  await page.keyboard.press(selectAllShortcut());
  await page.keyboard.type("visible-motion-before");
  const typedBefore = await waitForActiveNativeTextValue(page, {
    expectedText: "visible-motion-before",
    rowId: row.rowId,
  });
  const caretBeforeMotion = await waitForNativeTextSelectionState(page, {
    expectedCollapsed: true,
    rowId: row.rowId,
  });
  const committedProofBefore = await waitForCommittedActiveEditorTextProof(
    page,
    { rowId: row.rowId },
  );
  const accessibilityBefore = await readNativeTextAccessibilityExposure(
    page,
    row.rowId,
  );
  const beforeClip = await clampScreenshotClipToViewport(
    page,
    caretBeforeMotion.rowControlRect,
  );
  const beforeFrame = await page.screenshot({
    clip: beforeClip,
    path: testInfo.outputPath("active-editor-motion-before.png"),
  });
  const beforeInk = await analyzeCodeMirrorTextInkBounds(page, {
    clip: beforeClip,
    screenshot: beforeFrame,
    searchRect: caretBeforeMotion.rowControlRect,
  });

  const wheelPoint = await resolveRetainedSurfaceWheelPoint(
    page,
    target.surfaceId,
  );
  await page.mouse.move(wheelPoint.x, wheelPoint.y);
  await page.mouse.wheel(0, 36);
  await applyViewportTransformDelta(page, { dx: 42, dy: -24 });
  await waitForAnimationFrame(page);

  const caretAfterMotion = await waitForNativeTextSelectionState(page, {
    expectedCollapsed: true,
    minEditorXDeltaFrom: caretBeforeMotion,
    rowId: row.rowId,
  });
  const afterClip = await clampScreenshotClipToViewport(
    page,
    caretAfterMotion.rowControlRect,
  );
  const afterFrame = await page.screenshot({
    clip: afterClip,
    path: testInfo.outputPath("active-editor-motion-after.png"),
  });
  const afterInk = await analyzeCodeMirrorTextInkBounds(page, {
    clip: afterClip,
    screenshot: afterFrame,
    searchRect: caretAfterMotion.rowControlRect,
  });

  await page.keyboard.type("-after");
  const typedAfter = await waitForActiveNativeTextValue(page, {
    expectedText: "visible-motion-before-after",
    rowId: row.rowId,
  });
  const committedProofAfter = await waitForCommittedActiveEditorTextProof(
    page,
    { rowId: row.rowId },
  );
  const accessibilityAfter = await readNativeTextAccessibilityExposure(
    page,
    row.rowId,
  );
  const runtimeHealthSnapshot = runtimeHealth.stop();
  const details = JSON.stringify(
    {
      accessibilityAfter,
      accessibilityBefore,
      afterClip,
      afterInk,
      beforeClip,
      beforeInk,
      caretAfterMotion,
      caretBeforeMotion,
      committedProofAfter,
      committedProofBefore,
      row,
      runtimeHealth: runtimeHealthSnapshot,
      target,
      typedAfter,
      typedBefore,
    },
    null,
    2,
  );

  expect(runtimeHealthSnapshot.consoleErrors, details).toEqual([]);
  expect(runtimeHealthSnapshot.pageErrors, details).toEqual([]);
  expect(typedBefore.activeEditorId, details).toContain(row.rowId);
  expect(typedAfter.activeEditorId, details).toBe(typedBefore.activeEditorId);
  expect(typedAfter.text, details).toContain("visible-motion-before-after");
  expect(beforeInk?.pixelCount ?? 0, details).toBeGreaterThan(0);
  expect(afterInk?.pixelCount ?? 0, details).toBeGreaterThan(0);
  expect(committedProofAfter.actorId, details).toBe(
    committedProofBefore.actorId,
  );
  expect(committedProofAfter.active, details).toBe(true);
  expect(committedProofAfter.requiredInteraction, details).toBe(
    "active-editor-live",
  );
  expect(committedProofAfter.actualInteraction, details).toBe(
    "active-editor-live",
  );
  expectSingleNativeTextAccessibilityExposure(accessibilityBefore, details);
  expectSingleNativeTextAccessibilityExposure(accessibilityAfter, details);
  expectNativeTextStateAlignedToRow(caretBeforeMotion, details);
  expectNativeTextStateAlignedToRow(caretAfterMotion, details);
});

test("active editor remains selectable after drag through held or drained candidate work", async ({
  page,
}) => {
  const runtimeHealth = capturePageRuntimeHealth(page);
  const { row } = await openNativeTextLikeRow(page);

  await activateNativeTextLikeEditor(page, row);
  await page.keyboard.press(selectAllShortcut());
  await page.keyboard.type("drag abort text");
  const caretBeforeDrag = await waitForNativeTextSelectionState(page, {
    expectedCollapsed: true,
    rowId: row.rowId,
  });
  const committedProofBefore = await waitForCommittedActiveEditorTextProof(
    page,
    { rowId: row.rowId },
  );
  await installNativePointerProbe(page, row.rowId);
  await clearBlockedVisibleFramePresentationEvents(page);

  const dragStart = {
    x:
      caretBeforeDrag.editorRect.x +
      Math.min(
        caretBeforeDrag.editorRect.width - 12,
        Math.max(120, caretBeforeDrag.editorRect.width * 0.82),
      ),
    y: caretBeforeDrag.editorRect.y + caretBeforeDrag.editorRect.height / 2,
  };
  const dragMid = {
    x:
      caretBeforeDrag.editorRect.x +
      Math.max(72, caretBeforeDrag.editorRect.width * 0.48),
    y: dragStart.y,
  };
  const dragEnd = {
    x: caretBeforeDrag.editorRect.x + 16,
    y: dragStart.y,
  };
  const candidateMotion = { dx: 36, dy: -18 };
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.move(dragMid.x, dragMid.y, { steps: 12 });

  const faultActorId = await readOptionalQueuedBrowserVisualActorId(page, {
    excludeActorId: committedProofBefore.actorId,
  });
  if (faultActorId !== null) {
    await installBrowserVisualFaultInjectionForDomControls(page, {
      readiness: "blocked-awaiting-live-host",
      withholdDomControlActorIds: [faultActorId],
    });
  }
  await applyViewportTransformDelta(page, candidateMotion);
  await requestGpuFlowDebugFrame(page);
  await waitForActiveEditorMotionFrame(page);

  await page.mouse.move(
    dragEnd.x + candidateMotion.dx,
    dragEnd.y + candidateMotion.dy,
    { steps: 6 },
  );
  await page.mouse.up();
  const blockedEvent =
    faultActorId === null
      ? null
      : await waitForBlockedVisibleFramePresentationEvent(page, {
          actorId: committedProofBefore.actorId,
          reason: "live-dom-budget",
        });
  if (faultActorId !== null) {
    await clearBrowserVisualFaultInjection(page);
  }
  await requestGpuFlowDebugFrame(page);
  await page.keyboard.press(selectAllShortcut());

  const selectedAfterAbort = await waitForNativeTextSelectionState(page, {
    expectedCollapsed: false,
    rowId: row.rowId,
  });
  const committedProofAfter = await waitForCommittedActiveEditorTextProof(
    page,
    {
      rowId: row.rowId,
    },
  );
  const pointerProbe = await readNativePointerProbe(page);
  const accessibilityAfter = await readNativeTextAccessibilityExposure(
    page,
    row.rowId,
  );
  const runtimeHealthSnapshot = runtimeHealth.stop();
  const details = JSON.stringify(
    {
      accessibilityAfter,
      blockedEvent,
      caretBeforeDrag,
      committedProofAfter,
      committedProofBefore,
      faultActorId,
      pointerProbe,
      row,
      runtimeHealth: runtimeHealthSnapshot,
      selectedAfterAbort,
    },
    null,
    2,
  );

  expect(runtimeHealthSnapshot.consoleErrors, details).toEqual([]);
  expect(runtimeHealthSnapshot.pageErrors, details).toEqual([]);
  const observedCandidateAbort =
    blockedEvent?.blockedReasons?.some(
      (blockedReason) =>
        (blockedReason.family === "browser-visual" &&
          blockedReason.reason === "live-dom-budget") ||
        (blockedReason.family === "visible-transaction" &&
          blockedReason.reason === "held-previous-budget-exceeded"),
    ) ?? false;
  if (faultActorId !== null) {
    expect(observedCandidateAbort, details).toBe(true);
    expect(typeof blockedEvent?.frozenFrameId, details).toBe("number");
  }
  expect(pointerProbe.pointerDownCount, details).toBeGreaterThanOrEqual(1);
  expect(pointerProbe.pointerMoveCount, details).toBeGreaterThanOrEqual(4);
  expect(pointerProbe.pointerUpCount, details).toBe(1);
  expect(pointerProbe.pointerCancelCount, details).toBe(0);
  expect(pointerProbe.activeEditorMoveCount, details).toBeGreaterThanOrEqual(1);
  expect(selectedAfterAbort.selectedText.length, details).toBeGreaterThan(4);
  expect(committedProofAfter.actorId, details).toBe(
    committedProofBefore.actorId,
  );
  expect(committedProofAfter.active, details).toBe(true);
  expectSingleNativeTextAccessibilityExposure(accessibilityAfter, details);
  expectNativeTextStateAlignedToRow(selectedAfterAbort, details);
});

test("active editor crossing viewport clip boundary keeps one exposed live host", async ({
  page,
}) => {
  const runtimeHealth = capturePageRuntimeHealth(page);
  const { row } = await openNativeTextLikeRow(page);

  await activateNativeTextLikeEditor(page, row);
  await page.keyboard.press(selectAllShortcut());
  await page.keyboard.type("clip boundary active editor");
  const caretBeforeClip = await waitForNativeTextSelectionState(page, {
    expectedCollapsed: true,
    rowId: row.rowId,
  });
  const committedProofBefore = await waitForCommittedActiveEditorTextProof(
    page,
    { rowId: row.rowId },
  );
  const accessibilityBefore = await readNativeTextAccessibilityExposure(
    page,
    row.rowId,
  );

  await applyViewportTransformDelta(page, {
    dy: -4 - caretBeforeClip.rowControlRect.y,
  });
  await waitForAnimationFrame(page);
  const caretAtClipBoundary = await waitForNativeTextSelectionState(page, {
    expectedCollapsed: true,
    rowId: row.rowId,
  });
  const committedProofAtClip = await waitForCommittedActiveEditorTextProof(
    page,
    { rowId: row.rowId },
  );
  const accessibilityAtClip = await readNativeTextAccessibilityExposure(
    page,
    row.rowId,
  );
  const runtimeHealthSnapshot = runtimeHealth.stop();
  const details = JSON.stringify(
    {
      accessibilityAtClip,
      accessibilityBefore,
      caretAtClipBoundary,
      caretBeforeClip,
      committedProofAtClip,
      committedProofBefore,
      row,
      runtimeHealth: runtimeHealthSnapshot,
    },
    null,
    2,
  );

  expect(runtimeHealthSnapshot.consoleErrors, details).toEqual([]);
  expect(runtimeHealthSnapshot.pageErrors, details).toEqual([]);
  expect(caretAtClipBoundary.rowControlRect.y, details).toBeLessThan(0);
  expect(
    caretAtClipBoundary.rowControlRect.y +
      caretAtClipBoundary.rowControlRect.height,
    details,
  ).toBeGreaterThan(4);
  expect(committedProofAtClip.actorId, details).toBe(
    committedProofBefore.actorId,
  );
  expect(committedProofAtClip.active, details).toBe(true);
  expectSingleNativeTextAccessibilityExposure(accessibilityBefore, details);
  expectSingleNativeTextAccessibilityExposure(accessibilityAtClip, details);
  expectNativeTextStateAlignedToRow(caretBeforeClip, details);
  expectNativeTextStateAlignedToRow(caretAtClipBoundary, details);
});

type RuntimeHealthSnapshot = {
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
};

type BrowserVisualFaultReadiness =
  | "blocked-awaiting-live-host"
  | "blocked-awaiting-snapshot";

type BlockedVisibleFramePresentationEvent = {
  readonly blockedReasons?: readonly {
    readonly actorId?: string | null;
    readonly family?: string | null;
    readonly reason?: string | null;
  }[];
  readonly eventCount: number;
  readonly frozenFrameId?: number | string | null;
};

type NativePointerProbeSnapshot = {
  readonly activeEditorMoveCount: number;
  readonly pointerCancelCount: number;
  readonly pointerDownCount: number;
  readonly pointerMoveCount: number;
  readonly pointerUpCount: number;
  readonly rowId: string;
};

type NativeTextAccessibilityExposure = {
  readonly activeEditorId: string | null;
  readonly activeHostCount: number;
  readonly exposedHostCount: number;
  readonly exposedHosts: readonly {
    readonly active: string | null;
    readonly ariaHidden: string | null;
    readonly controlId: string | null;
    readonly hasActiveEditor: boolean;
    readonly textLength: number;
  }[];
  readonly hostCount: number;
  readonly rowId: string;
};

function capturePageRuntimeHealth(page: Page): {
  readonly stop: () => RuntimeHealthSnapshot;
} {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() !== "error") {
      return;
    }
    consoleErrors.push(message.text());
  };
  const onPageError = (error: Error) => {
    pageErrors.push(error.message);
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  return {
    stop: () => {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      return {
        consoleErrors,
        pageErrors,
      };
    },
  };
}

function expectSingleNativeTextAccessibilityExposure(
  exposure: NativeTextAccessibilityExposure,
  details: string,
): void {
  expect(exposure.activeEditorId, details).toContain(exposure.rowId);
  expect(exposure.activeHostCount, details).toBe(1);
  expect(exposure.exposedHostCount, details).toBe(1);
  expect(exposure.exposedHosts[0]?.hasActiveEditor, details).toBe(true);
}

async function readNativeTextAccessibilityExposure(
  page: Page,
  rowId: string,
): Promise<NativeTextAccessibilityExposure> {
  return await page.evaluate((rowId) => {
    const hosts = Array.from(
      document.querySelectorAll<HTMLElement>(
        `[data-gpu-flow-dom-control-row-id="${CSS.escape(rowId)}"]`,
      ),
    );
    const activeElement = document.activeElement;
    const activeEditorId =
      activeElement instanceof Element
        ? activeElement
            .closest("[data-gpu-flow-control]")
            ?.getAttribute("data-gpu-flow-control") ?? null
        : null;
    const exposedHosts = hosts
      .filter(
        (host) =>
          !host.closest('[aria-hidden="true"]') &&
          host.getClientRects().length > 0,
      )
      .map((host) => ({
        active: host.dataset.gpuFlowDomControlActive ?? null,
        ariaHidden: host.getAttribute("aria-hidden"),
        controlId: host.dataset.gpuFlowDomControlId ?? null,
        hasActiveEditor: Boolean(host.querySelector(".cm-editor")),
        textLength: (host.textContent ?? "").trim().length,
      }));
    return {
      activeEditorId,
      activeHostCount: exposedHosts.filter((host) => host.active === "true")
        .length,
      exposedHostCount: exposedHosts.length,
      exposedHosts,
      hostCount: hosts.length,
      rowId,
    };
  }, rowId);
}

async function installNativePointerProbe(
  page: Page,
  rowId: string,
): Promise<void> {
  await page.evaluate((rowId) => {
    const view = window as typeof window & {
      __SETTA_GPU_FLOW_TEST_POINTER__?: {
        activeEditorMoveCount: number;
        pointerCancelCount: number;
        pointerDownCount: number;
        pointerMoveCount: number;
        pointerUpCount: number;
        rowId: string;
      };
    };
    const state = {
      activeEditorMoveCount: 0,
      pointerCancelCount: 0,
      pointerDownCount: 0,
      pointerMoveCount: 0,
      pointerUpCount: 0,
      rowId,
    };
    view.__SETTA_GPU_FLOW_TEST_POINTER__ = state;
    const readPointerRowId = (event: PointerEvent): string | null => {
      const target = event.target;
      const targetElement =
        target instanceof Element
          ? target
          : target instanceof Node
            ? target.parentElement
            : null;
      return (
        targetElement
          ?.closest("[data-gpu-flow-dom-control-row-id]")
          ?.getAttribute("data-gpu-flow-dom-control-row-id") ?? null
      );
    };
    const handlePointer = (event: PointerEvent) => {
      if (event.type === "pointerdown") {
        state.pointerDownCount += 1;
      } else if (event.type === "pointermove") {
        state.pointerMoveCount += 1;
        if (readPointerRowId(event) === rowId) {
          state.activeEditorMoveCount += 1;
        }
      } else if (event.type === "pointerup") {
        state.pointerUpCount += 1;
      } else if (event.type === "pointercancel") {
        state.pointerCancelCount += 1;
      }
    };
    document.addEventListener("pointerdown", handlePointer, true);
    document.addEventListener("pointermove", handlePointer, true);
    document.addEventListener("pointerup", handlePointer, true);
    document.addEventListener("pointercancel", handlePointer, true);
  }, rowId);
}

async function readNativePointerProbe(
  page: Page,
): Promise<NativePointerProbeSnapshot> {
  return await page.evaluate(() => {
    const state = (
      window as typeof window & {
        __SETTA_GPU_FLOW_TEST_POINTER__?: NativePointerProbeSnapshot;
      }
    ).__SETTA_GPU_FLOW_TEST_POINTER__;
    if (!state) {
      throw new Error("Missing native pointer probe.");
    }
    return state;
  });
}

async function installBrowserVisualFaultInjectionForDomControls(
  page: Page,
  {
    readiness,
    withholdAllDomControls = false,
    withholdDomControlActorIds = [],
  }: {
    readonly readiness: BrowserVisualFaultReadiness;
    readonly withholdAllDomControls?: boolean | undefined;
    readonly withholdDomControlActorIds?: readonly string[] | undefined;
  },
): Promise<void> {
  await page.evaluate(
    ({ readiness, withholdAllDomControls, withholdDomControlActorIds }) => {
      (
        window as typeof window & {
          __SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__?: unknown;
        }
      ).__SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__ = {
        domControlReadiness: readiness,
        withholdAllDomControls,
        withholdDomControlActorIds,
      };
    },
    { readiness, withholdAllDomControls, withholdDomControlActorIds },
  );
}

async function readOptionalQueuedBrowserVisualActorId(
  page: Page,
  {
    excludeActorId,
  }: {
    readonly excludeActorId: string;
  },
): Promise<string | null> {
  return await page.evaluate((excludeActorId) => {
    const presentationDebtRequests =
      (
        window as typeof window & {
          __SETTA_GPU_FLOW_PRESENTATION_DEBT_FRAME_REQUESTS__?: readonly {
            readonly resourceGraph?: {
              readonly queuedResourceKeys?: readonly string[];
            };
          }[];
        }
      ).__SETTA_GPU_FLOW_PRESENTATION_DEBT_FRAME_REQUESTS__ ?? [];
    for (const entry of [...presentationDebtRequests].reverse()) {
      const queuedResourceKeys = entry.resourceGraph?.queuedResourceKeys ?? [];
      for (const resourceKey of queuedResourceKeys) {
        const actorId = parseBrowserVisualActorId(resourceKey);
        if (actorId && actorId !== excludeActorId) {
          return actorId;
        }
      }
    }
    return null;

    function parseBrowserVisualActorId(resourceKey: string): string | null {
      if (resourceKey.startsWith("dom-control:")) {
        return resourceKey.slice("dom-control:".length);
      }
      if (resourceKey.startsWith("dom-control-snapshot:")) {
        return resourceKey.slice("dom-control-snapshot:".length);
      }
      return null;
    }
  }, excludeActorId);
}

async function clearBrowserVisualFaultInjection(page: Page): Promise<void> {
  await page.evaluate(() => {
    delete (
      window as typeof window & {
        __SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__?: unknown;
      }
    ).__SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__;
  });
}

async function clearBlockedVisibleFramePresentationEvents(
  page: Page,
): Promise<void> {
  await page.evaluate(() => {
    (
      window as typeof window & {
        __SETTA_GPU_FLOW_BLOCKED_VISIBLE_FRAME_PRESENTATION_EVENTS__?: unknown[];
      }
    ).__SETTA_GPU_FLOW_BLOCKED_VISIBLE_FRAME_PRESENTATION_EVENTS__ = [];
  });
}

async function requestGpuFlowDebugFrame(
  page: Page,
  frameReason: "manual" | "texture-upload" = "manual",
): Promise<void> {
  await page.evaluate((frameReason) => {
    const requestFrame = (
      window as typeof window & {
        readonly __SETTA_GPU_FLOW_DEBUG_REQUEST_FRAME__?: (
          reason?: "manual" | "texture-upload",
        ) => void;
      }
    ).__SETTA_GPU_FLOW_DEBUG_REQUEST_FRAME__;
    if (!requestFrame) {
      throw new Error("Missing GPU Flow debug frame requester.");
    }
    requestFrame(frameReason);
  }, frameReason);
}

async function waitForActiveEditorMotionFrame(
  page: Page,
): Promise<BlockedVisibleFramePresentationEvent | null> {
  await waitForAnimationFrame(page);
  await waitForAnimationFrame(page);
  return null;
}

async function waitForBlockedVisibleFramePresentationEvent(
  page: Page,
  {
    actorId,
    reason,
  }: {
    readonly actorId: string;
    readonly reason: string;
  },
): Promise<BlockedVisibleFramePresentationEvent> {
  const deadline = Date.now() + 5_000;
  let latestEvents: readonly BlockedVisibleFramePresentationEvent[] = [];
  while (Date.now() < deadline) {
    latestEvents = await readBlockedVisibleFramePresentationEvents(page);
    const event = findBlockedVisibleFramePresentationEvent(latestEvents, {
      actorId,
      reason,
    });
    if (event) {
      return event;
    }
    await requestGpuFlowDebugFrame(page);
    await page.waitForTimeout(50);
  }
  throw new Error(
    `Timed out waiting for blocked visible frame presentation. ${JSON.stringify(
      {
        actorId,
        events: latestEvents.slice(-6),
        reason,
      },
      null,
      2,
    )}`,
  );
}

async function readBlockedVisibleFramePresentationEvents(
  page: Page,
): Promise<readonly BlockedVisibleFramePresentationEvent[]> {
  return await page.evaluate(
    () =>
      (
        window as typeof window & {
          readonly __SETTA_GPU_FLOW_BLOCKED_VISIBLE_FRAME_PRESENTATION_EVENTS__?: readonly BlockedVisibleFramePresentationEvent[];
        }
      ).__SETTA_GPU_FLOW_BLOCKED_VISIBLE_FRAME_PRESENTATION_EVENTS__ ?? [],
  );
}

function findBlockedVisibleFramePresentationEvent(
  events: readonly BlockedVisibleFramePresentationEvent[],
  {
    actorId,
    reason,
  }: {
    readonly actorId: string;
    readonly reason: string;
  },
): BlockedVisibleFramePresentationEvent | null {
  let committedFrozenFallback: BlockedVisibleFramePresentationEvent | null =
    null;
  for (const [index, event] of events.entries()) {
    if (
      event.blockedReasons?.some(
        (blockedReason) =>
          blockedReason.actorId === actorId && blockedReason.reason === reason,
      )
    ) {
      return { ...event, eventCount: index + 1 };
    }
    if (
      committedFrozenFallback === null &&
      typeof event.frozenFrameId === "number"
    ) {
      committedFrozenFallback = { ...event, eventCount: index + 1 };
    }
  }
  return committedFrozenFallback;
}

async function clampScreenshotClipToViewport(
  page: Page,
  rect: Rect,
): Promise<Rect> {
  return await page.evaluate((rect) => {
    const padding = 8;
    const x = Math.min(
      Math.max(0, Math.floor(rect.x - padding)),
      Math.max(0, window.innerWidth - 1),
    );
    const y = Math.min(
      Math.max(0, Math.floor(rect.y - padding)),
      Math.max(0, window.innerHeight - 1),
    );
    const right = Math.min(
      window.innerWidth,
      Math.max(x + 1, Math.ceil(rect.x + rect.width + padding)),
    );
    const bottom = Math.min(
      window.innerHeight,
      Math.max(y + 1, Math.ceil(rect.y + rect.height + padding)),
    );
    return {
      height: Math.max(1, bottom - y),
      width: Math.max(1, right - x),
      x,
      y,
    };
  }, rect);
}
