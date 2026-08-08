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

test("controlled and uncontrolled state honor live capability policy", async ({ page }) => {
  await page.goto("/?state-contract");

  const uncontrolledWorkspace = page.getByRole("region", {
    name: "Uncontrolled workspace",
    exact: true,
  });
  const controlledWorkspace = page.getByRole("region", {
    name: "Controlled workspace",
    exact: true,
  });
  const uncontrolledPanel = page.getByRole("region", {
    name: "Uncontrolled document",
    exact: true,
  });
  const controlledPanel = page.getByRole("region", {
    name: "Controlled document",
    exact: true,
  });
  const hostNote = page.getByRole("textbox", { name: "Host note" });
  const status = page.getByRole("status");
  await expect(uncontrolledWorkspace).toHaveAttribute("data-workspace-mode", "uncontrolled");
  await expect(controlledWorkspace).toHaveAttribute("data-workspace-mode", "controlled");

  await hostNote.fill("Keep this host value");
  await page.getByRole("button", { name: "Turn read-only on" }).click();
  await expect(uncontrolledWorkspace).toHaveAttribute("data-read-only", "true");

  await page.getByRole("button", { name: "Lock Alpha" }).click();
  await expect(status).toHaveText("Layout edit rejected: layout-edit-disabled.");
  await page.getByRole("button", { name: "Minimize Alpha" }).click();
  await expect(status).toHaveText("Presentation edit rejected: presentation-edit-disabled.");
  await page.getByRole("button", { name: "Delete Beta" }).click();
  await expect(status).toHaveText("Structure edit rejected: structure-edit-disabled.");
  await expect(uncontrolledPanel.getByText("Committed changes: 0")).toBeVisible();
  await expect(hostNote).toHaveValue("Keep this host value");

  await page.getByRole("button", { name: "Pan uncontrolled viewport" }).click();
  await expect(status).toHaveText("Viewport navigation: applied.");
  await expect(uncontrolledPanel.getByText("Committed changes: 1")).toBeVisible();
  await expect(page.getByTestId("uncontrolled-document")).toHaveValue(/"zoom": 1.5/u);

  await page.getByRole("button", { name: "Turn editing on" }).click();
  await page.getByRole("button", { name: "Minimize Alpha" }).click();
  await page.getByRole("button", { name: "Delete Beta" }).click();
  await expect(page.getByTestId("uncontrolled-document")).toHaveValue(/"isMinimized": true/u);
  await expect(page.getByTestId("uncontrolled-document")).not.toHaveValue(/"beta"/u);
  await expect(hostNote).toHaveValue("Keep this host value");

  await page.getByRole("button", { name: "Pan controlled viewport" }).click();
  await expect(status).toHaveText("Controlled viewport: applied.");
  await expect(page.getByTestId("controlled-document")).toHaveValue(/"x": 120/u);
  await expect(controlledPanel.getByText("Committed changes: 1")).toBeVisible();

  await page.setViewportSize({ width: 320, height: 720 });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
