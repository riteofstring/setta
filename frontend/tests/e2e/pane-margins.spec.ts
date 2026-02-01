import { expect, test, type Locator, type Page } from "@playwright/test";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);

const MIN_PADDING_PX = 8;
const MAX_PADDING_PX = 12;
const MIN_LEFT_PADDING_PX = 34;
const MAX_LEFT_PADDING_PX = 38;
const MIN_RIGHT_PADDING_PX = 26;
const MAX_RIGHT_PADDING_PX = 30;

test("overview and ui editor panes use reduced padding", async ({ page }) => {
  await setPaneState(page);
  await ensureAppReady(page);

  const overviewPane = page.locator("#OverviewPane aside").first();
  await expect(overviewPane).toBeVisible();
  const overviewPadding = await getPadding(overviewPane);
  expect(overviewPadding.top).toBeGreaterThanOrEqual(MIN_PADDING_PX);
  expect(overviewPadding.top).toBeLessThanOrEqual(MAX_PADDING_PX);
  expect(overviewPadding.left).toBeGreaterThanOrEqual(MIN_LEFT_PADDING_PX);
  expect(overviewPadding.left).toBeLessThanOrEqual(MAX_LEFT_PADDING_PX);

  const uiEditorPane = page.locator("#UiEditorPane aside").first();
  await expect(uiEditorPane).toBeVisible();
  const uiEditorPadding = await getPadding(uiEditorPane);
  expect(uiEditorPadding.top).toBeGreaterThanOrEqual(MIN_PADDING_PX);
  expect(uiEditorPadding.top).toBeLessThanOrEqual(MAX_PADDING_PX);
  expect(uiEditorPadding.right).toBeGreaterThanOrEqual(MIN_RIGHT_PADDING_PX);
  expect(uiEditorPadding.right).toBeLessThanOrEqual(MAX_RIGHT_PADDING_PX);
});

async function getPadding(locator: Locator): Promise<{
  top: number;
  right: number;
  bottom: number;
  left: number;
}> {
  return locator.evaluate((el) => {
    const styles = getComputedStyle(el);
    return {
      top: Number.parseFloat(styles.paddingTop),
      right: Number.parseFloat(styles.paddingRight),
      bottom: Number.parseFloat(styles.paddingBottom),
      left: Number.parseFloat(styles.paddingLeft),
    };
  });
}

async function setPaneState(page: Page): Promise<void> {
  await page.addInitScript(() => {
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
    payload.state = {
      ...payload.state,
      overviewVis: true,
      overviewTab: "FileBrowser",
      uiEditorVis: true,
    };
    localStorage.setItem(key, JSON.stringify(payload));
  });
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
