import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady, postBackend } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

test("settings view tabs filter sections and minimap", async ({ page }) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const coreTab = page.getByRole("button", { name: "Core", exact: true });
  await expect(coreTab).toBeVisible();
  await coreTab.click();
  await waitForNodeCount(page, 5);
  expect(await getMiniMapNodeCount(page)).toBe(5);
  await waitForOverviewCount(page, 5);

  const coreZoom = await getViewportScale(page);

  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTab).toBeVisible();
  await allTab.click();
  await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
  await expect(
    page.getByTestId("graph-substrate-canary-section"),
  ).toBeVisible();
  await expect(page.locator(".react-flow__pane")).toHaveCount(0);
  await expect(page.locator(".react-flow__minimap-node")).toHaveCount(0);

  const paramTab = page.getByRole("button", {
    name: "Param Defaults",
    exact: true,
  });
  await expect(paramTab).toBeVisible();
  await paramTab.click();
  await page.waitForSelector(READY_SELECTOR);
  await waitForNodeCount(page, 13);
  expect(await getMiniMapNodeCount(page)).toBe(13);
  await waitForOverviewCount(page, 13);

  const paramZoom = await getViewportScale(page);
  expect(coreZoom).toBeGreaterThan(paramZoom);
});

test("settings graph substrate canary drags one section and persists the top-level layout", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);

  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTab).toBeVisible();
  await allTab.click();

  const canarySection = page.getByTestId("graph-substrate-canary-section");
  await expect(canarySection).toBeVisible();
  await expect(page.locator(".react-flow__pane")).toHaveCount(0);

  const sectionId = await canarySection.getAttribute("data-section-id");
  if (!sectionId) {
    throw new Error("Missing canary section id.");
  }

  const originalLayout =
    initialState.projectState.projectConfig.topLevelSections[sectionId];
  if (!originalLayout) {
    throw new Error(`Missing original layout for section ${sectionId}.`);
  }

  const initialBox = await canarySection.boundingBox();
  if (!initialBox) {
    throw new Error("Missing initial canary section bounds.");
  }

  try {
    const dragStart = await findCanaryDragPoint(page, initialBox);
    const startX = dragStart.x;
    const startY = dragStart.y;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await expect(canarySection).toHaveAttribute("data-dragging", "true");
    await page.mouse.move(startX + 180, startY + 110, { steps: 10 });

    await expect
      .poll(async () => {
        const movedBox = await canarySection.boundingBox();
        if (!movedBox) {
          return 0;
        }
        return Math.hypot(
          movedBox.x - initialBox.x,
          movedBox.y - initialBox.y,
        );
      })
      .toBeGreaterThan(80);

    await page.mouse.up();

    await expect.poll(async () => {
      const latestState = await getLatestProjectState(page, projectConfigId);
      const layout =
        latestState.projectState.projectConfig.topLevelSections[sectionId];
      if (!layout) {
        return false;
      }
      return layout.x !== originalLayout.x || layout.y !== originalLayout.y;
    }).toBe(true);
  } finally {
    await postBackend(page, "/setTopLevelSectionLayout", {
      projectConfigId,
      topLevelSections: initialState.projectState.projectConfig.topLevelSections,
    });
    const initialActiveViewModeId =
      initialState.projectState.projectConfig.activeViewModeId;
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
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

async function getMiniMapNodeCount(page: Page): Promise<number> {
  return page.locator(".react-flow__minimap-node").count();
}

async function getViewportScale(page: Page): Promise<number> {
  return page.evaluate(() => {
    const viewport = document.querySelector(".react-flow__viewport");
    if (!viewport) {
      return 1;
    }
    const transform = window.getComputedStyle(viewport).transform;
    if (!transform || transform === "none") {
      return 1;
    }
    const matrix = new DOMMatrixReadOnly(transform);
    if (!Number.isFinite(matrix.a) || matrix.a <= 0) {
      return 1;
    }
    return matrix.a;
  });
}

async function findCanaryDragPoint(
  page: Page,
  box: BoundingBox,
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate((bounds) => {
    const blockingSelector =
      ".nodrag,input,textarea,select,option,a,[contenteditable='true']";
    const xs = [0.2, 0.35, 0.5, 0.65, 0.8];
    const ys = [0.12, 0.2, 0.3, 0.45, 0.6];
    for (const yPct of ys) {
      for (const xPct of xs) {
        const x = bounds.x + bounds.width * xPct;
        const y = bounds.y + bounds.height * yPct;
        const element = document.elementFromPoint(x, y);
        if (!(element instanceof Element)) {
          continue;
        }
        const section = element.closest('[data-testid="graph-substrate-canary-section"]');
        if (!section) {
          continue;
        }
        if (element.closest(blockingSelector)) {
          continue;
        }
        return { x, y };
      }
    }
    return null;
  }, box);
  if (!point) {
    throw new Error("Unable to find a draggable point inside the canary section.");
  }
  return point;
}

type ProjectStateSingleConfigWithCompletedOpIds = {
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
): Promise<ProjectStateSingleConfigWithCompletedOpIds> {
  const payload = await postBackend<ProjectStateSingleConfigWithCompletedOpIds>(
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
  payload: ProjectStateSingleConfigWithCompletedOpIds,
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
  payload: ProjectStateSingleConfigWithCompletedOpIds,
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
  payload: ProjectStateSingleConfigWithCompletedOpIds,
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
