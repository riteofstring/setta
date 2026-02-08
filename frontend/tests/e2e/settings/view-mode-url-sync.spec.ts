import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

import { ensureAppReady } from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const READY_SELECTOR = ".react-flow__pane";

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};

test("view mode selection updates url on /view route", async ({ page }) => {
  await ensureAppReady(page);
  await setOverviewTab(page, "ViewModes");

  const { projectConfigId, projectConfigName } =
    await resolveProjectConfigInfo(page);
  const suffix = Date.now().toString(36);
  const viewNames = [`view_alpha_${suffix}`, `view_beta_${suffix}`];

  const firstViewId = await createNamedViewMode(
    page,
    projectConfigId,
    viewNames[0],
  );
  const secondViewId = await createNamedViewMode(
    page,
    projectConfigId,
    viewNames[1],
  );

  const firstViewUrl = `${BASE_URL}/${projectConfigName}/view/${encodeURIComponent(
    viewNames[0],
  )}`;
  await page.goto(firstViewUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const firstViewButton = page.getByRole("button", { name: viewNames[0] });
  const secondViewButton = page.getByRole("button", { name: viewNames[1] });
  await expect(firstViewButton).toBeVisible();
  await expect(secondViewButton).toBeVisible();

  await secondViewButton.click();

  const secondViewUrl = `${BASE_URL}/${projectConfigName}/view/${encodeURIComponent(
    viewNames[1],
  )}`;
  await expect(page).toHaveURL(secondViewUrl);

  await postBackend(page, "/deleteViewMode", {
    projectConfigId,
    viewModeId: firstViewId,
  });
  await postBackend(page, "/deleteViewMode", {
    projectConfigId,
    viewModeId: secondViewId,
  });
});

test("view mode selection keeps encoded project name in url", async ({
  page,
}) => {
  await ensureAppReady(page);
  await setOverviewTab(page, "ViewModes");

  const suffix = Date.now().toString(36);
  const projectNameWithSpaces = `View Mode Sync ${suffix}`;
  const previewImgColor = "bg-blue-500/60 dark:bg-blue-600/30";
  const { projectConfigId } = await createProjectConfig(page, previewImgColor);

  const createdViewModeIds: string[] = [];
  try {
    await setProjectConfigName(page, projectConfigId, projectNameWithSpaces);

    const viewNames = [`view_alpha_${suffix}`, `view_beta_${suffix}`];
    createdViewModeIds.push(
      await createNamedViewMode(page, projectConfigId, viewNames[0]),
    );
    createdViewModeIds.push(
      await createNamedViewMode(page, projectConfigId, viewNames[1]),
    );

    const encodedProjectName = encodeURIComponent(projectNameWithSpaces);
    const firstViewUrl = `${BASE_URL}/${encodedProjectName}/view/${encodeURIComponent(
      viewNames[0],
    )}`;
    await page.goto(firstViewUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);

    const firstViewButton = page.getByRole("button", { name: viewNames[0] });
    const secondViewButton = page.getByRole("button", { name: viewNames[1] });
    await expect(firstViewButton).toBeVisible();
    await expect(secondViewButton).toBeVisible();

    await secondViewButton.click();

    const secondViewUrl = `${BASE_URL}/${encodedProjectName}/view/${encodeURIComponent(
      viewNames[1],
    )}`;
    await expect(page).toHaveURL(secondViewUrl);
  } finally {
    await deleteViewModes(page, projectConfigId, createdViewModeIds);
    await deleteProjectConfig(page, projectConfigId);
  }
});

async function setOverviewTab(page: Page, tabName: string): Promise<void> {
  await page.evaluate((tab) => {
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

async function resolveProjectConfigInfo(
  page: Page,
): Promise<{ projectConfigId: string; projectConfigName: string }> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }

  const currentPath = new URL(page.url()).pathname;
  const projectName = currentPath.split("/").filter(Boolean)[0];
  if (projectName) {
    const match = metadata.projectMetadata.find((p) => p.name === projectName);
    if (match) {
      return { projectConfigId: match.id, projectConfigName: match.name };
    }
  }

  if (metadata.defaultProjectConfigId) {
    const match = metadata.projectMetadata.find(
      (p) => p.id === metadata.defaultProjectConfigId,
    );
    if (match) {
      return { projectConfigId: match.id, projectConfigName: match.name };
    }
  }

  const fallback = metadata.projectMetadata[0];
  if (!fallback) {
    throw new Error("Unable to resolve project config for test.");
  }
  return { projectConfigId: fallback.id, projectConfigName: fallback.name };
}

async function createNamedViewMode(
  page: Page,
  projectConfigId: string,
  name: string,
): Promise<string> {
  const viewModeId = await postBackend<string>(page, "/createViewMode", {
    projectConfigId,
  });
  if (!viewModeId) {
    throw new Error("Missing viewModeId when creating view mode.");
  }
  await postBackend(page, "/setViewModeName", {
    projectConfigId,
    viewModeId,
    name,
  });
  await postBackend(page, "/toggleViewModeTab", {
    projectConfigId,
    viewModeId,
  });
  return viewModeId;
}

async function createProjectConfig(
  page: Page,
  previewImgColor: string,
): Promise<{ projectConfigId: string; projectConfigName: string }> {
  const projectConfigName = await postBackend<string>(
    page,
    "/createProjectConfig",
    { previewImgColor },
  );
  if (!projectConfigName) {
    throw new Error("Missing project config name when creating project config.");
  }

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
    throw new Error("Unable to resolve project config id for new project.");
  }
  return { projectConfigId: match.id, projectConfigName: match.name };
}

async function setProjectConfigName(
  page: Page,
  projectConfigId: string,
  newName: string,
): Promise<void> {
  await postBackend(page, "/setProjectConfigName", {
    projectConfigId,
    newName,
  });
}

async function deleteViewModes(
  page: Page,
  projectConfigId: string,
  viewModeIds: string[],
): Promise<void> {
  for (const viewModeId of viewModeIds) {
    await postBackend(page, "/deleteViewMode", {
      projectConfigId,
      viewModeId,
    });
  }
}

async function deleteProjectConfig(
  page: Page,
  projectConfigId: string,
): Promise<void> {
  await postBackend(page, "/deleteProjectConfigs", {
    ids: [projectConfigId],
  });
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
    throw new Error(`Backend request failed (${response.status()}): ${path}${detail}`);
  }
  if (!text) {
    return null;
  }
  return JSON.parse(text) as T;
}
