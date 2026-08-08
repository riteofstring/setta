import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { addSampleSection } from "./workspace-test-helpers.js";

test("the searchable section palette creates, selects, and focuses smart-placed sections", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const addSection = page.getByRole("button", { name: "Add section" });
  await expect(addSection).toBeEnabled();
  await addSection.click();

  const picker = page.getByRole("dialog", { name: "Add a section" });
  const search = picker.getByRole("searchbox", { name: "Search sections" });
  await expect(picker).toBeVisible();
  await expect(search).toBeFocused();
  await expect(picker.getByRole("heading", { name: "Basics" })).toBeVisible();
  await expect(picker.getByRole("button", { name: "Sample note" })).toBeVisible();
  await expect(page).toHaveScreenshot("section-creation-palette.png");

  await search.fill("missing");
  await expect(picker.getByText("No section types match “missing”.")).toBeVisible();
  await expect(picker.getByText("0 section types available.")).toBeAttached();
  await picker.getByRole("button", { name: "Clear search" }).click();
  await search.fill("example");
  await expect(picker.getByRole("button", { name: "Sample note" })).toBeVisible();
  await search.press("Escape");
  await expect(picker).not.toBeVisible();
  await expect(addSection).toBeFocused();

  await addSampleSection(page);
  const first = page.getByRole("article", { name: "Sample section 1" });
  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute("data-workspace-selected", "true");
  await expect(page.getByRole("status")).toHaveText("Document change: section-create.");

  await addSampleSection(page);
  const second = page.getByRole("article", { name: "Sample section 2" });
  await expect(second).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Document change: section-create.");
  const [firstBox, secondBox] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  if (!firstBox || !secondBox) {
    throw new Error("Created sections must have browser geometry.");
  }
  const separated =
    firstBox.x + firstBox.width <= secondBox.x ||
    secondBox.x + secondBox.width <= firstBox.x ||
    firstBox.y + firstBox.height <= secondBox.y ||
    secondBox.y + secondBox.height <= firstBox.y;
  expect(separated).toBe(true);

  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
});

test("pointer and keyboard context creation use a meaningful canvas location", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const canvas = page.getByRole("application", { name: "Section workspace canvas" });
  await canvas.scrollIntoViewIfNeeded();
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error("Workspace canvas must have browser geometry.");
  }
  const contextPoint = {
    x: canvasBox.x + canvasBox.width * 0.72,
    y: canvasBox.y + canvasBox.height * 0.38,
  };
  await page.mouse.move(
    canvasBox.x + canvasBox.width * 0.58,
    canvasBox.y + canvasBox.height * 0.82,
  );
  await page.locator(".react-flow__pane").evaluate((pane, point) => {
    pane.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        button: 2,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
      }),
    );
  }, contextPoint);

  let picker = page.getByRole("dialog", { name: "Add a section" });
  await expect(picker).toHaveAttribute("data-workspace-creation-source", "context");
  await picker.getByRole("searchbox", { name: "Search sections" }).fill("note");
  await picker.getByRole("button", { name: "Sample note" }).click();

  const first = page.getByRole("article", { name: "Sample section 1" });
  const firstBox = await first.boundingBox();
  if (!firstBox) {
    throw new Error("Context-created section must have browser geometry.");
  }
  expect(Math.abs(firstBox.x - contextPoint.x)).toBeLessThan(2);
  expect(Math.abs(firstBox.y - contextPoint.y)).toBeLessThan(2);

  await expect(first).toBeFocused();
  await canvas.focus();
  await expect(canvas).toBeFocused();
  await page.keyboard.press("Shift+F10");
  picker = page.getByRole("dialog", { name: "Add a section" });
  await expect(picker).toBeVisible();
  await expect(picker).toHaveAttribute("data-workspace-creation-source", "context");
  await picker.getByRole("button", { name: "Sample note" }).click();
  await expect(page.getByRole("article", { name: "Sample section 2" })).toBeFocused();
});

test("the section picker reflows at 320 CSS pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Add section" }).click();

  const picker = page.getByRole("dialog", { name: "Add a section" });
  const pickerBox = await picker.boundingBox();
  if (!pickerBox) {
    throw new Error("Section picker must have browser geometry.");
  }
  expect(pickerBox.x).toBeGreaterThanOrEqual(0);
  expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(320);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
