import { expect, test, type Locator, type Page } from "@playwright/test";

const MOD_KEY = process.platform === "darwin" ? "Meta" : "Control";
const COMMAND_PALETTE_SHORTCUT =
  MOD_KEY === "Meta" ? "Meta+Shift+P" : "Control+Shift+P";
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

  const codeSection = await ensureSection(
    page,
    sections,
    "Python Code",
    "__pw_code__",
  );
  await ensureImportMath(page, codeSection);

  const callableSection = await ensureSection(
    page,
    sections,
    "Callable",
    "__pw_callable__",
  );
  await replaceEditable(
    page,
    callableSection.locator("search.section-search").first(),
    "math.sqrt",
    true,
  );

  const argRowIds = await ensureArgKeys(page, callableSection, [
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
  ]);

  const paramGroup = callableSection.locator("div.section-row-pin-main").first();
  const unpinnedArea = paramGroup
    .locator(":scope > div.section-args-nested")
    .first();
  await selectArgRowsById(page, argRowIds, ["a", "b"]);
  await callableSection
    .getByRole("button", { name: "Convert to edge connectors" })
    .click();

  const edgesStrip = paramGroup
    .locator(":scope > section.section-row-pin-main")
    .first();
  await expect(edgesStrip).toBeVisible();
  await expect(edgesStrip).toContainText("a");
  await expect(edgesStrip).toContainText("b");

  await selectArgRowsById(page, argRowIds, ["c", "d", "e"]);
  await callableSection
    .getByRole("button", { name: "Pin selected args" })
    .click();

  const pinnedArea = paramGroup.locator('section:has-text("Pinned Params")');
  await expect(pinnedArea).toBeVisible();

  await expect(getRowById(pinnedArea, argRowIds.c)).toBeVisible();
  await expect(getRowById(pinnedArea, argRowIds.d)).toBeVisible();
  await expect(getRowById(pinnedArea, argRowIds.e)).toBeVisible();

  const unpinnedRows = unpinnedArea.locator(
    "article.section-args-nested-key-value",
  );
  await expect(getRowById(unpinnedArea, argRowIds.f)).toBeVisible();
  await expect(getRowById(unpinnedArea, argRowIds.g)).toBeVisible();
  await expect(getRowById(unpinnedArea, argRowIds.h)).toBeVisible();

  const edgesHeight = await getHeight(edgesStrip);

  const pinnedHeightBefore = await getHeight(pinnedArea);
  await clickResizeHandle(page, pinnedArea, "bottom", 0);
  const pinnedHeightAfter = await getHeight(pinnedArea);
  expect(Math.abs(pinnedHeightAfter - pinnedHeightBefore)).toBeLessThanOrEqual(2);

  await dragResize(page, pinnedArea, {
    handle: "bottom",
    dx: 0,
    dy: 200,
    outside: 0,
  });
  const pinnedList = pinnedArea.locator("div.section-args-nested");
  const pinnedMetrics = await getScrollMetrics(pinnedList);
  expect(pinnedMetrics.clientHeight - pinnedMetrics.scrollHeight).toBeLessThanOrEqual(
    2,
  );

  await dragResize(page, callableSection, {
    handle: "bottom",
    dx: 0,
    dy: -200,
    outside: 6,
  });
  const unpinnedRowHeight = await getHeight(unpinnedRows.first());
  const unpinnedHeight = await getHeight(unpinnedArea);
  expect(unpinnedHeight).toBeGreaterThanOrEqual(unpinnedRowHeight - 2);

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
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "New Config" }).click();
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

async function createSection(
  page: Page,
  sections: Locator,
  name: string,
  customName: string,
): Promise<Locator> {
  const titlesBefore = await sections
    .locator("header.section-title p")
    .allInnerTexts();
  const count = await sections.count();
  const searchInput = await openCommandPalette(page);
  await searchInput.fill(name);
  await page.keyboard.press("Enter");
  await expect(sections).toHaveCount(count + 1);
  await fitView(page);
  const titlesAfter = await sections
    .locator("header.section-title p")
    .allInnerTexts();
  const nextTitle =
    titlesAfter.find((title) => !titlesBefore.includes(title)) ??
    titlesAfter[titlesAfter.length - 1];
  const newSection = findSectionByName(page, nextTitle);
  await newSection.scrollIntoViewIfNeeded();
  await renameSection(page, newSection, customName);
  const renamedSection = findSectionByName(page, customName);
  await expect(renamedSection).toBeVisible();
  return renamedSection;
}

async function openCommandPalette(page: Page): Promise<Locator> {
  await page.keyboard.press(COMMAND_PALETTE_SHORTCUT);
  const searchInput = page.locator("#ProjectPageSearchBar");
  await searchInput.waitFor();
  await searchInput.focus();
  await searchInput.fill("");
  return searchInput;
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
  codeSection: Locator,
): Promise<void> {
  const codeArea = codeSection.locator("article.section-full-no-title").first();
  await codeArea.scrollIntoViewIfNeeded();
  await codeArea.click();

  const content = codeSection.locator(".cm-content").first();
  await content.waitFor();
  const text = await content.innerText();
  if (/\bimport math\b/.test(text)) {
    return;
  }

  await page.keyboard.press(JUMP_TO_START_SHORTCUT);
  await page.keyboard.type("import math\n");
}

async function renameSection(
  page: Page,
  section: Locator,
  name: string,
): Promise<void> {
  const title = section.locator("header.section-title p").first();
  await title.click({ clickCount: 2 });
  const input = page.locator("header.section-title input").first();
  await input.waitFor();
  await input.fill(name);
  await input.press("Enter");
}

async function fitView(page: Page): Promise<void> {
  await page.getByRole("button", { name: "fit view" }).click();
}

async function ensureSection(
  page: Page,
  sections: Locator,
  name: string,
  customName: string,
): Promise<Locator> {
  const existing = findSectionCandidates(page, customName);
  if ((await existing.count()) > 0) {
    const first = existing.first();
    await first.scrollIntoViewIfNeeded();
    return first;
  }
  return createSection(page, sections, name, customName);
}

function findSectionByName(page: Page, name: string): Locator {
  return findSectionCandidates(page, name).first();
}

function findSectionCandidates(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) });
}

function getEmptyArgRows(section: Locator): Locator {
  return section.locator(
    'article.section-args-nested-key-value:has-text("Please Enter Key")',
  );
}

async function ensureArgKeys(
  page: Page,
  section: Locator,
  keys: string[],
): Promise<Record<string, string>> {
  let rowIds = await getRowIdsByKeys(section, keys);
  const missingKeys = keys.filter((key) => !rowIds[key]);
  if (missingKeys.length === 0) {
    return rowIds;
  }

  const emptyRows = getEmptyArgRows(section);
  const addButton = section.getByRole("button", { name: "Add arg" });
  let guard = 0;
  while (
    (await emptyRows.count()) < missingKeys.length &&
    guard < missingKeys.length + 3
  ) {
    await addButton.click();
    guard += 1;
  }
  await expect.poll(async () => emptyRows.count()).toBeGreaterThanOrEqual(
    missingKeys.length,
  );
  const usedRowIds = new Set<string>();
  for (const key of missingKeys) {
    const emptyCount = await emptyRows.count();
    let rowId = "";
    let row: Locator | null = null;
    for (let i = 0; i < emptyCount; i += 1) {
      const candidate = emptyRows.nth(i);
      const candidateId = await candidate.getAttribute("id");
      if (candidateId && !usedRowIds.has(candidateId)) {
        row = candidate;
        rowId = candidateId;
        usedRowIds.add(candidateId);
        break;
      }
    }
    if (!row || !rowId) {
      throw new Error(`Unable to find empty row for key ${key}`);
    }
    const nameInput = row.locator('[class*="peer/nameinput"]').first();
    await nameInput.scrollIntoViewIfNeeded();
    await nameInput.click();
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.type(key);
    await page.keyboard.press("Enter");
    const updatedRow = section.locator(`#${rowId}`);
    await expect(updatedRow).toContainText(key);
    await expect.poll(async () => {
      const latest = await getRowIdsByKeys(section, [key]);
      return Boolean(latest[key]);
    }).toBe(true);
    rowIds[key] = rowId;
  }
  rowIds = await getRowIdsByKeys(section, keys);
  return rowIds;
}

function getRowById(section: Locator, id: string): Locator {
  return section.locator(`#${id}`);
}

async function getRowIdsByKeys(
  section: Locator,
  keys: string[],
): Promise<Record<string, string>> {
  return section.evaluate((el, wantedKeys) => {
    const wanted = new Set(wantedKeys);
    const rows = Array.from(
      el.querySelectorAll("article.section-args-nested-key-value"),
    );
    const result: Record<string, string> = {};
    for (const row of rows) {
      const keyEl = row.querySelector('[class*="peer/nameinput"]');
      const rawText = keyEl?.textContent ?? "";
      const keyText = rawText.replace(/\s+/g, " ").trim();
      if (!wanted.has(keyText)) {
        continue;
      }
      const id = row.getAttribute("id");
      if (id) {
        result[keyText] = id;
      }
    }
    return result;
  }, keys);
}

async function selectArgRowsById(
  page: Page,
  rowIds: Record<string, string>,
  keys: string[],
): Promise<void> {
  await page.keyboard.down(MOD_KEY);
  await page.keyboard.down("Shift");
  for (const key of keys) {
    const row = page.locator(`#${rowIds[key]}`);
    await row.scrollIntoViewIfNeeded();
    await row.click();
  }
  await page.keyboard.up("Shift");
  await page.keyboard.up(MOD_KEY);
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

async function getScrollMetrics(target: Locator): Promise<ScrollMetrics> {
  return target.evaluate((el) => ({
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
  }));
}
