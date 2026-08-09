import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function loadRecursiveFixture(page: Page): Promise<Locator> {
  await page.goto("/?canvas-shell");
  await page.getByRole("button", { name: "Load recursive fixture" }).click();
  await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
  const workspace = page.getByRole("region", {
    exact: true,
    name: "Canvas shell workspace",
  });
  await expect(workspace.getByRole("article", { name: "Recursive workspace" })).toBeVisible();
  return workspace;
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

async function openSelectionActions(page: Page, trigger: Locator): Promise<Locator> {
  await trigger.focus();
  await page.keyboard.press("Shift+F10");
  const dialog = page.getByRole("dialog", { name: "Selection actions" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function groupNestedRowChildren(page: Page, workspace: Locator) {
  const nestedBeta = workspace.getByRole("article", { name: "Nested Beta" });
  const deepContainer = workspace.getByRole("article", { name: "Deep container" });
  const selectBeta = nestedBeta.getByRole("button", { name: "Select Nested Beta" });
  const selectDeep = deepContainer.getByRole("button", { name: "Select Deep container" });
  await selectBeta.click();
  await selectDeep.click({ modifiers: ["Shift"] });
  const dialog = await openSelectionActions(page, selectBeta);
  await dialog.getByRole("menuitem", { name: "Group sections", exact: true }).click();
  const group = workspace.getByRole("article", { name: "Group 1 (2 sections)" });
  const selectGroup = group.getByRole("button", { name: "Select Group 1 (2 sections)" });
  await expect(group).toBeVisible();
  return { deepContainer, group, nestedBeta, selectBeta, selectDeep, selectGroup };
}

test("nested group history and ungroup restore exact structure and focus", async ({ page }) => {
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  const workspace = await loadRecursiveFixture(page);
  await page.getByRole("button", { name: "Fit recursive descendants" }).click();
  const { deepContainer, group, nestedBeta, selectBeta, selectDeep, selectGroup } =
    await groupNestedRowChildren(page, workspace);
  const actionAnnouncement = workspace.locator("[data-workspace-selection-action-announcement]");
  const baselineChanges = (await recursiveChangeCount(page)) - 1;
  let document: Awaited<ReturnType<typeof recursiveDocument>>;

  await page.keyboard.press("Control+z");
  await expect(group).toHaveCount(0);
  await expect(selectBeta).toHaveAttribute("aria-pressed", "true");
  await expect(selectDeep).toHaveAttribute("aria-pressed", "true");
  await expect(nestedBeta).toBeFocused();
  document = await recursiveDocument(page);
  expect(document.sections["nested-row"]?.childLayout?.sectionIds).toEqual([
    "nested-beta",
    "deep-container",
  ]);

  await page.keyboard.press("Control+Shift+z");
  await expect(group).toBeVisible();
  await expect(selectGroup).toHaveAttribute("aria-pressed", "true");
  await expect(group).toBeFocused();
  await selectGroup.focus();
  const dialog = await openSelectionActions(page, selectGroup);
  await dialog.getByRole("menuitem", { name: "Ungroup section", exact: true }).click();

  await expect(group).toHaveCount(0);
  await expect(nestedBeta).toHaveAttribute("data-workspace-depth", "2");
  await expect(nestedBeta).toHaveAttribute("data-workspace-parent-section-id", "nested-row");
  await expect(deepContainer).toHaveAttribute("data-workspace-depth", "2");
  await expect(selectBeta).toHaveAttribute("aria-pressed", "true");
  await expect(selectDeep).toHaveAttribute("aria-pressed", "true");
  await expect(selectBeta).toBeFocused();
  await expect(actionAnnouncement).toHaveText("The selected section was ungrouped.");
  document = await recursiveDocument(page);
  expect(document.sections["nested-row"]?.childLayout?.sectionIds).toEqual([
    "nested-beta",
    "deep-container",
  ]);

  await page.keyboard.press("Control+z");
  await expect(group).toBeVisible();
  await expect(selectGroup).toHaveAttribute("aria-pressed", "true");
  await expect(group).toBeFocused();
  await page.keyboard.press("Control+Shift+z");
  await expect(group).toHaveCount(0);
  await expect(selectBeta).toHaveAttribute("aria-pressed", "true");
  await expect(selectDeep).toHaveAttribute("aria-pressed", "true");
  await expect(nestedBeta).toBeFocused();
  await expect.poll(() => recursiveChangeCount(page)).toBe(baselineChanges + 6);

  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
});
