import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function rootOrder(page: Page): Promise<readonly string[]> {
  const value = await page.getByTestId("canvas-shell-document").inputValue();
  const document = JSON.parse(value) as { rootSections: readonly { sectionId: string }[] };
  return document.rootSections.map(({ sectionId }) => sectionId);
}

async function workspaceDocument(page: Page): Promise<{
  rootSections: readonly { position: { x: number; y: number }; sectionId: string }[];
  sections: Readonly<
    Record<string, { childLayout: { sectionIds: readonly string[] } | null; id: string }>
  >;
}> {
  const value = await page.getByTestId("canvas-shell-document").inputValue();
  return JSON.parse(value) as Awaited<ReturnType<typeof workspaceDocument>>;
}

async function changeCount(page: Page): Promise<number> {
  return Number(await page.getByTestId("canvas-shell-change-count").textContent());
}

async function loadSelectionFixture(page: Page): Promise<void> {
  await page.goto("/?canvas-shell");
  await page.getByRole("button", { name: "Load navigation fixture" }).click();
  await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
  await page.getByRole("button", { name: "Fit navigation fixture" }).click();
  await expect.poll(() => rootOrder(page)).toEqual(["alpha", "beta", "gamma"]);
}

async function selectAlphaAndBeta(page: Page): Promise<Locator> {
  const selectAlpha = page.getByRole("button", { name: "Select Alpha frame" });
  const selectBeta = page.getByRole("button", { name: "Select Beta frame" });
  await selectAlpha.click();
  await selectBeta.click({ modifiers: ["Shift"] });
  await expect(selectAlpha).toHaveAttribute("aria-pressed", "true");
  await expect(selectBeta).toHaveAttribute("aria-pressed", "true");
  return selectAlpha;
}

async function openSelectionActionsWithKeyboard(page: Page, trigger: Locator): Promise<Locator> {
  await trigger.focus();
  await page.keyboard.press("Shift+F10");
  const dialog = page.getByRole("dialog", { name: "Selection actions" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("selection actions batch lock, stack, and delete through one canonical change each", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loadSelectionFixture(page);
  const selectAlpha = await selectAlphaAndBeta(page);
  const baselineChanges = await changeCount(page);
  const workspace = page.getByRole("region", { name: "Canvas shell workspace", exact: true });
  const actionAnnouncement = workspace.locator("[data-workspace-selection-action-announcement]");

  await selectAlpha.click({ button: "right" });
  let dialog = page.getByRole("dialog", { name: "Selection actions" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("2 sections selected")).toBeVisible();
  const lockSections = dialog.getByRole("menuitem", { name: "Lock sections", exact: true });
  await expect(lockSections).toBeFocused();
  const lockBounds = await lockSections.boundingBox();
  expect(lockBounds?.height).toBeGreaterThanOrEqual(40);

  await page.keyboard.press("ArrowDown");
  const disabledUnlock = dialog.locator('[data-workspace-selection-action="unlock"]');
  await expect(disabledUnlock).toBeFocused();
  await expect(disabledUnlock).toHaveAttribute("aria-disabled", "true");
  await expect(disabledUnlock).toContainText("All selected sections are already unlocked.");
  await expect(dialog.locator('[data-workspace-selection-action="group"]')).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
  const accessibility = await new AxeBuilder({ page })
    .include('[data-workspace-selection-action-menu=""]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(page).toHaveScreenshot("selection-actions-menu.png");

  const dialogBounds = await dialog.boundingBox();
  const workspaceBounds = await workspace.boundingBox();
  if (!dialogBounds || !workspaceBounds) {
    throw new Error("The selection menu and workbench must expose browser geometry.");
  }
  expect(dialogBounds.x).toBeGreaterThanOrEqual(workspaceBounds.x);
  expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(
    workspaceBounds.x + workspaceBounds.width,
  );
  expect(dialogBounds.y).toBeGreaterThanOrEqual(workspaceBounds.y);
  expect(dialogBounds.y + dialogBounds.height).toBeLessThanOrEqual(
    workspaceBounds.y + workspaceBounds.height,
  );
  await page.mouse.click(workspaceBounds.x + 4, workspaceBounds.y + 4);
  await expect(dialog).not.toBeVisible();
  await expect(selectAlpha).toBeFocused();

  await selectAlpha.click({ button: "right" });
  dialog = page.getByRole("dialog", { name: "Selection actions" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(selectAlpha).toBeFocused();

  dialog = await openSelectionActionsWithKeyboard(page, selectAlpha);
  await dialog.getByRole("menuitem", { name: "Lock sections", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Unlock Alpha frame" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Unlock Beta frame" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(actionAnnouncement).toHaveText("The 2 selected sections were locked.");
  await expect.poll(() => changeCount(page)).toBe(baselineChanges + 1);
  await expect(selectAlpha).toBeFocused();

  dialog = await openSelectionActionsWithKeyboard(page, selectAlpha);
  await dialog.getByRole("menuitem", { name: "Unlock sections", exact: true }).click();
  await expect(page.getByRole("button", { name: "Lock Alpha frame" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByRole("button", { name: "Lock Beta frame" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(actionAnnouncement).toHaveText("The 2 selected sections were unlocked.");
  await expect.poll(() => changeCount(page)).toBe(baselineChanges + 2);

  dialog = await openSelectionActionsWithKeyboard(page, selectAlpha);
  await dialog.getByRole("menuitem", { name: "Bring to front", exact: true }).click();
  await expect.poll(() => rootOrder(page)).toEqual(["gamma", "alpha", "beta"]);
  await expect(actionAnnouncement).toHaveText("The 2 selected sections were brought to front.");
  await expect.poll(() => changeCount(page)).toBe(baselineChanges + 3);

  dialog = await openSelectionActionsWithKeyboard(page, selectAlpha);
  const bringToFront = dialog.locator('[data-workspace-selection-action="bring-to-front"]');
  await expect(bringToFront).toHaveAttribute("aria-disabled", "true");
  await expect(bringToFront).toContainText("Selected sections are already at the front.");
  await bringToFront.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("menuitem", { name: "Send backward", exact: true }).click();
  await expect.poll(() => rootOrder(page)).toEqual(["alpha", "beta", "gamma"]);
  await expect(actionAnnouncement).toHaveText("The 2 selected sections were moved backward.");
  await expect.poll(() => changeCount(page)).toBe(baselineChanges + 4);

  dialog = await openSelectionActionsWithKeyboard(page, selectAlpha);
  await dialog.getByRole("menuitem", { name: "Delete sections", exact: true }).click();
  await expect.poll(() => rootOrder(page)).toEqual(["gamma"]);
  await expect(page.getByRole("article", { name: "Alpha frame" })).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Beta frame" })).toHaveCount(0);
  await expect(actionAnnouncement).toHaveText("The 2 selected sections were deleted.");
  await expect.poll(() => changeCount(page)).toBe(baselineChanges + 5);
  await expect(page.getByRole("button", { name: "Select Gamma frame" })).toBeFocused();
});

test("selection actions group and ungroup top-level siblings with focus restoration", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loadSelectionFixture(page);
  const selectAlpha = await selectAlphaAndBeta(page);
  const baselineChanges = await changeCount(page);
  const workspace = page.getByRole("region", { name: "Canvas shell workspace", exact: true });
  const actionAnnouncement = workspace.locator("[data-workspace-selection-action-announcement]");

  let dialog = await openSelectionActionsWithKeyboard(page, selectAlpha);
  await dialog.getByRole("menuitem", { name: "Group sections", exact: true }).click();

  await expect.poll(() => rootOrder(page)).toEqual(["navigation-group-1", "gamma"]);
  await expect.poll(() => changeCount(page)).toBe(baselineChanges + 1);
  await expect(actionAnnouncement).toHaveText("The 2 selected sections were grouped.");
  const groupFrame = page.getByRole("article", { name: "Group 1 (2 sections)" });
  await expect(groupFrame).toBeVisible();
  const nestedAlphaFrame = page.getByRole("article", { name: "Alpha frame" });
  const nestedBetaFrame = page.getByRole("article", { name: "Beta frame" });
  await expect(nestedAlphaFrame).toBeVisible();
  await expect(nestedAlphaFrame).toHaveAttribute(
    "data-workspace-parent-section-id",
    "navigation-group-1",
  );
  await expect(nestedBetaFrame).toBeVisible();
  await expect(nestedBetaFrame).toHaveAttribute("data-workspace-depth", "1");
  await expect(nestedAlphaFrame.getByRole("button", { name: "Move Alpha frame" })).toBeEnabled();
  const selectGroup = page.getByRole("button", { name: "Select Group 1 (2 sections)" });
  await expect(selectGroup).toHaveAttribute("aria-pressed", "true");
  await expect(selectGroup).toBeFocused();
  const groupedDocument = await workspaceDocument(page);
  expect(groupedDocument.sections["navigation-group-1"]?.childLayout?.sectionIds).toEqual([
    "alpha",
    "beta",
  ]);
  const groupedAccessibility = await new AxeBuilder({ page }).analyze();
  expect(groupedAccessibility.violations).toEqual([]);
  await expect(page).toHaveScreenshot("selection-grouped-sections.png");

  dialog = await openSelectionActionsWithKeyboard(page, selectGroup);
  await expect(dialog.locator('[data-workspace-selection-action="group"]')).toContainText(
    "Select at least two sibling sections to group.",
  );
  const ungroup = dialog.getByRole("menuitem", { name: "Ungroup section", exact: true });
  await expect(ungroup).not.toHaveAttribute("aria-disabled", "true");
  await ungroup.click();

  await expect.poll(() => rootOrder(page)).toEqual(["alpha", "beta", "gamma"]);
  await expect.poll(() => changeCount(page)).toBe(baselineChanges + 2);
  await expect(actionAnnouncement).toHaveText("The selected section was ungrouped.");
  await expect(groupFrame).toHaveCount(0);
  const alphaFrame = page.getByRole("article", { name: "Alpha frame" });
  await expect(alphaFrame).toBeVisible();
  await expect(page.getByRole("article", { name: "Beta frame" })).toBeVisible();
  const restoredAlphaSelection = page.getByRole("button", { name: "Select Alpha frame" });
  await expect(restoredAlphaSelection).toHaveAttribute("aria-pressed", "true");
  await expect(restoredAlphaSelection).toBeFocused();
  await expect(page.getByRole("button", { name: "Select Beta frame" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const ungroupedDocument = await workspaceDocument(page);
  expect(ungroupedDocument.sections["navigation-group-1"]).toBeUndefined();
  expect(ungroupedDocument.rootSections.slice(0, 2)).toEqual([
    { position: { x: 480, y: 80 }, sectionId: "alpha" },
    { position: { x: 480, y: 284 }, sectionId: "beta" },
  ]);
});

test("open selection actions enforce live capabilities and controlled-host rejection", async ({
  page,
}) => {
  await page.goto("/?state-contract");
  const uncontrolled = page.getByRole("region", {
    name: "Uncontrolled workspace",
    exact: true,
  });
  const uncontrolledAlpha = uncontrolled.getByRole("button", { name: "Select Alpha" });
  await uncontrolledAlpha.click();
  await uncontrolled.getByRole("button", { name: "Select Beta" }).click({
    modifiers: ["Shift"],
  });
  let dialog = await openSelectionActionsWithKeyboard(page, uncontrolledAlpha);
  await expect(dialog.locator('[data-workspace-selection-action="lock"]')).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );

  await page.getByRole("button", { name: "Turn read-only on" }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await expect(uncontrolled).toHaveAttribute("data-read-only", "true");
  await expect(dialog.locator('[data-workspace-selection-action="lock"]')).toContainText(
    "Turn on layout editing to use this action.",
  );
  await expect(dialog.locator('[data-workspace-selection-action="delete"]')).toContainText(
    "Turn on structure editing to use this action.",
  );
  await dialog.getByRole("button", { name: "Close selection actions" }).click();

  const controlled = page.getByRole("region", { name: "Controlled workspace", exact: true });
  const controlledAlpha = controlled.getByRole("button", { name: "Select Alpha" });
  await controlledAlpha.click();
  await page.getByRole("checkbox", { name: "Accept controlled changes" }).uncheck();
  dialog = await openSelectionActionsWithKeyboard(page, controlledAlpha);
  await dialog.getByRole("menuitem", { name: "Delete section", exact: true }).click();
  await expect(controlled.getByRole("article", { name: "Alpha" })).toBeVisible();
  await expect(controlled.getByRole("article", { name: "Beta" })).toBeVisible();
  await expect(controlled.locator("[data-workspace-selection-action-announcement]")).toHaveText(
    "The selected section remains unchanged because the host did not accept the action.",
  );
  await expect(controlledAlpha).toBeFocused();
});

test.describe("coarse-pointer selection actions", () => {
  test.use({ hasTouch: true });

  test("the menu reflows at 320 CSS pixels", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await loadSelectionFixture(page);
    const selectAlpha = await selectAlphaAndBeta(page);

    expect(await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches)).toBe(true);
    const dialog = await openSelectionActionsWithKeyboard(page, selectAlpha);
    const bounds = await dialog.boundingBox();
    if (!bounds) {
      throw new Error("Selection actions must have browser geometry.");
    }
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    const lockBounds = await dialog
      .getByRole("menuitem", { name: "Lock sections", exact: true })
      .boundingBox();
    expect(lockBounds?.height).toBeGreaterThanOrEqual(44);
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });
});
