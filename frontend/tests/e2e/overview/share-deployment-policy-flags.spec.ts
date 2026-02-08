import { expect, test } from "@playwright/test";

import { ensureAppReady } from "../helpers";

test("publish share deployment modal exposes full policy flags", async ({ page }) => {
  await ensureAppReady(page);

  await page.getByRole("menuitem", { name: "Project" }).click();
  await page.getByRole("menuitem", { name: "Publish Share Deployment" }).click();

  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Publish Share Deployment")).toBeVisible();

  function getToggle(label: string) {
    // Toggle rows are not form labels; locate the label text and walk up to the row.
    const labelEl = modal.getByText(label, { exact: true });
    const row = labelEl.locator("..").locator("..");
    return row.getByRole("switch");
  }

  const runToggle = getToggle("Run & terminals");
  const multiToggle = getToggle("Multiple runs");
  const linksToggle = getToggle("External links");
  const downloadsToggle = getToggle("File downloads");

  await expect(runToggle).toBeVisible();
  await expect(multiToggle).toBeVisible();
  await expect(linksToggle).toBeVisible();
  await expect(downloadsToggle).toBeVisible();

  await expect(multiToggle).toBeDisabled();

  await runToggle.click();
  await expect(multiToggle).toBeEnabled();
});
