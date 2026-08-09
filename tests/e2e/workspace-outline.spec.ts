import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function loadRecursiveOutline(
  page: Page,
): Promise<Readonly<{ outline: Locator; workspace: Locator }>> {
  await page.goto("/?canvas-shell");
  await page.getByRole("button", { name: "Load recursive fixture" }).click();
  const extensions = page.getByRole("checkbox", { name: "Show host extensions" });
  if (await extensions.isChecked()) await extensions.uncheck();
  const workspace = page.getByRole("region", { exact: true, name: "Canvas shell workspace" });
  await expect(workspace.getByRole("article", { name: "Recursive workspace" })).toBeVisible();
  const toggle = workspace.getByRole("button", { name: "Show outline" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const outline = workspace.getByRole("navigation", { name: "Workspace outline" });
  await expect(outline).toBeVisible();
  return { outline, workspace };
}

function outlineItem(outline: Locator, name: string): Locator {
  return outline.getByRole("treeitem", { exact: true, name });
}

test("the outline navigates recursive sections and mirrors workspace selection", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  const { outline, workspace } = await loadRecursiveOutline(page);
  const tree = outline.getByRole("tree", { name: "Outline" });
  const root = outlineItem(outline, "Recursive workspace");
  const nestedAlpha = outlineItem(outline, "Nested Alpha");
  const nestedRow = outlineItem(outline, "Nested row");
  const emptyContainer = outlineItem(outline, "Empty container");

  await expect(tree).toHaveAttribute("aria-multiselectable", "true");
  await expect(root).toHaveAttribute("aria-expanded", "true");
  await expect(root).toHaveAttribute("aria-level", "1");
  await expect(root).toHaveAttribute("aria-posinset", "1");
  await expect(root).toHaveAttribute("aria-setsize", "1");
  await expect(nestedAlpha).toHaveAttribute("aria-level", "2");
  await expect(nestedAlpha).toHaveAttribute("aria-posinset", "1");
  await expect(nestedAlpha).toHaveAttribute("aria-setsize", "3");
  await expect(emptyContainer).toHaveAttribute("aria-posinset", "3");
  await expect(outlineItem(outline, "Nested Beta")).toHaveCount(0);

  await nestedRow.focus();
  await page.keyboard.press("ArrowRight");
  await expect(nestedRow).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  const nestedBeta = outlineItem(outline, "Nested Beta");
  await expect(nestedBeta).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const deepContainer = outlineItem(outline, "Deep container");
  await expect(deepContainer).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(deepContainer).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  const nestedGamma = outlineItem(outline, "Nested Gamma");
  await expect(nestedGamma).toBeFocused();
  await page.keyboard.press("Enter");

  const gammaFrame = workspace.getByRole("article", { name: "Nested Gamma" });
  await expect(gammaFrame).toBeFocused();
  await expect(gammaFrame).toHaveAttribute("data-workspace-selected", "true");
  await expect(nestedGamma).toHaveAttribute("aria-selected", "true");
  await nestedAlpha.click({ modifiers: ["Shift"] });
  await expect(nestedAlpha).toHaveAttribute("aria-selected", "true");
  await expect(nestedGamma).toHaveAttribute("aria-selected", "true");
  await expect(outline.locator("[data-workspace-outline-announcement]")).toHaveText(
    "2 sections selected.",
  );

  const itemBounds = await nestedAlpha.boundingBox();
  expect(itemBounds?.height).toBeGreaterThanOrEqual(40);
  const accessibility = await new AxeBuilder({ page })
    .include("[data-workspace-outline]")
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(outline).toHaveScreenshot("workspace-outline-navigator.png");

  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  expect((await nestedAlpha.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(2);
  await expect(outline).toBeVisible();
  await nestedRow.focus();
  await expect(nestedRow).toBeFocused();
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await session.detach();
});

test("the outline retains canonical hierarchy while collapsed descendants reject focus", async ({
  page,
}) => {
  const { outline, workspace } = await loadRecursiveOutline(page);
  const rootFrame = workspace.getByRole("article", { name: "Recursive workspace" });
  const nestedAlpha = outlineItem(outline, "Nested Alpha");
  await rootFrame.getByRole("button", { name: "Select Recursive workspace" }).click();
  await rootFrame
    .getByRole("button", {
      name: "Minimize Recursive workspace and descendant sections",
    })
    .click();

  await expect(nestedAlpha).toBeVisible();
  await nestedAlpha.click();
  await expect(nestedAlpha).toBeFocused();
  await expect(outline.locator("[data-workspace-outline-announcement]")).toHaveText(
    "Expand the minimized ancestor before focusing this section.",
  );
  await expect(rootFrame).toHaveAttribute("data-workspace-selected", "true");
  await expect(workspace.getByRole("article", { name: "Nested Alpha" })).toHaveCount(0);

  await rootFrame
    .getByRole("button", {
      name: "Expand Recursive workspace and descendant sections",
    })
    .click();
  await nestedAlpha.click();
  await expect(workspace.getByRole("article", { name: "Nested Alpha" })).toBeFocused();
});

test("the outline reflows at 320 CSS pixels and removes motion when requested", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 320 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  const { outline, workspace } = await loadRecursiveOutline(page);
  const [documentWidths, outlineBounds, workspaceBounds] = await Promise.all([
    page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
    outline.boundingBox(),
    workspace.boundingBox(),
  ]);
  if (!outlineBounds || !workspaceBounds) {
    throw new Error("The narrow outline and workspace must expose browser geometry.");
  }

  expect(documentWidths.scrollWidth).toBeLessThanOrEqual(documentWidths.clientWidth);
  expect(outlineBounds.x).toBeGreaterThanOrEqual(workspaceBounds.x);
  expect(outlineBounds.x + outlineBounds.width).toBeLessThanOrEqual(
    workspaceBounds.x + workspaceBounds.width,
  );
  const nestedRow = outlineItem(outline, "Nested row");
  expect((await nestedRow.boundingBox())?.height).toBeGreaterThanOrEqual(40);
  expect(await nestedRow.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
    "0s",
  );
});

test("the outline mirrors hierarchy controls in right-to-left workspaces", async ({ page }) => {
  const { outline, workspace } = await loadRecursiveOutline(page);
  await workspace.evaluate((element) => element.setAttribute("dir", "rtl"));
  const nestedRow = outlineItem(outline, "Nested row");

  await nestedRow.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(nestedRow).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  await expect(nestedRow).toHaveAttribute("aria-expanded", "false");
  await expect(outline).toHaveCSS("direction", "rtl");
});
