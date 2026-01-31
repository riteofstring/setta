import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type FullConfig, type Page } from "@playwright/test";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);
const setupDir = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE_PATH = path.join(setupDir, ".auth", "state.json");
const READY_SELECTOR = ".react-flow__pane";

async function isAppReady(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector(READY_SELECTOR, { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

async function waitForProjectUrl(page: Page): Promise<void> {
  await page.waitForURL(
    (url) => url.toString().startsWith(PROJECT_URL),
    { timeout: 20000, waitUntil: "domcontentloaded" },
  );
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(PROJECT_URL, { waitUntil: "domcontentloaded" });
    if (!(await isAppReady(page))) {
      if (!BOOTSTRAP_TOKEN) {
        throw new Error(
          "Missing SETTA_BOOTSTRAP_TOKEN. Open /__setta__/bootstrap to mint one.",
        );
      }
      await page.goto(
        `${BACKEND_ORIGIN}/__setta__/bootstrap#token=${BOOTSTRAP_TOKEN}`,
      );
      await waitForProjectUrl(page);
      await page.waitForSelector(READY_SELECTOR, { timeout: 30000 });
    }

    await context.storageState({ path: STORAGE_STATE_PATH });
  } finally {
    await browser.close();
  }
}
