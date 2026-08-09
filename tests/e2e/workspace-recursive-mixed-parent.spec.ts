import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  dragHandleToPoint,
  loadRecursiveFixture,
  recursiveChangeCount,
  setCanvasZoom,
  visibleCanvasTargetPoint,
} from "./workspace-test-helpers.js";

test("mixed-parent section roots move atomically into one container", async ({ page }) => {
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  const workspace = await loadRecursiveFixture(page);
  await page.getByRole("button", { name: "Fit recursive descendants" }).click();
  await setCanvasZoom(page, 0.5);
  await page.getByRole("combobox", { name: "Section movement" }).selectOption("free");
  const canvas = workspace.getByRole("application", { name: "Canvas shell workspace canvas" });
  const nestedAlpha = workspace.getByRole("article", { name: "Nested Alpha" });
  const nestedBeta = workspace.getByRole("article", { name: "Nested Beta" });
  const emptyContainer = workspace.getByRole("article", { name: "Empty container" });
  const alphaHandle = nestedAlpha.getByRole("button", { name: "Move Nested Alpha" });

  await nestedAlpha.getByRole("button", { name: "Select Nested Alpha" }).click();
  await nestedBeta
    .getByRole("button", { name: "Select Nested Beta" })
    .click({ modifiers: ["Shift"] });
  await expect(workspace.locator("[data-workspace-selection-announcement]")).toHaveText(
    "2 sections selected.",
  );
  await page.getByRole("button", { name: "Fit recursive descendants" }).click();
  await setCanvasZoom(page, 0.5);
  await workspace.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest" }),
  );
  const target = await visibleCanvasTargetPoint(
    canvas,
    emptyContainer.locator("[data-workspace-empty-child-container]"),
    "Mixed-parent empty container target",
  );
  const baselineChanges = await recursiveChangeCount(page);
  const scrollPosition = await page.evaluate(() => ({ left: window.scrollX, top: window.scrollY }));

  await dragHandleToPoint(page, alphaHandle, target);
  await expect(
    workspace.locator("[data-workspace-section-move-preview-announcement]"),
  ).toContainText("Nested Alpha and 1 more will move to Empty container");
  await expect(canvas).toHaveScreenshot("recursive-mixed-parent-section-preview.png");
  await page.evaluate(({ left, top }) => window.scrollTo(left, top), scrollPosition);
  await page.mouse.move(target.x, target.y);
  await page.mouse.up();

  await expect(nestedAlpha).toHaveAttribute("data-workspace-parent-section-id", "empty-container");
  await expect(nestedBeta).toHaveAttribute("data-workspace-parent-section-id", "empty-container");
  await expect(workspace.locator("[data-workspace-structure-movement-announcement]")).toContainText(
    "Nested Alpha and 1 more moved to Empty container",
  );
  expect(await recursiveChangeCount(page)).toBe(baselineChanges + 1);
  await expect(alphaHandle).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
});
