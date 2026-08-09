import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { addSampleSection, seedEmptyPlaygroundDocument } from "./workspace-test-helpers.js";

test("the first launch shows a populated, fitted, canvas-first workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const workspace = page.getByRole("region", { exact: true, name: "Section workspace" });
  await expect(page.locator(".announcement")).toHaveText("Example workspace loaded.");
  await expect(workspace.getByRole("article", { name: "Welcome note" })).toBeVisible();
  await expect(workspace.getByRole("article", { name: "Customer onboarding" })).toBeVisible();
  await expect(workspace.getByRole("article", { name: "Invite the customer" })).toBeVisible();
  await expect(workspace.getByRole("article", { name: "Handoff" })).toBeVisible();
  await expect(workspace.getByRole("article", { name: "Profile fields" })).toBeVisible();
  await expect(workspace.getByRole("article", { name: "Schedule check-in" })).toBeVisible();
  await expect(page.locator(".react-flow__attribution")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Setta Workspace" })).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to workspace" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();

  await expect(page.getByRole("combobox", { name: "Move sections" })).toHaveValue("sort");
  await expect(page.getByRole("combobox", { name: "Theme" })).toHaveValue("system");
  const help = page.getByRole("button", { name: "Help" });
  await help.click();
  const helpPanel = page.getByRole("dialog", { name: "Try these interactions" });
  await expect(helpPanel).toBeFocused();
  await expect(helpPanel).toContainText("Move a section");
  await expect(helpPanel).toContainText("Reorder fields");
  await page.keyboard.press("Escape");
  await expect(helpPanel).toHaveCount(0);
  await expect(help).toBeFocused();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("a deliberately emptied workspace keeps a forward-looking empty state", async ({ page }) => {
  await seedEmptyPlaygroundDocument(page);
  await page.goto("/");

  const workspace = page.getByRole("region", { exact: true, name: "Section workspace" });
  await expect(workspace).toContainText("This workspace is empty.");
  await expect(page.locator(".react-flow__attribution")).toHaveCount(0);

  await addSampleSection(page);
  await expect(page.getByRole("heading", { name: "Sample section 1" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Sample section 1" })).toContainText(
    "Host-rendered content inside the package-owned section frame.",
  );
  await expect(page.locator(".announcement")).toHaveText("Document change: section-create.");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("the canvas-first shell reflows and honors reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/");

  await expect(page.locator(".announcement")).toHaveText("Example workspace loaded.");
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(page).toHaveScreenshot("playground-320.png", { fullPage: true });
});

test("the primary workflow remains operable at 200% page scale", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".announcement")).toHaveText("Example workspace loaded.");
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });

  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(2);
  const addSection = page.getByRole("button", { name: "Add section" });
  await expect(addSection).toBeVisible();
  await addSection.focus();
  await expect(addSection).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("searchbox", { name: "Search sections" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Sample section 1" })).toBeVisible();
  await expect(page.locator(".announcement")).toHaveText("Document change: section-create.");

  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await session.detach();
});
