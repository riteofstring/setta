import { expect, test } from "@playwright/test";
import { ensureAppReady, seedLocalStorage } from "../helpers";

test("project ai combobox chevron sizing", async ({ page }) => {
  await seedLocalStorage(page, { overviewTab: "ProjectAIChat", overviewVis: true });
  await ensureAppReady(page);

  const overviewPane = page.locator("#OverviewPane");
  await expect(
    overviewPane.getByRole("heading", { name: "Project AI Chat" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Project AI Settings" }).click();

  const engineInput = page.getByPlaceholder("Select an engine");
  await expect(engineInput).toBeVisible();

  const searchWrapper = engineInput.locator("..");
  const toggleButton = searchWrapper.locator("button").first();
  await expect(toggleButton).toBeVisible();

  const inputBox = await engineInput.boundingBox();
  const buttonBox = await toggleButton.boundingBox();
  expect(inputBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  if (!inputBox || !buttonBox) {
    return;
  }

  expect(buttonBox.height).toBeGreaterThanOrEqual(inputBox.height * 0.9);
  expect(buttonBox.height).toBeLessThanOrEqual(inputBox.height + 1);
  const inputCenter = inputBox.y + inputBox.height / 2;
  const buttonCenter = buttonBox.y + buttonBox.height / 2;
  expect(Math.abs(buttonCenter - inputCenter)).toBeLessThanOrEqual(2);

  const micInput = page.getByPlaceholder("Microphone source");
  await expect(micInput).toBeVisible();
  await expect(page.locator('select[aria-label="Microphone source"]')).toHaveCount(
    0,
  );
});

test("project chat does not render inline external engine status text", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "ProjectAIChat", overviewVis: true });
  await ensureAppReady(page);

  const overviewPane = page.locator("#OverviewPane");
  await expect(
    overviewPane.getByRole("heading", { name: "Project AI Chat" }),
  ).toBeVisible();

  // External engine health should be surfaced via notifications, not inline chat labels.
  await expect(overviewPane.getByText("External engine available")).toHaveCount(
    0,
  );
  await expect(
    overviewPane.getByText("Checking external engine status..."),
  ).toHaveCount(0);
  await expect(
    overviewPane.getByText(/External engine unavailable/i),
  ).toHaveCount(0);
});
