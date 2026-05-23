import { expect, test } from "@playwright/test";

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
