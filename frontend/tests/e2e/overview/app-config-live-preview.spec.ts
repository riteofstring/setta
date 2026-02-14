import { expect, test } from "@playwright/test";

import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  seedLocalStorage,
} from "../helpers";

test("app config draft edits update the app preview without saving", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await expect(page.getByText("App Config")).toBeVisible();

    const showPreviewButton = page.getByRole("button", { name: "Show Preview" });
    if (await showPreviewButton.isVisible()) {
      await showPreviewButton.click();
    }

    await page.getByRole("button", { name: "Create Default" }).click();

    await expect(page.getByText("App Preview")).toBeVisible();

    const specTextarea = page.getByLabel("App Spec JSON");
    await expect
      .poll(async () => (await specTextarea.inputValue()).trim().length > 0)
      .toBe(true);
    const original = await specTextarea.inputValue();
    const updated = original.replaceAll(
      '"title": "Inputs"',
      '"title": "Live Preview Inputs"',
    );
    if (updated === original) {
      throw new Error("Unable to resolve input card title in default app spec.");
    }
    await specTextarea.fill(updated);
    const appPreviewPanel = page
      .locator("article")
      .filter({ hasText: "App Preview" })
      .first();

    await expect(appPreviewPanel).toContainText("Live Preview Inputs");

    await specTextarea.fill(updated.slice(0, -1));
    await expect(page.getByText("Invalid JSON in app spec.")).toBeVisible();

    await expect(appPreviewPanel).toContainText("Live Preview Inputs");

    await specTextarea.fill(updated);
    await expect(page.getByText("Invalid JSON in app spec.")).toBeHidden();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
