import { expect, test } from "@playwright/test";

import { ensureAppReady, seedLocalStorage } from "../../helpers";

test("app config pane persists catalog, version, and spec path", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);

  await expect(page.getByText("App Config")).toBeVisible();

  const createDefaultButton = page.getByRole("button", {
    name: "Create Default",
  });
  await expect(createDefaultButton).toBeEnabled();
  await createDefaultButton.click();
  await expect(page.getByLabel("App Spec JSON")).toHaveValue(
    /Standalone App Starter/,
  );

  const advancedToggle = page.getByRole("button", { name: "Advanced" });
  await expect(advancedToggle).toBeVisible();
  await advancedToggle.click();

  const catalogInput = page.getByLabel("Catalog ID");
  const versionInput = page.getByLabel("Spec version");
  const pathInput = page.getByLabel("Spec path");
  await expect(
    page.locator('[data-setting-anchor="core.app.catalog_id"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-setting-anchor="core.app.spec_version"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-setting-anchor="core.app.theme_mode"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-setting-anchor="core.app.spec_path"]'),
  ).toBeVisible();

  const defaultCatalogId = await catalogInput.inputValue();
  await catalogInput.fill(defaultCatalogId);
  await versionInput.fill("v2");
  await pathInput.fill("app_specs/custom.json");

  const saveButton = page.getByRole("button", { name: "Save" });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(page.getByText("App spec saved.")).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("App Config")).toBeVisible();

  await expect(page.getByLabel("Catalog ID")).toHaveValue(defaultCatalogId);
  await expect(page.getByLabel("Spec version")).toHaveValue("v2");
  await expect(page.getByLabel("Spec path")).toHaveValue(
    "app_specs/custom.json",
  );
});
