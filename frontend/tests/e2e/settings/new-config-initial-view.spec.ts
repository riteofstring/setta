import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

import { ensureAppReady } from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);
const HOME_URL = new URL("/home", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
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
