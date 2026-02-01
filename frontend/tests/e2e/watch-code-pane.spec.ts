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

const MIN_EXPECTED_PADDING = 12;

test("watch code pane has right padding and visible toggle button", async ({
  page,
}) => {
  await setOverviewTab(page, "WatchCode");
  await ensureAppReady(page);

  const heading = page.getByRole("heading", { name: "Watch Code" });
  await expect(heading).toBeVisible();

  const paneRoot = heading.locator("xpath=following-sibling::*[1]");
  await expect(paneRoot).toBeVisible();

  const paddingRight = await paneRoot.evaluate((el) =>
    Number.parseFloat(getComputedStyle(el).paddingRight),
  );
  expect(paddingRight).toBeGreaterThanOrEqual(MIN_EXPECTED_PADDING);

  const toggleButton = page.getByRole("button", {
    name: /Enable Watch Code|Disable Watch Code/,
  });
  await expect(toggleButton).toBeVisible();

  const [paneBox, buttonBox] = await Promise.all([
    paneRoot.boundingBox(),
    toggleButton.boundingBox(),
  ]);
  if (!paneBox || !buttonBox) {
    throw new Error("Expected watch code pane and toggle button to be visible.");
  }
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(
    paneBox.x + paneBox.width,
  );
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
  await page.goto(`${BACKEND_ORIGIN}/__setta__/bootstrap#token=${BOOTSTRAP_TOKEN}`);
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
