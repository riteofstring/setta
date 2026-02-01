import { expect, test } from "@playwright/test";

import { ensureAppReady, seedLocalStorage } from "../helpers";

test("app config generate button seeds project chat prompt", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);

  await expect(page.getByText("App Config")).toBeVisible();

  const catalogId = await page.getByLabel("Catalog ID").inputValue();
  await page.getByRole("button", { name: "Generate App" }).click();

  const visibleTextareas = page.locator("textarea:visible");
  await expect(visibleTextareas).toHaveCount(1);
  const prompt = await visibleTextareas.first().inputValue();
  expect(prompt).toContain(
    `Generate a JSON Render app spec using catalog "${catalogId}".`,
  );
  expect(prompt).toContain("Output format should be a UITree object");
});
