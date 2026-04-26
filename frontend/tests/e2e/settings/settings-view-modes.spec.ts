import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady, postBackend } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const HOME_URL = new URL("/home", BASE_URL).toString();
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".canvas-flow__canvas";

test("settings core view stays populated when opened from home", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  await page.getByTestId("home-left-rail-settings-link").click();
  await page.waitForURL("**/settings");
  await page.waitForSelector(READY_SELECTOR);

  const shortcutsNode = page
    .locator('.react-flow__node[data-id="settings-section__shortcuts"]')
    .first();
  const guiNode = page
    .locator('.react-flow__node[data-id="settings-section__gui"]')
    .first();

  await expect(shortcutsNode).toBeVisible();
  await expect(guiNode).toBeVisible();
  await waitForNodeCount(page, 5);
  await expect
    .poll(async () => page.locator(".react-flow__node").count(), {
      timeout: 1500,
    })
    .toBe(5);
  await expect
    .poll(async () => shortcutsNode.isVisible(), {
      timeout: 1500,
    })
    .toBe(true);
});

test("settings view tabs filter sections and refit the viewport", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const coreTab = page.getByRole("button", { name: "Core", exact: true });
  await expect(coreTab).toBeVisible();
  await coreTab.click();
  await waitForNodeCount(page, 5);
  await waitForOverviewCount(page, 5);

  const coreZoom = await getViewportScale(page);

  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTab).toBeVisible();
  await allTab.click();
  await page.waitForFunction(
    (minCount) =>
      document.querySelectorAll(".react-flow__node").length > minCount,
    13,
  );

  const allZoom = await getViewportScale(page);
  expect(coreZoom).toBeGreaterThan(allZoom);

  const paramTab = page.getByRole("button", {
    name: "Param Defaults",
    exact: true,
  });
  await expect(paramTab).toBeVisible();
  await paramTab.click();
  await waitForNodeCount(page, 13);
  await waitForOverviewCount(page, 13);

  const paramZoom = await getViewportScale(page);
  expect(paramZoom).toBeGreaterThan(allZoom);
});

test("settings view modes keep visible sections when layout payload is partial", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const viewModeId = findViewModeId(initialState, "Param Defaults");
  await postBackend(page, "/setActiveViewMode", {
    projectConfigId,
    activeViewModeId: viewModeId,
  });
  const paramState = await getLatestProjectState(page, projectConfigId);
  await applyProjectStateUpdate(page, paramState);

  const coreSectionNames = new Set([
    "shortcuts",
    "gui",
    "backend",
    "sectionSizingPolicy",
    "languageServer",
  ]);
  const coreLayout = buildLayoutSubset(paramState, coreSectionNames);
  await postBackend(page, "/setTopLevelSectionLayout", {
    projectConfigId,
    topLevelSections: coreLayout,
  });
  const corruptedState = await getLatestProjectState(page, projectConfigId);
  await applyProjectStateUpdate(page, corruptedState);

  const paramTab = page.getByRole("button", {
    name: "Param Defaults",
    exact: true,
  });
  await expect(paramTab).toBeVisible();
  await paramTab.click();
  await waitForNodeCount(page, 13);
  await waitForOverviewCount(page, 13);
});

async function waitForNodeCount(page: Page, expected: number): Promise<void> {
  await page.waitForFunction(
    (count) => document.querySelectorAll(".react-flow__node").length === count,
    expected,
  );
}

async function waitForOverviewCount(
  page: Page,
  expected: number,
): Promise<void> {
  await setOverviewTab(page, "Overview");
  await page.waitForFunction(
    (count) => document.querySelectorAll("#OverviewPane li").length === count,
    expected,
  );
}

async function getViewportScale(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const { useReactFlow } = await import(
      "/src/forks/xyflow/core/store/index.ts"
    );
    const zoom = useReactFlow.getState().transform[2];
    return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  });
}

type ProjectStateSingleConfigWithCompletedOpIDs = {
  projectState: {
    projectConfig: {
      topLevelSections: Record<string, { x: number; y: number }>;
      viewModes: Record<string, { id: string; name: string }>;
    };
    sections: Record<string, { name: string }>;
  };
  completedOpIds: Array<string>;
  pendingOpIds: Array<string>;
};

async function getLatestProjectState(
  page: Page,
  projectConfigId: string,
): Promise<ProjectStateSingleConfigWithCompletedOpIDs> {
  const payload = await postBackend<ProjectStateSingleConfigWithCompletedOpIDs>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  if (!payload) {
    throw new Error("Missing project state payload.");
  }
  return payload;
}

function findViewModeId(
  payload: ProjectStateSingleConfigWithCompletedOpIDs,
  name: string,
): string {
  for (const viewMode of Object.values(
    payload.projectState.projectConfig.viewModes,
  )) {
    if (viewMode.name === name) {
      return viewMode.id;
    }
  }
  throw new Error(`Missing view mode ${name}`);
}

function buildLayoutSubset(
  payload: ProjectStateSingleConfigWithCompletedOpIDs,
  allowedNames: Set<string>,
): Record<string, { x: number; y: number }> {
  const { sections, projectConfig } = payload.projectState;
  const layouts: Record<string, { x: number; y: number }> = {};
  for (const [sectionId, section] of Object.entries(sections)) {
    if (!allowedNames.has(section.name)) {
      continue;
    }
    const layout = projectConfig.topLevelSections[sectionId];
    if (!layout) {
      continue;
    }
    layouts[sectionId] = { x: layout.x, y: layout.y };
  }
  if (Object.keys(layouts).length === 0) {
    throw new Error("Failed to build layout subset.");
  }
  return layouts;
}

async function applyProjectStateUpdate(
  page: Page,
  payload: ProjectStateSingleConfigWithCompletedOpIDs,
): Promise<void> {
  await page.evaluate(async (stateUpdate) => {
    const mod = await import("/src/state/actions/sectionInfos");
    mod.processProjectStateUpdateFromBackend(stateUpdate);
  }, payload);
}

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

type ProjectConfigIdResponse = {
  projectConfig: { id: string };
};

async function getProjectConfigIdFromBackend(page: Page): Promise<string> {
  const pathParts = new URL(page.url()).pathname.split("/").filter(Boolean);
  const projectConfigName = pathParts[0] ?? "settings";
  const response = await postBackend<ProjectConfigIdResponse>(
    page,
    "/loadProjectConfig",
    { projectConfigName },
  );
  if (!response?.projectConfig?.id) {
    throw new Error("Missing projectConfig id from backend.");
  }
  return response.projectConfig.id;
}
