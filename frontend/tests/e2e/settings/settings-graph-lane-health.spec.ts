import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady, postBackend } from "../helpers";
import {
  applyProjectStateUpdate,
  captureSettingsGraphLaneHealthSnapshot,
  findSectionIdByName,
  findViewModeId,
  getLatestProjectState,
  getLocalPaneState,
  normalizeSettingsGraphComparePaneState,
  setLocalPaneState,
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
  const pathParts = new URL(page.url()).pathname.split("/").filter(Boolean);
  const projectConfigName = pathParts[0] ?? "settings";
  const payload = await postBackend<{
    projectConfig?: { id?: string | null } | null;
  }>(page, "/loadProjectConfig", { projectConfigName });
  const projectConfigId = payload?.projectConfig?.id;
  if (!projectConfigId) {
    throw new Error("Missing projectConfig id from backend.");
  }
  return projectConfigId;
}

test("settings graph worktree lane health captures the normalized rotaryParamCodeObjDefault canary state", async ({
  page,
}) => {
  test.setTimeout(180000);

  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await waitForInitialSettingsGraphReady(page);

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const initialViewport = initialState.projectState.projectConfig.viewport;
  const initialPaneState = await getLocalPaneState(page).catch(() => null);
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const targetSectionName = "rotaryParamCodeObjDefault";
  const targetSectionId = findSectionIdByName(initialState, targetSectionName);

  try {
    await normalizeSettingsGraphComparePaneState(page);
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const normalizedState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, normalizedState);

    const laneHealth = await captureSettingsGraphLaneHealthSnapshot({
      expectedSurfaceKind: "canary",
      expectedViewModeName: "All Settings",
      page,
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
      await setLocalPaneState(page, initialPaneState).catch(() => {});
    }
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialViewport,
    }).catch(() => {});
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      }).catch(() => {});
    }
  }
});
