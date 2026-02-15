import { expect, test } from "@playwright/test";

import { ensureAppReady, seedLocalStorage } from "../helpers";

test("app config pane persists catalog, version, and spec path", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);

  await expect(page.getByText("App Config")).toBeVisible();

  await page.getByRole("button", { name: "Create Default" }).click();

  const catalogInput = page.getByLabel("Catalog ID");
  const versionInput = page.getByLabel("Spec version");
  const pathInput = page.getByLabel("Spec path");

  const defaultCatalogId = await catalogInput.inputValue();
  await catalogInput.fill(defaultCatalogId);
  await versionInput.fill("v2");
  await pathInput.fill("app_specs/custom.json");

  const saveButton = page.getByRole("button", { name: "Save" });
  await expect(saveButton).toBeEnabled();
  await Promise.all([
    page.waitForResponse((response) => {
      return response.url().includes("/setAppDefinition") && response.ok();
    }),
    saveButton.click(),
  ]);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("App Config")).toBeVisible();

  await expect(page.getByLabel("Catalog ID")).toHaveValue(defaultCatalogId);
  await expect(page.getByLabel("Spec version")).toHaveValue("v2");
  await expect(page.getByLabel("Spec path")).toHaveValue(
    "app_specs/custom.json",
  );
});
