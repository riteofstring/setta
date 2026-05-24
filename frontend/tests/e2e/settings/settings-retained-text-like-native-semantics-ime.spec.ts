import { expect, test } from "@playwright/test";

import { waitForAnimationFrame } from "./settings-retained-frame-helpers";
import {
  activateNativeTextLikeEditor,
  applyViewportTransformDelta,
  dispatchSyntheticCompositionEvent,
  expectNativeCompositionStateAlignedToRow,
  installNativeCompositionProbe,
  openNativeTextLikeRow,
  resolveRetainedSurfaceWheelPoint,
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

test("IME composition stays live and aligned through retained scroll and viewport projection", async ({
  page,
}) => {
  const { row, target } = await openNativeTextLikeRow(page);

  await installNativeCompositionProbe(page);
  await activateNativeTextLikeEditor(page, row);
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
  const composingAfterPan = await dispatchSyntheticCompositionEvent(
    page,
    {
      data: "kana-pan",
      kind: "compositionupdate",
      rowId: row.rowId,
    },
    { minEditorXDeltaFrom: composingAfterScroll },
  );
  await applyViewportTransformDelta(page, { zoomFactor: 1.08 });
  await waitForAnimationFrame(page);
  const composingAfterZoom = await dispatchSyntheticCompositionEvent(
    page,
    {
      data: "kana-zoom",
      kind: "compositionupdate",
      rowId: row.rowId,
    },
    { minEditorWidthDeltaFrom: composingAfterPan },
  );
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
