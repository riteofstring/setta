import { chromium, type FullConfig } from "@playwright/test";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);

async function globalSetup(config: FullConfig) {
  if (!BOOTSTRAP_TOKEN) {
    throw new Error(
      "Missing SETTA_BOOTSTRAP_TOKEN. Open /__setta__/bootstrap to mint one.",
    );
  }
  await waitForBackend(BACKEND_ORIGIN, 60000);
  const storagePath = config.projects[0]?.use?.storageState as string | undefined;
  if (!storagePath) {
    throw new Error("storageState path missing in Playwright config.");
  }
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(
    `${BACKEND_ORIGIN}/__setta__/bootstrap#token=${BOOTSTRAP_TOKEN}`,
  );
  await page.waitForURL(PROJECT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-shell, .app-base");
  await context.storageState({ path: storagePath });
  await browser.close();
}

export default globalSetup;

async function waitForBackend(origin: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin, { method: "GET" });
      if (response.status < 500) {
        return;
      }
      lastError = new Error(`Backend responded with ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for backend: ${String(lastError)}`);
}
