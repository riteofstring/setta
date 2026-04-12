import { expect, test, type Page } from "@playwright/test";
import {
  isSettingsGraphDirectOpenReady,
  resolveSettingsGraphDirectOpenPhase,
  type SettingsGraphDirectOpenSnapshot,
} from "components/Pages/Project/graphSubstrate/settingsGraphDirectOpenState";
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
  const timeoutMs = 30000;
  const pollIntervalMs = 500;
  const startTimeMs = Date.now();
  let lastSnapshot: SettingsGraphDirectOpenSnapshot | null = null;

  while (true) {
    const snapshot = await page.evaluate(() => {
      const globalLoadingState = document.querySelector<HTMLElement>(
        '[data-testid="global-app-loading-state"]',
      );
      return {
        appRouterLoadingMounted:
          document.querySelector('[data-testid="app-router-loading-state"]') !==
          null,
        appShellMounted:
          document.querySelector(".setta-titlebar-offset") !== null,
        backendReady:
          globalLoadingState?.dataset.backendReady === undefined
            ? null
            : globalLoadingState.dataset.backendReady === "true",
        globalLoadingMounted: globalLoadingState !== null,
        graphSurfaceMounted:
          document.querySelector(".react-flow__pane") !== null ||
          document.querySelector('[data-testid="graph-substrate-canary"]') !==
            null,
        projectSurfaceLoadingMounted:
          document.querySelector(
            '[data-testid="project-surface-loading-state"]',
          ) !== null,
        settingsContentMounted: document.querySelector("article") !== null,
        settingsLoaded:
          globalLoadingState?.dataset.settingsLoaded === undefined
            ? null
            : globalLoadingState.dataset.settingsLoaded === "true",
      } satisfies SettingsGraphDirectOpenSnapshot;
    });

    const elapsedMs = Date.now() - startTimeMs;
    if (JSON.stringify(snapshot) !== JSON.stringify(lastSnapshot)) {
      console.info(
        "settings-graph-lane-health-direct-open-progress",
        JSON.stringify({
          elapsedMs,
          phase: resolveSettingsGraphDirectOpenPhase(snapshot),
          snapshot,
        }),
      );
      lastSnapshot = snapshot;
    }

    if (isSettingsGraphDirectOpenReady(snapshot)) {
      return;
    }

    if (elapsedMs >= timeoutMs) {
      throw new Error(
        `Timed out waiting for initial settings graph readiness after ${timeoutMs}ms. ${JSON.stringify(
          {
            elapsedMs,
            phase: resolveSettingsGraphDirectOpenPhase(snapshot),
            snapshot,
          },
          null,
          2,
        )}`,
      );
    }

    await page.waitForTimeout(pollIntervalMs);
  }
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
