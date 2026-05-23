import {
  expect,
  test,
  type ConsoleMessage,
  type Page,
  type TestInfo,
} from "@playwright/test";

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
  const runtimeHealthSnapshot = runtimeHealth.stop();
  const details = JSON.stringify(
    {
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
  expectNativeTextStateAlignedToRow(caretBeforeMotion, details);
  expectNativeTextStateAlignedToRow(caretAfterMotion, details);
});

type RuntimeHealthSnapshot = {
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
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
