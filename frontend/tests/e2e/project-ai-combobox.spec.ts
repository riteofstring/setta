import { expect, test, type Page } from "@playwright/test";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);

test("project ai combobox chevron sizing", async ({ page }) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);

  const overviewPane = page.locator("#OverviewPane");
  await expect(
    overviewPane.getByRole("heading", { name: "Project AI Chat" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Project AI Settings" }).click();

  const engineInput = page.getByPlaceholder("Select an engine");
  await expect(engineInput).toBeVisible();

  const searchWrapper = engineInput.locator("..");
  const toggleButton = searchWrapper.locator("button").first();
  await expect(toggleButton).toBeVisible();

  const inputBox = await engineInput.boundingBox();
  const buttonBox = await toggleButton.boundingBox();
  expect(inputBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  if (!inputBox || !buttonBox) {
    return;
  }

  expect(buttonBox.height).toBeLessThan(inputBox.height * 0.9);
  const inputCenter = inputBox.y + inputBox.height / 2;
  const buttonCenter = buttonBox.y + buttonBox.height / 2;
  expect(Math.abs(buttonCenter - inputCenter)).toBeLessThanOrEqual(2);
});

async function setOverviewTab(page: Page, tabName: string): Promise<void> {
  await page.addInitScript((tab) => {
    const key = "setta_data";
    let payload: { state: Record<string, unknown>; version: number } = {
      state: {},
      version: 0,
    };
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          payload = {
            state:
              typeof parsed.state === "object" && parsed.state
                ? parsed.state
                : {},
            version: typeof parsed.version === "number" ? parsed.version : 0,
          };
        }
      } catch {
        payload = { state: {}, version: 0 };
      }
    }
    payload.state = { ...payload.state, overviewTab: tab, overviewVis: true };
    localStorage.setItem(key, JSON.stringify(payload));
  }, tabName);
}

async function ensureAppReady(page: Page): Promise<void> {
  await page.goto(PROJECT_URL);
  if (await isAppReady(page)) {
    return;
  }
  if (!BOOTSTRAP_TOKEN) {
    throw new Error(
      "Missing SETTA_BOOTSTRAP_TOKEN. Open /__setta__/bootstrap to mint one.",
    );
  }
  await page.goto(
    `${BACKEND_ORIGIN}/__setta__/bootstrap#token=${BOOTSTRAP_TOKEN}`,
  );
  await page.waitForURL(PROJECT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".react-flow__pane");
}

async function isAppReady(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector(".react-flow__pane", { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}
