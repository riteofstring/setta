import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady, loadProjectConfig } from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);
const HOME_URL = new URL("/home", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const CANVAS_SELECTOR = ".setta-gpu-flow-root";

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};

test("new config opens with initial section in view", async ({ page }) => {
  await ensureAppReady(page);

  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New Project" }).click();
  await page.waitForSelector(READY_SELECTOR);

  const projectState = await loadProjectConfig(page);
  const generatedSectionId = projectState.singletonSections.GenPythonCode;
  if (!generatedSectionId) {
    throw new Error(
      "Expected new project to include generated python section.",
    );
  }

  const canvas = page.locator(CANVAS_SELECTOR);
  const section = canvas
    .locator(`.setta-gpu-flow__node[data-id="${generatedSectionId}"]`)
    .first();
  await expect(section).toBeVisible();

  await expect
    .poll(async () => {
      const canvasBox = await canvas.boundingBox();
      const sectionBox = await section.boundingBox();
      if (!canvasBox || !sectionBox) {
        return false;
      }
      const centerX = sectionBox.x + sectionBox.width / 2;
      const centerY = sectionBox.y + sectionBox.height / 2;
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
