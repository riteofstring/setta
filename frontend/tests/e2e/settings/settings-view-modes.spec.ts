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
  await expect
    .poll(() => page.getByTestId("graph-substrate-canary-section").count())
    .toBeGreaterThan(1);
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

  const canarySections = page.getByTestId("graph-substrate-canary-section");
  await expect.poll(() => canarySections.count()).toBeGreaterThan(1);
  const draggableSection = await findDraggableCanarySection(page);
  const canarySection = canarySections.nth(draggableSection.index);
  const stationarySection =
    draggableSection.index === 0
      ? canarySections.nth(1)
      : canarySections.first();
  await expect(stationarySection).toBeVisible();
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
  const stationaryBox = await stationarySection.boundingBox();
  if (!initialBox || !stationaryBox) {
    throw new Error("Missing initial multi-section canary bounds.");
  }

  try {
    const startX = draggableSection.point.x;
    const startY = draggableSection.point.y;
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
        return Math.hypot(movedBox.x - initialBox.x, movedBox.y - initialBox.y);
      })
      .toBeGreaterThan(80);

    await expect
      .poll(async () => {
        const latestStationaryBox = await stationarySection.boundingBox();
        if (!latestStationaryBox) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.hypot(
          latestStationaryBox.x - stationaryBox.x,
          latestStationaryBox.y - stationaryBox.y,
        );
      })
      .toBeLessThan(10);

    await page.mouse.up();

    await expect
      .poll(async () => {
        const latestState = await getLatestProjectState(page, projectConfigId);
        const layout =
          latestState.projectState.projectConfig.topLevelSections[sectionId];
        if (!layout) {
          return false;
        }
        return layout.x !== originalLayout.x || layout.y !== originalLayout.y;
      })
      .toBe(true);
  } finally {
    await postBackend(page, "/setTopLevelSectionLayout", {
      projectConfigId,
      topLevelSections:
        initialState.projectState.projectConfig.topLevelSections,
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

test("settings graph substrate canary pans and zooms one section on the custom surface", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTab).toBeVisible();
  await allTab.click();

  const canaryPane = page.getByTestId("graph-substrate-canary");
  const canarySections = page.getByTestId("graph-substrate-canary-section");
  await expect.poll(() => canarySections.count()).toBeGreaterThan(1);
  const firstSection = canarySections.first();
  const secondSection = canarySections.nth(1);
  await expect(canaryPane).toBeVisible();
  await expect(firstSection).toBeVisible();
  await expect(secondSection).toBeVisible();
  await expect(page.locator(".react-flow__pane")).toHaveCount(0);

  const initialScale = await getCanaryViewportScale(page);
  const initialFirstBox = await firstSection.boundingBox();
  const initialSecondBox = await secondSection.boundingBox();
  const paneBox = await canaryPane.boundingBox();
  if (!initialFirstBox || !initialSecondBox || !paneBox) {
    throw new Error(
      "Missing multi-section canary bounds for pan and zoom test.",
    );
  }

  const panStart = findCanaryPanePoint(paneBox, initialFirstBox);
  await page.mouse.move(panStart.x, panStart.y);
  await page.mouse.down();
  await page.mouse.move(panStart.x + 140, panStart.y + 90, { steps: 10 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const movedBox = await firstSection.boundingBox();
      if (!movedBox) {
        return 0;
      }
      return Math.hypot(
        movedBox.x - initialFirstBox.x,
        movedBox.y - initialFirstBox.y,
      );
    })
    .toBeGreaterThan(80);

  await expect
    .poll(async () => {
      const movedBox = await secondSection.boundingBox();
      if (!movedBox) {
        return 0;
      }
      return Math.hypot(
        movedBox.x - initialSecondBox.x,
        movedBox.y - initialSecondBox.y,
      );
    })
    .toBeGreaterThan(80);

  const movedFirstBox = await firstSection.boundingBox();
  if (!movedFirstBox) {
    throw new Error("Missing moved canary section bounds.");
  }

  const zoomStart = findCanaryPanePoint(paneBox, movedFirstBox);
  await page.mouse.move(zoomStart.x, zoomStart.y);
  await page.mouse.wheel(0, -240);

  await expect
    .poll(() => getCanaryViewportScale(page))
    .toBeGreaterThan(initialScale * 1.15);
  await expect
    .poll(async () => {
      const zoomedBox = await firstSection.boundingBox();
      return zoomedBox?.width ?? 0;
    })
    .toBeGreaterThan(initialFirstBox.width * 1.05);
  await expect
    .poll(async () => {
      const zoomedBox = await secondSection.boundingBox();
      return zoomedBox?.width ?? 0;
    })
    .toBeGreaterThan(initialSecondBox.width * 1.05);
});

test("settings graph substrate canary keeps title editing working after pan and zoom", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTab).toBeVisible();
  await allTab.click();

  const canaryPane = page.getByTestId("graph-substrate-canary");
  const canarySections = page.getByTestId("graph-substrate-canary-section");
  await expect.poll(() => canarySections.count()).toBeGreaterThan(1);
  const canarySection = canarySections.first();
  await expect(canaryPane).toBeVisible();
  await expect(canarySection).toBeVisible();
  await expect(page.locator(".react-flow__pane")).toHaveCount(0);

  const sectionId = await canarySection.getAttribute("data-section-id");
  if (!sectionId) {
    throw new Error("Missing canary section id.");
  }

  const title = canarySection.locator("header p").first();
  const originalTitle = (await title.textContent())?.trim();
  if (!originalTitle) {
    throw new Error("Missing original canary section title.");
  }

  const initialScale = await getCanaryViewportScale(page);
  const initialBox = await canarySection.boundingBox();
  const paneBox = await canaryPane.boundingBox();
  if (!initialBox || !paneBox) {
    throw new Error("Missing canary bounds for title edit test.");
  }

  const panStart = findCanaryPanePoint(paneBox, initialBox);
  await page.mouse.move(panStart.x, panStart.y);
  await page.mouse.down();
  await page.mouse.move(panStart.x + 120, panStart.y + 80, { steps: 10 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const movedBox = await canarySection.boundingBox();
      if (!movedBox) {
        return 0;
      }
      return Math.hypot(movedBox.x - initialBox.x, movedBox.y - initialBox.y);
    })
    .toBeGreaterThan(60);

  const movedBox = await canarySection.boundingBox();
  if (!movedBox) {
    throw new Error("Missing moved canary bounds for title edit test.");
  }

  const zoomStart = findCanaryPanePoint(paneBox, movedBox);
  await page.mouse.move(zoomStart.x, zoomStart.y);
  await page.mouse.wheel(0, -180);

  await expect
    .poll(() => getCanaryViewportScale(page))
    .toBeGreaterThan(initialScale * 1.08);

  const renamedTitle = `${originalTitle} canary title`;

  try {
    // The canary must preserve DOM title editing after custom viewport motion.
    await title.dblclick();

    const titleInput = canarySection.locator("header input").first();
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toBeFocused();
    await titleInput.fill(renamedTitle);
    await titleInput.press("Enter");

    await expect
      .poll(async () => {
        const latestState = await getLatestProjectState(page, projectConfigId);
        return latestState.projectState.sections[sectionId]?.name ?? null;
      })
      .toBe(renamedTitle);

    await expect(canarySection.locator("header p").first()).toHaveText(
      renamedTitle,
    );
  } finally {
    await postBackend(page, "/setSectionName", {
      projectConfigId,
      sectionId,
      name: originalTitle,
    });
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

async function getCanaryViewportScale(page: Page): Promise<number> {
  return page.evaluate(() => {
    const viewport = document.querySelector(
      '[data-testid="graph-substrate-canary-viewport"]',
    );
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

async function findDraggableCanarySection(page: Page): Promise<{
  index: number;
  point: { x: number; y: number };
}> {
  const draggable = await page.evaluate(() => {
    const blockingSelector =
      ".nodrag,input,textarea,select,option,a,[contenteditable='true']";
    const xs = [0.2, 0.35, 0.5, 0.65, 0.8];
    const ys = [0.12, 0.2, 0.3, 0.45, 0.6];
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="graph-substrate-canary-section"]',
      ),
    );
    for (const [index, section] of sections.entries()) {
      const bounds = section.getBoundingClientRect();
      for (const yPct of ys) {
        for (const xPct of xs) {
          const x = bounds.x + bounds.width * xPct;
          const y = bounds.y + bounds.height * yPct;
          const element = document.elementFromPoint(x, y);
          if (!(element instanceof Element)) {
            continue;
          }
          if (element.closest(blockingSelector)) {
            continue;
          }
          const resolvedSection = element.closest<HTMLElement>(
            '[data-testid="graph-substrate-canary-section"]',
          );
          if (!resolvedSection || resolvedSection !== section) {
            continue;
          }
          return { index, point: { x, y } };
        }
      }
    }
    return null;
  });

  if (!draggable) {
    throw new Error("Unable to find a draggable canary section.");
  }
  return draggable;
}

function findCanaryPanePoint(
  containerBox: BoundingBox,
  sectionBox: BoundingBox,
): { x: number; y: number } {
  const containerRight = containerBox.x + containerBox.width;
  const containerBottom = containerBox.y + containerBox.height;
  const sectionRight = sectionBox.x + sectionBox.width;
  const sectionBottom = sectionBox.y + sectionBox.height;
  const candidates: Array<{ x: number; y: number } | null> = [
    sectionBox.y - containerBox.y > 24
      ? {
          x: sectionBox.x + sectionBox.width / 2,
          y: sectionBox.y - Math.min(24, (sectionBox.y - containerBox.y) / 2),
        }
      : null,
    containerBottom - sectionBottom > 24
      ? {
          x: sectionBox.x + sectionBox.width / 2,
          y:
            sectionBottom + Math.min(24, (containerBottom - sectionBottom) / 2),
        }
      : null,
    sectionBox.x - containerBox.x > 24
      ? {
          x: sectionBox.x - Math.min(24, (sectionBox.x - containerBox.x) / 2),
          y: sectionBox.y + sectionBox.height / 2,
        }
      : null,
    containerRight - sectionRight > 24
      ? {
          x: sectionRight + Math.min(24, (containerRight - sectionRight) / 2),
          y: sectionBox.y + sectionBox.height / 2,
        }
      : null,
  ];
  const point = candidates.find((candidate) => candidate !== null);
  if (!point) {
    throw new Error("Unable to find a pan or zoom point on the canary pane.");
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
