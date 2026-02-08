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
        "Generate a JSON Render app definition (appSpec + routes) using the catalog below.",
      ),
    );
  });
  const prompt = await page.evaluate(() => {
    const match = Array.from(document.querySelectorAll("textarea")).find(
      (node) =>
        node.value.includes(
          "Generate a JSON Render app definition (appSpec + routes) using the catalog below.",
        ),
    );
    return match?.value ?? "";
  });
  expect(prompt).toContain(
    "Generate a JSON Render app definition (appSpec + routes) using the catalog below.",
  );
  expect(prompt).toContain("DO NOT paste JSON into the chat.");
  expect(prompt).toContain("setta__set_app_definition");
  expect(prompt).toContain(`Catalog: ${catalogId}`);
  expect(prompt).toContain("Pages and navigation:");
  expect(prompt).toContain("- Treat tab view modes as pages.");
  expect(prompt).toContain("- routes: list of { path, name, rootKey }");
});
