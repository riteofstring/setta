import { expect, test, type Locator, type Page } from "@playwright/test";

const MOD_KEY = process.platform === "darwin" ? "Meta" : "Control";
const SELECT_ALL_SHORTCUT = MOD_KEY === "Meta" ? "Meta+A" : "Control+A";
const JUMP_TO_START_SHORTCUT =
  MOD_KEY === "Meta" ? "Meta+ArrowUp" : "Control+Home";
const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";

type DragHandle = "bottom" | "right" | "bottomRight";
type Box = { x: number; y: number; width: number; height: number };
type ScrollMetrics = { clientHeight: number; scrollHeight: number };

test("pinned params resize behavior", async ({ page }) => {
  await page.goto("/");
  await ensureAppReady(page);

  const sections = page.locator('section[class*="card-section"]');
  await ensureProjectConfig(page, sections);

  const callableSection = await findCallableSection(
    page,
    sections,
  );
  const callableName = await getSectionTitle(callableSection);
  await replaceEditable(
    page,
    callableSection.locator("search.section-search").first(),
    "math.sqrt",
    true,
  );
  await ensureImportMath(page);

  await focusSectionFromOverview(page, callableName);
  const paramGroup = callableSection.locator("div.section-row-pin-main").first();
  const unpinnedArea = paramGroup
    .locator(":scope > div.section-args-nested")
    .first();
  const editableRows = await ensureEditableArgRows(
    callableSection,
    unpinnedArea,
    6,
  );
  let unpinnedRows = unpinnedArea.locator(
    "article.section-args-nested-key-value",
  );
  const edgeRowIds = [
    await setRowNameByIndex(page, editableRows, 0, "a"),
    await setRowNameByIndex(page, editableRows, 1, "b"),
  ];
  await selectArgRowsById(page, edgeRowIds);
  await callableSection
    .getByRole("button", { name: "Convert to edge connectors" })
    .click();

  const edgesStrip = paramGroup
    .locator(":scope > section.section-row-pin-main")
    .first();
  await expect(edgesStrip).toBeVisible();
  const edgesInputRows = edgesStrip
    .locator("div.grid > div")
    .first()
    .locator("div.flex.flex-col.gap-1 > div");
  await expect.poll(async () => edgesInputRows.count()).toBeGreaterThan(0);

  unpinnedRows = unpinnedArea.locator("article.section-args-nested-key-value");
  let unpinnedRowCount = await unpinnedRows.count();
  if (unpinnedRowCount < 2) {
    await ensureEditableArgRows(callableSection, unpinnedArea, 2);
    unpinnedRowCount = await unpinnedRows.count();
  }
  if (unpinnedRowCount < 2) {
    throw new Error("Need at least two unpinned rows to pin.");
  }
  const pinCount = Math.min(3, Math.max(1, unpinnedRowCount - 1));
  const pinIndices = Array.from({ length: pinCount }, (_, index) => index);
  await selectArgRowsByIndex(page, unpinnedRows, pinIndices);
  await callableSection
    .getByRole("button", { name: "Pin selected args" })
    .click();

  const pinnedArea = paramGroup.locator('section:has-text("Pinned Params")');
  await expect(pinnedArea).toBeVisible();

  const pinnedRows = pinnedArea.locator(
    "article.section-args-nested-key-value",
  );
  unpinnedRows = unpinnedArea.locator(
    "article.section-args-nested-key-value",
  );
  await expect
    .poll(async () => pinnedRows.count())
    .toBeGreaterThanOrEqual(pinCount);
  await expect
    .poll(async () => unpinnedRows.count())
    .toBeGreaterThanOrEqual(1);

  const edgesHeight = await getHeight(edgesStrip);
  const pinnedRowHeight = await getOffsetHeight(pinnedRows.first());
  const unpinnedRowHeight = await getOffsetHeight(unpinnedRows.first());
  const pinnedList = pinnedArea.locator("div.section-args-nested");

  await dragResize(page, callableSection, {
    handle: "bottom",
    dx: 0,
    dy: 500,
    outside: 6,
  });
  await dragPinnedResize(page, pinnedArea, 500);
  const layoutMetrics = await waitForPinnedMax(
    page,
    paramGroup,
    pinnedArea,
    unpinnedArea,
    edgesStrip,
  );
  const pinnedMetricsAtMax = await getScrollMetrics(pinnedList);
  const availableHeight = Math.max(
    layoutMetrics.paramGroupHeight -
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

  await dragPinnedResize(page, pinnedArea, 80);
  const pinnedHeightAfterManualResize = await getHeight(pinnedArea);
  if (pinnedHeightAfterManualResize <= pinnedHeightManual + 4) {
    const layoutMetricsAfterManual = await getPinnedLayoutMetrics(
      page,
      paramGroup,
      pinnedArea,
      unpinnedArea,
      edgesStrip,
    );
    const availableHeightAfterManual = Math.max(
      layoutMetricsAfterManual.paramGroupHeight -
        layoutMetricsAfterManual.edgesHeight -
        (layoutMetricsAfterManual.unpinnedRowHeight +
          layoutMetricsAfterManual.unpinnedPadding),
      0,
    );
    const expectedPinnedMaxAfterManual = Math.min(
      availableHeightAfterManual,
      layoutMetricsAfterManual.pinnedContentHeight,
    );
    expect(
      Math.abs(pinnedHeightAfterManualResize - expectedPinnedMaxAfterManual),
    ).toBeLessThanOrEqual(2);
  } else {
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

  await dragResize(page, callableSection, {
    handle: "bottom",
    dx: 0,
    dy: -400,
    outside: 6,
  });
  const unpinnedMetrics = await getScrollMetrics(unpinnedArea);
  expect(unpinnedMetrics.clientHeight).toBeGreaterThanOrEqual(
    unpinnedRowHeight - 2,
  );
  const pinnedMetricsAfterShrink = await getScrollMetrics(pinnedList);
  expect(pinnedMetricsAfterShrink.clientHeight).toBeGreaterThanOrEqual(
    pinnedRowHeight - 2,
  );

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
  const currentUrl = page.url();
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "New Config" }).click();
  await expect.poll(() => page.url()).not.toBe(currentUrl);
  await page.waitForSelector(".react-flow__pane");
  await expect.poll(async () => sections.count()).toBeGreaterThan(0);
}

async function ensureAppReady(page: Page): Promise<void> {
  if (await isAppReady(page)) {
    return;
  }
  if (!BOOTSTRAP_TOKEN) {
    throw new Error(
      "Missing SETTA_BOOTSTRAP_TOKEN. Open /__setta__/bootstrap to mint one.",
    );
  }
  await page.goto(`${BACKEND_ORIGIN}/__setta__/bootstrap#token=${BOOTSTRAP_TOKEN}`);
  await page.goto("/");
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
  const generatedSection = findSectionCandidates(
    page,
    "Generated Python Code",
  ).first();
  if ((await generatedSection.count()) > 0) {
    const generatedText = await getSectionText(generatedSection);
    if (/\bimport math\b/.test(generatedText)) {
      return;
    }
  }

  const codeSection = findSectionCandidates(page, "__pw_code__").first();
  if ((await codeSection.count()) === 0) {
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

function findSectionCandidates(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) });
}

async function findCallableSection(
  page: Page,
  sections: Locator,
): Promise<Locator> {
  const preferred = findSectionCandidates(page, "__pw_callable__");
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
    "No callable section found. Create one or rename a callable to __pw_callable__.",
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
): Promise<void> {
  const overviewItem = page.getByRole("listitem", { name }).first();
  if ((await overviewItem.count()) > 0) {
    await overviewItem.click();
  }
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
  for (const idx of indices) {
    const row = rows.nth(idx);
    await row.scrollIntoViewIfNeeded();
    await row.click({ force: true });
  }
  await page.keyboard.up(MOD_KEY);
}

async function selectArgRowsById(
  page: Page,
  rowIds: string[],
): Promise<void> {
  await page.keyboard.down(MOD_KEY);
  for (const rowId of rowIds) {
    const row = page.locator(`#${rowId}`);
    await row.scrollIntoViewIfNeeded();
    await row.click({ force: true });
  }
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
  const box = await getBox(target);
  const point = getHandlePoint(box, handle, outside);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + dx, point.y + dy);
  await page.mouse.up();
}

async function clickResizeHandle(
  page: Page,
  target: Locator,
  handle: DragHandle,
  outside: number,
): Promise<void> {
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

async function getOffsetHeight(target: Locator): Promise<number> {
  return target.evaluate((el) => el.offsetHeight);
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
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error("Pinned resize handle not visible.");
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy);
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
      const edgesHeight = edgesStrip.clientHeight;
      const pinnedHeight = pinnedArea.clientHeight;
      const unpinnedHeight = unpinnedArea.clientHeight;
      const pinnedList = pinnedArea.querySelector(
        "div.section-args-nested",
      ) as HTMLDivElement | null;
      const unpinnedRow = unpinnedArea.querySelector(
        "article.section-args-nested-key-value, article.section-lg-value",
      ) as HTMLElement | null;
      const unpinnedStyle = unpinnedArea
        ? window.getComputedStyle(unpinnedArea)
        : null;
      const unpinnedPadding = unpinnedStyle
        ? Number.parseFloat(unpinnedStyle.paddingTop) +
          Number.parseFloat(unpinnedStyle.paddingBottom)
        : 0;
      const unpinnedRowHeight = unpinnedRow?.offsetHeight ?? 0;
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
      const pinnedListScrollHeight = pinnedList?.scrollHeight ?? 0;
      const pinnedListClientHeight = pinnedList?.clientHeight ?? 0;
      const pinnedContentHeight =
        pinnedListScrollHeight + pinnedHeaderHeight + pinnedPadding;
      const edgesInputCount = edgesStrip.querySelectorAll(
        "div.grid > div:first-child div.flex.flex-col.gap-1 > div",
      ).length;
      const edgesOutputCount = edgesStrip.querySelectorAll(
        "div.grid > div:last-child div.flex.flex-col.gap-1 > div",
      ).length;
      return {
        paramGroupHeight,
        edgesHeight,
        pinnedHeight,
        unpinnedHeight,
        unpinnedRowHeight,
        unpinnedPadding,
        pinnedHeaderHeight,
        pinnedPadding,
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

async function waitForPinnedMax(
  page: Page,
  paramGroup: Locator,
  pinnedArea: Locator,
  unpinnedArea: Locator,
  edgesStrip: Locator,
): Promise<Record<string, number>> {
  let lastMetrics: Record<string, number> | null = null;
  await expect
    .poll(async () => {
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
          metrics.edgesHeight -
          (metrics.unpinnedRowHeight + metrics.unpinnedPadding),
        0,
      );
      const expectedPinnedMax = Math.min(
        availableHeight,
        metrics.pinnedContentHeight,
      );
      return Math.abs(metrics.pinnedHeight - expectedPinnedMax);
    })
    .toBeLessThanOrEqual(2);
  if (!lastMetrics) {
    throw new Error("Pinned metrics unavailable.");
  }
  return lastMetrics;
}
