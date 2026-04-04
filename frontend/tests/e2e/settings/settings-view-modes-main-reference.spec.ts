import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  captureSettingsGraphSectionMetrics,
  findSectionIdByName,
  findSettingsGraphPanePoint,
  findViewModeId,
  fitGraphViewportToSection,
  getLocalPaneState,
  normalizeSettingsGraphComparePaneState,
  setLocalPaneState,
  SETTINGS_GRAPH_COMPARE_PANE_STATE,
  type ProjectStateSingleConfigWithCompletedOpIds,
} from "./graphSubstrateParityProbe";

const WORKTREE_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const WORKTREE_BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const WORKTREE_SETTINGS_URL = new URL(
  "/settings",
  WORKTREE_BASE_URL,
).toString();
const MAIN_REFERENCE_FRONTEND_URL =
  process.env.SETTA_MAIN_REFERENCE_FRONTEND_URL ?? "";
const MAIN_REFERENCE_BACKEND_ORIGIN =
  process.env.SETTA_MAIN_REFERENCE_BACKEND_ORIGIN ?? "";
const MAIN_REFERENCE_BOOTSTRAP_URL =
  process.env.SETTA_MAIN_REFERENCE_BOOTSTRAP_URL ?? "";
const READY_SELECTOR = ".react-flow__pane";

type ProjectConfigIdResponse = {
  projectConfig?: { id?: string };
};

type SharedTopLevelSection = {
  name: string;
  referenceSectionId: string;
  worktreeSectionId: string;
};

test("settings graph parity probe applies the same short pan delta on read-only main legacy and worktree canary after normalized fit", async ({
  context,
  page,
}) => {
  test.skip(
    !MAIN_REFERENCE_FRONTEND_URL ||
      !MAIN_REFERENCE_BACKEND_ORIGIN ||
      !MAIN_REFERENCE_BOOTSTRAP_URL,
    "Requires SETTA_MAIN_REFERENCE_FRONTEND_URL, SETTA_MAIN_REFERENCE_BACKEND_ORIGIN, and SETTA_MAIN_REFERENCE_BOOTSTRAP_URL.",
  );

  await page.goto(WORKTREE_SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { exact: true, name: "All Settings" })
    .waitFor();

  const referencePage = await context.newPage();
  await bootstrapReferenceSettingsPage(referencePage);

  const worktreeProjectConfigId = await getProjectConfigIdFromBackendOrigin(
    page,
    WORKTREE_BACKEND_ORIGIN,
    WORKTREE_BASE_URL,
  );
  const referenceProjectConfigId = await getProjectConfigIdFromBackendOrigin(
    referencePage,
    MAIN_REFERENCE_BACKEND_ORIGIN,
    MAIN_REFERENCE_FRONTEND_URL,
  );
  const worktreeInitialState = await getLatestProjectStateFromBackendOrigin(
    page,
    WORKTREE_BACKEND_ORIGIN,
    WORKTREE_BASE_URL,
    worktreeProjectConfigId,
  );
  const referenceInitialState = await getLatestProjectStateFromBackendOrigin(
    referencePage,
    MAIN_REFERENCE_BACKEND_ORIGIN,
    MAIN_REFERENCE_FRONTEND_URL,
    referenceProjectConfigId,
  );
  const worktreeAllSettingsViewModeId = findViewModeId(
    worktreeInitialState,
    "All Settings",
  );
  const referenceAllSettingsViewModeId = findViewModeId(
    referenceInitialState,
    "All Settings",
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const sharedSection = findSharedVisibleTopLevelSectionByName({
    referenceState: referenceInitialState,
    viewModeName: "All Settings",
    worktreeState: worktreeInitialState,
  });
  const panDelta = { x: 140, y: 90 };

  async function captureNamedSectionPanDelta(args: {
    activeViewModeId: string;
    expectedSurfaceKind: "legacy" | "canary";
    sectionId: string;
    sectionName: string;
    targetPage: Page;
    tab: Locator;
  }) {
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.targetPage === page
        ? WORKTREE_BACKEND_ORIGIN
        : MAIN_REFERENCE_BACKEND_ORIGIN,
      args.targetPage === page
        ? WORKTREE_BASE_URL
        : MAIN_REFERENCE_FRONTEND_URL,
      args.targetPage === page
        ? worktreeProjectConfigId
        : referenceProjectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.tab).toBeVisible();
    await args.tab.click();
    if (args.expectedSurfaceKind === "legacy") {
      await args.targetPage.waitForSelector(READY_SELECTOR);
      await expect(
        args.targetPage.getByTestId("graph-substrate-canary"),
      ).toHaveCount(0);
    } else {
      await expect(
        args.targetPage.getByTestId("graph-substrate-canary"),
      ).toBeVisible();
      await expect
        .poll(() =>
          args.targetPage.getByTestId("graph-substrate-canary-section").count(),
        )
        .toBeGreaterThan(1);
    }

    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    expect(
      await fitGraphViewportToSection(args.targetPage, args.sectionId),
    ).toBe(true);

    await expect
      .poll(async () => {
        return (
          await captureSettingsGraphSectionMetrics(
            args.targetPage,
            args.sectionId,
          )
        ).surfaceKind;
      })
      .toBe(args.expectedSurfaceKind);

    const before = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    if (!before.rect || !before.transform) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} pan baseline metrics for ${args.sectionName}.`,
      );
    }

    const panStart = await findSettingsGraphPanePoint(args.targetPage);
    await args.targetPage.mouse.move(panStart.x, panStart.y);
    await args.targetPage.mouse.down();
    await args.targetPage.mouse.move(
      panStart.x + panDelta.x,
      panStart.y + panDelta.y,
      {
        steps: 10,
      },
    );
    await args.targetPage.mouse.up();

    await expect
      .poll(async () => {
        const after = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        if (!after.transform) {
          return 0;
        }
        return Math.hypot(
          after.transform.x - before.transform.x,
          after.transform.y - before.transform.y,
        );
      })
      .toBeGreaterThan(120);

    const after = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    if (!after.rect || !after.transform) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} pan result metrics for ${args.sectionName}.`,
      );
    }

    return {
      paneState: after.paneState,
      rectDelta: {
        x: after.rect.x - before.rect.x,
        y: after.rect.y - before.rect.y,
      },
      transformDelta: {
        x: after.transform.x - before.transform.x,
        y: after.transform.y - before.transform.y,
        zoom: after.transform.zoom - before.transform.zoom,
      },
    };
  }

  try {
    // Live CDP could not honestly drive this cross-worktree motion lane, so
    // this probe normalizes both pages first and uses Playwright as the shared
    // motion driver before later CDP post-state inspection.
    const referencePan = await captureNamedSectionPanDelta({
      activeViewModeId: referenceAllSettingsViewModeId,
      expectedSurfaceKind: "legacy",
      sectionId: sharedSection.referenceSectionId,
      sectionName: sharedSection.name,
      tab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      targetPage: referencePage,
    });
    const worktreePan = await captureNamedSectionPanDelta({
      activeViewModeId: worktreeAllSettingsViewModeId,
      expectedSurfaceKind: "canary",
      sectionId: sharedSection.worktreeSectionId,
      sectionName: sharedSection.name,
      tab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      targetPage: page,
    });

    expect(referencePan.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(worktreePan.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(
      Math.abs(worktreePan.transformDelta.x - referencePan.transformDelta.x),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreePan.transformDelta.y - referencePan.transformDelta.y),
    ).toBeLessThan(8);
    expect(Math.abs(worktreePan.transformDelta.zoom)).toBeLessThan(0.02);
    expect(Math.abs(referencePan.transformDelta.zoom)).toBeLessThan(0.02);
    expect(
      Math.abs(worktreePan.rectDelta.x - referencePan.rectDelta.x),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreePan.rectDelta.y - referencePan.rectDelta.y),
    ).toBeLessThan(8);
  } finally {
    await restoreCurrentPageState({
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      initialPaneState: initialWorktreePaneState,
      initialState: worktreeInitialState,
      page,
      projectConfigId: worktreeProjectConfigId,
    }).catch(() => {});
    await restoreCurrentPageState({
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialPaneState: initialReferencePaneState,
      initialState: referenceInitialState,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
    }).catch(() => {});
    await referencePage.close().catch(() => {});
  }
});

async function bootstrapReferenceSettingsPage(page: Page): Promise<void> {
  await page.goto(MAIN_REFERENCE_BOOTSTRAP_URL, {
    waitUntil: "domcontentloaded",
  });
  await page.goto(
    new URL("/settings", MAIN_REFERENCE_FRONTEND_URL).toString(),
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page
    .getByRole("button", { exact: true, name: "All Settings" })
    .waitFor();
}

async function postBackendForPage<T>(
  page: Page,
  backendOrigin: string,
  frontendOrigin: string,
  path: string,
  payload: Record<string, unknown> | null,
): Promise<T | null> {
  const response = await page.request.post(`${backendOrigin}/api${path}`, {
    data: payload,
    headers: {
      Origin: new URL(frontendOrigin).origin,
      Referer: new URL(frontendOrigin).toString(),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    const detail = text ? ` ${text}` : "";
    throw new Error(
      `Current-page backend request failed (${response.status}): ${path}${detail}`,
    );
  }
  if (!text) {
    return null;
  }
  return JSON.parse(text) as T;
}

async function getProjectConfigIdFromBackendOrigin(
  page: Page,
  backendOrigin: string,
  frontendOrigin: string,
): Promise<string> {
  const pathParts = new URL(page.url()).pathname.split("/").filter(Boolean);
  const projectConfigName = pathParts[0] ?? "settings";
  const response = await postBackendForPage<ProjectConfigIdResponse>(
    page,
    backendOrigin,
    frontendOrigin,
    "/loadProjectConfig",
    { projectConfigName },
  );
  if (!response?.projectConfig?.id) {
    throw new Error("Missing projectConfig id from current-page backend.");
  }
  return response.projectConfig.id;
}

async function getLatestProjectStateFromBackendOrigin(
  page: Page,
  backendOrigin: string,
  frontendOrigin: string,
  projectConfigId: string,
): Promise<ProjectStateSingleConfigWithCompletedOpIds> {
  const payload =
    await postBackendForPage<ProjectStateSingleConfigWithCompletedOpIds>(
      page,
      backendOrigin,
      frontendOrigin,
      "/getLatestProjectState",
      { projectConfigId },
    );
  if (!payload) {
    throw new Error("Missing project state payload from current-page backend.");
  }
  return payload;
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

async function setPageViewModeAndClearViewport(
  page: Page,
  backendOrigin: string,
  frontendOrigin: string,
  projectConfigId: string,
  activeViewModeId: string,
  expectedSurfaceKind: "legacy" | "canary",
): Promise<void> {
  await postBackendForPage(
    page,
    backendOrigin,
    frontendOrigin,
    "/setActiveViewMode",
    {
      activeViewModeId,
      projectConfigId,
    },
  );
  await postBackendForPage(
    page,
    backendOrigin,
    frontendOrigin,
    "/setViewport",
    {
      projectConfigId,
      viewport: null,
    },
  );
  const stateWithoutViewport = await getLatestProjectStateFromBackendOrigin(
    page,
    backendOrigin,
    frontendOrigin,
    projectConfigId,
  );
  await applyProjectStateUpdate(page, stateWithoutViewport);

  if (expectedSurfaceKind === "legacy") {
    await page.waitForSelector(READY_SELECTOR);
  } else {
    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
  }
}

async function restoreCurrentPageState(args: {
  backendOrigin: string;
  frontendOrigin: string;
  initialPaneState: Awaited<ReturnType<typeof getLocalPaneState>>;
  initialState: ProjectStateSingleConfigWithCompletedOpIds;
  page: Page;
  projectConfigId: string;
}): Promise<void> {
  await setLocalPaneState(args.page, args.initialPaneState);
  await setDurableActiveSectionIds(
    args.page,
    args.initialState.projectState.projectConfig.activeIds,
  );

  const allSettingsViewModeId = findViewModeId(
    args.initialState,
    "All Settings",
  );
  await postBackendForPage(
    args.page,
    args.backendOrigin,
    args.frontendOrigin,
    "/setActiveViewMode",
    {
      activeViewModeId: allSettingsViewModeId,
      projectConfigId: args.projectConfigId,
    },
  );
  await postBackendForPage(
    args.page,
    args.backendOrigin,
    args.frontendOrigin,
    "/setViewport",
    {
      projectConfigId: args.projectConfigId,
      viewport:
        args.initialState.projectState.projectConfig.viewModes[
          allSettingsViewModeId
        ]?.viewport ?? null,
    },
  );

  const initialActiveViewModeId =
    args.initialState.projectState.projectConfig.activeViewModeId;
  if (initialActiveViewModeId) {
    await postBackendForPage(
      args.page,
      args.backendOrigin,
      args.frontendOrigin,
      "/setActiveViewMode",
      {
        activeViewModeId: initialActiveViewModeId,
        projectConfigId: args.projectConfigId,
      },
    );
    if (initialActiveViewModeId !== allSettingsViewModeId) {
      await postBackendForPage(
        args.page,
        args.backendOrigin,
        args.frontendOrigin,
        "/setViewport",
        {
          projectConfigId: args.projectConfigId,
          viewport:
            args.initialState.projectState.projectConfig.viewport ?? null,
        },
      );
    }
  }

  const restoredState = await getLatestProjectStateFromBackendOrigin(
    args.page,
    args.backendOrigin,
    args.frontendOrigin,
    args.projectConfigId,
  );
  await applyProjectStateUpdate(args.page, restoredState);
}

function findSharedVisibleTopLevelSectionByName(args: {
  referenceState: ProjectStateSingleConfigWithCompletedOpIds;
  viewModeName: string;
  worktreeState: ProjectStateSingleConfigWithCompletedOpIds;
}): SharedTopLevelSection {
  const worktreeViewModeId = findViewModeId(
    args.worktreeState,
    args.viewModeName,
  );
  const referenceViewModeId = findViewModeId(
    args.referenceState,
    args.viewModeName,
  );
  const worktreeNames = getVisibleTopLevelSectionNames(
    args.worktreeState,
    worktreeViewModeId,
  );
  const referenceNames = new Set(
    getVisibleTopLevelSectionNames(args.referenceState, referenceViewModeId),
  );
  const sharedName = worktreeNames.find((name) => referenceNames.has(name));
  if (!sharedName) {
    throw new Error(
      `Missing shared visible top-level section across worktree and reference ${args.viewModeName}.`,
    );
  }
  return {
    name: sharedName,
    referenceSectionId: findSectionIdByName(args.referenceState, sharedName),
    worktreeSectionId: findSectionIdByName(args.worktreeState, sharedName),
  };
}

function getVisibleTopLevelSectionNames(
  payload: ProjectStateSingleConfigWithCompletedOpIds,
  viewModeId: string,
): string[] {
  const viewMode = payload.projectState.projectConfig.viewModes[viewModeId];
  if (!viewMode) {
    throw new Error(`Missing view mode ${viewModeId}`);
  }

  return Object.entries(payload.projectState.sections)
    .filter(([sectionId]) => !payload.projectState.parentSectionMap[sectionId])
    .filter(([sectionId]) => viewMode.visibilityBySectionId[sectionId] === true)
    .map(([, section]) => section.name)
    .sort((left, right) => left.localeCompare(right));
}

async function setDurableActiveSectionIds(
  page: Page,
  activeIds: string[],
): Promise<void> {
  await page.evaluate(async (ids) => {
    const { setActiveSectionIds } = await import(
      "/src/state/actions/activeSections.ts"
    );
    setActiveSectionIds(ids, { syncMode: "immediate" });
  }, activeIds);
}
