import { expect, test, type Page } from "@playwright/test";
import {
  ensureAppReady,
  getActiveProjectConfigIdFromPageStore,
  postBackend,
} from "../helpers";
import {
  captureSettingsGraphLaneHealthSnapshot,
  findSectionIdByName,
  findViewModeId,
  getLatestProjectState,
  getLocalPaneState,
  normalizeSettingsGraphComparePaneState,
  setLocalPaneState,
  waitForFrontendProjectConfigState,
} from "./graphSubstrateParityProbe";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();

async function waitForInitialSettingsGraphReady(page: Page) {
  await expect
    .poll(
      async () => {
        const snapshot = await page.evaluate(async () => {
          const { useProjectLoading } = await import(
            "/src/state/definitions.ts"
          );
          return {
            canaryRootMounted:
              document.querySelector(
                '[data-testid="graph-substrate-canary"]',
              ) !== null,
            legacyPaneMounted:
              document.querySelector(".react-flow__pane") !== null,
            projectIsLoading: useProjectLoading.getState().projectIsLoading,
          };
        });
        return (
          (snapshot.canaryRootMounted || snapshot.legacyPaneMounted) &&
          snapshot.projectIsLoading === false
        );
      },
      { timeout: 30000 },
    )
    .toBe(true);
}

async function getProjectConfigIdFromBackend(page: Page) {
  return getActiveProjectConfigIdFromPageStore(page);
}

test("settings graph worktree lane health captures the normalized rotaryParamCodeObjDefault canary state", async ({
  page,
}) => {
  test.setTimeout(180000);

  let activePage = page;

  await ensureAppReady(activePage);
  await activePage.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await waitForInitialSettingsGraphReady(activePage);

  const projectConfigId = await getProjectConfigIdFromBackend(activePage);
  const initialState = await getLatestProjectState(activePage, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const initialViewport = initialState.projectState.projectConfig.viewport;
  const initialPaneState = await getLocalPaneState(activePage).catch(
    () => null,
  );
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const targetSectionName = "rotaryParamCodeObjDefault";
  const targetSectionId = findSectionIdByName(initialState, targetSectionName);

  try {
    activePage = await normalizeSettingsGraphComparePaneState(activePage);
    await postBackend(activePage, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(activePage, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    await waitForFrontendProjectConfigState({
      activeViewModeId: allSettingsViewModeId,
      page: activePage,
      viewport: null,
      viewportInitialized: false,
    });
    const laneHealth = await captureSettingsGraphLaneHealthSnapshot({
      expectedSurfaceKind: "canary",
      expectedViewModeName: "All Settings",
      page: activePage,
      projectConfigId,
      requireFitView: true,
      side: "worktree",
      targetSectionName,
    });

    console.info(
      "settings-graph-worktree-lane-health",
      JSON.stringify(
        {
          laneHealth,
          targetSectionId,
          targetSectionName,
        },
        null,
        2,
      ),
    );

    expect(laneHealth.preflight.status).toBe("ok");
    expect(laneHealth.preflight.issues).toEqual([]);
    expect(laneHealth.preflight.targetSectionId).toBe(targetSectionId);
    expect(laneHealth.surfacePresence.canaryRootMounted).toBe(true);
    expect(laneHealth.surfacePresence.legacyPaneMounted).toBe(false);
    expect(laneHealth.targetSectionMetrics?.surfaceKind).toBe("canary");
    expect(laneHealth.targetSectionMetrics?.transform).not.toBeNull();
    expect(laneHealth.targetSectionVisible).toBe(true);
    expect(laneHealth.instrumentation?.mounted).toBe(true);
    expect(
      laneHealth.instrumentation?.mountedSceneSectionCount ?? 0,
    ).toBeGreaterThan(0);
    expect(
      laneHealth.instrumentation?.mountedSectionBodyCount ?? 0,
    ).toBeGreaterThan(0);
  } finally {
    if (initialPaneState) {
      activePage = await setLocalPaneState(activePage, initialPaneState).catch(
        () => activePage,
      );
    }
    await postBackend(activePage, "/setViewport", {
      projectConfigId,
      viewport: initialViewport,
    }).catch(() => {});
    if (initialActiveViewModeId) {
      await postBackend(activePage, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      }).catch(() => {});
    }
  }
});
