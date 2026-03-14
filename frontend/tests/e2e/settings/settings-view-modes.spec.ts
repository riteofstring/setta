import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady, postBackend, seedLocalStorage } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

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
  expect(await getMiniMapNodeCount(page)).toBe(13);
  await waitForOverviewCount(page, 13);

  const paramZoom = await getViewportScale(page);
  expect(paramZoom).toBeGreaterThan(allZoom);
  expect(coreZoom).toBeGreaterThan(paramZoom);
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

test("settings shells stay promoted before the first wheel interaction", async ({
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
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-viewport-shell-promotable="true"]')
        .length > 0,
  );

  await page.evaluate(() => {
    type InteractionObserver = {
      disconnect: () => void;
      snapshot: () => {
        affectedSectionCount: number;
        firstShellBackfaceVisibility: string;
        firstShellIsolation: string;
        firstShellTransform: string;
        sectionClassMutations: number;
        sectionStyleMutations: number;
      };
    };
    const win = window as Window & {
      __settaViewportInteractionObserver?: InteractionObserver;
    };
    win.__settaViewportInteractionObserver?.disconnect();

    const root = document.querySelector(".react-flow");
    const shells = Array.from(
      document.querySelectorAll('[data-viewport-shell-promotable="true"]'),
    );
    if (!(root instanceof HTMLElement) || shells.length === 0) {
      throw new Error("Missing React Flow root or promotable shells.");
    }

    let sectionStyleMutations = 0;
    let sectionClassMutations = 0;
    const affectedSectionIds = new Set<string>();
    const shellObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type !== "attributes") {
          continue;
        }
        const target = record.target;
        if (!(target instanceof HTMLElement)) {
          continue;
        }
        if (record.attributeName === "style") {
          sectionStyleMutations += 1;
        }
        if (record.attributeName === "class") {
          sectionClassMutations += 1;
        }
        const sectionId = target.getAttribute("data-section-id");
        if (sectionId) {
          affectedSectionIds.add(sectionId);
        }
      }
    });

    const firstShell = shells[0];
    if (!(firstShell instanceof HTMLElement)) {
      throw new Error("Missing first promotable shell.");
    }
    const firstShellStyle = getComputedStyle(firstShell);
    for (const shell of shells) {
      shellObserver.observe(shell, {
        attributes: true,
        attributeFilter: ["style", "class"],
      });
    }

    win.__settaViewportInteractionObserver = {
      disconnect() {
        shellObserver.disconnect();
      },
      snapshot() {
        return {
          firstShellBackfaceVisibility: firstShellStyle.backfaceVisibility,
          firstShellIsolation: firstShellStyle.isolation,
          firstShellTransform: firstShellStyle.transform,
          sectionStyleMutations,
          sectionClassMutations,
          affectedSectionCount: affectedSectionIds.size,
        };
      },
    };
  });

  const renderer = page.locator(".react-flow__renderer");
  const box = await renderer.boundingBox();
  if (!box) {
    throw new Error("Missing renderer bounds for wheel interaction.");
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(50);

  const interactionResult = await page.evaluate(() => {
    type InteractionObserver = {
      disconnect: () => void;
      snapshot: () => {
        affectedSectionCount: number;
        firstShellBackfaceVisibility: string;
        firstShellIsolation: string;
        firstShellTransform: string;
        sectionClassMutations: number;
        sectionStyleMutations: number;
      };
    };
    const win = window as Window & {
      __settaViewportInteractionObserver?: InteractionObserver;
    };
    const observer = win.__settaViewportInteractionObserver;
    if (!observer) {
      throw new Error("Missing viewport interaction observer.");
    }
    const snapshot = observer.snapshot();
    observer.disconnect();
    delete win.__settaViewportInteractionObserver;
    return snapshot;
  });

  expect(interactionResult.firstShellBackfaceVisibility).toBe("hidden");
  expect(interactionResult.firstShellIsolation).toBe("isolate");
  expect(interactionResult.firstShellTransform).not.toBe("none");
  expect(interactionResult.sectionStyleMutations).toBe(0);
  expect(interactionResult.sectionClassMutations).toBe(0);
  expect(interactionResult.affectedSectionCount).toBe(0);
});

test("settings can mount the experimental canvas engine host", async ({
  page,
}) => {
  await ensureAppReady(page);
  await seedLocalStorage(page, { useCanvasEngineV1: true });
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const host = page.locator('[data-canvas-engine-host="v1"]');
  await expect(host).toBeVisible();
  await expect(page.locator(".react-flow")).toHaveCount(0);
  await expect
    .poll(async () => {
      const value = await host.getAttribute("data-canvas-engine-rect-count");
      return Number(value);
    })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => {
      return (
        (await host.getAttribute("data-canvas-engine-active-backend")) ?? ""
      );
    })
    .toMatch(/webgl2|webgpu/);
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const islands = Array.from(
          document.querySelectorAll("[data-canvas-engine-dom-island]"),
        );
        return islands.some((candidate) => {
          if (!(candidate instanceof HTMLElement)) {
            return false;
          }
          const rect = candidate.getBoundingClientRect();
          return (
            rect.width >= 40 &&
            rect.height >= 40 &&
            rect.right > 80 &&
            rect.bottom > 40 &&
            rect.left < window.innerWidth &&
            rect.top < window.innerHeight
          );
        });
      });
    })
    .toBe(true);
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
