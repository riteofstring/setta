import { expect, test, type Page } from "@playwright/test";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const AUTH_COOKIE_PREFIX = process.env.SETTA_AUTH_COOKIE_NAME ?? "setta_auth";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);
const HOME_URL = new URL("/home", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const READY_TIMEOUT_MS = 30000;
const CANVAS_SELECTOR = ".react-flow";

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};

test("new config opens with initial section in view", async ({ page }) => {
  await ensureAppReady(page);

  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New Config" }).click();
  await page.waitForSelector(READY_SELECTOR);

  const canvas = page.locator(CANVAS_SELECTOR);
  const header = canvas.getByText(/generated python code/i).first();
  await expect(header).toBeVisible();

  await expect
    .poll(async () => {
      const canvasBox = await canvas.boundingBox();
      const headerBox = await header.boundingBox();
      if (!canvasBox || !headerBox) {
        return false;
      }
      const centerX = headerBox.x + headerBox.width / 2;
      const centerY = headerBox.y + headerBox.height / 2;
      return (
        centerX >= canvasBox.x &&
        centerX <= canvasBox.x + canvasBox.width &&
        centerY >= canvasBox.y &&
        centerY <= canvasBox.y + canvasBox.height
      );
    })
    .toBe(true);

  const projectConfigName = getProjectConfigName(page.url(), PROJECT_URL);
  if (projectConfigName) {
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

async function ensureAppReady(page: Page): Promise<void> {
  await page.goto(PROJECT_URL, { waitUntil: "domcontentloaded" });
  if (await isAppReady(page)) {
    return;
  }

  const hasCookie = await hasAuthCookie(page);
  if (!hasCookie && BOOTSTRAP_TOKEN) {
    await page.goto(
      `${BACKEND_ORIGIN}/__setta__/bootstrap#token=${BOOTSTRAP_TOKEN}`,
    );
    try {
      await waitForProjectUrl(page);
    } catch {
      // Fall through to final readiness check.
    }
  }

  await page.goto(PROJECT_URL, { waitUntil: "domcontentloaded" });
  if (await isAppReady(page)) {
    return;
  }

  if (!BOOTSTRAP_TOKEN && !hasCookie) {
    throw new Error(
      "Missing SETTA_BOOTSTRAP_TOKEN and no auth cookie present. Open /__setta__/bootstrap to mint one.",
    );
  }
  throw new Error("Setta UI did not become ready. Check bootstrap auth.");
}

async function isAppReady(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector(READY_SELECTOR, { timeout: READY_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

async function waitForProjectUrl(page: Page): Promise<void> {
  await page.waitForURL(
    (url) => url.toString().startsWith(PROJECT_URL),
    { timeout: READY_TIMEOUT_MS, waitUntil: "domcontentloaded" },
  );
}

async function hasAuthCookie(page: Page): Promise<boolean> {
  const cookies = await page
    .context()
    .cookies([PROJECT_URL, BACKEND_ORIGIN]);
  return cookies.some(
    (cookie) =>
      cookie.name === AUTH_COOKIE_PREFIX ||
      cookie.name.startsWith(`${AUTH_COOKIE_PREFIX}_`),
  );
}

function getProjectConfigName(pageUrl: string, baseUrl: string): string {
  const pagePath = new URL(pageUrl).pathname;
  const basePath = new URL(baseUrl).pathname;
  let relativePath = pagePath;

  if (basePath !== "/") {
    const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
    if (relativePath.startsWith(normalizedBase)) {
      relativePath = relativePath.slice(normalizedBase.length);
    } else if (relativePath.startsWith(basePath)) {
      relativePath = relativePath.slice(basePath.length);
    }
  }

  relativePath = relativePath.replace(/^\/+/, "");
  return decodeURIComponent(relativePath);
}

async function deleteProjectConfigByName(
  page: Page,
  projectConfigName: string,
): Promise<void> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }
  const match = metadata.projectMetadata.find(
    (entry) => entry.name === projectConfigName,
  );
  if (!match) {
    throw new Error(
      `Unable to resolve project config id for ${projectConfigName}.`,
    );
  }
  await postBackend(page, "/deleteProjectConfigs", { ids: [match.id] });
}

async function postBackend<T>(
  page: Page,
  path: string,
  payload: Record<string, unknown> | null,
): Promise<T | null> {
  const response = await page.request.post(`${BACKEND_ORIGIN}/api${path}`, {
    data: payload,
  });
  const text = await response.text();
  if (!response.ok()) {
    const detail = text ? ` ${text}` : "";
    throw new Error(
      `Backend request failed (${response.status()}): ${path}${detail}`,
    );
  }
  if (!text) {
    return null;
  }
  return JSON.parse(text) as T;
}
