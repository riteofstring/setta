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

  await page.waitForFunction(() => {
    return Array.from(document.querySelectorAll("textarea")).some((node) =>
      node.value.includes(
        "Generate a JSON Render app spec using the catalog below.",
      ),
    );
  });
  const prompt = await page.evaluate(() => {
    const match = Array.from(document.querySelectorAll("textarea")).find(
      (node) =>
        node.value.includes(
          "Generate a JSON Render app spec using the catalog below.",
        ),
    );
    return match?.value ?? "";
  });
  expect(prompt).toContain(
    "Generate a JSON Render app spec using the catalog below.",
  );
  expect(prompt).toContain(`Catalog: ${catalogId}`);
  expect(prompt).toContain("Output format should be a UITree object");
});
