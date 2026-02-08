import path from "path";
import { fileURLToPath } from "url";

import { expect, test } from "@playwright/test";

import { ensureAppReady, seedLocalStorage } from "../helpers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("app config can attach a style image and seed it into project chat", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);

  await expect(page.getByText("App Config")).toBeVisible();

  const filePath = path.join(
    __dirname,
    "../../../../images/setta-github-dark.png",
  );
  await page
    .locator('input[aria-label="Style reference image"]')
    .setInputFiles(filePath);

  await expect(page.getByText("setta-github-dark.png")).toBeVisible();

  await page.getByRole("button", { name: "Generate App" }).click();

  await page.waitForFunction(() => {
    return Array.from(document.querySelectorAll("textarea")).some((node) =>
      node.value.includes("Style reference:"),
    );
  });

  const seededPrompt = await page.evaluate(() => {
    const match = Array.from(document.querySelectorAll("textarea")).find((node) =>
      node.value.includes("Style reference:"),
    );
    return match?.value ?? "";
  });

  expect(seededPrompt).toContain("Style reference:");
  expect(seededPrompt).toContain(
    "Treat it as the style reference for the app's look and feel.",
  );

  await expect(page.getByText("setta-github-dark.png")).toBeVisible();
});
