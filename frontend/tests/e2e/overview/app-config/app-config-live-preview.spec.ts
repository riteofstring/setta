import { expect, test } from "@playwright/test";

import { ensureAppReady, seedLocalStorage } from "../../helpers";

test("app config draft edits update the app preview without saving", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);

  await expect(
    page.getByRole("heading", { name: "JSON Render" }),
  ).toBeVisible();

  const showPreviewButton = page.getByRole("button", { name: "Show Preview" });
  if (await showPreviewButton.isVisible()) {
    await showPreviewButton.click();
  }

  await page.getByRole("button", { name: "Create Default" }).click();

  await expect(page.getByText("App Preview")).toBeVisible();

  const specTextarea = page.getByLabel("App Spec JSON");
  await expect(specTextarea).toHaveValue(/Standalone App Starter/);
  const original = await specTextarea.inputValue();

  const updated = original.replace(
    "Standalone App Starter",
    "Live Preview Starter",
  );
  await specTextarea.fill(updated);

  await expect(
    page.getByRole("heading", { name: "Live Preview Starter" }),
  ).toBeVisible();

  await specTextarea.fill(updated.slice(0, -1));
  await expect(page.getByText("Invalid JSON in app spec.")).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Live Preview Starter" }),
  ).toBeVisible();

  await specTextarea.fill(updated);
  await expect(page.getByText("Invalid JSON in app spec.")).toBeHidden();
});
