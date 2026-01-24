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
const EXPECTED_CALLABLE_HIDE_PARAMS_MIN_HEIGHT = 32;
const EXPECTED_UNPINNED_PARAMS_AREA_MIN_HEIGHT = 38;
const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);

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
    await setRowNameByIndex(page, editableRows, 0, "a"),
    await setRowNameByIndex(page, editableRows, 1, "b"),
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
  const expectedUnpinnedMin =
    initialLayoutMetrics.unpinnedRowHeight + initialLayoutMetrics.unpinnedPadding;
  expect(initialLayoutMetrics.pinnedMinHeight).toBeGreaterThanOrEqual(
    expectedPinnedMin - 2,
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
  const availableHeight = Math.max(
    layoutMetrics.paramGroupHeight -
      layoutMetrics.paramGroupPadding -
      layoutMetrics.edgesHeight -
      (layoutMetrics.unpinnedRowHeight + layoutMetrics.unpinnedPadding),
    0,
  );
  const shouldScrollAtMax =
    layoutMetrics.pinnedContentHeight > availableHeight + 1;
  if (shouldScrollAtMax) {
    expect(pinnedMetricsAtMax.scrollHeight).toBeGreaterThan(
      pinnedMetricsAtMax.clientHeight,
    );
  } else {
    expect(pinnedMetricsAtMax.scrollHeight).toBeLessThanOrEqual(
      pinnedMetricsAtMax.clientHeight + 2,
    );
  }
  expect(unpinnedMetricsAtMax.clientHeight).toBeGreaterThanOrEqual(
    unpinnedMinExpected - 2,
  );

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
  const availableHeightAfterManual = Math.max(
    layoutMetricsAfterManual.paramGroupHeight -
      layoutMetricsAfterManual.paramGroupPadding -
      layoutMetricsAfterManual.edgesHeight -
      (layoutMetricsAfterManual.unpinnedRowHeight +
        layoutMetricsAfterManual.unpinnedPadding),
    0,
  );
  const expectedPinnedMaxAfterManual = Math.min(
    availableHeightAfterManual,
    layoutMetricsAfterManual.pinnedContentHeight,
  );
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

  await page.reload();
  await ensureAppReady(page);
  const sectionsAfterReload = page.locator('section[class*="card-section"]');
  await ensureProjectConfig(page, sectionsAfterReload);
  const namedCallableSection = findSectionCandidates(
    page,
    callableName,
  ).first();
  if ((await namedCallableSection.count()) > 0) {
    callableSection = namedCallableSection;
  } else {
    callableSection = await findCallableSection(page, sectionsAfterReload);
  }
  await focusSectionFromOverview(page, callableName, callableSection);
  await callableSection.locator("header.section-title").first().click({
    force: true,
  });
  paramGroup = callableSection.locator("div.section-row-pin-main").first();
  unpinnedArea = paramGroup.locator(":scope > div.section-args-nested").first();
  pinnedArea = paramGroup.locator('section:has-text("Pinned Params")');
  pinnedList = pinnedArea.locator("div.section-args-nested");
  pinnedRows = pinnedList.locator(
    ":scope > article.section-args-nested-key-value",
  );
  unpinnedRows = unpinnedArea.locator(
    ":scope > article.section-args-nested-key-value",
  );
  edgesStrip = paramGroup.locator(":scope > section.section-row-pin-main").first();
  await expect(edgesStrip).toBeVisible();
  await expect.poll(async () => pinnedRows.count()).toBeGreaterThan(0);
  await expect.poll(async () => unpinnedRows.count()).toBeGreaterThan(0);
  edgesHeight = await getHeight(edgesStrip);

  const pinnedHeightAfterReload = await getHeight(pinnedArea);
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
  const sectionHeightAfterReloadResize = await getHeight(callableSection);
  expect(sectionHeightAfterReloadResize).toBeGreaterThan(
    sectionHeightBeforeReloadResize + 20,
  );
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
  const availableHeightAfterReload = Math.max(
    layoutMetricsAfterReload.paramGroupHeight -
      layoutMetricsAfterReload.paramGroupPadding -
      layoutMetricsAfterReload.edgesHeight -
      (layoutMetricsAfterReload.unpinnedRowHeight +
        layoutMetricsAfterReload.unpinnedPadding),
    0,
  );
  const expectedPinnedMaxAfterReload = Math.min(
    availableHeightAfterReload,
    layoutMetricsAfterReload.pinnedContentHeight,
  );
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
  expect(unpinnedMetrics.clientHeight).toBeLessThanOrEqual(
    unpinnedMinExpectedAtMin + 4,
  );
  expect(unpinnedMetrics.clientHeight).toBeGreaterThanOrEqual(
    unpinnedMinExpectedAtMin - 2,
  );
  expect(layoutMetricsAtMin.pinnedHeight).toBeGreaterThanOrEqual(
    pinnedMinExpectedAtMin - 2,
  );
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
  if ((await unpinnedRows.count()) > 1) {
    await expectRowNotFullyVisibleWithinContainer(
      unpinnedArea,
      unpinnedRows.nth(1),
      "unpinned-secondary",
    );
  }
  if ((await pinnedRows.count()) > 1) {
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
  await page.goto(PROJECT_URL);
  if (await isAppReady(page)) {
    return;
  }
  if (!BOOTSTRAP_TOKEN) {
    throw new Error(
      "Missing SETTA_BOOTSTRAP_TOKEN. Open /__setta__/bootstrap to mint one.",
    );
  }
  await page.goto(`${BACKEND_ORIGIN}/__setta__/bootstrap#token=${BOOTSTRAP_TOKEN}`);
  await page.goto(PROJECT_URL);
  await page.waitForSelector(".react-flow__pane");
}

async function isAppReady(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector(".react-flow__pane", { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
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
): Promise<string> {
  const row = rows.nth(index);
  const rowId = await row.getAttribute("id");
  if (!rowId) {
    throw new Error(`Missing row id for ${name}`);
  }
  const nameInput = row.locator('[class*="peer/nameinput"]').first();
  await nameInput.scrollIntoViewIfNeeded();
  await nameInput.click();
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await expect.poll(async () => {
    const text = await row.textContent();
    return text?.includes(name) ?? false;
  }).toBe(true);
  return rowId;
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
  const box = await getBox(target);
  return box.height;
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
      const pinnedContentHeight =
        pinnedListScrollHeight +
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
        pinnedHeaderHeight,
        pinnedPadding,
        pinnedBorderHeight,
        pinnedMinHeight,
        pinnedMaxHeight,
        pinnedListScrollHeight,
        pinnedListClientHeight,
        pinnedContentHeight,
        edgesInputCount,
        edgesOutputCount,
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
type PinnedMaxResult = { metrics: Record<string, number>; didReach: boolean };

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
): Promise<PinnedMaxResult> {
  const timeoutMs = 10000;
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
    const availableHeight = Math.max(
      metrics.paramGroupHeight -
        metrics.paramGroupPadding -
        metrics.edgesHeight -
        (metrics.unpinnedRowHeight + metrics.unpinnedPadding),
      0,
    );
    const expectedPinnedMax = Math.min(
      availableHeight,
      metrics.pinnedContentHeight,
    );
    if (Math.abs(metrics.pinnedHeight - expectedPinnedMax) <= 2) {
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
