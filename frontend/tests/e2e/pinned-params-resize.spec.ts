import { writeFile } from "node:fs/promises";
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import type { SettingsState } from "../../src/utils/generatedTypes";

const MOD_KEY = process.platform === "darwin" ? "Meta" : "Control";
const PARAM_SELECT_KEY = "Shift";
const SELECT_ALL_SHORTCUT = MOD_KEY === "Meta" ? "Meta+A" : "Control+A";
const JUMP_TO_START_SHORTCUT =
  MOD_KEY === "Meta" ? "Meta+ArrowUp" : "Control+Home";
const TARGET_CALLABLE = "math.sqrt";
const FALLBACK_CALLABLE_SECTION_NAME = "__pw_callable__";
const FALLBACK_DICT_SECTION_NAME = "__pw_dict__";
const EXPECTED_CALLABLE_HIDE_PARAMS_MIN_HEIGHT = 32;
const EXPECTED_UNPINNED_PARAMS_AREA_MIN_HEIGHT = 38;
const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const AUTH_COOKIE_NAME = process.env.SETTA_AUTH_COOKIE_NAME ?? "setta_auth";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);
const READY_SELECTOR = ".react-flow__pane";

type DragHandle = "bottom" | "right" | "bottomRight";
type Box = { x: number; y: number; width: number; height: number };
type ScrollMetrics = { clientHeight: number; scrollHeight: number };
type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};

test("pinned params resize behavior", async ({ page }, testInfo) => {
  await ensureAppReady(page);

  const settingsSnapshot = await loadSettingsSnapshot(page);
  try {
    const didUpdateSettings = await ensureSizingPolicyDefaults(page);
    if (didUpdateSettings) {
      await page.reload();
      await page.waitForSelector(".react-flow__pane");
    }

    const sections = page.locator('section[class*="card-section"]');
    await ensureProjectConfig(page, sections);

    const ensuredCallable = await ensureCallableSectionWithMathSqrt(
      page,
      sections,
    );
    let callableSection = ensuredCallable.callableSection;
    const callableName = ensuredCallable.callableName;
    await ensureImportMath(page);

  await focusSectionFromOverview(page, callableName, callableSection);
  let paramGroup = callableSection.locator("div.section-row-pin-main").first();
  let unpinnedArea = paramGroup
    .locator(":scope > div.section-args-nested")
    .first();
  const editableRows = await ensureEditableArgRows(
    callableSection,
    unpinnedArea,
    6,
  );
  let unpinnedRows = unpinnedArea.locator(
    ":scope > article.section-args-nested-key-value",
  );
  const edgeRowIds = [
    await setRowNameByIndex(page, editableRows, 0, "a", testInfo),
    await setRowNameByIndex(page, editableRows, 1, "b", testInfo),
  ];
  await selectArgRowsById(page, edgeRowIds);
  const convertEdgesButton = callableSection.getByRole("button", {
    name: "Convert to edge connectors",
  });
  await expect(convertEdgesButton).toBeEnabled();
  await convertEdgesButton.click();

  let edgesStrip = paramGroup
    .locator(":scope > section.section-row-pin-main")
    .first();
  await expect(edgesStrip).toBeVisible();
  const edgesInputRows = edgesStrip
    .locator("div.grid > div")
    .first()
    .locator("div.flex.flex-col.gap-1 > div");
  await expect.poll(async () => edgesInputRows.count()).toBeGreaterThan(0);

  unpinnedRows = unpinnedArea.locator(
    ":scope > article.section-args-nested-key-value",
  );
  let unpinnedRowCount = await unpinnedRows.count();
  if (unpinnedRowCount < 2) {
    await ensureEditableArgRows(callableSection, unpinnedArea, 2);
    unpinnedRowCount = await unpinnedRows.count();
  }
  if (unpinnedRowCount < 2) {
    throw new Error("Need at least two unpinned rows to pin.");
  }
  const pinCount = Math.min(3, Math.max(1, unpinnedRowCount - 2));
  const pinIndices = Array.from({ length: pinCount }, (_, index) => index);
  await selectArgRowsByIndex(page, unpinnedRows, pinIndices);
  await callableSection
    .getByRole("button", { name: "Pin selected args" })
    .click();

  let pinnedArea = paramGroup.locator('section:has-text("Pinned Params")');
  await expect(pinnedArea).toBeVisible();

  let pinnedList = pinnedArea.locator("div.section-args-nested");
  let pinnedRows = pinnedList.locator(
    ":scope > article.section-args-nested-key-value",
  );
  unpinnedRows = unpinnedArea.locator(
    ":scope > article.section-args-nested-key-value",
  );
    await expect
      .poll(async () => pinnedRows.count())
      .toBeGreaterThanOrEqual(pinCount);
    await expect
      .poll(async () => unpinnedRows.count())
      .toBeGreaterThanOrEqual(1);

  let edgesHeight = await getHeight(edgesStrip);
  const pinnedRowHeight = await getMinParamRowHeight(pinnedList);
  const unpinnedRowHeight = await getMinParamRowHeight(unpinnedArea);
  await expect
    .poll(async () => {
      const metrics = await getPinnedLayoutMetrics(
        page,
        paramGroup,
        pinnedArea,
        unpinnedArea,
        edgesStrip,
      );
      return metrics.unpinnedMinHeight;
    })
    .toBeGreaterThan(0);
  const initialLayoutMetrics = await getPinnedLayoutMetrics(
    page,
    paramGroup,
    pinnedArea,
    unpinnedArea,
    edgesStrip,
  );
  const expectedPinnedMin =
    pinnedRowHeight +
    initialLayoutMetrics.pinnedHeaderHeight +
    initialLayoutMetrics.pinnedPadding +
    initialLayoutMetrics.pinnedBorderHeight;
  const expectedPinnedMaxInitial = initialLayoutMetrics.pinnedContentHeight;
  const expectedUnpinnedMin =
    initialLayoutMetrics.unpinnedRowHeight +
    initialLayoutMetrics.unpinnedPadding;
  // - The pinned param area max height should be the minimum height necessary to have all pinned params visible.
  // - The pinned param area min height should be the height where 1 pinned param is fully visible.
  // - The unpinned param area max height should be unbounded.
  // - The unpinned param area min height should be the height where 1 unpinned param is fully visible.
  expect(initialLayoutMetrics.pinnedMaxHeight).toBeGreaterThanOrEqual(
    expectedPinnedMaxInitial - 2,
  );
  expect(initialLayoutMetrics.pinnedMaxHeight).toBeLessThanOrEqual(
    expectedPinnedMaxInitial + 4,
  );
  expect(initialLayoutMetrics.pinnedMinHeight).toBeGreaterThanOrEqual(
    expectedPinnedMin - 2,
  );
  expect(initialLayoutMetrics.pinnedMinHeight).toBeLessThanOrEqual(
    expectedPinnedMin + 4,
  );
  expect(initialLayoutMetrics.pinnedHeight).toBeGreaterThanOrEqual(
    expectedPinnedMin - 2,
  );
  expect(initialLayoutMetrics.unpinnedMinHeight).toBeGreaterThanOrEqual(
    expectedUnpinnedMin - 2,
  );
  expect(initialLayoutMetrics.unpinnedMinHeight).toBeLessThanOrEqual(
    expectedUnpinnedMin + 4,
  );
  const unpinnedMaxHeight = await getComputedMaxHeight(unpinnedArea);
  expect(isMaxHeightUnbounded(unpinnedMaxHeight)).toBe(true);
  pinnedList = pinnedArea.locator("div.section-args-nested");

  await dragResize(page, callableSection, {
    handle: "bottom",
    dx: 0,
    dy: 500,
    outside: 6,
  });
  await dragPinnedResize(page, pinnedArea, 500);
  const pinnedMaxResult = await waitForPinnedMax(
    page,
    paramGroup,
    pinnedArea,
    unpinnedArea,
    edgesStrip,
  );
  const layoutMetrics = pinnedMaxResult.metrics;
  const pinnedMetricsAtMax = await getScrollMetrics(pinnedList);
  const unpinnedMetricsAtMax = await getScrollMetrics(unpinnedArea);
  const unpinnedMinExpected =
    layoutMetrics.unpinnedRowHeight + layoutMetrics.unpinnedPadding;
  await attachLayoutSnapshot({
    testInfo,
    label: "pinned-max-layout",
    target: callableSection,
    metrics: {
      ...layoutMetrics,
      pinnedMaxReached: pinnedMaxResult.didReach,
      pinnedListScrollHeight: pinnedMetricsAtMax.scrollHeight,
      pinnedListClientHeight: pinnedMetricsAtMax.clientHeight,
      unpinnedListScrollHeight: unpinnedMetricsAtMax.scrollHeight,
      unpinnedListClientHeight: unpinnedMetricsAtMax.clientHeight,
      unpinnedMinExpected,
    },
  });
  expect(pinnedMaxResult.didReach).toBe(true);
  const expectedPinnedMax = getExpectedPinnedMax(layoutMetrics);
  const pinnedTargetMax = getPinnedTargetMax(layoutMetrics);
  const pinnedAvailableHeight = getPinnedAvailableHeight(layoutMetrics);
  const hasRoomForAllPinned =
    pinnedAvailableHeight >= layoutMetrics.pinnedContentHeight - 2;
  expect(Math.abs(layoutMetrics.pinnedHeight - expectedPinnedMax)).toBeLessThanOrEqual(
    4,
  );
  expect(Math.abs(pinnedTargetMax - expectedPinnedMax)).toBeLessThanOrEqual(2);
  expect(expectedPinnedMax).toBeLessThanOrEqual(
    layoutMetrics.pinnedContentHeight + 2,
  );
  if (hasRoomForAllPinned) {
    expect(Math.abs(expectedPinnedMax - layoutMetrics.pinnedContentHeight)).toBeLessThanOrEqual(
      2,
    );
  }
  // Pinned params should never grow beyond the height needed to show all
  // pinned params fully.
  const pinnedHeightAtMax = await getHeight(pinnedArea);
  await dragPinnedResize(page, pinnedArea, 220);
  const pinnedHeightAfterOversizeDrag = await getHeight(pinnedArea);
  expect(pinnedHeightAfterOversizeDrag).toBeLessThanOrEqual(
    pinnedTargetMax + 2,
  );
  expect(pinnedHeightAfterOversizeDrag).toBeLessThanOrEqual(
    pinnedHeightAtMax + 2,
  );
  const layoutMetricsAfterOversize = await getPinnedLayoutMetrics(
    page,
    paramGroup,
    pinnedArea,
    unpinnedArea,
    edgesStrip,
  );
  if (
    layoutMetricsAfterOversize.pinnedListScrollHeight <=
    layoutMetricsAfterOversize.pinnedListClientHeight + 2
  ) {
    expect(layoutMetricsAfterOversize.pinnedListTrailingGap).toBeLessThanOrEqual(
      4,
    );
  }
  if (layoutMetrics.pinnedMaxHeight > 0) {
    expect(
      Math.abs(layoutMetrics.pinnedMaxHeight - expectedPinnedMax),
    ).toBeLessThanOrEqual(4);
  }
  const shouldScrollAtMax = layoutMetrics.pinnedContentHeight > expectedPinnedMax + 1;
  if (shouldScrollAtMax) {
    expect(pinnedMetricsAtMax.scrollHeight).toBeGreaterThan(
      pinnedMetricsAtMax.clientHeight,
    );
  } else {
    expect(pinnedMetricsAtMax.scrollHeight).toBeLessThanOrEqual(
      pinnedMetricsAtMax.clientHeight + 2,
    );
    // Max height should end at the bottom of the last pinned row,
    // with no extra blank space below it.
    expect(layoutMetrics.pinnedListTrailingGap).toBeLessThanOrEqual(4);
  }
  expect(unpinnedMetricsAtMax.clientHeight).toBeGreaterThanOrEqual(
    unpinnedMinExpected - 2,
  );

  // Pinned params should never resize beyond the minimum height needed
  // to show all pinned params fully.
  const pinnedHeightBefore = await getHeight(pinnedArea);
  await clickPinnedResizeHandle(page, pinnedArea);
  const pinnedHeightAfter = await getHeight(pinnedArea);
  expect(Math.abs(pinnedHeightAfter - pinnedHeightBefore)).toBeLessThanOrEqual(2);

  await dragPinnedResize(page, pinnedArea, -300);
  const pinnedMetrics = await getScrollMetrics(pinnedList);
  expect(pinnedMetrics.clientHeight).toBeGreaterThanOrEqual(
    pinnedRowHeight - 2,
  );
  expect(pinnedMetrics.scrollHeight).toBeGreaterThan(
    pinnedMetrics.clientHeight,
  );
  let pinnedHeightManual = await getHeight(pinnedArea);

  await dragResize(page, callableSection, {
    handle: "bottom",
    dx: 0,
    dy: 200,
    outside: 6,
  });
  const pinnedHeightAfterSectionResize = await getHeight(pinnedArea);
  expect(
    Math.abs(pinnedHeightAfterSectionResize - pinnedHeightManual),
  ).toBeLessThanOrEqual(2);
  const pinnedMetricsAfterSectionResize = await getScrollMetrics(pinnedList);
  expect(pinnedMetricsAfterSectionResize.scrollHeight).toBeGreaterThan(
    pinnedMetricsAfterSectionResize.clientHeight,
  );

  const pinnedHeightSavePromise = page.waitForResponse((response) => {
    return (
      response.url().includes("/setSectionPinnedAreaHeight") &&
      response.request().method() === "POST"
    );
  });
  await dragPinnedResize(page, pinnedArea, 80);
  let pinnedHeightAfterManualResize = await getHeight(pinnedArea);
  const layoutMetricsAfterManual = await getPinnedLayoutMetrics(
    page,
    paramGroup,
    pinnedArea,
    unpinnedArea,
    edgesStrip,
  );
  const expectedPinnedMaxAfterManual =
    getExpectedPinnedMax(layoutMetricsAfterManual);
  const canGrowAfterManual =
    expectedPinnedMaxAfterManual - pinnedHeightManual > 6;
  if (
    pinnedHeightAfterManualResize <= pinnedHeightManual + 4 &&
    canGrowAfterManual
  ) {
    await dragPinnedResize(page, pinnedArea, 160);
    pinnedHeightAfterManualResize = await getHeight(pinnedArea);
  }
  if (pinnedHeightAfterManualResize <= pinnedHeightManual + 4) {
    if (canGrowAfterManual) {
      throw new Error("Pinned params area did not resize when growth expected.");
    }
    expect(
      Math.abs(pinnedHeightAfterManualResize - expectedPinnedMaxAfterManual),
    ).toBeLessThanOrEqual(2);
  } else {
    await pinnedHeightSavePromise;
    expect(pinnedHeightAfterManualResize).toBeGreaterThan(
      pinnedHeightManual + 4,
    );
  }
  pinnedHeightManual = pinnedHeightAfterManualResize;

  await clickResizeHandle(page, callableSection, "bottom", 6);
  const pinnedHeightAfterSectionClick = await getHeight(pinnedArea);
  expect(
    Math.abs(pinnedHeightAfterSectionClick - pinnedHeightManual),
  ).toBeLessThanOrEqual(2);

  // Refresh can leave the pinned area too small to show any rows and
  // temporarily non-resizable; retry reloads before failing.
  const reloadState = await reloadPinnedSectionState({
    page,
    callableName,
    testInfo,
  });
  callableSection = reloadState.callableSection;
  paramGroup = reloadState.paramGroup;
  unpinnedArea = reloadState.unpinnedArea;
  pinnedArea = reloadState.pinnedArea;
  pinnedList = reloadState.pinnedList;
  pinnedRows = reloadState.pinnedRows;
  unpinnedRows = reloadState.unpinnedRows;
  edgesStrip = reloadState.edgesStrip;
  edgesHeight = await getHeight(edgesStrip);

  const pinnedHeightAfterReload = await getHeight(pinnedArea);
  const reloadLayoutMetrics = await getPinnedLayoutMetrics(
    page,
    paramGroup,
    pinnedArea,
    unpinnedArea,
    edgesStrip,
  );
  await attachLayoutSnapshot({
    testInfo,
    label: "pinned-reload-layout",
    target: callableSection,
    metrics: {
      ...reloadLayoutMetrics,
      pinnedHeightManual,
      pinnedHeightAfterReload,
    },
  });
  expect(Math.abs(pinnedHeightAfterReload - pinnedHeightManual)).toBeLessThanOrEqual(
    3,
  );

  const sectionHeightBeforeReloadResize = await getHeight(callableSection);
  await dragResize(page, callableSection, {
    handle: "bottom",
    dx: 0,
    dy: 400,
    outside: 6,
  });
  await expect
    .poll(async () => getHeight(callableSection), { timeout: 3000 })
    .toBeGreaterThan(sectionHeightBeforeReloadResize + 20);
  const sectionHeightAfterReloadResize = await getHeight(callableSection);
  const pinnedHeightAfterReloadResize = await getHeight(pinnedArea);
  expect(
    Math.abs(pinnedHeightAfterReloadResize - pinnedHeightAfterReload),
  ).toBeLessThanOrEqual(2);

  const pinnedRowHeightAfterReload = await getMinParamRowHeight(pinnedList);
  const unpinnedRowHeightAfterReload =
    await getMinParamRowHeight(unpinnedArea);
  const layoutMetricsAfterReload = await getPinnedLayoutMetrics(
    page,
    paramGroup,
    pinnedArea,
    unpinnedArea,
    edgesStrip,
  );
  const expectedPinnedMinAfterReloadCheck =
    pinnedRowHeightAfterReload +
    layoutMetricsAfterReload.pinnedHeaderHeight +
    layoutMetricsAfterReload.pinnedPadding +
    layoutMetricsAfterReload.pinnedBorderHeight;
  const expectedUnpinnedMinAfterReloadCheck =
    layoutMetricsAfterReload.unpinnedRowHeight +
    layoutMetricsAfterReload.unpinnedPadding;
  expect(layoutMetricsAfterReload.pinnedMinHeight).toBeGreaterThanOrEqual(
    expectedPinnedMinAfterReloadCheck - 2,
  );
  expect(layoutMetricsAfterReload.unpinnedMinHeight).toBeGreaterThanOrEqual(
    expectedUnpinnedMinAfterReloadCheck - 2,
  );
  expect(layoutMetricsAfterReload.unpinnedMinHeight).toBeLessThanOrEqual(
    expectedUnpinnedMinAfterReloadCheck + 4,
  );
  const expectedPinnedMaxAfterReload =
    getExpectedPinnedMax(layoutMetricsAfterReload);
  const expectedPinnedMinAfterReload =
    pinnedRowHeightAfterReload +
    layoutMetricsAfterReload.pinnedHeaderHeight +
    layoutMetricsAfterReload.pinnedPadding +
    layoutMetricsAfterReload.pinnedBorderHeight;
  const canGrow = expectedPinnedMaxAfterReload - pinnedHeightAfterReloadResize > 6;
  const canShrink =
    pinnedHeightAfterReloadResize - expectedPinnedMinAfterReload > 6;
  const preferredDelta = canGrow ? 60 : canShrink ? -60 : 60;
  await dragPinnedResize(page, pinnedArea, preferredDelta);
  let pinnedHeightAfterSecondResize = await getHeight(pinnedArea);
  if (
    Math.abs(pinnedHeightAfterSecondResize - pinnedHeightAfterReloadResize) <= 2
  ) {
    const fallbackDelta = preferredDelta > 0 ? -60 : 60;
    await dragPinnedResize(page, pinnedArea, fallbackDelta);
    pinnedHeightAfterSecondResize = await getHeight(pinnedArea);
  }
  if (
    Math.abs(pinnedHeightAfterSecondResize - pinnedHeightAfterReloadResize) <= 2
  ) {
    throw new Error("Pinned params area did not resize after reload.");
  }
  pinnedHeightManual = pinnedHeightAfterSecondResize;

  const sectionHeightBeforeShrink = await getHeight(callableSection);
  await dragResize(page, callableSection, {
    handle: "bottom",
    dx: 0,
    dy: -140,
    outside: 6,
  });
  const sectionHeightAfterShrink = await getHeight(callableSection);
  if (sectionHeightAfterShrink < sectionHeightBeforeShrink - 10) {
    const pinnedHeightAfterShrink = await getHeight(pinnedArea);
    expect(
      Math.abs(pinnedHeightAfterShrink - pinnedHeightManual),
    ).toBeLessThanOrEqual(2);
  }

  // If pinned params are already at their minimum height, shrinking the
  // callable section must not push them below that minimum (no partial rows).
  const pinnedHeightAtMinManual = await shrinkPinnedAreaToMin(page, pinnedArea);
  const pinnedRowHeightAtMinManual = await getMinParamRowHeight(pinnedList);
  await dragResize(page, callableSection, {
    handle: "bottom",
    dx: 0,
    dy: -160,
    outside: 6,
  });
  const pinnedHeightAfterSectionShrinkFromMin = await getHeight(pinnedArea);
  expect(pinnedHeightAfterSectionShrinkFromMin).toBeGreaterThanOrEqual(
    pinnedHeightAtMinManual - 2,
  );
  const pinnedMetricsAfterSectionShrinkFromMin = await getScrollMetrics(
    pinnedList,
  );
  expect(pinnedMetricsAfterSectionShrinkFromMin.clientHeight).toBeGreaterThanOrEqual(
    pinnedRowHeightAtMinManual - 2,
  );
  await expectRowFullyVisibleWithinContainer(
    pinnedList,
    pinnedRows.first(),
    "pinned-min-after-section-shrink",
  );
  pinnedHeightManual = pinnedHeightAfterSectionShrinkFromMin;

  await shrinkSectionToMinHeight(page, callableSection, "bottom", 6);
  await unpinnedArea.evaluate((el) => {
    el.scrollTop = 0;
  });
  await pinnedList.evaluate((el) => {
    el.scrollTop = 0;
  });
  const unpinnedMetrics = await getScrollMetrics(unpinnedArea);
  expect(unpinnedMetrics.clientHeight).toBeGreaterThanOrEqual(
    unpinnedRowHeightAfterReload - 2,
  );
  const pinnedMetricsAfterShrink = await getScrollMetrics(pinnedList);
  expect(pinnedMetricsAfterShrink.clientHeight).toBeGreaterThanOrEqual(
    pinnedRowHeightAfterReload - 2,
  );
  const layoutMetricsAtMin = await getPinnedLayoutMetrics(
    page,
    paramGroup,
    pinnedArea,
    unpinnedArea,
    edgesStrip,
  );
  const unpinnedMinExpectedAtMin =
    layoutMetricsAtMin.unpinnedMinHeight > 0
      ? layoutMetricsAtMin.unpinnedMinHeight
      : layoutMetricsAtMin.unpinnedRowHeight +
        layoutMetricsAtMin.unpinnedPadding;
  const pinnedMinExpectedAtMin =
    pinnedRowHeightAfterReload +
    layoutMetricsAtMin.pinnedHeaderHeight +
    layoutMetricsAtMin.pinnedPadding +
    layoutMetricsAtMin.pinnedBorderHeight;
  expect(unpinnedMetrics.clientHeight).toBeGreaterThanOrEqual(
    unpinnedMinExpectedAtMin - 2,
  );
  expect(layoutMetricsAtMin.pinnedHeight).toBeGreaterThanOrEqual(
    pinnedMinExpectedAtMin - 2,
  );
  const unpinnedAtMin =
    unpinnedMetrics.clientHeight <= unpinnedMinExpectedAtMin + 4;
  const pinnedAtMin = layoutMetricsAtMin.pinnedHeight <= pinnedMinExpectedAtMin + 4;
  // When both areas are at their minimum, the first row must be fully visible
  // (no partial rows), and the next row should be clipped.
  await expectRowFullyVisibleWithinContainer(
    unpinnedArea,
    unpinnedRows.first(),
    "unpinned",
  );
  await expectRowFullyVisibleWithinContainer(
    pinnedList,
    pinnedRows.first(),
    "pinned",
  );
  if (unpinnedAtMin && (await unpinnedRows.count()) > 1) {
    await expectRowNotFullyVisibleWithinContainer(
      unpinnedArea,
      unpinnedRows.nth(1),
      "unpinned-secondary",
    );
  }
  if (pinnedAtMin && (await pinnedRows.count()) > 1) {
    await expectRowNotFullyVisibleWithinContainer(
      pinnedList,
      pinnedRows.nth(1),
      "pinned-secondary",
    );
  }
  await attachLayoutSnapshot({
    testInfo,
    label: "pinned-min-layout",
    target: callableSection,
    metrics: {
      ...layoutMetricsAtMin,
      unpinnedListScrollHeight: unpinnedMetrics.scrollHeight,
      unpinnedListClientHeight: unpinnedMetrics.clientHeight,
      pinnedListScrollHeight: pinnedMetricsAfterShrink.scrollHeight,
      pinnedListClientHeight: pinnedMetricsAfterShrink.clientHeight,
    },
  });

  const reloadAtMinState = await reloadPinnedSectionState({
    page,
    callableName,
    testInfo,
  });
  callableSection = reloadAtMinState.callableSection;
  paramGroup = reloadAtMinState.paramGroup;
  unpinnedArea = reloadAtMinState.unpinnedArea;
  pinnedArea = reloadAtMinState.pinnedArea;
  pinnedList = reloadAtMinState.pinnedList;
  pinnedRows = reloadAtMinState.pinnedRows;
  unpinnedRows = reloadAtMinState.unpinnedRows;
  edgesStrip = reloadAtMinState.edgesStrip;
  edgesHeight = await getHeight(edgesStrip);
  await expectRowFullyVisibleWithinContainer(
    unpinnedArea,
    unpinnedRows.first(),
    "unpinned-min-reload",
  );
  await expectRowFullyVisibleWithinContainer(
    pinnedList,
    pinnedRows.first(),
    "pinned-min-reload",
  );

  // After expanding the callable section, pinned params should be able to grow
  // again if there is available space.
  const pinnedHeightAtMin = await getHeight(pinnedArea);
  await dragResize(page, callableSection, {
    handle: "bottom",
    dx: 0,
    dy: 200,
    outside: 6,
  });
  const layoutMetricsAfterExpand = await getPinnedLayoutMetrics(
    page,
    paramGroup,
    pinnedArea,
    unpinnedArea,
    edgesStrip,
  );
  const maxAfterExpand = getPinnedTargetMax(layoutMetricsAfterExpand);
  const canGrowAfterExpand = maxAfterExpand - pinnedHeightAtMin > 6;
  if (canGrowAfterExpand) {
    await dragPinnedResize(page, pinnedArea, 120);
    let pinnedHeightAfterExpandResize = await getHeight(pinnedArea);
    if (pinnedHeightAfterExpandResize <= pinnedHeightAtMin + 4) {
      await dragPinnedResize(page, pinnedArea, 200);
      pinnedHeightAfterExpandResize = await getHeight(pinnedArea);
    }
    if (pinnedHeightAfterExpandResize <= pinnedHeightAtMin + 4) {
      throw new Error(
        "Pinned params area did not grow after expanding the callable section.",
      );
    }
    expect(pinnedHeightAfterExpandResize).toBeLessThanOrEqual(
      maxAfterExpand + 2,
    );
  }

  // With few pinned params, the max height must still stop at the last pinned
  // row (no blank space before unpinned params).
  await dragResize(page, callableSection, {
    handle: "bottom",
    dx: 0,
    dy: 260,
    outside: 6,
  });
  await reducePinnedRowsToCount(page, pinnedRows, callableSection, 1);
  await dragPinnedResize(page, pinnedArea, 260);
  const reducedPinnedMaxResult = await waitForPinnedMax(
    page,
    paramGroup,
    pinnedArea,
    unpinnedArea,
    edgesStrip,
    5000,
  );
  if (
    reducedPinnedMaxResult.metrics.pinnedListScrollHeight <=
    reducedPinnedMaxResult.metrics.pinnedListClientHeight + 2
  ) {
    expect(reducedPinnedMaxResult.metrics.pinnedListTrailingGap).toBeLessThanOrEqual(
      4,
    );
  }

  await dragResize(page, callableSection, {
    handle: "bottomRight",
    dx: 200,
    dy: 200,
    outside: 6,
  });
  await dragResize(page, callableSection, {
    handle: "right",
    dx: 200,
    dy: 0,
    outside: 6,
  });

  const edgesHeightAfter = await getHeight(edgesStrip);
  expect(Math.abs(edgesHeightAfter - edgesHeight)).toBeLessThanOrEqual(2);
    const edgesMetrics = await getScrollMetrics(edgesStrip);
    expect(edgesMetrics.scrollHeight).toBeLessThanOrEqual(
      edgesMetrics.clientHeight + 2,
    );

    // Re-run the core resize sequence across multiple refreshes and after
    // moving/resizing the callable section, to catch stale or inert resize state.
    for (let cycle = 0; cycle < 2; cycle += 1) {
      await runPinnedResizeEdgeSequence({
        page,
        callableSection,
        paramGroup,
        pinnedArea,
        pinnedList,
        pinnedRows,
        unpinnedArea,
        edgesStrip,
        label: `cycle-${cycle + 1}`,
      });

      const refreshed = await reloadPinnedSectionState({
        page,
        callableName,
        testInfo,
      });
      callableSection = refreshed.callableSection;
      paramGroup = refreshed.paramGroup;
      unpinnedArea = refreshed.unpinnedArea;
      pinnedArea = refreshed.pinnedArea;
      pinnedList = refreshed.pinnedList;
      pinnedRows = refreshed.pinnedRows;
      unpinnedRows = refreshed.unpinnedRows;
      edgesStrip = refreshed.edgesStrip;
    }

    await moveSectionBy(page, callableSection, { dx: 80, dy: 40 });
    await runPinnedResizeEdgeSequence({
      page,
      callableSection,
      paramGroup,
      pinnedArea,
      pinnedList,
      pinnedRows,
      unpinnedArea,
      edgesStrip,
      label: "after-move",
    });

    const refreshedFinal = await reloadPinnedSectionState({
      page,
      callableName,
      testInfo,
    });
    callableSection = refreshedFinal.callableSection;
    paramGroup = refreshedFinal.paramGroup;
    unpinnedArea = refreshedFinal.unpinnedArea;
    pinnedArea = refreshedFinal.pinnedArea;
    pinnedList = refreshedFinal.pinnedList;
    pinnedRows = refreshedFinal.pinnedRows;
    unpinnedRows = refreshedFinal.unpinnedRows;
    edgesStrip = refreshedFinal.edgesStrip;

    await runPinnedResizeEdgeSequence({
      page,
      callableSection,
      paramGroup,
      pinnedArea,
      pinnedList,
      pinnedRows,
      unpinnedArea,
      edgesStrip,
      label: "after-final-refresh",
    });

    // Verify layout stability immediately after refresh (multiple samples)
    await verifyLayoutStabilityAfterReload({
      page,
      paramGroup,
      pinnedArea,
      pinnedList,
      unpinnedArea,
      edgesStrip,
    });

    // Run rapid consecutive resize cycles to test for race conditions
    await runRapidResizeCycles({
      page,
      pinnedArea,
      pinnedList,
      paramGroup,
      unpinnedArea,
      edgesStrip,
      cycles: 5,
    });

    const pinnedRowCountBeforeUnpin = await pinnedRows.count();
    if (pinnedRowCountBeforeUnpin > 0) {
      const unpinCount = Math.min(2, pinnedRowCountBeforeUnpin);
      const unpinIndices = Array.from({ length: unpinCount }, (_, index) => index);
      await selectArgRowsByIndex(page, pinnedRows, unpinIndices);
      const unpinButton = callableSection.getByRole("button", {
        name: "Unpin selected args",
      });
      if ((await unpinButton.count()) > 0) {
        await expect(unpinButton).toBeEnabled();
        const unpinnedRowCountBefore = await unpinnedRows.count();
        await unpinButton.click();
        await expect
          .poll(async () => pinnedRows.count())
          .toBeLessThan(pinnedRowCountBeforeUnpin);
        await expect
          .poll(async () => unpinnedRows.count())
          .toBeGreaterThanOrEqual(unpinnedRowCountBefore + 1);
      }
    }
  } finally {
    await restoreSettings(page, settingsSnapshot);
  }
});

test("dict section keeps unpinned params visible when shrinking", async ({
  page,
}) => {
  await ensureAppReady(page);

  const settingsSnapshot = await loadSettingsSnapshot(page);
  try {
    const didUpdateSettings = await ensureSizingPolicyDefaults(page);
    if (didUpdateSettings) {
      await page.reload();
      await page.waitForSelector(READY_SELECTOR);
    }

    const sections = page.locator('section[class*="card-section"]');
    await ensureProjectConfig(page, sections);

    const ensuredDict = await createDictSection(page);
    const dictSection = ensuredDict.dictSection;
    await focusSectionFromOverview(page, ensuredDict.dictName, dictSection);

    const paramGroup = dictSection.locator("div.section-row-pin-main").first();
    const unpinnedArea = paramGroup
      .locator(":scope > div.section-args-nested")
      .first();

    const editableRows = await ensureEditableArgRows(
      dictSection,
      unpinnedArea,
      6,
    );
    const rowSelector =
      ":scope > article.section-args-nested-key-value, :scope > article.section-lg-value";
    const unpinnedRows = unpinnedArea.locator(rowSelector);
    await expect
      .poll(async () => unpinnedRows.count())
      .toBeGreaterThanOrEqual(6);

    await selectArgRowsByIndex(page, unpinnedRows, [0, 1, 2]);
    const pinButton = dictSection.getByRole("button", {
      name: "Pin selected args",
    });
    await expect(pinButton).toBeEnabled();
    await pinButton.click();

    const pinnedArea = paramGroup.locator('section:has-text("Pinned Params")');
    await expect(pinnedArea).toBeVisible();
    const pinnedRows = pinnedArea
      .locator("div.section-args-nested")
      .locator(rowSelector);
    // Shrink immediately after pinning to catch cases where unpinned min height
    // hasn't been measured yet.
    const initialUnpinnedCount = await unpinnedRows.count();
    for (let i = 0; i < 6; i += 1) {
      await dragResize(page, dictSection, {
        handle: "bottom",
        dx: 0,
        dy: -120,
        outside: 6,
      });
      const intersectionMetrics = await getUnpinnedIntersectionMetrics(
        page,
        dictSection,
        unpinnedArea,
      );
      const rowHeight =
        intersectionMetrics.rowHeight > 0
          ? intersectionMetrics.rowHeight
          : await getMinParamRowHeight(unpinnedArea);
      expect(rowHeight).toBeGreaterThan(0);
      expect(intersectionMetrics.intersectionHeight).toBeGreaterThanOrEqual(
        rowHeight - 2,
      );
    }
    let unpinnedRowHeight = await getMinParamRowHeight(unpinnedArea);
    if (unpinnedRowHeight === 0) {
      unpinnedRowHeight = await getMinParamRowHeight(unpinnedArea);
    }
    const unpinnedMetrics = await getScrollMetrics(unpinnedArea);
    expect(unpinnedMetrics.clientHeight).toBeGreaterThanOrEqual(
      unpinnedRowHeight - 2,
    );
    await expect
      .poll(async () => unpinnedRows.count())
      .toBeGreaterThanOrEqual(initialUnpinnedCount);
  } finally {
    await restoreSettings(page, settingsSnapshot);
  }
});

test("dict pinned resize keeps unpinned height stable", async ({ page }) => {
  await ensureAppReady(page);

  const settingsSnapshot = await loadSettingsSnapshot(page);
  try {
    const didUpdateSettings = await ensureSizingPolicyDefaults(page);
    if (didUpdateSettings) {
      await page.reload();
      await page.waitForSelector(READY_SELECTOR);
    }

    const sections = page.locator('section[class*="card-section"]');
    await ensureProjectConfig(page, sections);

    const ensuredDict = await createDictSection(page);
    const dictSection = ensuredDict.dictSection;
    await focusSectionFromOverview(page, ensuredDict.dictName, dictSection);

    const paramGroup = dictSection.locator("div.section-row-pin-main").first();
    const unpinnedArea = paramGroup
      .locator(":scope > div.section-args-nested")
      .first();
    const rowSelector =
      ":scope > article.section-args-nested-key-value, :scope > article.section-lg-value";

    await ensureEditableArgRows(dictSection, unpinnedArea, 6);
    const unpinnedRows = unpinnedArea.locator(rowSelector);
    await expect
      .poll(async () => unpinnedRows.count())
      .toBeGreaterThanOrEqual(6);

    await selectArgRowsByIndex(page, unpinnedRows, [0, 1, 2]);
    const pinButton = dictSection.getByRole("button", {
      name: "Pin selected args",
    });
    await expect(pinButton).toBeEnabled();
    await pinButton.click();

    const pinnedArea = paramGroup.locator('section:has-text("Pinned Params")');
    await expect(pinnedArea).toBeVisible();
    const edgesStrip = paramGroup
      .locator(":scope > section.section-row-pin-main")
      .first();
    const pinnedList = pinnedArea.locator("div.section-args-nested");
    const pinnedRows = pinnedList.locator(rowSelector);
    await expect
      .poll(async () => pinnedRows.count())
      .toBeGreaterThanOrEqual(3);
    await expect
      .poll(async () => unpinnedRows.count())
      .toBeGreaterThanOrEqual(3);

    await expect
      .poll(async () => getMinParamRowHeight(pinnedList))
      .toBeGreaterThan(0);
    await expect
      .poll(async () => getMinParamRowHeight(unpinnedArea))
      .toBeGreaterThan(0);
    const pinnedRowHeight = await getMinParamRowHeight(pinnedList);
    const unpinnedRowHeight = await getMinParamRowHeight(unpinnedArea);

    await shrinkPinnedAreaToMin(page, pinnedArea);
    let pinnedMetrics = await getScrollMetrics(pinnedList);
    for (
      let i = 0;
      i < 4 && pinnedMetrics.clientHeight < pinnedRowHeight * 2 - 4;
      i += 1
    ) {
      await dragPinnedResize(page, pinnedArea, pinnedRowHeight + 12);
      pinnedMetrics = await getScrollMetrics(pinnedList);
    }
    expect(pinnedMetrics.clientHeight).toBeGreaterThanOrEqual(
      pinnedRowHeight * 2 - 4,
    );

    const sectionMinHeight = await getComputedMinHeight(dictSection);
    await setSectionHeight(page, ensuredDict.sectionId, sectionMinHeight);
    await expect
      .poll(async () => getHeight(dictSection))
      .toBeGreaterThanOrEqual(sectionMinHeight - 2);
    let unpinnedMetrics = await getScrollMetrics(unpinnedArea);
    const baselineUnpinnedHeight = unpinnedMetrics.clientHeight;
    expect(unpinnedMetrics.scrollHeight).toBeGreaterThanOrEqual(
      baselineUnpinnedHeight + unpinnedRowHeight - 2,
    );

    await shrinkPinnedAreaToMin(page, pinnedArea);
    pinnedMetrics = await getScrollMetrics(pinnedList);
    expect(pinnedMetrics.clientHeight).toBeLessThanOrEqual(
      pinnedRowHeight + 12,
    );

    unpinnedMetrics = await getScrollMetrics(unpinnedArea);
    expect(unpinnedMetrics.clientHeight).toBeLessThanOrEqual(
      baselineUnpinnedHeight + 2,
    );
    expect(unpinnedMetrics.clientHeight).toBeGreaterThanOrEqual(
      baselineUnpinnedHeight - 2,
    );
  } finally {
    await restoreSettings(page, settingsSnapshot);
  }
});

test("dict pinned/unpinned resize avoids update-depth loop", async ({ page }) => {
  test.setTimeout(180000);
  await ensureAppReady(page);

  const settingsSnapshot = await loadSettingsSnapshot(page);
  const depthErrors: Array<string> = [];
  const onConsole = (msg: ConsoleMessage) => {
    if (
      msg.type() === "error" &&
      msg.text().includes("Maximum update depth exceeded")
    ) {
      depthErrors.push(msg.text());
    }
  };
  const onPageError = (error: Error) => {
    if (error.message.includes("Maximum update depth exceeded")) {
      depthErrors.push(error.message);
    }
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  try {
    const didUpdateSettings = await ensureSizingPolicyDefaults(page);
    if (didUpdateSettings) {
      await page.reload();
      await page.waitForSelector(READY_SELECTOR);
    }

    const sections = page.locator('section[class*="card-section"]');
    await ensureProjectConfig(page, sections);

    const ensuredDict = await createDictSection(page);
    const dictSection = ensuredDict.dictSection;
    await focusSectionFromOverview(page, ensuredDict.dictName, dictSection);

    const paramGroup = dictSection.locator("div.section-row-pin-main").first();
    const unpinnedArea = paramGroup
      .locator(":scope > div.section-args-nested")
      .first();
    const rowSelector =
      ":scope > article.section-args-nested-key-value, :scope > article.section-lg-value";

    await ensureEditableArgRows(dictSection, unpinnedArea, 6);
    const unpinnedRows = unpinnedArea.locator(rowSelector);
    await expect
      .poll(async () => unpinnedRows.count())
      .toBeGreaterThanOrEqual(6);

    await selectArgRowsByIndex(page, unpinnedRows, [0, 1, 2]);
    const pinButton = dictSection.getByRole("button", {
      name: "Pin selected args",
    });
    await expect(pinButton).toBeEnabled();
    await pinButton.click();

    const pinnedArea = paramGroup.locator('section:has-text("Pinned Params")');
    await expect(pinnedArea).toBeVisible();
    const edgesStrip = paramGroup
      .locator(":scope > section.section-row-pin-main")
      .first();
    const pinnedList = pinnedArea.locator("div.section-args-nested");
    const pinnedRows = pinnedList.locator(rowSelector);
    await expect
      .poll(async () => pinnedRows.count())
      .toBeGreaterThanOrEqual(3);

    const pinnedRowHeight = await getMinParamRowHeight(pinnedList);
    const unpinnedRowHeight = await getMinParamRowHeight(unpinnedArea);
    expect(pinnedRowHeight).toBeGreaterThan(0);
    expect(unpinnedRowHeight).toBeGreaterThan(0);

    await shrinkPinnedAreaToMin(page, pinnedArea);
    let pinnedMetrics = await getScrollMetrics(pinnedList);
    for (
      let i = 0;
      i < 4 && pinnedMetrics.clientHeight < pinnedRowHeight * 2 - 4;
      i += 1
    ) {
      await dragPinnedResize(page, pinnedArea, pinnedRowHeight + 12);
      pinnedMetrics = await getScrollMetrics(pinnedList);
    }
    expect(pinnedMetrics.clientHeight).toBeGreaterThanOrEqual(
      pinnedRowHeight * 2 - 4,
    );

    const unpinnedTargetMetrics = await getPinnedLayoutMetrics(
      page,
      paramGroup,
      pinnedArea,
      unpinnedArea,
      edgesStrip,
    );
    const unpinnedMinTarget = Math.max(
      unpinnedTargetMetrics.unpinnedMinHeight,
      unpinnedRowHeight,
    );
    for (let i = 0; i < 8; i += 1) {
      await dragResize(page, dictSection, {
        handle: "bottom",
        dx: 0,
        dy: -140,
        outside: 6,
      });
      const unpinnedMetrics = await getScrollMetrics(unpinnedArea);
      if (unpinnedMetrics.clientHeight <= unpinnedMinTarget + 6) {
        break;
      }
    }
    await dragResize(page, dictSection, {
      handle: "bottom",
      dx: 0,
      dy: -180,
      outside: 6,
    });

    await shrinkPinnedAreaToMin(page, pinnedArea);
    await page.waitForTimeout(300);

    expect(depthErrors).toHaveLength(0);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    await restoreSettings(page, settingsSnapshot);
  }
});

test("dict unpinned area does not auto-expand after shrink", async ({ page }) => {
  test.setTimeout(240000);
  await ensureAppReady(page);

  const settingsSnapshot = await loadSettingsSnapshot(page);
  try {
    const didUpdateSettings = await ensureSizingPolicyDefaults(page);
    if (didUpdateSettings) {
      await page.reload();
      await page.waitForSelector(READY_SELECTOR);
    }

    const sections = page.locator('section[class*="card-section"]');
    await ensureProjectConfig(page, sections);

    const ensuredDict = await createDictSection(page);
    const dictSection = ensuredDict.dictSection;
    await focusSectionFromOverview(page, ensuredDict.dictName, dictSection);

    const paramGroup = dictSection.locator("div.section-row-pin-main").first();
    const edgesStrip = paramGroup
      .locator(":scope > section.section-row-pin-main")
      .first();
    const unpinnedArea = paramGroup
      .locator(":scope > div.section-args-nested")
      .first();
    const rowSelector =
      ":scope > article.section-args-nested-key-value, :scope > article.section-lg-value";

    await ensureEditableArgRows(dictSection, unpinnedArea, 6);
    const unpinnedRows = unpinnedArea.locator(rowSelector);
    await expect
      .poll(async () => unpinnedRows.count())
      .toBeGreaterThanOrEqual(6);

    await selectArgRowsByIndex(page, unpinnedRows, [0, 1, 2]);
    const pinButton = dictSection.getByRole("button", {
      name: "Pin selected args",
    });
    await expect(pinButton).toBeEnabled();
    await pinButton.click();

    const pinnedArea = paramGroup.locator('section:has-text("Pinned Params")');
    await expect(pinnedArea).toBeVisible();
    const pinnedList = pinnedArea.locator("div.section-args-nested");
    const pinnedRows = pinnedList.locator(rowSelector);
    await expect
      .poll(async () => pinnedRows.count())
      .toBeGreaterThanOrEqual(3);

    const pinnedRowHeight = await getMinParamRowHeight(pinnedList);
    const unpinnedRowHeight = await getMinParamRowHeight(unpinnedArea);
    expect(pinnedRowHeight).toBeGreaterThan(0);
    expect(unpinnedRowHeight).toBeGreaterThan(0);

    await shrinkPinnedAreaToMin(page, pinnedArea);
    let pinnedMetrics = await getScrollMetrics(pinnedList);
    for (
      let i = 0;
      i < 4 && pinnedMetrics.clientHeight < pinnedRowHeight * 2 - 4;
      i += 1
    ) {
      await dragPinnedResize(page, pinnedArea, pinnedRowHeight + 12);
      pinnedMetrics = await getScrollMetrics(pinnedList);
    }
    expect(pinnedMetrics.clientHeight).toBeGreaterThanOrEqual(
      pinnedRowHeight * 2 - 4,
    );

    const layoutMetrics = await getPinnedLayoutMetrics(
      page,
      paramGroup,
      pinnedArea,
      unpinnedArea,
      edgesStrip,
    );
    const unpinnedMinTarget = Math.max(
      layoutMetrics.unpinnedMinHeight,
      unpinnedRowHeight,
    );

    for (let i = 0; i < 10; i += 1) {
      await dragResize(page, dictSection, {
        handle: "bottom",
        dx: 0,
        dy: -140,
        outside: 6,
      });
      const unpinnedMetrics = await getScrollMetrics(unpinnedArea);
      if (unpinnedMetrics.clientHeight <= unpinnedMinTarget + 6) {
        break;
      }
    }

    const baselineUnpinned = await getScrollMetrics(unpinnedArea);
    expect(baselineUnpinned.clientHeight).toBeLessThanOrEqual(
      unpinnedMinTarget + 6,
    );

    let pinnedAfterShrink = await getScrollMetrics(pinnedList);
    for (
      let i = 0;
      i < 6 && pinnedAfterShrink.clientHeight > pinnedRowHeight + 4;
      i += 1
    ) {
      await dragPinnedResize(
        page,
        pinnedArea,
        -Math.max(pinnedRowHeight + 16, 48),
      );
      pinnedAfterShrink = await getScrollMetrics(pinnedList);
    }
    expect(pinnedAfterShrink.clientHeight).toBeLessThanOrEqual(
      pinnedRowHeight + 6,
    );

    await page.waitForTimeout(400);
    const afterUnpinned = await getScrollMetrics(unpinnedArea);
    expect(afterUnpinned.clientHeight).toBeLessThanOrEqual(
      baselineUnpinned.clientHeight + 2,
    );
  } finally {
    await restoreSettings(page, settingsSnapshot);
  }
});

async function ensureProjectConfig(
  page: Page,
  sections: Locator,
): Promise<void> {
  if ((await sections.count()) > 0) {
    return;
  }
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
}

async function ensureAppReady(page: Page): Promise<void> {
  await page.goto(PROJECT_URL, { waitUntil: "domcontentloaded" });
  if (await isAppReady(page)) {
    return;
  }

  const hasCookie = await hasAuthCookie(page);
  if (!hasCookie && BOOTSTRAP_TOKEN) {
    await page.goto(
      `${BACKEND_ORIGIN}/__setta__/bootstrap#token=${BOOTSTRAP_TOKEN}`,
    );
    try {
      await waitForProjectUrl(page);
    } catch {
      // Fall through to the final readiness check below.
    }
  }

  await page.goto(PROJECT_URL, { waitUntil: "domcontentloaded" });
  if (await isAppReady(page)) {
    return;
  }

  if (!BOOTSTRAP_TOKEN && !hasCookie) {
    throw new Error(
      "Missing SETTA_BOOTSTRAP_TOKEN and no auth cookie present. Open /__setta__/bootstrap to mint one.",
    );
  }
  throw new Error("Setta UI did not become ready. Check bootstrap auth.");
}

async function isAppReady(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector(READY_SELECTOR, { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

async function waitForProjectUrl(page: Page): Promise<void> {
  await page.waitForURL(
    (url) => url.toString().startsWith(PROJECT_URL),
    { timeout: 20000, waitUntil: "domcontentloaded" },
  );
}

async function hasAuthCookie(page: Page): Promise<boolean> {
  const cookies = await page
    .context()
    .cookies([PROJECT_URL, BACKEND_ORIGIN]);
  return cookies.some((cookie) => cookie.name === AUTH_COOKIE_NAME);
}
async function ensureCallableSectionWithMathSqrt(
  page: Page,
  sections: Locator,
): Promise<{ callableSection: Locator; callableName: string }> {
  const existing = await findCallableSectionWithCallable(
    page,
    sections,
    TARGET_CALLABLE,
    true,
  );
  if (existing) {
    return {
      callableSection: existing,
      callableName: await getSectionTitle(existing),
    };
  }

  const fallback = await findCallableSectionWithCallable(
    page,
    sections,
    TARGET_CALLABLE,
    false,
  );
  if (fallback) {
    await resetCallableSectionForTest(page, fallback);
    return {
      callableSection: fallback,
      callableName: await getSectionTitle(fallback),
    };
  }

  const projectConfigId = await getCurrentProjectConfigId(page);
  const created = await postBackend(page, "/createTopLevelSection", {
    projectConfigId,
    implType: "Callable",
  });
  const sectionId = created?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating callable section.");
  }

  const sectionName = await resolveUniqueSectionName(
    page,
    FALLBACK_CALLABLE_SECTION_NAME,
  );
  await postBackend(page, "/setSectionName", {
    projectConfigId,
    sectionId,
    name: sectionName,
  });
  await postBackendWithRetries(page, "/setCallable", {
    projectConfigId,
    sectionId,
    callableName: TARGET_CALLABLE,
    refetchParams: false,
  });

  const createdSection = findSectionCandidates(page, sectionName).first();
  await expect(createdSection).toBeVisible();
  await expect.poll(async () => {
    return getCallableSearchText(createdSection);
  }).toContain(TARGET_CALLABLE);
  return {
    callableSection: createdSection,
    callableName: sectionName,
  };
}

async function createDictSection(page: Page): Promise<{
  dictSection: Locator;
  dictName: string;
  sectionId: string;
}> {
  const projectConfigId = await getCurrentProjectConfigId(page);
  const created = await postBackend(page, "/createTopLevelSection", {
    projectConfigId,
    implType: "Dict",
  });
  const sectionId = created?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating dict section.");
  }

  const sectionName = await resolveUniqueSectionName(
    page,
    FALLBACK_DICT_SECTION_NAME,
  );
  await postBackend(page, "/setSectionName", {
    projectConfigId,
    sectionId,
    name: sectionName,
  });

  const createdSection = findSectionCandidates(page, sectionName).first();
  await expect(createdSection).toBeVisible();
  return {
    dictSection: createdSection,
    dictName: sectionName,
    sectionId,
  };
}

async function replaceEditable(
  page: Page,
  editable: Locator,
  value: string,
  commitEnter: boolean,
): Promise<void> {
  const contentEditable = editable.locator('[contenteditable="true"]').first();
  await editable.scrollIntoViewIfNeeded();
  await editable.click();
  if ((await contentEditable.count()) > 0) {
    await contentEditable.click();
  } else {
    await contentEditable.waitFor({ state: "visible" });
    await contentEditable.click();
  }
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await page.keyboard.type(value);
  if (commitEnter) {
    await page.keyboard.press("Enter");
  }
}

async function ensureImportMath(
  page: Page,
): Promise<void> {
  if (await hasImportMathInCodeAreas(page)) {
    return;
  }

  const codeSection = await findUserCodeSection(page);
  if (!codeSection) {
    return;
  }
  const codeArea = codeSection.locator("article.section-full-no-title").first();
  await expect(codeArea).toBeVisible();
  await codeArea.click();

  const text = await getSectionText(codeSection);
  if (/\bimport math\b/.test(text)) {
    return;
  }

  await page.keyboard.press(JUMP_TO_START_SHORTCUT);
  await page.keyboard.type("import math\n");
}

async function hasImportMathInCodeAreas(page: Page): Promise<boolean> {
  const codeAreas = page.locator("article.section-full-no-title");
  const count = await codeAreas.count();
  for (let i = 0; i < count; i += 1) {
    const text = await getSectionText(codeAreas.nth(i));
    if (/\bimport math\b/.test(text)) {
      return true;
    }
  }
  return false;
}

async function findUserCodeSection(page: Page): Promise<Locator | null> {
  const sections = page.locator('section[class*="card-section"]');
  const count = await sections.count();
  for (let i = 0; i < count; i += 1) {
    const section = sections.nth(i);
    const titleLocator = section.locator("header.section-title p").first();
    const title =
      (await titleLocator.count()) > 0
        ? (await titleLocator.innerText()).trim()
        : "";
    if (title === "Generated Python Code") {
      continue;
    }
    if ((await section.locator("article.section-full-no-title").count()) > 0) {
      return section;
    }
  }
  return null;
}

async function getCallableSearchText(section: Locator): Promise<string> {
  const search = section.locator("search.section-search").first();
  if ((await search.count()) === 0) {
    return "";
  }
  return (await search.textContent())?.trim() ?? "";
}

async function getSectionIdFromSection(section: Locator): Promise<string> {
  const handle = section.locator('[id$="-CustomResizable"]').first();
  if ((await handle.count()) === 0) {
    throw new Error("Section id handle not found.");
  }
  const id = await handle.getAttribute("id");
  if (!id) {
    throw new Error("Section id attribute missing.");
  }
  return id.replace(/-CustomResizable$/, "");
}

async function isCallableSectionClean(section: Locator): Promise<boolean> {
  const paramGroup = section.locator("div.section-row-pin-main").first();
  if ((await paramGroup.count()) === 0) {
    return false;
  }
  const pinnedArea = paramGroup.locator('section:has-text("Pinned Params")');
  if ((await pinnedArea.count()) > 0) {
    const pinnedList = pinnedArea.locator("div.section-args-nested").first();
    const pinnedRows = pinnedList.locator(
      ":scope > article.section-args-nested-key-value",
    );
    if ((await pinnedRows.count()) > 0) {
      return false;
    }
  }
  const edgesStrip = paramGroup.locator(":scope > section.section-row-pin-main");
  if ((await edgesStrip.count()) > 0) {
    const edgeRows = edgesStrip
      .locator("div.grid > div")
      .first()
      .locator("div.flex.flex-col.gap-1 > div");
    if ((await edgeRows.count()) > 0) {
      return false;
    }
  }
  return true;
}

async function resetCallableSectionForTest(
  page: Page,
  section: Locator,
): Promise<void> {
  const projectConfigId = await getCurrentProjectConfigId(page);
  const sectionId = await getSectionIdFromSection(section);
  await postBackend(page, "/setSectionPinnedParams", {
    projectConfigId,
    sectionId,
    pinnedParams: [],
  });
  await postBackend(page, "/setSectionEdgeInputs", {
    projectConfigId,
    sectionId,
    edgeInputParams: [],
  });
  await postBackend(page, "/setSectionEdgeOutputs", {
    projectConfigId,
    sectionId,
    edgeOutputPorts: [],
  });
  await postBackend(page, "/setSectionPinnedAreaHeight", {
    projectConfigId,
    sectionId,
    pinnedAreaHeight: "auto",
  });
  await postBackend(page, "/setSectionParamFilter", {
    projectConfigId,
    sectionId,
    value: "",
  });
  await expect.poll(async () => isCallableSectionClean(section)).toBe(true);
}

async function findCallableSectionWithCallable(
  page: Page,
  sections: Locator,
  callableName: string,
  requireClean = false,
): Promise<Locator | null> {
  const callableCandidates = sections.filter({
    has: page.getByRole("button", { name: "Add arg" }),
  });
  const count = await callableCandidates.count();
  for (let i = 0; i < count; i += 1) {
    const section = callableCandidates.nth(i);
    const callableText = await getCallableSearchText(section);
    if (callableText.includes(callableName)) {
      if (requireClean && !(await isCallableSectionClean(section))) {
        continue;
      }
      await expect(section).toBeVisible();
      return section;
    }
  }
  return null;
}

async function postBackend<T>(
  page: Page,
  path: string,
  payload: Record<string, unknown> | null,
): Promise<T | null> {
  const response = await page.request.post(`${BACKEND_ORIGIN}/api${path}`, {
    data: payload,
  });
  const text = await response.text();
  if (!response.ok()) {
    const detail = text ? ` ${text}` : "";
    throw new Error(
      `Backend request failed (${response.status()}): ${path}${detail}`,
    );
  }
  if (!text) {
    return null;
  }
  return JSON.parse(text) as T;
}

async function postBackendWithRetries<T>(
  page: Page,
  path: string,
  payload: Record<string, unknown> | null,
  attempts = 8,
  delayMs = 500,
): Promise<T | null> {
  let lastStatus = 0;
  let lastText = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await page.request.post(`${BACKEND_ORIGIN}/api${path}`, {
      data: payload,
    });
    lastStatus = response.status();
    lastText = await response.text();
    if (response.ok()) {
      if (!lastText) {
        return null;
      }
      return JSON.parse(lastText) as T;
    }
    if (attempt < attempts - 1) {
      await page.waitForTimeout(delayMs);
    }
  }
  const detail = lastText ? ` ${lastText}` : "";
  throw new Error(
    `Backend request failed (${lastStatus}): ${path}${detail}`,
  );
}

async function setSectionHeight(
  page: Page,
  sectionId: string,
  height: number,
): Promise<void> {
  const projectConfigId = await getCurrentProjectConfigId(page);
  await postBackend(page, "/setSectionSizes", {
    projectConfigId,
    sectionSizes: {
      [sectionId]: {
        height,
      },
    },
  });
}

async function ensureSizingPolicyDefaults(page: Page): Promise<boolean> {
  const settings = await postBackend<SettingsState>(
    page,
    "/loadSettings",
    null,
  );
  if (!settings) {
    throw new Error("Missing settings payload.");
  }

  let didUpdate = false;
  const callablePolicy = settings.sectionSizingPolicy.byType.Callable;
  if (callablePolicy.hideParamsMinHeight !== EXPECTED_CALLABLE_HIDE_PARAMS_MIN_HEIGHT) {
    callablePolicy.hideParamsMinHeight = EXPECTED_CALLABLE_HIDE_PARAMS_MIN_HEIGHT;
    didUpdate = true;
  }
  const globals = settings.sectionSizingPolicy.globals;
  if (
    globals.unpinnedParamsAreaMinHeight !==
    EXPECTED_UNPINNED_PARAMS_AREA_MIN_HEIGHT
  ) {
    globals.unpinnedParamsAreaMinHeight =
      EXPECTED_UNPINNED_PARAMS_AREA_MIN_HEIGHT;
    didUpdate = true;
  }

  if (didUpdate) {
    await postBackend(page, "/saveSettings", { settings });
  }

  return didUpdate;
}

async function loadSettingsSnapshot(page: Page): Promise<SettingsState> {
  const settings = await postBackend<SettingsState>(page, "/loadSettings", null);
  if (!settings) {
    throw new Error("Missing settings payload.");
  }
  return settings;
}

async function restoreSettings(
  page: Page,
  settings: SettingsState,
): Promise<void> {
  await postBackend(page, "/saveSettings", { settings });
}

type ReloadedPinnedSectionState = {
  callableSection: Locator;
  paramGroup: Locator;
  unpinnedArea: Locator;
  pinnedArea: Locator;
  pinnedList: Locator;
  pinnedRows: Locator;
  unpinnedRows: Locator;
  edgesStrip: Locator;
};

async function reloadPinnedSectionState({
  page,
  callableName,
  testInfo,
}: {
  page: Page;
  callableName: string;
  testInfo: TestInfo;
}): Promise<ReloadedPinnedSectionState> {
  const maxAttempts = 3;
  let lastReason = "unknown";
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await page.reload();
    await ensureAppReady(page);
    const sectionsAfterReload = page.locator('section[class*="card-section"]');
    await ensureProjectConfig(page, sectionsAfterReload);
    const namedCallableSection = findSectionCandidates(
      page,
      callableName,
    ).first();
    let callableSection: Locator;
    if ((await namedCallableSection.count()) > 0) {
      callableSection = namedCallableSection;
    } else {
      callableSection = await findCallableSection(page, sectionsAfterReload);
    }
    await focusSectionFromOverview(page, callableName, callableSection);
    await callableSection.locator("header.section-title").first().click({
      force: true,
    });

    const paramGroup = callableSection.locator("div.section-row-pin-main").first();
    const unpinnedArea = paramGroup
      .locator(":scope > div.section-args-nested")
      .first();
    const pinnedArea = paramGroup
      .locator('section:has-text("Pinned Params")')
      .first();
    const edgesStrip = paramGroup
      .locator(":scope > section.section-row-pin-main")
      .first();
    if ((await edgesStrip.count()) === 0) {
      lastReason = "edges strip missing";
      continue;
    }

    const pinnedList = pinnedArea.locator("div.section-args-nested");
    const pinnedRows = pinnedList.locator(
      ":scope > article.section-args-nested-key-value",
    );
    const unpinnedRows = unpinnedArea.locator(
      ":scope > article.section-args-nested-key-value",
    );
    const { pinnedCount, unpinnedCount } = await waitForPinnedRowCounts(
      page,
      pinnedRows,
      unpinnedRows,
    );
    if (pinnedCount === 0 || unpinnedCount === 0) {
      lastReason = "pinned/unpinned rows missing after reload";
      continue;
    }

    const readyResult = await waitForPinnedReloadReady({
      page,
      paramGroup,
      pinnedArea,
      unpinnedArea,
      edgesStrip,
      pinnedList,
      timeoutMs: 1800,
      pollIntervalMs: 150,
    });
    if (readyResult.isReady) {
      return {
        callableSection,
        paramGroup,
        unpinnedArea,
        pinnedArea,
        pinnedList,
        pinnedRows,
        unpinnedRows,
        edgesStrip,
      };
    }

    await attachLayoutSnapshot({
      testInfo,
      label: `pinned-reload-attempt-${attempt + 1}`,
      target: callableSection,
      metrics: {
        ...readyResult.metrics,
        pinnedRowHeight: readyResult.pinnedRowHeight,
        pinnedListClientHeight: readyResult.pinnedMetrics.clientHeight,
        pinnedListScrollHeight: readyResult.pinnedMetrics.scrollHeight,
        reloadAttempt: attempt + 1,
        reloadWaitMs: readyResult.elapsedMs,
        reloadPinnedReady: false,
      },
    });
    lastReason = "pinned area collapsed or not resizable after reload";
  }

  throw new Error(
    `Pinned params area did not stabilize after reload (${lastReason}).`,
  );
}

async function waitForPinnedReloadReady({
  page,
  paramGroup,
  pinnedArea,
  unpinnedArea,
  edgesStrip,
  pinnedList,
  timeoutMs,
  pollIntervalMs,
}: {
  page: Page;
  paramGroup: Locator;
  pinnedArea: Locator;
  unpinnedArea: Locator;
  edgesStrip: Locator;
  pinnedList: Locator;
  timeoutMs: number;
  pollIntervalMs: number;
}): Promise<{
  isReady: boolean;
  metrics: Record<string, number>;
  pinnedRowHeight: number;
  pinnedMetrics: ScrollMetrics;
  elapsedMs: number;
}> {
  const start = Date.now();
  const deadline = start + timeoutMs;
  let lastMetrics: Record<string, number> = {};
  let lastPinnedRowHeight = 0;
  let lastPinnedMetrics: ScrollMetrics = { clientHeight: 0, scrollHeight: 0 };

  while (Date.now() < deadline) {
    lastMetrics = await getPinnedLayoutMetrics(
      page,
      paramGroup,
      pinnedArea,
      unpinnedArea,
      edgesStrip,
    );
    lastPinnedRowHeight = await getMinParamRowHeight(pinnedList);
    lastPinnedMetrics = await getScrollMetrics(pinnedList);
    const resizeHandleCount = await pinnedArea
      .locator(".pinned-resize-handle")
      .count();
    const pinnedRowVisible =
      lastPinnedRowHeight > 0 &&
      lastPinnedMetrics.clientHeight >= lastPinnedRowHeight - 2;
    const pinnedHeightValid =
      lastMetrics.pinnedHeight >= lastMetrics.pinnedMinHeight - 2;
    if (resizeHandleCount > 0 && pinnedRowVisible && pinnedHeightValid) {
      return {
        isReady: true,
        metrics: lastMetrics,
        pinnedRowHeight: lastPinnedRowHeight,
        pinnedMetrics: lastPinnedMetrics,
        elapsedMs: Date.now() - start,
      };
    }
    await page.waitForTimeout(pollIntervalMs);
  }

  return {
    isReady: false,
    metrics: lastMetrics,
    pinnedRowHeight: lastPinnedRowHeight,
    pinnedMetrics: lastPinnedMetrics,
    elapsedMs: Date.now() - start,
  };
}

async function getCurrentProjectConfigId(page: Page): Promise<string> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }

  const currentPath = new URL(page.url()).pathname;
  const projectName = currentPath.split("/").filter(Boolean)[0];
  if (projectName) {
    const match = metadata.projectMetadata.find((p) => p.name === projectName);
    if (match?.id) {
      return match.id;
    }
  }

  if (metadata.defaultProjectConfigId) {
    return metadata.defaultProjectConfigId;
  }

  throw new Error("Unable to resolve projectConfigId for test.");
}

async function resolveUniqueSectionName(
  page: Page,
  baseName: string,
): Promise<string> {
  const existingTitles = new Set(await getSectionTitles(page));
  if (!existingTitles.has(baseName)) {
    return baseName;
  }
  for (let i = 1; i <= 5; i += 1) {
    const candidate = `${baseName}-${i}`;
    if (!existingTitles.has(candidate)) {
      return candidate;
    }
  }
  return `${baseName}-${Date.now()}`;
}

async function getSectionTitles(page: Page): Promise<string[]> {
  const titles = await page
    .locator('section[class*="card-section"] header.section-title p')
    .allTextContents();
  return titles.map((title) => title.trim()).filter((title) => title.length > 0);
}

function findSectionCandidates(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) });
}

async function findCallableSection(
  page: Page,
  sections: Locator,
): Promise<Locator> {
  const preferred = findSectionCandidates(page, FALLBACK_CALLABLE_SECTION_NAME);
  if ((await preferred.count()) > 0) {
    const first = preferred.first();
    await expect(first).toBeVisible();
    return first;
  }

  const callableCandidates = sections.filter({
    has: page.getByRole("button", { name: "Add arg" }),
  });
  if ((await callableCandidates.count()) > 0) {
    const first = callableCandidates.first();
    await expect(first).toBeVisible();
    return first;
  }

  throw new Error(
    `No callable section found. Create one or rename a callable to ${FALLBACK_CALLABLE_SECTION_NAME}.`,
  );
}

async function getSectionTitle(section: Locator): Promise<string> {
  const title = section.locator("header.section-title p").first();
  return title.innerText();
}

async function getSectionText(section: Locator): Promise<string> {
  const content = section.locator(".cm-content").first();
  if ((await content.count()) > 0) {
    return content.innerText();
  }
  return section.innerText();
}

async function focusSectionFromOverview(
  page: Page,
  name: string,
  fallbackSection?: Locator,
): Promise<void> {
  const overviewItem = page.getByRole("listitem", { name }).first();
  if ((await overviewItem.count()) > 0) {
    await overviewItem.click();
    return;
  }
  if (fallbackSection) {
    await fallbackSection.locator("header.section-title").first().click({
      force: true,
    });
    return;
  }
  throw new Error(`Overview item not found for ${name}.`);
}

function getEditableArgRows(container: Locator): Locator {
  return container.locator(
    'article.section-args-nested-key-value:has([class*="peer/nameinput"])',
  );
}

async function ensureEditableArgRows(
  section: Locator,
  container: Locator,
  count: number,
): Promise<Locator> {
  const rows = getEditableArgRows(container);
  const addButton = section.getByRole("button", { name: "Add arg" });
  let guard = 0;
  while ((await rows.count()) < count && guard < count + 4) {
    await addButton.click();
    guard += 1;
  }
  await expect.poll(async () => rows.count()).toBeGreaterThanOrEqual(count);
  return rows;
}

async function selectArgRowsByIndex(
  page: Page,
  rows: Locator,
  indices: number[],
): Promise<void> {
  await page.keyboard.down(MOD_KEY);
  await page.keyboard.down(PARAM_SELECT_KEY);
  for (const idx of indices) {
    const row = rows.nth(idx);
    await row.scrollIntoViewIfNeeded();
    await row.click({ force: true });
  }
  await page.keyboard.up(PARAM_SELECT_KEY);
  await page.keyboard.up(MOD_KEY);
}

async function reducePinnedRowsToCount(
  page: Page,
  pinnedRows: Locator,
  callableSection: Locator,
  targetCount: number,
): Promise<void> {
  const rowIds = await pinnedRows.evaluateAll((rows) =>
    rows.map((row) => row.id).filter(Boolean),
  );
  const paramIds = rowIds
    .map((rowId) => extractParamIdFromRowId(rowId))
    .filter((id): id is string => Boolean(id));
  if (paramIds.length <= targetCount) {
    return;
  }
  const projectConfigId = await getCurrentProjectConfigId(page);
  const sectionId = await getSectionIdFromSection(callableSection);
  await postBackend(page, "/setSectionPinnedParams", {
    projectConfigId,
    sectionId,
    pinnedParams: paramIds.slice(0, targetCount),
  });
  await expect
    .poll(async () => pinnedRows.count(), { timeout: 5000 })
    .toBe(targetCount);
}

type PinnedResizeSequenceArgs = {
  page: Page;
  callableSection: Locator;
  paramGroup: Locator;
  pinnedArea: Locator;
  pinnedList: Locator;
  pinnedRows: Locator;
  unpinnedArea: Locator;
  edgesStrip: Locator;
  label: string;
};

async function runPinnedResizeEdgeSequence({
  page,
  callableSection,
  paramGroup,
  pinnedArea,
  pinnedList,
  pinnedRows,
  unpinnedArea,
  edgesStrip,
  label,
}: PinnedResizeSequenceArgs): Promise<void> {
  const metricsStart = await getPinnedLayoutMetrics(
    page,
    paramGroup,
    pinnedArea,
    unpinnedArea,
    edgesStrip,
  );
  // After refreshes/resizes the pinned area should not collapse below its
  // minimum (1 pinned param fully visible) and should remain resizable.
  if (metricsStart.pinnedMinHeight > 0) {
    expect(metricsStart.pinnedHeight).toBeGreaterThanOrEqual(
      metricsStart.pinnedMinHeight - 2,
    );
    const pinnedStartScroll = await getScrollMetrics(pinnedList);
    expect(pinnedStartScroll.clientHeight).toBeGreaterThan(0);
  }
  const startHeight = await getHeight(pinnedArea);
  const targetMax = getPinnedTargetMax(metricsStart);
  const canGrow = targetMax - startHeight > 6;
  if (canGrow) {
    await dragPinnedResize(page, pinnedArea, 80);
    const afterGrow = await getHeight(pinnedArea);
    if (afterGrow <= startHeight + 4) {
      throw new Error(`Pinned params did not grow in ${label}.`);
    }
  }

  // When both the callable and pinned areas are at their minimums, dragging
  // the pinned handle should not collapse the pinned list or strand it
  // in an unresizable state.
  const pinnedAtMin = await shrinkPinnedAreaToMin(page, pinnedArea);
  await shrinkSectionToMinHeight(page, callableSection, "bottom", 6);
  const pinnedAfterSectionMin = await getHeight(pinnedArea);
  expect(pinnedAfterSectionMin).toBeGreaterThanOrEqual(pinnedAtMin - 2);
  await dragPinnedResize(page, pinnedArea, 80);
  const pinnedAfterMinResize = await getHeight(pinnedArea);
  expect(pinnedAfterMinResize).toBeLessThanOrEqual(pinnedAfterSectionMin + 2);
  expect(pinnedAfterMinResize).toBeGreaterThanOrEqual(
    pinnedAfterSectionMin - 2,
  );

  await dragResize(page, callableSection, {
    handle: "bottom",
    dx: 0,
    dy: 200,
    outside: 6,
  });
  const metricsAfterExpand = await getPinnedLayoutMetrics(
    page,
    paramGroup,
    pinnedArea,
    unpinnedArea,
    edgesStrip,
  );
  const maxAfterExpand = getPinnedTargetMax(metricsAfterExpand);
  const canGrowAfterExpand = maxAfterExpand - pinnedAfterSectionMin > 6;
  if (canGrowAfterExpand) {
    await dragPinnedResize(page, pinnedArea, 120);
    const afterExpandResize = await getHeight(pinnedArea);
    if (afterExpandResize <= pinnedAfterSectionMin + 4) {
      throw new Error(`Pinned params did not resize after expand in ${label}.`);
    }
  }

  await dragResize(page, callableSection, {
    handle: "right",
    dx: 120,
    dy: 0,
    outside: 6,
  });
  await dragResize(page, callableSection, {
    handle: "bottomRight",
    dx: 120,
    dy: 120,
    outside: 6,
  });

  const metricsEnd = await getPinnedLayoutMetrics(
    page,
    paramGroup,
    pinnedArea,
    unpinnedArea,
    edgesStrip,
  );
  if (
    metricsEnd.pinnedListScrollHeight <=
    metricsEnd.pinnedListClientHeight + 2
  ) {
    expect(metricsEnd.pinnedListTrailingGap).toBeLessThanOrEqual(4);
  }
}

async function moveSectionBy(
  page: Page,
  section: Locator,
  { dx, dy }: { dx: number; dy: number },
): Promise<void> {
  const header = section.locator("header.section-title").first();
  const target = (await header.count()) > 0 ? header : section;
  const box = await target.boundingBox();
  if (!box) {
    return;
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

async function selectArgRowsById(
  page: Page,
  rowIds: string[],
): Promise<void> {
  await page.keyboard.down(MOD_KEY);
  await page.keyboard.down(PARAM_SELECT_KEY);
  for (const rowId of rowIds) {
    const row = page.locator(`#${rowId}`);
    await row.scrollIntoViewIfNeeded();
    await row.click({ force: true });
  }
  await page.keyboard.up(PARAM_SELECT_KEY);
  await page.keyboard.up(MOD_KEY);
}

async function setRowNameByIndex(
  page: Page,
  rows: Locator,
  index: number,
  name: string,
  testInfo?: TestInfo,
): Promise<string> {
  const row = rows.nth(index);
  const rowId = await row.getAttribute("id");
  if (!rowId) {
    throw new Error(`Missing row id for ${name}`);
  }
  const nameInput = row.locator('[class*="peer/nameinput"]').first();
  await nameInput.scrollIntoViewIfNeeded();
  const rowInfo = await row.evaluate((el) => ({
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    className: el.getAttribute("class"),
    ariaDisabled: el.getAttribute("aria-disabled"),
    disabled: el.hasAttribute("disabled"),
    role: el.getAttribute("role"),
    outerHTML: el.outerHTML.slice(0, 400),
  }));
  await logLocatorDiagnostics(page, nameInput, `param-name-${name}`, {
    rowId,
    rowIndex: index,
    rowInfo,
  }, testInfo);
  // Drag-and-drop marks rows aria-disabled; force click to trigger CodeMirror.
  await nameInput.click({ force: true });
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await expect.poll(async () => {
    const text = await row.textContent();
    return text?.includes(name) ?? false;
  }).toBe(true);
  return rowId;
}

function extractParamIdFromRowId(rowId: string): string | null {
  const prefix = "ParamContainer-";
  if (!rowId.startsWith(prefix)) {
    return null;
  }
  const trimmed = rowId.slice(prefix.length);
  if (trimmed.length < 36) {
    return null;
  }
  return trimmed.slice(-36);
}

async function logLocatorDiagnostics(
  page: Page,
  locator: Locator,
  label: string,
  extra: Record<string, unknown>,
  testInfo?: TestInfo,
): Promise<void> {
  const [isVisible, isEnabled, boundingBox, elementInfo] = await Promise.all([
    locator.isVisible(),
    locator.isEnabled(),
    locator.boundingBox(),
    locator.evaluate((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const chain: Array<Record<string, unknown>> = [];
      let current: HTMLElement | null = el;
      for (let i = 0; i < 6 && current; i += 1) {
        const currentStyle = window.getComputedStyle(current);
        chain.push({
          tag: current.tagName.toLowerCase(),
          id: current.id || null,
          className: current.getAttribute("class"),
          role: current.getAttribute("role"),
          ariaDisabled: current.getAttribute("aria-disabled"),
          disabled: current.hasAttribute("disabled"),
          pointerEvents: currentStyle.pointerEvents,
          opacity: currentStyle.opacity,
        });
        current = current.parentElement;
      }
      const closestDisabled = el.closest('[disabled], [aria-disabled="true"]');
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: el.getAttribute("class"),
        role: el.getAttribute("role"),
        ariaDisabled: el.getAttribute("aria-disabled"),
        disabled: el.hasAttribute("disabled"),
        pointerEvents: style.pointerEvents,
        visibility: style.visibility,
        display: style.display,
        opacity: style.opacity,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        outerHTML: el.outerHTML.slice(0, 400),
        closestDisabled: closestDisabled
          ? {
              tag: closestDisabled.tagName.toLowerCase(),
              id: closestDisabled.id || null,
              className: closestDisabled.getAttribute("class"),
              role: closestDisabled.getAttribute("role"),
              ariaDisabled: closestDisabled.getAttribute("aria-disabled"),
              disabled: closestDisabled.hasAttribute("disabled"),
            }
          : null,
        ancestorChain: chain,
      };
    }),
  ]);

  const storageInfo = await page.evaluate(() => {
    const rawCookies = document.cookie.split(";").map((cookie) => cookie.trim());
    const cookieNames = rawCookies
      .map((cookie) => cookie.split("=")[0])
      .filter(Boolean);
    const shareSessionRaw =
      window.sessionStorage?.getItem("settaShareSession") ?? null;
    return {
      url: window.location.href,
      cookieNames,
      shareSessionStoragePresent: Boolean(shareSessionRaw),
      shareSessionStorageLength: shareSessionRaw ? shareSessionRaw.length : 0,
    };
  });

  const payload = {
    label,
    isVisible,
    isEnabled,
    boundingBox,
    elementInfo,
    storageInfo,
    ...extra,
  };
  const serialized = JSON.stringify(payload, null, 2);
  if (process.env.SETTA_E2E_DEBUG_LOG === "1") {
    console.log(`[e2e-debug] ${serialized}`);
  }

  if (testInfo) {
    await testInfo.attach(`e2e-debug-${label}.json`, {
      body: serialized,
      contentType: "application/json",
    });
    if (process.env.SETTA_E2E_DEBUG_SCREENSHOT === "1") {
      const pageShot = await page.screenshot({ fullPage: true });
      const elementShot = await locator.screenshot();
      await testInfo.attach(`e2e-debug-${label}-page.png`, {
        body: pageShot,
        contentType: "image/png",
      });
      await testInfo.attach(`e2e-debug-${label}-element.png`, {
        body: elementShot,
        contentType: "image/png",
      });
    }
  }
}

async function dragResize(
  page: Page,
  target: Locator,
  {
    handle,
    dx,
    dy,
    outside,
  }: { handle: DragHandle; dx: number; dy: number; outside: number },
): Promise<void> {
  const handleLocator = getResizeHandleLocator(target, handle);
  if ((await handleLocator.count()) > 0) {
    await handleLocator.scrollIntoViewIfNeeded();
    const handleBox = await handleLocator.boundingBox();
    if (handleBox) {
      const x = handleBox.x + handleBox.width / 2;
      const y = handleBox.y + handleBox.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y + dy);
      await page.mouse.up();
      return;
    }
  }
  const box = await getBox(target);
  const point = getHandlePoint(box, handle, outside);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + dx, point.y + dy);
  await page.mouse.up();
}

async function shrinkSectionToMinHeight(
  page: Page,
  target: Locator,
  handle: DragHandle,
  outside: number,
): Promise<void> {
  let lastHeight = await getHeight(target);
  for (let i = 0; i < 10; i += 1) {
    await dragResize(page, target, {
      handle,
      dx: 0,
      dy: -500,
      outside,
    });
    const nextHeight = await getHeight(target);
    if (Math.abs(nextHeight - lastHeight) <= 1) {
      return;
    }
    lastHeight = nextHeight;
  }
}

async function clickResizeHandle(
  page: Page,
  target: Locator,
  handle: DragHandle,
  outside: number,
): Promise<void> {
  const handleLocator = getResizeHandleLocator(target, handle);
  if ((await handleLocator.count()) > 0) {
    await handleLocator.scrollIntoViewIfNeeded();
    await handleLocator.click({ force: true });
    return;
  }
  const box = await getBox(target);
  const point = getHandlePoint(box, handle, outside);
  await page.mouse.click(point.x, point.y);
}

function getHandlePoint(
  box: Box,
  handle: DragHandle,
  outside: number,
): { x: number; y: number } {
  let x = box.x;
  let y = box.y;

  if (handle === "bottom") {
    x = box.x + box.width / 2;
    y = box.y + box.height + outside;
  }
  if (handle === "right") {
    x = box.x + box.width + outside;
    y = box.y + box.height / 2;
  }
  if (handle === "bottomRight") {
    x = box.x + box.width + outside;
    y = box.y + box.height + outside;
  }

  return { x, y };
}

function getResizeHandleLocator(target: Locator, handle: DragHandle): Locator {
  const handleClass =
    handle === "bottomRight"
      ? "section-resize-handle-bottom-right"
      : `section-resize-handle-${handle}`;
  return target.locator(`.${handleClass}`).first();
}

async function getBox(target: Locator): Promise<Box> {
  const box = await target.boundingBox();
  if (!box) {
    throw new Error("Expected target to be visible before measuring.");
  }
  return box;
}

async function getHeight(target: Locator): Promise<number> {
  return target.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const viewport =
      el.closest(".react-flow__viewport") ??
      document.querySelector(".react-flow__viewport");
    let scale = 1;
    if (viewport) {
      const transform = window.getComputedStyle(viewport).transform;
      if (transform && transform !== "none") {
        const matrix = new DOMMatrixReadOnly(transform);
        if (Number.isFinite(matrix.a) && matrix.a > 0) {
          scale = matrix.a;
        }
      }
    }
    return scale > 0 ? rect.height / scale : rect.height;
  });
}

async function getComputedMinHeight(target: Locator): Promise<number> {
  return target.evaluate((el) => {
    const viewport =
      el.closest(".react-flow__viewport") ??
      document.querySelector(".react-flow__viewport");
    let scale = 1;
    if (viewport) {
      const transform = window.getComputedStyle(viewport).transform;
      if (transform && transform !== "none") {
        const matrix = new DOMMatrixReadOnly(transform);
        if (Number.isFinite(matrix.a) && matrix.a > 0) {
          scale = matrix.a;
        }
      }
    }
    const minHeight =
      Number.parseFloat(window.getComputedStyle(el).minHeight) || 0;
    return scale > 0 ? minHeight / scale : minHeight;
  });
}

async function getMinParamRowHeight(target: Locator): Promise<number> {
  return target.evaluate((el) => {
    const rows = Array.from(
      el.querySelectorAll(":scope > article.section-args-nested-key-value"),
    );
    const candidates =
      rows.length > 0
        ? rows
        : Array.from(
            el.querySelectorAll(":scope > article.section-lg-value"),
          );
    let minHeight = Number.POSITIVE_INFINITY;
    for (const row of candidates) {
      const height = row instanceof HTMLElement ? row.offsetHeight : 0;
      if (height > 0 && height < minHeight) {
        minHeight = height;
      }
    }
    return Number.isFinite(minHeight) ? minHeight : 0;
  });
}

async function expectRowFullyVisibleWithinContainer(
  container: Locator,
  row: Locator,
  label: string,
): Promise<void> {
  const [containerBox, rowBox] = await Promise.all([
    container.boundingBox(),
    row.boundingBox(),
  ]);
  if (!containerBox || !rowBox) {
    throw new Error(`Unable to measure ${label} row visibility.`);
  }
  expect(rowBox.y).toBeGreaterThanOrEqual(containerBox.y - 1);
  expect(rowBox.y + rowBox.height).toBeLessThanOrEqual(
    containerBox.y + containerBox.height + 1,
  );
}

async function expectRowNotFullyVisibleWithinContainer(
  container: Locator,
  row: Locator,
  label: string,
): Promise<void> {
  const [containerBox, rowBox] = await Promise.all([
    container.boundingBox(),
    row.boundingBox(),
  ]);
  if (!containerBox || !rowBox) {
    throw new Error(`Unable to measure ${label} row visibility.`);
  }
  const containerTop = containerBox.y;
  const containerBottom = containerBox.y + containerBox.height;
  const rowTop = rowBox.y;
  const rowBottom = rowBox.y + rowBox.height;
  const isFullyVisible =
    rowTop >= containerTop - 1 && rowBottom <= containerBottom + 1;
  expect(isFullyVisible).toBe(false);
}

async function getScrollMetrics(target: Locator): Promise<ScrollMetrics> {
  return target.evaluate((el) => ({
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
  }));
}

async function getUnpinnedIntersectionMetrics(
  page: Page,
  section: Locator,
  unpinnedArea: Locator,
): Promise<{ intersectionHeight: number; rowHeight: number }> {
  return page.evaluate(
    ({ section, unpinnedArea }) => {
      if (!section || !unpinnedArea) {
        return { intersectionHeight: 0, rowHeight: 0 };
      }
      const sectionRect = section.getBoundingClientRect();
      const areaRect = unpinnedArea.getBoundingClientRect();
      const intersectionTop = Math.max(sectionRect.top, areaRect.top);
      const intersectionBottom = Math.min(sectionRect.bottom, areaRect.bottom);
      const intersectionHeight = Math.max(0, intersectionBottom - intersectionTop);
      const rows = Array.from(
        unpinnedArea.querySelectorAll(
          ":scope > article.section-args-nested-key-value, :scope > article.section-lg-value",
        ),
      );
      const rowHeight =
        rows.length > 0 && rows[0] instanceof HTMLElement
          ? rows[0].offsetHeight
          : 0;
      return { intersectionHeight, rowHeight };
    },
    {
      section: await section.elementHandle(),
      unpinnedArea: await unpinnedArea.elementHandle(),
    },
  );
}

async function waitForPinnedRowCounts(
  page: Page,
  pinnedRows: Locator,
  unpinnedRows: Locator,
  timeoutMs = 4000,
): Promise<{ pinnedCount: number; unpinnedCount: number }> {
  const deadline = Date.now() + timeoutMs;
  let pinnedCount = 0;
  let unpinnedCount = 0;
  while (Date.now() < deadline) {
    [pinnedCount, unpinnedCount] = await Promise.all([
      pinnedRows.count(),
      unpinnedRows.count(),
    ]);
    if (pinnedCount > 0 && unpinnedCount > 0) {
      break;
    }
    await page.waitForTimeout(200);
  }
  return { pinnedCount, unpinnedCount };
}

function getReservedUnpinnedHeight(metrics: PinnedLayoutMetrics): number {
  if (metrics.unpinnedRowCount <= 0) {
    return 0;
  }
  if (metrics.unpinnedMinHeight > 0) {
    return metrics.unpinnedMinHeight;
  }
  return metrics.unpinnedRowHeight + metrics.unpinnedPadding;
}

function getPinnedAvailableHeight(metrics: PinnedLayoutMetrics): number {
  const reservedUnpinnedHeight = getReservedUnpinnedHeight(metrics);
  return Math.max(
    metrics.paramGroupHeight -
      metrics.paramGroupPadding -
      metrics.kwargsControlsHeight -
      metrics.edgesHeight -
      reservedUnpinnedHeight,
    0,
  );
}

function getExpectedPinnedMax(metrics: PinnedLayoutMetrics): number {
  return metrics.pinnedContentHeight;
}

function getPinnedTargetMax(metrics: PinnedLayoutMetrics): number {
  if (metrics.pinnedMaxHeight > 0) {
    return metrics.pinnedMaxHeight;
  }
  return getExpectedPinnedMax(metrics);
}

async function getComputedMaxHeight(target: Locator): Promise<string> {
  return target.evaluate((el) => window.getComputedStyle(el).maxHeight);
}

function isMaxHeightUnbounded(maxHeight: string): boolean {
  return maxHeight === "none";
}

async function dragPinnedResize(
  page: Page,
  pinnedArea: Locator,
  dy: number,
): Promise<void> {
  const handle = pinnedArea.locator(".pinned-resize-handle").first();
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error("Pinned resize handle not visible.");
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: 5 });
  await page.mouse.up();
}

async function shrinkPinnedAreaToMin(
  page: Page,
  pinnedArea: Locator,
): Promise<number> {
  let lastHeight = await getHeight(pinnedArea);
  for (let i = 0; i < 8; i += 1) {
    await dragPinnedResize(page, pinnedArea, -200);
    const nextHeight = await getHeight(pinnedArea);
    if (Math.abs(nextHeight - lastHeight) <= 1) {
      return nextHeight;
    }
    lastHeight = nextHeight;
  }
  return lastHeight;
}

async function clickPinnedResizeHandle(
  page: Page,
  pinnedArea: Locator,
): Promise<void> {
  const handle = pinnedArea.locator(".pinned-resize-handle").first();
  await handle.click({ force: true });
}

async function getPinnedLayoutMetrics(
  page: Page,
  paramGroup: Locator,
  pinnedArea: Locator,
  unpinnedArea: Locator,
  edgesStrip: Locator,
): Promise<Record<string, number>> {
  return page.evaluate(
    ({ paramGroup, pinnedArea, unpinnedArea, edgesStrip }) => {
      const paramGroupHeight = paramGroup.clientHeight;
      const paramGroupStyle = window.getComputedStyle(paramGroup);
      const paramGroupPadding =
        (Number.parseFloat(paramGroupStyle.paddingTop) || 0) +
        (Number.parseFloat(paramGroupStyle.paddingBottom) || 0);
      const edgesStyle = window.getComputedStyle(edgesStrip);
      const edgesMarginHeight =
        (Number.parseFloat(edgesStyle.marginTop) || 0) +
        (Number.parseFloat(edgesStyle.marginBottom) || 0);
      const edgesHeight = edgesStrip.clientHeight + edgesMarginHeight;
      const pinnedHeight = pinnedArea.clientHeight;
      const unpinnedHeight = unpinnedArea.clientHeight;
      const pinnedList = pinnedArea.querySelector(
        "div.section-args-nested",
      ) as HTMLDivElement | null;
      const findMinRowHeight = (root: HTMLElement | null) => {
        if (!root) {
          return 0;
        }
        const rows = Array.from(
          root.querySelectorAll(
            ":scope > article.section-args-nested-key-value",
          ),
        );
        const candidates =
          rows.length > 0
            ? rows
            : Array.from(
                root.querySelectorAll(
                  ":scope > article.section-lg-value",
                ),
              );
        let minHeight = Number.POSITIVE_INFINITY;
        for (const row of candidates) {
          const height = row instanceof HTMLElement ? row.offsetHeight : 0;
          if (height > 0 && height < minHeight) {
            minHeight = height;
          }
        }
        return Number.isFinite(minHeight) ? minHeight : 0;
      };
      const unpinnedStyle = unpinnedArea
        ? window.getComputedStyle(unpinnedArea)
        : null;
      const unpinnedPadding = unpinnedStyle
        ? Number.parseFloat(unpinnedStyle.paddingTop) +
          Number.parseFloat(unpinnedStyle.paddingBottom)
        : 0;
      const unpinnedMinHeight = unpinnedStyle
        ? Number.parseFloat(unpinnedStyle.minHeight) || 0
        : 0;
      const unpinnedRowHeight = findMinRowHeight(unpinnedArea);
      const unpinnedRowCount = unpinnedArea
        ? unpinnedArea.querySelectorAll(
            ":scope > article.section-args-nested-key-value",
          ).length
        : 0;
      const sectionRoot = paramGroup.closest("section");
      const kwargsControls = sectionRoot
        ? (sectionRoot.querySelector("section.section-args") as
            | HTMLElement
            | null)
        : null;
      const kwargsStyle = kwargsControls
        ? window.getComputedStyle(kwargsControls)
        : null;
      const kwargsMarginHeight = kwargsStyle
        ? Number.parseFloat(kwargsStyle.marginTop) +
          Number.parseFloat(kwargsStyle.marginBottom)
        : 0;
      const kwargsControlsHeight = kwargsControls
        ? kwargsControls.offsetHeight + kwargsMarginHeight
        : 0;
      const pinnedHeader = pinnedArea.querySelector("header") as HTMLElement | null;
      const pinnedWrapper = pinnedArea.querySelector(
        "div.flex.flex-1",
      ) as HTMLElement | null;
      const pinnedWrapperStyle = pinnedWrapper
        ? window.getComputedStyle(pinnedWrapper)
        : null;
      const pinnedPadding = pinnedWrapperStyle
        ? Number.parseFloat(pinnedWrapperStyle.paddingTop) +
          Number.parseFloat(pinnedWrapperStyle.paddingBottom)
        : 0;
      const pinnedHeaderHeight = pinnedHeader?.offsetHeight ?? 0;
      const pinnedStyle = window.getComputedStyle(pinnedArea);
      const pinnedBorderHeight =
        (Number.parseFloat(pinnedStyle.borderTopWidth) || 0) +
        (Number.parseFloat(pinnedStyle.borderBottomWidth) || 0);
      const pinnedMinHeight = Number.parseFloat(pinnedStyle.minHeight) || 0;
      const pinnedMaxHeight = Number.parseFloat(pinnedStyle.maxHeight) || 0;
      const pinnedListScrollHeight = pinnedList?.scrollHeight ?? 0;
      const pinnedListClientHeight = pinnedList?.clientHeight ?? 0;
      const pinnedRows = pinnedList
        ? Array.from(
            pinnedList.querySelectorAll(
              "article.section-args-nested-key-value",
            ),
          )
        : [];
      const fallbackRows =
        pinnedRows.length > 0
          ? pinnedRows
          : pinnedList
          ? Array.from(pinnedList.querySelectorAll("article.section-lg-value"))
          : [];
      let pinnedListLastRowBottom = 0;
      if (pinnedList && fallbackRows.length > 0) {
        const listRect = pinnedList.getBoundingClientRect();
        const listScrollTop = pinnedList.scrollTop;
        for (const row of fallbackRows) {
          const rowRect = row.getBoundingClientRect();
          const top = rowRect.top - listRect.top + listScrollTop;
          const bottom = top + rowRect.height;
          if (bottom > pinnedListLastRowBottom) {
            pinnedListLastRowBottom = bottom;
          }
        }
      }
      const pinnedListTrailingGap = pinnedList
        ? pinnedListClientHeight - pinnedListLastRowBottom
        : 0;
      const pinnedListContentHeight =
        pinnedListLastRowBottom > 0
          ? pinnedListLastRowBottom
          : pinnedListScrollHeight;
      const pinnedContentHeight =
        pinnedListContentHeight +
        pinnedHeaderHeight +
        pinnedPadding +
        pinnedBorderHeight;
      const edgesInputCount = edgesStrip.querySelectorAll(
        "div.grid > div:first-child div.flex.flex-col.gap-1 > div",
      ).length;
      const edgesOutputCount = edgesStrip.querySelectorAll(
        "div.grid > div:last-child div.flex.flex-col.gap-1 > div",
      ).length;
      return {
        paramGroupHeight,
        paramGroupPadding,
        edgesHeight,
        pinnedHeight,
        unpinnedHeight,
        unpinnedRowHeight,
        unpinnedPadding,
        unpinnedMinHeight,
        unpinnedRowCount,
        pinnedHeaderHeight,
        pinnedPadding,
        pinnedBorderHeight,
        pinnedMinHeight,
        pinnedMaxHeight,
        pinnedListScrollHeight,
        pinnedListClientHeight,
        pinnedListLastRowBottom,
        pinnedListTrailingGap,
        pinnedListContentHeight,
        pinnedContentHeight,
        edgesInputCount,
        edgesOutputCount,
        kwargsControlsHeight,
      };
    },
    {
      paramGroup: await paramGroup.elementHandle(),
      pinnedArea: await pinnedArea.elementHandle(),
      unpinnedArea: await unpinnedArea.elementHandle(),
      edgesStrip: await edgesStrip.elementHandle(),
    },
  );
}

type LayoutSnapshotMetrics = Record<string, number | boolean>;
type PinnedLayoutMetrics = Awaited<ReturnType<typeof getPinnedLayoutMetrics>>;
type PinnedMaxResult = { metrics: PinnedLayoutMetrics; didReach: boolean };

async function attachLayoutSnapshot({
  testInfo,
  label,
  target,
  metrics,
}: {
  testInfo: TestInfo;
  label: string;
  target: Locator;
  metrics: LayoutSnapshotMetrics;
}): Promise<void> {
  if (process.env.SETTA_CAPTURE_LAYOUT === "0") {
    return;
  }
  await target.scrollIntoViewIfNeeded();
  const image = await target.screenshot();
  const imagePath = testInfo.outputPath(`${label}.png`);
  const metricsPath = testInfo.outputPath(`${label}.json`);
  const metricsBody = JSON.stringify(metrics, null, 2);
  await writeFile(imagePath, image);
  await writeFile(metricsPath, metricsBody);
  await testInfo.attach(`${label}.png`, {
    body: image,
    contentType: "image/png",
  });
  await testInfo.attach(`${label}.json`, {
    body: metricsBody,
    contentType: "application/json",
  });
}

async function waitForPinnedMax(
  page: Page,
  paramGroup: Locator,
  pinnedArea: Locator,
  unpinnedArea: Locator,
  edgesStrip: Locator,
  timeoutMs = 10000,
): Promise<PinnedMaxResult> {
  const pollIntervalMs = 200;
  const deadline = Date.now() + timeoutMs;
  let lastMetrics: Record<string, number> | null = null;
  let didReach = false;
  while (Date.now() < deadline) {
    const metrics = await getPinnedLayoutMetrics(
      page,
      paramGroup,
      pinnedArea,
      unpinnedArea,
      edgesStrip,
    );
    lastMetrics = metrics;
    const targetMax = getPinnedTargetMax(metrics);
    if (Math.abs(metrics.pinnedHeight - targetMax) <= 2) {
      didReach = true;
      break;
    }
    await page.waitForTimeout(pollIntervalMs);
  }
  if (!lastMetrics) {
    throw new Error("Pinned metrics unavailable.");
  }
  return { metrics: lastMetrics, didReach };
}

/**
 * Performs rapid consecutive resize cycles (up/down) to test for race conditions
 * and visual glitches during rapid resizing.
 */
async function runRapidResizeCycles({
  page,
  pinnedArea,
  pinnedList,
  paramGroup,
  unpinnedArea,
  edgesStrip,
  cycles = 5,
}: {
  page: Page;
  pinnedArea: Locator;
  pinnedList: Locator;
  paramGroup: Locator;
  unpinnedArea: Locator;
  edgesStrip: Locator;
  cycles?: number;
}): Promise<void> {
  const initialMetrics = await getPinnedLayoutMetrics(
    page,
    paramGroup,
    pinnedArea,
    unpinnedArea,
    edgesStrip,
  );
  const targetMax = getPinnedTargetMax(initialMetrics);

  for (let i = 0; i < cycles; i += 1) {
    // Resize up
    await dragPinnedResize(page, pinnedArea, 60);
    // Resize down
    await dragPinnedResize(page, pinnedArea, -60);
  }

  // After rapid cycles, verify constraints still hold
  const finalMetrics = await getPinnedLayoutMetrics(
    page,
    paramGroup,
    pinnedArea,
    unpinnedArea,
    edgesStrip,
  );

  // Pinned height should be within valid range
  expect(finalMetrics.pinnedHeight).toBeGreaterThanOrEqual(
    finalMetrics.pinnedMinHeight - 2,
  );
  if (finalMetrics.pinnedMaxHeight > 0) {
    expect(finalMetrics.pinnedHeight).toBeLessThanOrEqual(
      finalMetrics.pinnedMaxHeight + 2,
    );
  }

  // Unpinned area should still have valid minHeight CSS applied
  const unpinnedMinHeight = await getComputedMinHeight(unpinnedArea);
  if (finalMetrics.unpinnedRowCount > 0) {
    expect(unpinnedMinHeight).toBeGreaterThan(0);
  }

  // No blank space below last pinned row when not scrolling
  const pinnedScroll = await getScrollMetrics(pinnedList);
  if (pinnedScroll.scrollHeight <= pinnedScroll.clientHeight + 2) {
    expect(finalMetrics.pinnedListTrailingGap).toBeLessThanOrEqual(4);
  }
}

/**
 * Verifies layout stability immediately after page reload by taking
 * multiple measurement samples.
 */
async function verifyLayoutStabilityAfterReload({
  page,
  paramGroup,
  pinnedArea,
  pinnedList,
  unpinnedArea,
  edgesStrip,
  samples = 3,
  delayMs = 100,
}: {
  page: Page;
  paramGroup: Locator;
  pinnedArea: Locator;
  pinnedList: Locator;
  unpinnedArea: Locator;
  edgesStrip: Locator;
  samples?: number;
  delayMs?: number;
}): Promise<void> {
  const measurements: PinnedLayoutMetrics[] = [];

  for (let i = 0; i < samples; i += 1) {
    const metrics = await getPinnedLayoutMetrics(
      page,
      paramGroup,
      pinnedArea,
      unpinnedArea,
      edgesStrip,
    );
    measurements.push(metrics);
    if (i < samples - 1) {
      await page.waitForTimeout(delayMs);
    }
  }

  // All measurements should be consistent (no flickering)
  const first = measurements[0];
  for (let i = 1; i < measurements.length; i += 1) {
    const current = measurements[i];
    expect(Math.abs(current.pinnedHeight - first.pinnedHeight)).toBeLessThanOrEqual(2);
    expect(Math.abs(current.unpinnedMinHeight - first.unpinnedMinHeight)).toBeLessThanOrEqual(2);
  }

  // Verify CSS minHeight is actually applied to unpinned area
  if (first.unpinnedRowCount > 0) {
    const cssMinHeight = await getComputedMinHeight(unpinnedArea);
    expect(cssMinHeight).toBeGreaterThan(0);
    expect(Math.abs(cssMinHeight - first.unpinnedMinHeight)).toBeLessThanOrEqual(2);
  }

  // Pinned area should not be collapsed
  expect(first.pinnedHeight).toBeGreaterThanOrEqual(first.pinnedMinHeight - 2);

  // Pinned list should have visible content
  const pinnedScroll = await getScrollMetrics(pinnedList);
  expect(pinnedScroll.clientHeight).toBeGreaterThan(0);
}
