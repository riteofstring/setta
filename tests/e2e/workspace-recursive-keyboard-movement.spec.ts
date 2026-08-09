import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

type KeyboardDirection = "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp";

async function loadRecursiveFixture(page: Page): Promise<Locator> {
  await page.goto("/?canvas-shell");
  await page.getByRole("button", { name: "Load recursive fixture" }).click();
  await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
  const workspace = page.getByRole("region", {
    exact: true,
    name: "Canvas shell workspace",
  });
  await expect(workspace.getByRole("article", { name: "Recursive workspace" })).toBeVisible();
  await page.getByRole("button", { name: "Fit recursive descendants" }).click();
  return workspace;
}

async function requiredBoundingBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`${label} must expose browser geometry.`);
  }
  return box;
}

async function nextAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function moveKeyboardTowardPreview({
  page,
  preview,
  source,
  target,
}: Readonly<{
  page: Page;
  preview: Locator;
  source: Locator;
  target: Readonly<{ x: number; y: number }>;
}>): Promise<void> {
  const sourceBox = await requiredBoundingBox(source, "The keyboard move source");
  const position = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  };
  for (let step = 0; step < 32; step += 1) {
    if ((await preview.count()) > 0) {
      return;
    }
    const horizontalDistance = target.x - position.x;
    const verticalDistance = target.y - position.y;
    let direction: KeyboardDirection;
    if (Math.abs(horizontalDistance) > Math.abs(verticalDistance)) {
      direction = horizontalDistance < 0 ? "ArrowLeft" : "ArrowRight";
      position.x += horizontalDistance < 0 ? -72 : 72;
    } else {
      direction = verticalDistance < 0 ? "ArrowUp" : "ArrowDown";
      position.y += verticalDistance < 0 ? -72 : 72;
    }
    await page.keyboard.press(direction);
    await nextAnimationFrame(page);
  }
  throw new Error("Keyboard movement did not reach the expected structural preview in 32 steps.");
}

async function recursiveChangeCount(page: Page): Promise<number> {
  return Number(await page.getByTestId("canvas-shell-change-count").textContent());
}

async function recursiveDocument(page: Page): Promise<{
  sections: Readonly<
    Record<string, { childLayout: { sectionIds: readonly string[] } | null; id: string }>
  >;
}> {
  const value = await page.getByTestId("canvas-shell-document").inputValue();
  return JSON.parse(value) as Awaited<ReturnType<typeof recursiveDocument>>;
}

test("keyboard sorting follows vertical and logical horizontal order", async ({ page }) => {
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  let workspace = await loadRecursiveFixture(page);
  let nestedAlpha = workspace.getByRole("article", { name: "Nested Alpha" });
  let nestedRow = workspace.getByRole("article", { name: "Nested row" });
  let handle = nestedAlpha.getByRole("button", { name: "Move Nested Alpha" });
  let targetBox = await requiredBoundingBox(nestedRow, "The vertical keyboard sort target");
  let preview = workspace.locator(
    '[data-workspace-section-move-destination-parent="recursive-root"]' +
      '[data-workspace-section-move-destination-index="1"]',
  );
  const baselineChanges = await recursiveChangeCount(page);

  await handle.focus();
  await page.keyboard.press("Enter");
  await moveKeyboardTowardPreview({
    page,
    preview,
    source: nestedAlpha,
    target: { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height * 0.75 },
  });
  await expect(workspace.locator("[data-workspace-section-move-preview-announcement]")).toHaveText(
    "Preview: Nested Alpha will move to Recursive workspace, position 2 of 3.",
  );
  await page.keyboard.press("Enter");
  await expect(handle).toBeFocused();
  await expect(workspace.locator("[data-workspace-structure-movement-announcement]")).toHaveText(
    "Nested Alpha moved to Recursive workspace, position 2 of 3.",
  );
  let document = await recursiveDocument(page);
  expect(document.sections["recursive-root"]?.childLayout?.sectionIds).toEqual([
    "nested-row",
    "nested-alpha",
    "empty-container",
  ]);
  expect(await recursiveChangeCount(page)).toBe(baselineChanges + 1);

  workspace = await loadRecursiveFixture(page);
  let nestedBeta = workspace.getByRole("article", { name: "Nested Beta" });
  let deepContainer = workspace.getByRole("article", { name: "Deep container" });
  handle = nestedBeta.getByRole("button", { name: "Move Nested Beta" });
  targetBox = await requiredBoundingBox(deepContainer, "The LTR keyboard sort target");
  preview = workspace.locator(
    '[data-workspace-section-move-destination-parent="nested-row"]' +
      '[data-workspace-section-move-destination-index="1"]',
  );
  await handle.focus();
  await page.keyboard.press("Enter");
  await moveKeyboardTowardPreview({
    page,
    preview,
    source: nestedBeta,
    target: { x: targetBox.x + targetBox.width * 0.75, y: targetBox.y + targetBox.height / 2 },
  });
  await page.keyboard.press("Enter");
  await expect(handle).toBeFocused();
  document = await recursiveDocument(page);
  expect(document.sections["nested-row"]?.childLayout?.sectionIds).toEqual([
    "deep-container",
    "nested-beta",
  ]);

  workspace = await loadRecursiveFixture(page);
  await workspace.evaluate((element) => element.setAttribute("dir", "rtl"));
  nestedBeta = workspace.getByRole("article", { name: "Nested Beta" });
  deepContainer = workspace.getByRole("article", { name: "Deep container" });
  handle = nestedBeta.getByRole("button", { name: "Move Nested Beta" });
  targetBox = await requiredBoundingBox(deepContainer, "The RTL keyboard sort target");
  preview = workspace.locator(
    '[data-workspace-section-move-destination-parent="nested-row"]' +
      '[data-workspace-section-move-destination-index="1"]',
  );
  await handle.focus();
  await page.keyboard.press("Enter");
  await moveKeyboardTowardPreview({
    page,
    preview,
    source: nestedBeta,
    target: { x: targetBox.x + targetBox.width * 0.25, y: targetBox.y + targetBox.height / 2 },
  });
  await page.keyboard.press("Enter");
  await expect(handle).toBeFocused();
  document = await recursiveDocument(page);
  expect(document.sections["nested-row"]?.childLayout?.sectionIds).toEqual([
    "deep-container",
    "nested-beta",
  ]);
});

test("keyboard free-move promotes the deep container target above its ancestor", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  const workspace = await loadRecursiveFixture(page);
  await page.getByRole("combobox", { name: "Section movement" }).selectOption("free");
  const nestedBeta = workspace.getByRole("article", { name: "Nested Beta" });
  const deepContainer = workspace.getByRole("article", { name: "Deep container" });
  const handle = nestedBeta.getByRole("button", { name: "Move Nested Beta" });

  await nestedBeta.getByRole("button", { name: "Select Nested Beta" }).click();
  await deepContainer
    .getByRole("button", { name: "Select Deep container" })
    .click({ modifiers: ["Shift"] });
  await handle.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");

  await expect(
    workspace.locator(
      '[data-workspace-section-move-destination-parent="empty-container"]' +
        '[data-workspace-section-move-destination-index="0"]',
    ),
  ).toHaveCount(1);
  await expect(workspace.locator("[data-workspace-section-move-preview-announcement]")).toHaveText(
    "Preview: Nested Beta and 1 more will move to Empty container, position 1 through 2 of 2.",
  );
  await page.keyboard.press("Escape");
  await expect(handle).toBeFocused();
  await expect(workspace.locator("[data-workspace-structure-movement-announcement]")).toHaveText(
    "Nested Beta movement canceled.",
  );
  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
});

test("keyboard free-move reparents a selected sibling block into a deep empty container", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  const workspace = await loadRecursiveFixture(page);
  await page.getByRole("combobox", { name: "Section movement" }).selectOption("free");
  const nestedBeta = workspace.getByRole("article", { name: "Nested Beta" });
  const deepContainer = workspace.getByRole("article", { name: "Deep container" });
  const emptyContainer = workspace.getByRole("article", { name: "Empty container" });
  const betaSelection = nestedBeta.getByRole("button", { name: "Select Nested Beta" });
  const deepSelection = deepContainer.getByRole("button", { name: "Select Deep container" });
  const handle = nestedBeta.getByRole("button", { name: "Move Nested Beta" });
  const emptyRegion = emptyContainer.getByRole("group", {
    name: "Empty container child sections",
  });
  const targetBox = await requiredBoundingBox(emptyRegion, "The empty keyboard destination");
  const preview = workspace.locator(
    '[data-workspace-section-move-destination-parent="empty-container"]' +
      '[data-workspace-section-move-destination-index="0"]',
  );
  const baselineChanges = await recursiveChangeCount(page);

  await betaSelection.click();
  await deepSelection.click({ modifiers: ["Shift"] });
  await handle.focus();
  await page.keyboard.press("Enter");
  await expect(workspace.getByRole("application")).toHaveAttribute(
    "data-workspace-section-move-input",
    "keyboard",
  );
  await moveKeyboardTowardPreview({
    page,
    preview,
    source: nestedBeta,
    target: { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 },
  });
  await expect(workspace.locator("[data-workspace-section-move-preview-announcement]")).toHaveText(
    "Preview: Nested Beta and 1 more will move to Empty container, position 1 through 2 of 2.",
  );
  await page.keyboard.press("Enter");

  await expect(handle).toBeFocused();
  await expect(nestedBeta).toHaveAttribute("data-workspace-parent-section-id", "empty-container");
  await expect(deepContainer).toHaveAttribute(
    "data-workspace-parent-section-id",
    "empty-container",
  );
  await expect(workspace.locator("[data-workspace-structure-movement-announcement]")).toHaveText(
    "Nested Beta and 1 more moved to Empty container, position 1 through 2 of 2.",
  );
  const document = await recursiveDocument(page);
  expect(document.sections["empty-container"]?.childLayout?.sectionIds).toEqual([
    "nested-beta",
    "deep-container",
  ]);
  expect(await recursiveChangeCount(page)).toBe(baselineChanges + 1);
  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
});
