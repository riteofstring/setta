import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const HOME_URL = new URL("/home", BASE_URL).toString();

test("home page renders the three-column file manager layout", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("home-file-manager-layout")).toBeVisible();
  await expect(page.getByTestId("home-file-browser-column")).toBeVisible();
  await expect(page.getByTestId("home-project-gallery")).toBeVisible();
  await expect(page.getByTestId("home-selected-project-details")).toBeVisible();

  const firstCard = page.getByTestId("home-project-card").first();
  await expect(firstCard).toBeVisible();
  const firstCardName = (await firstCard.locator("p").first().textContent())?.trim();
  if (firstCardName) {
    await expect(page.getByTestId("home-selected-project-details")).toContainText(
      firstCardName,
    );
  }
});

test("home browser marks Setta-initialized folders", async ({ page }) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for home browser test.");
  }

  const tempRoot = await fs.mkdtemp(
    path.join(workspaceRoot, "setta-home-browser-"),
  );
  const initializedFolder = path.join(tempRoot, "initialized-folder");
  const plainFolder = path.join(tempRoot, "plain-folder");
  await fs.mkdir(path.join(initializedFolder, "setta_files"), {
    recursive: true,
  });
  await fs.mkdir(plainFolder, { recursive: true });

  try {
    await ensureAppReady(page);
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

    const pathInput = page.getByTestId("home-file-browser-path-input");
    await expect(pathInput).toBeVisible();
    await pathInput.fill(tempRoot);
    await pathInput.press("Enter");

    const initializedRow = page
      .getByTestId("file-browser-row")
      .filter({ hasText: "initialized-folder" })
      .first();
    const plainRow = page
      .getByTestId("file-browser-row")
      .filter({ hasText: "plain-folder" })
      .first();

    await expect(initializedRow).toBeVisible();
    await expect(initializedRow.getByTestId("setta-initialized-badge")).toBeVisible();
    await expect(plainRow).toBeVisible();
    await expect(plainRow.getByTestId("setta-initialized-badge")).toHaveCount(0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
