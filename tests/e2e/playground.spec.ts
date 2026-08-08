import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the blank workspace supports keyboard and assistive technology", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to workspace" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();

  const workspace = page.getByRole("region", { name: "Section workspace" });
  await expect(workspace).toContainText("No sections yet.");

  await page.getByRole("button", { name: "Add sample section" }).click();
  await expect(page.getByRole("heading", { name: "Sample section 1" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Sample section 1 added.");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("the scaffold reflows and honors reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/");

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(page).toHaveScreenshot("blank-workspace-320.png", { fullPage: true });
});

test("the primary workflow remains operable at 200% page scale", async ({ page }) => {
  await page.goto("/");
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });

  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(2);
  const addSection = page.getByRole("button", { name: "Add sample section" });
  await expect(addSection).toBeVisible();
  await addSection.focus();
  await expect(addSection).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Sample section 1" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Sample section 1 added.");

  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await session.detach();
});
