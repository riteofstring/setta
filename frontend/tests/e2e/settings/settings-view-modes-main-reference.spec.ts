import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  captureSettingsGraphSectionMetrics,
  clearSettingsGraphFocusedEditableTarget,
  findSectionIdByName,
  findSettingsGraphPanePoint,
  findSettingsGraphSectionDragPoint,
  findSettingsGraphSectionHeaderDragPoint,
  findSettingsGraphSectionWheelPanPoint,
  findViewModeId,
  fitGraphViewportToSection,
  getLocalPaneState,
  getSettingsGraphOverlapDropPlan,
  getSettingsGraphRootRelativePoint,
  getSettingsGraphSectionIntersectionPoint,
  getSettingsGraphSectionRenderedZIndex,
  normalizeSettingsGraphComparePaneState,
  runSettingsGraphComparePreflight,
  setLocalPaneState,
  SETTINGS_GRAPH_COMPARE_PANE_STATE,
  type ProjectStateSingleConfigWithCompletedOpIds,
  type SettingsGraphSectionMetrics,
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
const MOD_KEY = process.platform === "darwin" ? "Meta" : "Control";

type ProjectConfigIdResponse = {
  projectConfig?: { id?: string };
};

type SharedTopLevelSection = {
  name: string;
  referenceSectionId: string;
  worktreeSectionId: string;
};

type TopLevelSectionLayout = {
  x: number;
  y: number;
  zIndex: number;
};

function hasSettledSectionMetrics(
  metrics: SettingsGraphSectionMetrics,
  expectedSurfaceKind: "legacy" | "canary",
): boolean {
  return (
    metrics.centerOffsetFromRootCenter !== null &&
    metrics.rect !== null &&
    metrics.surfaceKind === expectedSurfaceKind &&
    metrics.transform !== null
  );
}

function areSectionMetricsStable(
  current: SettingsGraphSectionMetrics,
  previous: SettingsGraphSectionMetrics,
): boolean {
  if (
    current.centerOffsetFromRootCenter === null ||
    previous.centerOffsetFromRootCenter === null ||
    !current.rect ||
    !previous.rect ||
    !current.transform ||
    !previous.transform
  ) {
    return false;
  }

  return (
    Math.abs(
      current.centerOffsetFromRootCenter - previous.centerOffsetFromRootCenter,
    ) < 0.5 &&
    Math.abs(current.rect.x - previous.rect.x) < 0.5 &&
    Math.abs(current.rect.y - previous.rect.y) < 0.5 &&
    Math.abs(current.rect.width - previous.rect.width) < 0.5 &&
    Math.abs(current.rect.height - previous.rect.height) < 0.5 &&
    Math.abs(current.transform.x - previous.transform.x) < 0.5 &&
    Math.abs(current.transform.y - previous.transform.y) < 0.5 &&
    Math.abs(current.transform.zoom - previous.transform.zoom) < 0.002
  );
}

async function waitForSettledSectionMetrics(args: {
  expectedSurfaceKind: "legacy" | "canary";
  page: Page;
  sectionId: string;
}): Promise<SettingsGraphSectionMetrics> {
  await expect
    .poll(
      async () => {
        const first = await captureSettingsGraphSectionMetrics(
          args.page,
          args.sectionId,
        );
        if (!hasSettledSectionMetrics(first, args.expectedSurfaceKind)) {
          return false;
        }

        await args.page.waitForTimeout(150);

        const second = await captureSettingsGraphSectionMetrics(
          args.page,
          args.sectionId,
        );
        if (!hasSettledSectionMetrics(second, args.expectedSurfaceKind)) {
          return false;
        }

        return areSectionMetricsStable(second, first);
      },
      {
        timeout: 5000,
      },
    )
    .toBe(true);

  const settledMetrics = await captureSettingsGraphSectionMetrics(
    args.page,
    args.sectionId,
  );
  if (!hasSettledSectionMetrics(settledMetrics, args.expectedSurfaceKind)) {
    throw new Error(
      `Missing settled ${args.expectedSurfaceKind} section metrics for ${args.sectionId}.`,
    );
  }
  return settledMetrics;
}

function areTopLevelSectionLayoutsStable(
  current: TopLevelSectionLayout,
  previous: TopLevelSectionLayout,
): boolean {
  return (
    Math.abs(current.x - previous.x) < 0.5 &&
    Math.abs(current.y - previous.y) < 0.5 &&
    current.zIndex === previous.zIndex
  );
}

async function waitForSettledTopLevelSectionLayout(args: {
  page: Page;
  sectionId: string;
}): Promise<TopLevelSectionLayout> {
  await expect
    .poll(
      async () => {
        const first = await getActiveTopLevelSectionLayout(
          args.page,
          args.sectionId,
        );
        if (!first) {
          return false;
        }

        await args.page.waitForTimeout(150);

        const second = await getActiveTopLevelSectionLayout(
          args.page,
          args.sectionId,
        );
        if (!second) {
          return false;
        }

        return areTopLevelSectionLayoutsStable(second, first);
      },
      {
        timeout: 5000,
      },
    )
    .toBe(true);

  const settledLayout = await getActiveTopLevelSectionLayout(
    args.page,
    args.sectionId,
  );
  if (!settledLayout) {
    throw new Error(`Missing settled top-level layout for ${args.sectionId}.`);
  }
  return settledLayout;
}

test("settings graph parity probe lands the same shared section after clearing viewport on read-only main legacy and worktree canary", async ({
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

  async function captureClearedViewportEntryMetrics(args: {
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
    await expect
      .poll(async () => {
        const metrics = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        return {
          centerOffsetFromRootCenter: metrics.centerOffsetFromRootCenter,
          hasRect: metrics.rect !== null,
          hasTransform: metrics.transform !== null,
          surfaceKind: metrics.surfaceKind,
        };
      })
      .toEqual({
        centerOffsetFromRootCenter: expect.any(Number),
        hasRect: true,
        hasTransform: true,
        surfaceKind: args.expectedSurfaceKind,
      });

    const metrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    if (
      metrics.centerOffsetFromRootCenter === null ||
      !metrics.rect ||
      !metrics.transform
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} cleared-viewport entry metrics for ${args.sectionName}.`,
      );
    }

    return metrics;
  }

  try {
    const referenceMetrics = await captureClearedViewportEntryMetrics({
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
    const worktreeMetrics = await captureClearedViewportEntryMetrics({
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

    expect(referenceMetrics.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeMetrics.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(
      Math.abs(
        worktreeMetrics.centerOffsetFromRootCenter -
          referenceMetrics.centerOffsetFromRootCenter,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeMetrics.transform.x - referenceMetrics.transform.x),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeMetrics.transform.y - referenceMetrics.transform.y),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeMetrics.transform.zoom - referenceMetrics.transform.zoom,
      ),
    ).toBeLessThan(0.02);
    expect(
      Math.abs(worktreeMetrics.rect.x - referenceMetrics.rect.x),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeMetrics.rect.y - referenceMetrics.rect.y),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeMetrics.rect.width - referenceMetrics.rect.width),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeMetrics.rect.height - referenceMetrics.rect.height),
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

test("settings graph parity probe clears the same shared active section after normalized blank-pane click on read-only main legacy and worktree canary", async ({
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
    preferredNames: ["browserSectionDefault", "taskBoardSectionDefault"],
    referenceState: referenceInitialState,
    viewModeName: "All Settings",
    worktreeState: worktreeInitialState,
  });

  async function captureBlankPaneDeselectResult(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    projectConfigId: string;
    sectionId: string;
    targetPage: Page;
    tab: Locator;
  }) {
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.tab).toBeVisible();
    await args.tab.click();
    await expect
      .poll(async () => {
        const fitApplied = await fitGraphViewportToSection(
          args.targetPage,
          args.sectionId,
        );
        const metrics = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        return {
          fitApplied,
          hasRect: metrics.rect !== null,
          surfaceKind: metrics.surfaceKind,
        };
      })
      .toEqual({
        fitApplied: true,
        hasRect: true,
        surfaceKind: args.expectedSurfaceKind,
      });

    await setDurableActiveSectionIds(args.targetPage, [args.sectionId]);
    await expect
      .poll(async () =>
        isSettingsGraphSectionActive(args.targetPage, args.sectionId),
      )
      .toBe(true);
    await expect
      .poll(async () => {
        return (
          await getLatestProjectStateFromBackendOrigin(
            args.targetPage,
            args.backendOrigin,
            args.frontendOrigin,
            args.projectConfigId,
          )
        ).projectState.projectConfig.activeIds;
      })
      .toEqual([args.sectionId]);

    // Lock the graph-surface deselect lane itself, not section-chrome focus.
    const blankPanePoint = await findSettingsGraphPanePoint(args.targetPage);
    await args.targetPage.mouse.click(blankPanePoint.x, blankPanePoint.y);

    await expect
      .poll(async () =>
        isSettingsGraphSectionActive(args.targetPage, args.sectionId),
      )
      .toBe(false);
    await expect
      .poll(async () => {
        return (
          await getLatestProjectStateFromBackendOrigin(
            args.targetPage,
            args.backendOrigin,
            args.frontendOrigin,
            args.projectConfigId,
          )
        ).projectState.projectConfig.activeIds;
      })
      .toEqual([]);

    return {
      paneState: await getLocalPaneState(args.targetPage),
    };
  }

  try {
    const referenceDeselect = await captureBlankPaneDeselectResult({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      projectConfigId: referenceProjectConfigId,
      sectionId: sharedSection.referenceSectionId,
      tab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      targetPage: referencePage,
    });
    const worktreeDeselect = await captureBlankPaneDeselectResult({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      projectConfigId: worktreeProjectConfigId,
      sectionId: sharedSection.worktreeSectionId,
      tab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      targetPage: page,
    });

    expect(referenceDeselect.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeDeselect.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
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

test("settings graph parity probe restores the same shared offscreen section target with the canvas focus shortcut on read-only main legacy and worktree canary", async ({
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
    preferredNames: ["browserSectionDefault", "taskBoardSectionDefault"],
    referenceState: referenceInitialState,
    viewModeName: "All Settings",
    worktreeState: worktreeInitialState,
  });

  async function captureFocusShortcutRestore(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    projectConfigId: string;
    sectionId: string;
    sectionName: string;
    targetPage: Page;
    tab: Locator;
  }) {
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
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

    const targetSection = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const targetFocusable = targetSection.locator("header button").first();

    await expect(targetSection).toBeVisible();
    await expect(targetFocusable).toBeVisible();
    await targetFocusable.focus();
    await expect(targetFocusable).toBeFocused();

    const offscreenViewport =
      await getSettingsGraphViewportWithSectionMovedOffscreen(
        args.targetPage,
        args.sectionId,
      );
    if (!offscreenViewport) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} offscreen viewport for ${args.sectionName}.`,
      );
    }

    await postBackendForPage(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      "/setViewport",
      {
        projectConfigId: args.projectConfigId,
        viewport: offscreenViewport,
      },
    );
    const stateWithOffscreenViewport =
      await getLatestProjectStateFromBackendOrigin(
        args.targetPage,
        args.backendOrigin,
        args.frontendOrigin,
        args.projectConfigId,
      );
    await applyProjectStateUpdate(args.targetPage, stateWithOffscreenViewport);

    await expect
      .poll(async () =>
        isSettingsGraphSectionCenterInsidePane(args.targetPage, args.sectionId),
      )
      .toBe(false);
    await args.targetPage
      .getByRole("button", { exact: true, name: "Core" })
      .focus();
    await expect.poll(() => isCanvasScopeFocused(args.targetPage)).toBe(false);

    // The shared canvas-focus shortcut should restore the stored canvas target
    // on both surfaces, not just on the canary path.
    await args.targetPage.keyboard.press("Control+Shift+3");

    await expect.poll(() => isCanvasScopeFocused(args.targetPage)).toBe(true);
    await expect
      .poll(async () => getFocusedCanvasSectionId(args.targetPage))
      .toBe(args.sectionId);
    await expect
      .poll(async () => {
        const restoredMetrics = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        if (!restoredMetrics.transform) {
          return 0;
        }
        return Math.hypot(
          restoredMetrics.transform.x - offscreenViewport.x,
          restoredMetrics.transform.y - offscreenViewport.y,
        );
      })
      .toBeGreaterThan(20);

    return {
      paneState: await getLocalPaneState(args.targetPage),
    };
  }

  try {
    const referenceRestore = await captureFocusShortcutRestore({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      projectConfigId: referenceProjectConfigId,
      sectionId: sharedSection.referenceSectionId,
      sectionName: sharedSection.name,
      tab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      targetPage: referencePage,
    });
    const worktreeRestore = await captureFocusShortcutRestore({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      projectConfigId: worktreeProjectConfigId,
      sectionId: sharedSection.worktreeSectionId,
      sectionName: sharedSection.name,
      tab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      targetPage: page,
    });

    expect(referenceRestore.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeRestore.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
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

test("settings graph parity probe applies the same section-chrome plain-wheel pan delta on read-only main legacy and worktree canary after normalized fit", async ({
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

  async function captureNamedSectionWheelPanDelta(args: {
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
        `Missing ${args.expectedSurfaceKind} wheel-pan baseline metrics for ${args.sectionName}.`,
      );
    }

    const wheelPoint = await findSettingsGraphSectionWheelPanPoint(
      args.targetPage,
      args.sectionId,
    );
    await args.targetPage.mouse.move(wheelPoint.x, wheelPoint.y);
    await args.targetPage.mouse.wheel(0, -240);

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
        `Missing ${args.expectedSurfaceKind} wheel-pan result metrics for ${args.sectionName}.`,
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
    const referenceWheelPan = await captureNamedSectionWheelPanDelta({
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
    const worktreeWheelPan = await captureNamedSectionWheelPanDelta({
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

    expect(referenceWheelPan.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeWheelPan.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(Math.abs(referenceWheelPan.transformDelta.zoom)).toBeLessThan(0.02);
    expect(Math.abs(worktreeWheelPan.transformDelta.zoom)).toBeLessThan(0.02);
    expect(
      Math.abs(
        worktreeWheelPan.transformDelta.x - referenceWheelPan.transformDelta.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeWheelPan.transformDelta.y - referenceWheelPan.transformDelta.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeWheelPan.rectDelta.x - referenceWheelPan.rectDelta.x),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeWheelPan.rectDelta.y - referenceWheelPan.rectDelta.y),
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

test("settings graph parity probe applies the same modified-wheel zoom delta on read-only main legacy and worktree canary after normalized fit", async ({
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

  async function captureNamedSectionModifiedWheelZoom(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    projectConfigId: string;
    sectionId: string;
    sectionName: string;
    targetPage: Page;
    tab: Locator;
  }) {
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
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
        `Missing ${args.expectedSurfaceKind} zoom baseline metrics for ${args.sectionName}.`,
      );
    }

    const zoomPoint = await findSettingsGraphPanePoint(args.targetPage);
    const rootRelativeZoomPoint = await getSettingsGraphRootRelativePoint(
      args.targetPage,
      zoomPoint,
    );
    await args.targetPage.mouse.move(zoomPoint.x, zoomPoint.y);
    await args.targetPage.keyboard.down(MOD_KEY);
    await args.targetPage.mouse.wheel(0, -240);
    await args.targetPage.keyboard.up(MOD_KEY);

    await expect
      .poll(async () => {
        const after = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        return after.transform?.zoom ?? 0;
      })
      .toBeGreaterThan(before.transform.zoom);

    const after = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    if (!after.rect || !after.transform) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} zoom result metrics for ${args.sectionName}.`,
      );
    }

    const expectedAnchoredTransform = resolveScreenPointAnchoredViewport(
      before.transform,
      rootRelativeZoomPoint,
      after.transform.zoom,
    );

    return {
      anchorDrift: {
        x: Math.abs(after.transform.x - expectedAnchoredTransform.x),
        y: Math.abs(after.transform.y - expectedAnchoredTransform.y),
      },
      paneState: after.paneState,
      rectDelta: {
        x: after.rect.x - before.rect.x,
        y: after.rect.y - before.rect.y,
        width: after.rect.width - before.rect.width,
        height: after.rect.height - before.rect.height,
      },
      transformDelta: {
        x: after.transform.x - before.transform.x,
        y: after.transform.y - before.transform.y,
        zoom: after.transform.zoom - before.transform.zoom,
      },
    };
  }

  try {
    const referenceZoom = await captureNamedSectionModifiedWheelZoom({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      projectConfigId: referenceProjectConfigId,
      sectionId: sharedSection.referenceSectionId,
      sectionName: sharedSection.name,
      tab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      targetPage: referencePage,
    });
    const worktreeZoom = await captureNamedSectionModifiedWheelZoom({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      projectConfigId: worktreeProjectConfigId,
      sectionId: sharedSection.worktreeSectionId,
      sectionName: sharedSection.name,
      tab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      targetPage: page,
    });

    expect(referenceZoom.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(worktreeZoom.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceZoom.anchorDrift.x).toBeLessThan(1);
    expect(referenceZoom.anchorDrift.y).toBeLessThan(1);
    expect(worktreeZoom.anchorDrift.x).toBeLessThan(1);
    expect(worktreeZoom.anchorDrift.y).toBeLessThan(1);
    expect(
      Math.abs(
        worktreeZoom.transformDelta.zoom - referenceZoom.transformDelta.zoom,
      ),
    ).toBeLessThan(0.02);
    expect(
      Math.abs(worktreeZoom.transformDelta.x - referenceZoom.transformDelta.x),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeZoom.transformDelta.y - referenceZoom.transformDelta.y),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeZoom.rectDelta.x - referenceZoom.rectDelta.x),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeZoom.rectDelta.y - referenceZoom.rectDelta.y),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeZoom.rectDelta.width - referenceZoom.rectDelta.width),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeZoom.rectDelta.height - referenceZoom.rectDelta.height),
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

test("settings graph parity probe reapplies the same shared fit view landing after manual pan on read-only main legacy and worktree canary", async ({
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
  const panDelta = { x: 160, y: 100 };

  async function captureSharedFitViewAfterManualPan(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    projectConfigId: string;
    sectionId: string;
    sectionName: string;
    targetPage: Page;
    tab: Locator;
  }) {
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
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

    const fitViewButton = args.targetPage.getByRole("button", {
      name: "fit view",
    });
    await expect(fitViewButton).toBeVisible();
    await fitViewButton.click();

    const expectedMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    if (
      expectedMetrics.centerOffsetFromRootCenter === null ||
      !expectedMetrics.rect ||
      !expectedMetrics.transform
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} fit-view baseline metrics for ${args.sectionName}.`,
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
        const afterPan = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        if (!afterPan.transform) {
          return 0;
        }
        return Math.hypot(
          afterPan.transform.x - expectedMetrics.transform.x,
          afterPan.transform.y - expectedMetrics.transform.y,
        );
      })
      .toBeGreaterThan(120);

    await fitViewButton.click();

    const afterFit = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    if (
      afterFit.centerOffsetFromRootCenter === null ||
      !afterFit.rect ||
      !afterFit.transform
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} fit-view result metrics for ${args.sectionName}.`,
      );
    }

    return {
      afterFit,
      paneState: afterFit.paneState,
    };
  }

  try {
    const referenceFitView = await captureSharedFitViewAfterManualPan({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      projectConfigId: referenceProjectConfigId,
      sectionId: sharedSection.referenceSectionId,
      sectionName: sharedSection.name,
      tab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      targetPage: referencePage,
    });
    const worktreeFitView = await captureSharedFitViewAfterManualPan({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      projectConfigId: worktreeProjectConfigId,
      sectionId: sharedSection.worktreeSectionId,
      sectionName: sharedSection.name,
      tab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      targetPage: page,
    });

    expect(referenceFitView.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeFitView.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );

    expect(
      Math.abs(
        worktreeFitView.afterFit.centerOffsetFromRootCenter -
          referenceFitView.afterFit.centerOffsetFromRootCenter,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeFitView.afterFit.transform.x -
          referenceFitView.afterFit.transform.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeFitView.afterFit.transform.y -
          referenceFitView.afterFit.transform.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeFitView.afterFit.transform.zoom -
          referenceFitView.afterFit.transform.zoom,
      ),
    ).toBeLessThan(0.02);
    expect(
      Math.abs(
        worktreeFitView.afterFit.rect.x - referenceFitView.afterFit.rect.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeFitView.afterFit.rect.y - referenceFitView.afterFit.rect.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeFitView.afterFit.rect.width -
          referenceFitView.afterFit.rect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeFitView.afterFit.rect.height -
          referenceFitView.afterFit.rect.height,
      ),
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

test("settings graph parity probe applies the same short top-level drag delta on read-only main legacy and worktree canary after normalized fit", async ({
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
    preferredNames: ["browserSectionDefault", "taskBoardSectionDefault"],
    referenceState: referenceInitialState,
    viewModeName: "All Settings",
    worktreeState: worktreeInitialState,
  });
  const dragDelta = { x: 120, y: 80 };

  async function captureNamedSectionDragDelta(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    projectConfigId: string;
    sectionId: string;
    sectionName: string;
    targetPage: Page;
    tab: Locator;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
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
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

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

    const beforeMetrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const beforeLayout = await getActiveTopLevelSectionLayout(
      args.targetPage,
      args.sectionId,
    );
    if (!beforeMetrics.rect || !beforeMetrics.transform || !beforeLayout) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} drag baseline metrics for ${args.sectionName}.`,
      );
    }

    const dragPoint = await findSettingsGraphSectionHeaderDragPoint(
      args.targetPage,
      args.sectionId,
    );
    await args.targetPage.mouse.move(dragPoint.x, dragPoint.y);
    await args.targetPage.mouse.down();
    await args.targetPage.mouse.move(
      dragPoint.x + dragDelta.x,
      dragPoint.y + dragDelta.y,
      {
        steps: 10,
      },
    );
    await args.targetPage.mouse.up();

    await expect
      .poll(async () => {
        const after = await getActiveTopLevelSectionLayout(
          args.targetPage,
          args.sectionId,
        );
        if (!after) {
          return 0;
        }
        return Math.hypot(after.x - beforeLayout.x, after.y - beforeLayout.y);
      })
      .toBeGreaterThan(80);

    const afterMetrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const afterLayout = await getActiveTopLevelSectionLayout(
      args.targetPage,
      args.sectionId,
    );
    if (!afterMetrics.rect || !afterMetrics.transform || !afterLayout) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} drag result metrics for ${args.sectionName}.`,
      );
    }

    return {
      layoutDelta: {
        x: afterLayout.x - beforeLayout.x,
        y: afterLayout.y - beforeLayout.y,
      },
      paneState: afterMetrics.paneState,
      rectDelta: {
        x: afterMetrics.rect.x - beforeMetrics.rect.x,
        y: afterMetrics.rect.y - beforeMetrics.rect.y,
      },
      transformDelta: {
        x: afterMetrics.transform.x - beforeMetrics.transform.x,
        y: afterMetrics.transform.y - beforeMetrics.transform.y,
        zoom: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
      },
    };
  }

  try {
    // Live CDP could not honestly drive this cross-worktree motion lane, so
    // this probe normalizes both pages first and uses Playwright as the shared
    // motion driver before later CDP post-state inspection.
    const referenceDrag = await captureNamedSectionDragDelta({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      projectConfigId: referenceProjectConfigId,
      sectionId: sharedSection.referenceSectionId,
      sectionName: sharedSection.name,
      tab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      targetPage: referencePage,
    });
    const worktreeDrag = await captureNamedSectionDragDelta({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      projectConfigId: worktreeProjectConfigId,
      sectionId: sharedSection.worktreeSectionId,
      sectionName: sharedSection.name,
      tab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      targetPage: page,
    });

    expect(referenceDrag.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(worktreeDrag.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(Math.abs(referenceDrag.transformDelta.x)).toBeLessThan(8);
    expect(Math.abs(referenceDrag.transformDelta.y)).toBeLessThan(8);
    expect(Math.abs(referenceDrag.transformDelta.zoom)).toBeLessThan(0.02);
    expect(Math.abs(worktreeDrag.transformDelta.x)).toBeLessThan(8);
    expect(Math.abs(worktreeDrag.transformDelta.y)).toBeLessThan(8);
    expect(Math.abs(worktreeDrag.transformDelta.zoom)).toBeLessThan(0.02);
    expect(
      Math.abs(worktreeDrag.layoutDelta.x - referenceDrag.layoutDelta.x),
    ).toBeLessThan(12);
    expect(
      Math.abs(worktreeDrag.layoutDelta.y - referenceDrag.layoutDelta.y),
    ).toBeLessThan(12);
    expect(
      Math.abs(worktreeDrag.rectDelta.x - referenceDrag.rectDelta.x),
    ).toBeLessThan(16);
    expect(
      Math.abs(worktreeDrag.rectDelta.y - referenceDrag.rectDelta.y),
    ).toBeLessThan(16);
  } finally {
    await restoreInitialViewModeLayout({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      page,
      projectConfigId: worktreeProjectConfigId,
    }).catch(() => {});
    await restoreInitialViewModeLayout({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
    }).catch(() => {});
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

test("settings graph parity probe keeps browser title editing working after normalized top-level drag on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  test.slow();
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
  const browserSectionName = "browserSectionDefault";
  const referenceAllSettingsViewModeId = findViewModeId(
    referenceInitialState,
    "All Settings",
  );
  const worktreeBrowserSectionId = findSectionIdByName(
    worktreeInitialState,
    browserSectionName,
  );
  const referenceBrowserSectionId = findSectionIdByName(
    referenceInitialState,
    browserSectionName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const dragDelta = { x: 120, y: 80 };
  const referenceOriginalTitle =
    referenceInitialState.projectState.sections[referenceBrowserSectionId]
      ?.name ?? browserSectionName;
  const worktreeOriginalTitle =
    worktreeInitialState.projectState.sections[worktreeBrowserSectionId]
      ?.name ?? browserSectionName;

  async function captureTitleEditAfterDrag(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    nextTitle: string;
    originalTitle: string;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: browserSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const titleText = sectionLocator.locator("header p").first();
    const titleInput = sectionLocator.locator("header input").first();

    await expect(sectionLocator).toBeVisible();
    await expect(titleText).toBeVisible();
    await expect(titleText).toHaveText(args.originalTitle);

    const beforeDrag = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const beforeLayout = await getActiveTopLevelSectionLayout(
      args.targetPage,
      args.sectionId,
    );
    if (
      !beforeDrag.rect ||
      !beforeDrag.titleRect ||
      !beforeDrag.transform ||
      !beforeLayout
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} title-edit drag baseline metrics for ${args.originalTitle}.`,
      );
    }

    const dragPoint = await findSettingsGraphSectionHeaderDragPoint(
      args.targetPage,
      args.sectionId,
    );
    await args.targetPage.mouse.move(dragPoint.x, dragPoint.y);
    await args.targetPage.mouse.down();
    await args.targetPage.mouse.move(
      dragPoint.x + dragDelta.x,
      dragPoint.y + dragDelta.y,
      {
        steps: 10,
      },
    );
    await args.targetPage.mouse.up();

    await expect
      .poll(async () => {
        const afterLayout = await getActiveTopLevelSectionLayout(
          args.targetPage,
          args.sectionId,
        );
        if (!afterLayout) {
          return 0;
        }
        return Math.hypot(
          afterLayout.x - beforeLayout.x,
          afterLayout.y - beforeLayout.y,
        );
      })
      .toBeGreaterThan(80);

    const afterDrag = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterLayout = await waitForSettledTopLevelSectionLayout({
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    if (
      afterDrag.centerOffsetFromRootCenter === null ||
      !afterDrag.rect ||
      !afterDrag.titleRect ||
      !afterDrag.transform ||
      !afterLayout
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} title-edit post-drag metrics for ${args.originalTitle}.`,
      );
    }

    await titleText.dblclick();
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toBeFocused();
    await titleInput.fill(args.nextTitle);
    await titleInput.press("Enter");

    await expect
      .poll(async () => {
        const latestState = await getLatestProjectStateFromBackendOrigin(
          args.targetPage,
          args.backendOrigin,
          args.frontendOrigin,
          args.projectConfigId,
        );
        return latestState.projectState.sections[args.sectionId]?.name ?? null;
      })
      .toBe(args.nextTitle);
    await expect(titleText).toHaveText(args.nextTitle);
    await expect
      .poll(async () => {
        const metrics = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        return {
          hasRect: metrics.rect !== null,
          surfaceKind: metrics.surfaceKind,
        };
      })
      .toEqual({
        hasRect: true,
        surfaceKind: args.expectedSurfaceKind,
      });

    return {
      afterDrag: {
        rect: afterDrag.rect,
        titleRect: afterDrag.titleRect,
      },
      layoutDelta: {
        x: afterLayout.x - beforeLayout.x,
        y: afterLayout.y - beforeLayout.y,
      },
      paneState: await getLocalPaneState(args.targetPage),
      rectDelta: {
        x: afterDrag.rect.x - beforeDrag.rect.x,
        y: afterDrag.rect.y - beforeDrag.rect.y,
      },
      titleRectDelta: {
        x: afterDrag.titleRect.x - beforeDrag.titleRect.x,
        y: afterDrag.titleRect.y - beforeDrag.titleRect.y,
      },
      transformDelta: {
        x: afterDrag.transform.x - beforeDrag.transform.x,
        y: afterDrag.transform.y - beforeDrag.transform.y,
        zoom: afterDrag.transform.zoom - beforeDrag.transform.zoom,
      },
    };
  }

  try {
    const referenceResult = await captureTitleEditAfterDrag({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      nextTitle: `${referenceOriginalTitle} main drag parity`,
      originalTitle: referenceOriginalTitle,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceBrowserSectionId,
      side: "reference",
      targetPage: referencePage,
    });
    const worktreeResult = await captureTitleEditAfterDrag({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      nextTitle: `${worktreeOriginalTitle} canary drag parity`,
      originalTitle: worktreeOriginalTitle,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeBrowserSectionId,
      side: "worktree",
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(Math.abs(referenceResult.transformDelta.x)).toBeLessThan(8);
    expect(Math.abs(referenceResult.transformDelta.y)).toBeLessThan(8);
    expect(Math.abs(referenceResult.transformDelta.zoom)).toBeLessThan(0.02);
    expect(Math.abs(worktreeResult.transformDelta.x)).toBeLessThan(8);
    expect(Math.abs(worktreeResult.transformDelta.y)).toBeLessThan(8);
    expect(Math.abs(worktreeResult.transformDelta.zoom)).toBeLessThan(0.02);
    expect(
      Math.abs(worktreeResult.layoutDelta.x - referenceResult.layoutDelta.x),
    ).toBeLessThan(12);
    expect(
      Math.abs(worktreeResult.layoutDelta.y - referenceResult.layoutDelta.y),
    ).toBeLessThan(12);
    expect(
      Math.abs(worktreeResult.rectDelta.x - referenceResult.rectDelta.x),
    ).toBeLessThan(16);
    expect(
      Math.abs(worktreeResult.rectDelta.y - referenceResult.rectDelta.y),
    ).toBeLessThan(16);
    expect(
      Math.abs(
        worktreeResult.titleRectDelta.x - referenceResult.titleRectDelta.x,
      ),
    ).toBeLessThan(16);
    expect(
      Math.abs(
        worktreeResult.titleRectDelta.y - referenceResult.titleRectDelta.y,
      ),
    ).toBeLessThan(16);
    expect(
      Math.abs(
        worktreeResult.afterDrag.rect.width -
          referenceResult.afterDrag.rect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterDrag.rect.height -
          referenceResult.afterDrag.rect.height,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterDrag.titleRect.width -
          referenceResult.afterDrag.titleRect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterDrag.titleRect.height -
          referenceResult.afterDrag.titleRect.height,
      ),
    ).toBeLessThan(8);
  } finally {
    await restoreSectionNameForPage({
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      name: worktreeOriginalTitle,
      page,
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeBrowserSectionId,
    }).catch(() => {});
    await restoreSectionNameForPage({
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      name: referenceOriginalTitle,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceBrowserSectionId,
    }).catch(() => {});
    await restoreInitialViewModeLayout({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      page,
      projectConfigId: worktreeProjectConfigId,
    }).catch(() => {});
    await restoreInitialViewModeLayout({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
    }).catch(() => {});
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

test("settings graph parity probe keeps browser title editing working after authoritative top-level move and targeted fit on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  test.skip(
    !MAIN_REFERENCE_FRONTEND_URL ||
      !MAIN_REFERENCE_BACKEND_ORIGIN ||
      !MAIN_REFERENCE_BOOTSTRAP_URL,
    "Requires SETTA_MAIN_REFERENCE_FRONTEND_URL, SETTA_MAIN_REFERENCE_BACKEND_ORIGIN, and SETTA_MAIN_REFERENCE_BOOTSTRAP_URL.",
  );
  test.slow();

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
  const browserSectionName = "browserSectionDefault";
  const referenceAllSettingsViewModeId = findViewModeId(
    referenceInitialState,
    "All Settings",
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const worktreeBrowserSectionId = findSectionIdByName(
    worktreeInitialState,
    browserSectionName,
  );
  const referenceBrowserSectionId = findSectionIdByName(
    referenceInitialState,
    browserSectionName,
  );
  const moveDelta = { x: 120, y: 80 };
  const referenceOriginalTitle =
    referenceInitialState.projectState.sections[referenceBrowserSectionId]
      ?.name ?? browserSectionName;
  const worktreeOriginalTitle =
    worktreeInitialState.projectState.sections[worktreeBrowserSectionId]
      ?.name ?? browserSectionName;

  async function captureTitleEditAfterAuthoritativeMove(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    nextTitle: string;
    originalTitle: string;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: browserSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const titleText = sectionLocator.locator("header p").first();
    const titleInput = sectionLocator.locator("header input").first();

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
    await expect(sectionLocator).toBeVisible();
    await expect(titleText).toBeVisible();
    await expect(titleText).toHaveText(args.originalTitle);

    const beforeLayout = await getActiveTopLevelSectionLayout(
      args.targetPage,
      args.sectionId,
    );
    if (!beforeLayout) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} title-edit authoritative-move baseline layout for ${args.originalTitle}.`,
      );
    }

    // CDP cannot complete this drag path reliably yet, so normalize the same
    // post-move state through the backend layout API before the fit/edit check.
    await moveActiveTopLevelSectionByDelta({
      backendOrigin: args.backendOrigin,
      delta: moveDelta,
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      sectionId: args.sectionId,
    });

    const afterMoveLayout = await getActiveTopLevelSectionLayout(
      args.targetPage,
      args.sectionId,
    );
    if (!afterMoveLayout) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} title-edit authoritative-move layout after update for ${args.originalTitle}.`,
      );
    }
    expect(
      Math.abs(afterMoveLayout.x - beforeLayout.x - moveDelta.x),
    ).toBeLessThan(1);
    expect(
      Math.abs(afterMoveLayout.y - beforeLayout.y - moveDelta.y),
    ).toBeLessThan(1);

    await setDurableActiveSectionIds(args.targetPage, []);
    expect(
      await fitGraphViewportToSection(args.targetPage, args.sectionId),
    ).toBe(true);
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

    await expect(titleText).toBeVisible();
    const afterFit = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    if (
      afterFit.centerOffsetFromRootCenter === null ||
      !afterFit.rect ||
      !afterFit.titleRect ||
      !afterFit.transform
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} title-edit authoritative-move metrics for ${args.originalTitle}.`,
      );
    }

    await titleText.dblclick();
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toBeFocused();
    await titleInput.fill(args.nextTitle);
    await titleInput.press("Enter");

    await expect
      .poll(async () => {
        const latestState = await getLatestProjectStateFromBackendOrigin(
          args.targetPage,
          args.backendOrigin,
          args.frontendOrigin,
          args.projectConfigId,
        );
        return latestState.projectState.sections[args.sectionId]?.name ?? null;
      })
      .toBe(args.nextTitle);
    await expect(titleText).toHaveText(args.nextTitle);

    return {
      afterFit,
      layoutDelta: {
        x: afterMoveLayout.x - beforeLayout.x,
        y: afterMoveLayout.y - beforeLayout.y,
      },
      paneState: await getLocalPaneState(args.targetPage),
    };
  }

  try {
    const referenceResult = await captureTitleEditAfterAuthoritativeMove({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      nextTitle: `${referenceOriginalTitle} main authoritative move`,
      originalTitle: referenceOriginalTitle,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceBrowserSectionId,
      side: "reference",
      targetPage: referencePage,
    });
    const worktreeResult = await captureTitleEditAfterAuthoritativeMove({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      nextTitle: `${worktreeOriginalTitle} canary authoritative move`,
      originalTitle: worktreeOriginalTitle,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeBrowserSectionId,
      side: "worktree",
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(
      Math.abs(worktreeResult.layoutDelta.x - referenceResult.layoutDelta.x),
    ).toBeLessThan(1);
    expect(
      Math.abs(worktreeResult.layoutDelta.y - referenceResult.layoutDelta.y),
    ).toBeLessThan(1);
    expect(
      Math.abs(
        worktreeResult.afterFit.centerOffsetFromRootCenter -
          referenceResult.afterFit.centerOffsetFromRootCenter,
      ),
    ).toBeLessThan(8);
    // Absolute viewport translation diverges across legacy/canary on this
    // deterministic fit path even when the moved Browser card lands with the
    // same on-screen geometry, so keep the parity oracle on rendered section
    // metrics instead of raw transform x/y.
    expect(
      Math.abs(
        worktreeResult.afterFit.transform.zoom -
          referenceResult.afterFit.transform.zoom,
      ),
    ).toBeLessThan(0.02);
    expect(
      Math.abs(
        worktreeResult.afterFit.rect.x - referenceResult.afterFit.rect.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterFit.rect.y - referenceResult.afterFit.rect.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterFit.titleRect.x -
          referenceResult.afterFit.titleRect.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterFit.titleRect.y -
          referenceResult.afterFit.titleRect.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterFit.rect.width -
          referenceResult.afterFit.rect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterFit.rect.height -
          referenceResult.afterFit.rect.height,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterFit.titleRect.width -
          referenceResult.afterFit.titleRect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterFit.titleRect.height -
          referenceResult.afterFit.titleRect.height,
      ),
    ).toBeLessThan(8);
  } finally {
    await restoreSectionNameForPage({
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      name: worktreeOriginalTitle,
      page,
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeBrowserSectionId,
    }).catch(() => {});
    await restoreSectionNameForPage({
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      name: referenceOriginalTitle,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceBrowserSectionId,
    }).catch(() => {});
    await restoreInitialViewModeLayout({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      page,
      projectConfigId: worktreeProjectConfigId,
    }).catch(() => {});
    await restoreInitialViewModeLayout({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
    }).catch(() => {});
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

test("settings graph parity probe keeps draw section frontmost after normalized overlap drag on read-only main legacy and worktree canary", async ({
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
  const worktreeDrawSectionId = findSectionIdByName(
    worktreeInitialState,
    "drawSectionDefault",
  );
  const referenceDrawSectionId = findSectionIdByName(
    referenceInitialState,
    "drawSectionDefault",
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);

  async function captureFrontmostAfterOverlapDrag(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    projectConfigId: string;
    sectionId: string;
    targetPage: Page;
    tab: Locator;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
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
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

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

    const beforeLayout = await getActiveTopLevelSectionLayout(
      args.targetPage,
      args.sectionId,
    );
    if (!beforeLayout) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} drawSectionDefault layout before overlap drag.`,
      );
    }

    const overlapPlan = await getSettingsGraphOverlapDropPlan(
      args.targetPage,
      args.sectionId,
    );
    if (!overlapPlan) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} overlap drag plan for drawSectionDefault.`,
      );
    }

    const overlapSectionName =
      args.initialState.projectState.sections[overlapPlan.overlapSectionId]
        ?.name ?? overlapPlan.overlapSectionId;
    if (
      !(await getActiveTopLevelSectionLayout(
        args.targetPage,
        overlapPlan.overlapSectionId,
      ))
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} overlap target layout before overlap drag.`,
      );
    }

    const dragPoint = await findSettingsGraphSectionHeaderDragPoint(
      args.targetPage,
      args.sectionId,
    );
    await args.targetPage.mouse.move(dragPoint.x, dragPoint.y);
    await args.targetPage.mouse.down();
    await args.targetPage.mouse.move(
      dragPoint.x + overlapPlan.delta.x,
      dragPoint.y + overlapPlan.delta.y,
      {
        steps: 12,
      },
    );
    await args.targetPage.mouse.up();

    await expect
      .poll(async () => {
        const movedLayout = await getActiveTopLevelSectionLayout(
          args.targetPage,
          args.sectionId,
        );
        if (!movedLayout) {
          return 0;
        }
        return Math.hypot(
          movedLayout.x - beforeLayout.x,
          movedLayout.y - beforeLayout.y,
        );
      })
      .toBeGreaterThan(80);

    await expect
      .poll(async () => {
        const movedLayout = await getActiveTopLevelSectionLayout(
          args.targetPage,
          args.sectionId,
        );
        const overlapLayout = await getActiveTopLevelSectionLayout(
          args.targetPage,
          overlapPlan.overlapSectionId,
        );
        if (!movedLayout || !overlapLayout) {
          return Number.NEGATIVE_INFINITY;
        }
        return movedLayout.zIndex - overlapLayout.zIndex;
      })
      .toBeGreaterThan(0);

    await setDurableActiveSectionIds(args.targetPage, []);
    const overlapPoint = await getSettingsGraphSectionIntersectionPoint(
      args.targetPage,
      args.sectionId,
      overlapPlan.overlapSectionId,
    );
    if (!overlapPoint) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} overlap point after overlap drag.`,
      );
    }

    await expect
      .poll(async () => {
        const movedZIndex = await getSettingsGraphSectionRenderedZIndex(
          args.targetPage,
          args.sectionId,
        );
        const overlapZIndex = await getSettingsGraphSectionRenderedZIndex(
          args.targetPage,
          overlapPlan.overlapSectionId,
        );
        if (movedZIndex === null || overlapZIndex === null) {
          return Number.NEGATIVE_INFINITY;
        }
        return movedZIndex - overlapZIndex;
      })
      .toBeGreaterThan(0);

    return {
      overlapPoint,
      overlapSectionName,
      paneState: await getLocalPaneState(args.targetPage),
    };
  }

  try {
    const referenceFrontmost = await captureFrontmostAfterOverlapDrag({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceDrawSectionId,
      tab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      targetPage: referencePage,
    });
    const worktreeFrontmost = await captureFrontmostAfterOverlapDrag({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeDrawSectionId,
      tab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      targetPage: page,
    });

    expect(referenceFrontmost.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeFrontmost.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeFrontmost.overlapSectionName).toBe(
      referenceFrontmost.overlapSectionName,
    );
  } finally {
    await restoreInitialViewModeLayout({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      page,
      projectConfigId: worktreeProjectConfigId,
    }).catch(() => {});
    await restoreInitialViewModeLayout({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
    }).catch(() => {});
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

test("settings graph parity probe keeps the group body args filter attached during normalized top-level drag on read-only main legacy and worktree canary", async ({
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
  const worktreeGroupSectionId = findSectionIdByName(
    worktreeInitialState,
    "groupSectionDefault",
  );
  const referenceGroupSectionId = findSectionIdByName(
    referenceInitialState,
    "groupSectionDefault",
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const dragDelta = { x: 120, y: 80 };
  const inputValue = "group drag anchor";

  async function captureGroupDragAttachment(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    targetPage: Page;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const filterInput = sectionLocator
      .locator(`[id="${args.sectionId}-args-filter"]`)
      .first();

    await expect(sectionLocator).toBeVisible();
    await expect(filterInput).toBeVisible();

    const beforeMetrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const beforeLayout = await getActiveTopLevelSectionLayout(
      args.targetPage,
      args.sectionId,
    );
    const beforeFilterPosition = await getSectionChildRelativeCenterPosition(
      args.targetPage,
      args.sectionId,
      `${args.sectionId}-args-filter`,
    );
    if (
      !beforeMetrics.rect ||
      !beforeMetrics.transform ||
      !beforeLayout ||
      !beforeFilterPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} group drag baseline metrics.`,
      );
    }

    const dragPoint = await findSettingsGraphSectionDragPoint(
      args.targetPage,
      args.sectionId,
    );
    await args.targetPage.mouse.move(dragPoint.x, dragPoint.y);
    await args.targetPage.mouse.down();
    await args.targetPage.mouse.move(
      dragPoint.x + dragDelta.x,
      dragPoint.y + dragDelta.y,
      {
        steps: 10,
      },
    );
    await args.targetPage.mouse.up();

    await expect
      .poll(async () => {
        const afterLayout = await getActiveTopLevelSectionLayout(
          args.targetPage,
          args.sectionId,
        );
        if (!afterLayout) {
          return 0;
        }
        return Math.hypot(
          afterLayout.x - beforeLayout.x,
          afterLayout.y - beforeLayout.y,
        );
      })
      .toBeGreaterThan(80);

    await expect
      .poll(async () => {
        const latestFilterPosition =
          await getSectionChildRelativeCenterPosition(
            args.targetPage,
            args.sectionId,
            `${args.sectionId}-args-filter`,
          );
        if (!latestFilterPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestFilterPosition.x - beforeFilterPosition.x),
          Math.abs(latestFilterPosition.y - beforeFilterPosition.y),
        );
      })
      .toBeLessThan(0.03);

    await filterInput.click();
    await expect(filterInput).toBeFocused();
    await filterInput.fill(inputValue);
    await expect(filterInput).toHaveValue(inputValue);
    await filterInput.fill("");
    await expect(filterInput).toHaveValue("");

    const afterMetrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const afterLayout = await getActiveTopLevelSectionLayout(
      args.targetPage,
      args.sectionId,
    );
    const afterFilterPosition = await getSectionChildRelativeCenterPosition(
      args.targetPage,
      args.sectionId,
      `${args.sectionId}-args-filter`,
    );
    if (
      !afterMetrics.rect ||
      !afterMetrics.transform ||
      !afterLayout ||
      !afterFilterPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} group drag result metrics.`,
      );
    }

    return {
      filterPositionDrift: {
        x: Math.abs(afterFilterPosition.x - beforeFilterPosition.x),
        y: Math.abs(afterFilterPosition.y - beforeFilterPosition.y),
      },
      layoutDelta: {
        x: afterLayout.x - beforeLayout.x,
        y: afterLayout.y - beforeLayout.y,
      },
      paneState: afterMetrics.paneState,
      rectDelta: {
        x: afterMetrics.rect.x - beforeMetrics.rect.x,
        y: afterMetrics.rect.y - beforeMetrics.rect.y,
      },
      transformDelta: {
        x: afterMetrics.transform.x - beforeMetrics.transform.x,
        y: afterMetrics.transform.y - beforeMetrics.transform.y,
        zoom: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
      },
    };
  }

  try {
    const referenceResult = await captureGroupDragAttachment({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceGroupSectionId,
      targetPage: referencePage,
    });
    const worktreeResult = await captureGroupDragAttachment({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeGroupSectionId,
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.filterPositionDrift.x).toBeLessThan(0.03);
    expect(referenceResult.filterPositionDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.filterPositionDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.filterPositionDrift.y).toBeLessThan(0.03);
    expect(
      Math.abs(
        worktreeResult.transformDelta.x - referenceResult.transformDelta.x,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.y - referenceResult.transformDelta.y,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.zoom -
          referenceResult.transformDelta.zoom,
      ),
    ).toBeLessThan(0.02);
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

test("settings graph parity probe keeps the spreadsheet body search input attached during normalized top-level drag on read-only main legacy and worktree canary", async ({
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
  const worktreeSpreadsheetSectionId = findSectionIdByName(
    worktreeInitialState,
    "spreadsheetSectionDefault",
  );
  const referenceSpreadsheetSectionId = findSectionIdByName(
    referenceInitialState,
    "spreadsheetSectionDefault",
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const dragDelta = { x: 120, y: 80 };
  const inputValue = "drag anchor";

  async function captureSpreadsheetDragAttachment(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    targetPage: Page;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const searchInput = sectionLocator
      .locator(`[id="${args.sectionId}-args-filter"]`)
      .first();

    await expect(sectionLocator).toBeVisible();
    await expect(searchInput).toBeVisible();

    const beforeMetrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const beforeLayout = await getActiveTopLevelSectionLayout(
      args.targetPage,
      args.sectionId,
    );
    const beforeInputPosition = await getSectionChildRelativeCenterPosition(
      args.targetPage,
      args.sectionId,
      `${args.sectionId}-args-filter`,
    );
    if (
      !beforeMetrics.rect ||
      !beforeMetrics.transform ||
      !beforeLayout ||
      !beforeInputPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} spreadsheet drag baseline metrics.`,
      );
    }

    const dragPoint = await findSettingsGraphSectionDragPoint(
      args.targetPage,
      args.sectionId,
    );
    await args.targetPage.mouse.move(dragPoint.x, dragPoint.y);
    await args.targetPage.mouse.down();
    await args.targetPage.mouse.move(
      dragPoint.x + dragDelta.x,
      dragPoint.y + dragDelta.y,
      {
        steps: 10,
      },
    );
    await args.targetPage.mouse.up();

    await expect
      .poll(async () => {
        const afterLayout = await getActiveTopLevelSectionLayout(
          args.targetPage,
          args.sectionId,
        );
        if (!afterLayout) {
          return 0;
        }
        return Math.hypot(
          afterLayout.x - beforeLayout.x,
          afterLayout.y - beforeLayout.y,
        );
      })
      .toBeGreaterThan(80);

    await expect
      .poll(async () => {
        const latestInputPosition = await getSectionChildRelativeCenterPosition(
          args.targetPage,
          args.sectionId,
          `${args.sectionId}-args-filter`,
        );
        if (!latestInputPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestInputPosition.x - beforeInputPosition.x),
          Math.abs(latestInputPosition.y - beforeInputPosition.y),
        );
      })
      .toBeLessThan(0.03);

    await searchInput.click();
    await expect(searchInput).toBeFocused();
    await searchInput.fill(inputValue);
    await expect(searchInput).toHaveValue(inputValue);
    await searchInput.fill("");
    await expect(searchInput).toHaveValue("");

    const afterMetrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const afterLayout = await getActiveTopLevelSectionLayout(
      args.targetPage,
      args.sectionId,
    );
    const afterInputPosition = await getSectionChildRelativeCenterPosition(
      args.targetPage,
      args.sectionId,
      `${args.sectionId}-args-filter`,
    );
    if (
      !afterMetrics.rect ||
      !afterMetrics.transform ||
      !afterLayout ||
      !afterInputPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} spreadsheet drag result metrics.`,
      );
    }

    return {
      inputPositionDrift: {
        x: Math.abs(afterInputPosition.x - beforeInputPosition.x),
        y: Math.abs(afterInputPosition.y - beforeInputPosition.y),
      },
      layoutDelta: {
        x: afterLayout.x - beforeLayout.x,
        y: afterLayout.y - beforeLayout.y,
      },
      paneState: afterMetrics.paneState,
      rectDelta: {
        x: afterMetrics.rect.x - beforeMetrics.rect.x,
        y: afterMetrics.rect.y - beforeMetrics.rect.y,
      },
      transformDelta: {
        x: afterMetrics.transform.x - beforeMetrics.transform.x,
        y: afterMetrics.transform.y - beforeMetrics.transform.y,
        zoom: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
      },
    };
  }

  try {
    const referenceResult = await captureSpreadsheetDragAttachment({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceSpreadsheetSectionId,
      targetPage: referencePage,
    });
    const worktreeResult = await captureSpreadsheetDragAttachment({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeSpreadsheetSectionId,
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.inputPositionDrift.x).toBeLessThan(0.03);
    expect(referenceResult.inputPositionDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.inputPositionDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.inputPositionDrift.y).toBeLessThan(0.03);
    expect(Math.abs(referenceResult.transformDelta.x)).toBeLessThan(2);
    expect(Math.abs(referenceResult.transformDelta.y)).toBeLessThan(2);
    expect(Math.abs(referenceResult.transformDelta.zoom)).toBeLessThan(0.02);
    expect(Math.abs(worktreeResult.transformDelta.x)).toBeLessThan(2);
    expect(Math.abs(worktreeResult.transformDelta.y)).toBeLessThan(2);
    expect(Math.abs(worktreeResult.transformDelta.zoom)).toBeLessThan(0.02);
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

test("settings graph parity probe keeps the task board args filter attached during normalized top-level drag on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  test.slow();
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
  const taskBoardSectionName = "taskBoardSectionDefault";
  const referenceAllSettingsViewModeId = findViewModeId(
    referenceInitialState,
    "All Settings",
  );
  const worktreeTaskBoardSectionId = findSectionIdByName(
    worktreeInitialState,
    taskBoardSectionName,
  );
  const referenceTaskBoardSectionId = findSectionIdByName(
    referenceInitialState,
    taskBoardSectionName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const dragDelta = { x: 120, y: 80 };
  const inputValue = "task board drag anchor";

  async function captureTaskBoardFilterAfterDrag(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: taskBoardSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const argsFilter = sectionLocator
      .locator(`[id="${args.sectionId}-args-filter"]`)
      .first();

    await expect(sectionLocator).toBeVisible();
    await expect(argsFilter).toBeVisible();

    const beforeMetrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const beforeLayout = await getActiveTopLevelSectionLayout(
      args.targetPage,
      args.sectionId,
    );
    const beforeFilterPosition = await getSectionChildRelativeCenterBySelector(
      args.targetPage,
      args.sectionId,
      `[id="${args.sectionId}-args-filter"]`,
    );
    if (
      !beforeMetrics.rect ||
      !beforeMetrics.transform ||
      !beforeLayout ||
      !beforeFilterPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} task-board drag baseline metrics.`,
      );
    }

    const dragPoint = await findSettingsGraphSectionHeaderDragPoint(
      args.targetPage,
      args.sectionId,
    );
    await args.targetPage.mouse.move(dragPoint.x, dragPoint.y);
    await args.targetPage.mouse.down();
    await args.targetPage.mouse.move(
      dragPoint.x + dragDelta.x,
      dragPoint.y + dragDelta.y,
      {
        steps: 10,
      },
    );
    await args.targetPage.mouse.up();

    await expect
      .poll(async () => {
        const afterLayout = await getActiveTopLevelSectionLayout(
          args.targetPage,
          args.sectionId,
        );
        if (!afterLayout) {
          return 0;
        }
        return Math.hypot(
          afterLayout.x - beforeLayout.x,
          afterLayout.y - beforeLayout.y,
        );
      })
      .toBeGreaterThan(80);

    await expect
      .poll(async () => {
        const latestFilterPosition =
          await getSectionChildRelativeCenterBySelector(
            args.targetPage,
            args.sectionId,
            `[id="${args.sectionId}-args-filter"]`,
          );
        if (!latestFilterPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestFilterPosition.x - beforeFilterPosition.x),
          Math.abs(latestFilterPosition.y - beforeFilterPosition.y),
        );
      })
      .toBeLessThan(0.03);

    const afterDragMetrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const afterFilterPosition = await getSectionChildRelativeCenterBySelector(
      args.targetPage,
      args.sectionId,
      `[id="${args.sectionId}-args-filter"]`,
    );
    if (!afterDragMetrics.transform || !afterFilterPosition) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} task-board drag result metrics.`,
      );
    }

    await argsFilter.click();
    await expect(argsFilter).toBeFocused();
    await argsFilter.fill(inputValue);
    await expect(argsFilter).toHaveValue(inputValue);
    await argsFilter.fill("");
    await expect(argsFilter).toHaveValue("");

    return {
      filterPositionDrift: {
        x: Math.abs(afterFilterPosition.x - beforeFilterPosition.x),
        y: Math.abs(afterFilterPosition.y - beforeFilterPosition.y),
      },
      paneState: afterDragMetrics.paneState,
      transformDelta: {
        x: afterDragMetrics.transform.x - beforeMetrics.transform.x,
        y: afterDragMetrics.transform.y - beforeMetrics.transform.y,
        zoom: afterDragMetrics.transform.zoom - beforeMetrics.transform.zoom,
      },
    };
  }

  try {
    const referenceResult = await captureTaskBoardFilterAfterDrag({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceTaskBoardSectionId,
      side: "reference",
      targetPage: referencePage,
    });
    const worktreeResult = await captureTaskBoardFilterAfterDrag({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeTaskBoardSectionId,
      side: "worktree",
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.filterPositionDrift.x).toBeLessThan(0.03);
    expect(referenceResult.filterPositionDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.filterPositionDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.filterPositionDrift.y).toBeLessThan(0.03);
    expect(
      Math.abs(
        worktreeResult.transformDelta.x - referenceResult.transformDelta.x,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.y - referenceResult.transformDelta.y,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.zoom -
          referenceResult.transformDelta.zoom,
      ),
    ).toBeLessThan(0.02);
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

test("settings graph parity probe keeps the task board args filter editable after normalized pane pan on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  const taskBoardSectionName = "taskBoardSectionDefault";
  test.slow();

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
  const worktreeTaskBoardSectionId = findSectionIdByName(
    worktreeInitialState,
    taskBoardSectionName,
  );
  const referenceTaskBoardSectionId = findSectionIdByName(
    referenceInitialState,
    taskBoardSectionName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const panDelta = { x: 120, y: 80 };
  const filterValue = "task board pane pan";

  async function captureTaskBoardFilterAfterPan(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
  }) {
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: taskBoardSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);

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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const filterInput = sectionLocator
      .locator(`[id="${args.sectionId}-args-filter"]`)
      .first();

    await expect(sectionLocator).toBeVisible();
    await expect(filterInput).toBeVisible();

    const beforeMetrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const beforeFilterPosition = await getSectionChildRelativeCenterPosition(
      args.targetPage,
      args.sectionId,
      `${args.sectionId}-args-filter`,
    );
    if (
      !beforeMetrics.rect ||
      !beforeMetrics.transform ||
      !beforeFilterPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} task-board pane-pan baseline metrics.`,
      );
    }

    // Pane pan should move the graph surface without detaching the task-board filter.
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
        const afterPan = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        if (!afterPan.rect || !afterPan.transform) {
          return 0;
        }
        return Math.max(
          Math.hypot(
            afterPan.rect.x - beforeMetrics.rect.x,
            afterPan.rect.y - beforeMetrics.rect.y,
          ),
          Math.hypot(
            afterPan.transform.x - beforeMetrics.transform.x,
            afterPan.transform.y - beforeMetrics.transform.y,
          ),
        );
      })
      .toBeGreaterThan(60);

    await expect
      .poll(async () => {
        const latestFilterPosition =
          await getSectionChildRelativeCenterPosition(
            args.targetPage,
            args.sectionId,
            `${args.sectionId}-args-filter`,
          );
        if (!latestFilterPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestFilterPosition.x - beforeFilterPosition.x),
          Math.abs(latestFilterPosition.y - beforeFilterPosition.y),
        );
      })
      .toBeLessThan(0.03);

    const afterMetrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const afterFilterPosition = await getSectionChildRelativeCenterPosition(
      args.targetPage,
      args.sectionId,
      `${args.sectionId}-args-filter`,
    );
    if (!afterMetrics.transform || !afterFilterPosition) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} task-board pane-pan result metrics.`,
      );
    }

    await filterInput.click();
    await expect(filterInput).toBeFocused();
    await filterInput.fill(filterValue);
    await expect(filterInput).toHaveValue(filterValue);
    await filterInput.fill("");
    await expect(filterInput).toHaveValue("");

    return {
      filterPositionDrift: {
        x: Math.abs(afterFilterPosition.x - beforeFilterPosition.x),
        y: Math.abs(afterFilterPosition.y - beforeFilterPosition.y),
      },
      paneState: await getLocalPaneState(args.targetPage),
      transformDelta: {
        x: afterMetrics.transform.x - beforeMetrics.transform.x,
        y: afterMetrics.transform.y - beforeMetrics.transform.y,
        zoom: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
      },
    };
  }

  try {
    const referenceResult = await captureTaskBoardFilterAfterPan({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceTaskBoardSectionId,
      side: "reference",
      targetPage: referencePage,
    });
    const worktreeResult = await captureTaskBoardFilterAfterPan({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeTaskBoardSectionId,
      side: "worktree",
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.filterPositionDrift.x).toBeLessThan(0.03);
    expect(referenceResult.filterPositionDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.filterPositionDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.filterPositionDrift.y).toBeLessThan(0.03);
    expect(
      Math.abs(
        worktreeResult.transformDelta.x - referenceResult.transformDelta.x,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.y - referenceResult.transformDelta.y,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.zoom -
          referenceResult.transformDelta.zoom,
      ),
    ).toBeLessThan(0.02);
  } finally {
    await restoreInitialViewModeLayout({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      page,
      projectConfigId: worktreeProjectConfigId,
    }).catch(() => {});
    await restoreInitialViewModeLayout({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
    }).catch(() => {});
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

test("settings graph parity probe keeps the dict config language row attached after authoritative viewport shift on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  test.skip(
    !MAIN_REFERENCE_FRONTEND_URL ||
      !MAIN_REFERENCE_BACKEND_ORIGIN ||
      !MAIN_REFERENCE_BOOTSTRAP_URL,
    "Requires SETTA_MAIN_REFERENCE_FRONTEND_URL, SETTA_MAIN_REFERENCE_BACKEND_ORIGIN, and SETTA_MAIN_REFERENCE_BOOTSTRAP_URL.",
  );
  test.slow();

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
  const dictSectionName = "dictSectionDefault";
  const worktreeDictSectionId = findSectionIdByName(
    worktreeInitialState,
    dictSectionName,
  );
  const referenceDictSectionId = findSectionIdByName(
    referenceInitialState,
    dictSectionName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const viewportDelta = { x: 90, y: 60 };

  async function captureDictViewportShift(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: dictSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const configLanguageRow = sectionLocator
      .getByText("Config Language", { exact: true })
      .first();

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
    await expect(sectionLocator).toBeVisible();
    await expect(configLanguageRow).toBeVisible();

    const beforeMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const beforeAnchorPosition = await getLocatorRelativeCenterPosition({
      child: configLanguageRow,
      section: sectionLocator,
    });
    if (
      !beforeMetrics.transform ||
      !beforeMetrics.rect ||
      !beforeAnchorPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} dict authoritative viewport baseline metrics.`,
      );
    }

    await applyViewportFromBackendOrigin({
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      viewport: {
        x: beforeMetrics.transform.x + viewportDelta.x,
        y: beforeMetrics.transform.y + viewportDelta.y,
        zoom: beforeMetrics.transform.zoom,
      },
    });

    await expect
      .poll(async () => {
        const afterShift = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        if (!afterShift.transform) {
          return 0;
        }
        return Math.hypot(
          afterShift.transform.x - beforeMetrics.transform.x,
          afterShift.transform.y - beforeMetrics.transform.y,
        );
      })
      .toBeGreaterThan(60);

    const afterMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterAnchorPosition = await getLocatorRelativeCenterPosition({
      child: configLanguageRow,
      section: sectionLocator,
    });
    if (!afterMetrics.transform || !afterMetrics.rect || !afterAnchorPosition) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} dict authoritative viewport result metrics.`,
      );
    }

    return {
      anchorDrift: {
        x: Math.abs(afterAnchorPosition.x - beforeAnchorPosition.x),
        y: Math.abs(afterAnchorPosition.y - beforeAnchorPosition.y),
      },
      afterMetrics: {
        centerOffsetFromRootCenter: afterMetrics.centerOffsetFromRootCenter,
        rect: afterMetrics.rect,
        transform: afterMetrics.transform,
      },
      paneState: await getLocalPaneState(args.targetPage),
      transformDelta: {
        x: afterMetrics.transform.x - beforeMetrics.transform.x,
        y: afterMetrics.transform.y - beforeMetrics.transform.y,
        zoom: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
      },
    };
  }

  try {
    const referenceResult = await captureDictViewportShift({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceDictSectionId,
      side: "reference",
      targetPage: referencePage,
    });
    const worktreeResult = await captureDictViewportShift({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeDictSectionId,
      side: "worktree",
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.anchorDrift.x).toBeLessThan(0.03);
    expect(referenceResult.anchorDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.anchorDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.anchorDrift.y).toBeLessThan(0.03);
    expect(
      Math.abs(referenceResult.transformDelta.x - viewportDelta.x),
    ).toBeLessThan(2);
    expect(
      Math.abs(referenceResult.transformDelta.y - viewportDelta.y),
    ).toBeLessThan(2);
    expect(Math.abs(referenceResult.transformDelta.zoom)).toBeLessThan(0.001);
    expect(
      Math.abs(worktreeResult.transformDelta.x - viewportDelta.x),
    ).toBeLessThan(2);
    expect(
      Math.abs(worktreeResult.transformDelta.y - viewportDelta.y),
    ).toBeLessThan(2);
    expect(Math.abs(worktreeResult.transformDelta.zoom)).toBeLessThan(0.001);
    expect(
      Math.abs(
        (worktreeResult.afterMetrics.centerOffsetFromRootCenter ?? 0) -
          (referenceResult.afterMetrics.centerOffsetFromRootCenter ?? 0),
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.transform.x -
          referenceResult.afterMetrics.transform.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.transform.y -
          referenceResult.afterMetrics.transform.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.rect.x -
          referenceResult.afterMetrics.rect.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.rect.y -
          referenceResult.afterMetrics.rect.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.rect.width -
          referenceResult.afterMetrics.rect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.rect.height -
          referenceResult.afterMetrics.rect.height,
      ),
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

test("settings graph parity probe keeps the dict config language row attached after fit view and toolbar zoom in on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  test.slow();
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
  const dictSectionName = "dictSectionDefault";
  const worktreeDictSectionId = findSectionIdByName(
    worktreeInitialState,
    dictSectionName,
  );
  const referenceDictSectionId = findSectionIdByName(
    referenceInitialState,
    dictSectionName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);

  async function captureDictToolbarZoom(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: dictSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const configLanguageRow = sectionLocator
      .getByText("Config Language", { exact: true })
      .first();

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
    await expect(sectionLocator).toBeVisible();
    await expect(configLanguageRow).toBeVisible();

    const beforeMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const beforeAnchorPosition = await getLocatorRelativeCenterPosition({
      child: configLanguageRow,
      section: sectionLocator,
    });
    if (
      !beforeMetrics.transform ||
      !beforeMetrics.rect ||
      !beforeAnchorPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} dict toolbar zoom baseline metrics.`,
      );
    }

    // Keep the same section-local row anchor attached while the shared zoom
    // control changes the graph viewport.
    await args.targetPage.getByRole("button", { name: "zoom in" }).click();

    await expect
      .poll(async () => {
        return (
          (
            await captureSettingsGraphSectionMetrics(
              args.targetPage,
              args.sectionId,
            )
          ).transform?.zoom ?? 0
        );
      })
      .toBeGreaterThan(beforeMetrics.transform.zoom * 1.08);

    await expect
      .poll(async () => {
        const latestAnchorPosition = await getLocatorRelativeCenterPosition({
          child: configLanguageRow,
          section: sectionLocator,
        });
        if (!latestAnchorPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestAnchorPosition.x - beforeAnchorPosition.x),
          Math.abs(latestAnchorPosition.y - beforeAnchorPosition.y),
        );
      })
      .toBeLessThan(0.03);

    const afterMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterAnchorPosition = await getLocatorRelativeCenterPosition({
      child: configLanguageRow,
      section: sectionLocator,
    });
    if (!afterMetrics.transform || !afterMetrics.rect || !afterAnchorPosition) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} dict toolbar zoom result metrics.`,
      );
    }

    return {
      afterMetrics: {
        centerOffsetFromRootCenter: afterMetrics.centerOffsetFromRootCenter,
        rect: afterMetrics.rect,
        transform: afterMetrics.transform,
      },
      anchorDrift: {
        x: Math.abs(afterAnchorPosition.x - beforeAnchorPosition.x),
        y: Math.abs(afterAnchorPosition.y - beforeAnchorPosition.y),
      },
      paneState: await getLocalPaneState(args.targetPage),
      zoomDelta: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
    };
  }

  try {
    const referenceResult = await captureDictToolbarZoom({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceDictSectionId,
      side: "reference",
      targetPage: referencePage,
    });
    const worktreeResult = await captureDictToolbarZoom({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeDictSectionId,
      side: "worktree",
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.anchorDrift.x).toBeLessThan(0.03);
    expect(referenceResult.anchorDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.anchorDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.anchorDrift.y).toBeLessThan(0.03);
    expect(
      Math.abs(worktreeResult.zoomDelta - referenceResult.zoomDelta),
    ).toBeLessThan(0.04);
    expect(
      Math.abs(
        (worktreeResult.afterMetrics.centerOffsetFromRootCenter ?? 0) -
          (referenceResult.afterMetrics.centerOffsetFromRootCenter ?? 0),
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.transform.x -
          referenceResult.afterMetrics.transform.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.transform.y -
          referenceResult.afterMetrics.transform.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.transform.zoom -
          referenceResult.afterMetrics.transform.zoom,
      ),
    ).toBeLessThan(0.04);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.rect.x -
          referenceResult.afterMetrics.rect.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.rect.y -
          referenceResult.afterMetrics.rect.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.rect.width -
          referenceResult.afterMetrics.rect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.rect.height -
          referenceResult.afterMetrics.rect.height,
      ),
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

test("settings graph parity probe keeps the dict config language row attached during normalized top-level drag on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  test.slow();
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
  const dictSectionName = "dictSectionDefault";
  const worktreeDictSectionId = findSectionIdByName(
    worktreeInitialState,
    dictSectionName,
  );
  const referenceDictSectionId = findSectionIdByName(
    referenceInitialState,
    dictSectionName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const dragDelta = { x: 120, y: 80 };

  async function captureDictDragAttachment(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: dictSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const configLanguageRow = sectionLocator
      .getByText("Config Language", { exact: true })
      .first();

    await expect(sectionLocator).toBeVisible();
    await expect(configLanguageRow).toBeVisible();

    const beforeMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const beforeLayout = await waitForSettledTopLevelSectionLayout({
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const beforeAnchorPosition = await getLocatorRelativeCenterPosition({
      child: configLanguageRow,
      section: sectionLocator,
    });
    if (
      !beforeMetrics.rect ||
      !beforeMetrics.transform ||
      !beforeAnchorPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} dict drag baseline metrics.`,
      );
    }

    const dragPoint = await findSettingsGraphSectionHeaderDragPoint(
      args.targetPage,
      args.sectionId,
    );
    await args.targetPage.mouse.move(dragPoint.x, dragPoint.y);
    await args.targetPage.mouse.down();
    await args.targetPage.mouse.move(
      dragPoint.x + dragDelta.x,
      dragPoint.y + dragDelta.y,
      {
        steps: 10,
      },
    );
    await args.targetPage.mouse.up();

    await expect
      .poll(async () => {
        const afterLayout = await getActiveTopLevelSectionLayout(
          args.targetPage,
          args.sectionId,
        );
        if (!afterLayout) {
          return 0;
        }
        return Math.hypot(
          afterLayout.x - beforeLayout.x,
          afterLayout.y - beforeLayout.y,
        );
      })
      .toBeGreaterThan(80);

    await expect
      .poll(async () => {
        const latestAnchorPosition = await getLocatorRelativeCenterPosition({
          child: configLanguageRow,
          section: sectionLocator,
        });
        if (!latestAnchorPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestAnchorPosition.x - beforeAnchorPosition.x),
          Math.abs(latestAnchorPosition.y - beforeAnchorPosition.y),
        );
      })
      .toBeLessThan(0.03);

    const afterMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterLayout = await waitForSettledTopLevelSectionLayout({
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterAnchorPosition = await getLocatorRelativeCenterPosition({
      child: configLanguageRow,
      section: sectionLocator,
    });
    const afterConfigLanguageRowBox = await configLanguageRow.boundingBox();
    if (
      afterMetrics.centerOffsetFromRootCenter === null ||
      !afterMetrics.rect ||
      !afterMetrics.transform ||
      !afterAnchorPosition ||
      !afterConfigLanguageRowBox
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} dict drag result metrics.`,
      );
    }

    return {
      afterMotion: {
        centerOffsetFromRootCenter: afterMetrics.centerOffsetFromRootCenter,
        rect: afterMetrics.rect,
        transform: afterMetrics.transform,
      },
      anchorPositionDrift: {
        x: Math.abs(afterAnchorPosition.x - beforeAnchorPosition.x),
        y: Math.abs(afterAnchorPosition.y - beforeAnchorPosition.y),
      },
      configLanguageRowBox: afterConfigLanguageRowBox,
      layoutDelta: {
        x: afterLayout.x - beforeLayout.x,
        y: afterLayout.y - beforeLayout.y,
      },
      paneState: afterMetrics.paneState,
      rectDelta: {
        x: afterMetrics.rect.x - beforeMetrics.rect.x,
        y: afterMetrics.rect.y - beforeMetrics.rect.y,
      },
      transformDelta: {
        x: afterMetrics.transform.x - beforeMetrics.transform.x,
        y: afterMetrics.transform.y - beforeMetrics.transform.y,
        zoom: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
      },
    };
  }

  try {
    const referenceResult = await captureDictDragAttachment({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceDictSectionId,
      side: "reference",
      targetPage: referencePage,
    });
    const worktreeResult = await captureDictDragAttachment({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeDictSectionId,
      side: "worktree",
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.anchorPositionDrift.x).toBeLessThan(0.03);
    expect(referenceResult.anchorPositionDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.anchorPositionDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.anchorPositionDrift.y).toBeLessThan(0.03);
    expect(Math.abs(referenceResult.transformDelta.x)).toBeLessThan(2);
    expect(Math.abs(referenceResult.transformDelta.y)).toBeLessThan(2);
    expect(Math.abs(referenceResult.transformDelta.zoom)).toBeLessThan(0.02);
    expect(Math.abs(worktreeResult.transformDelta.x)).toBeLessThan(2);
    expect(Math.abs(worktreeResult.transformDelta.y)).toBeLessThan(2);
    expect(Math.abs(worktreeResult.transformDelta.zoom)).toBeLessThan(0.02);
    expect(
      Math.abs(worktreeResult.layoutDelta.x - referenceResult.layoutDelta.x),
    ).toBeLessThan(12);
    expect(
      Math.abs(worktreeResult.layoutDelta.y - referenceResult.layoutDelta.y),
    ).toBeLessThan(12);
    expect(
      Math.abs(worktreeResult.rectDelta.x - referenceResult.rectDelta.x),
    ).toBeLessThan(16);
    expect(
      Math.abs(worktreeResult.rectDelta.y - referenceResult.rectDelta.y),
    ).toBeLessThan(16);
    expect(
      Math.abs(
        worktreeResult.afterMotion.centerOffsetFromRootCenter -
          referenceResult.afterMotion.centerOffsetFromRootCenter,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.rect.width -
          referenceResult.afterMotion.rect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.rect.height -
          referenceResult.afterMotion.rect.height,
      ),
    ).toBeLessThan(12);
    expect(
      Math.abs(
        worktreeResult.configLanguageRowBox.width -
          referenceResult.configLanguageRowBox.width,
      ),
    ).toBeLessThan(12);
    expect(
      Math.abs(
        worktreeResult.configLanguageRowBox.height -
          referenceResult.configLanguageRowBox.height,
      ),
    ).toBeLessThan(6);
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

test("settings graph parity probe keeps the dict config language row attached during normalized pane pan on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  const dictSectionName = "dictSectionDefault";
  test.slow();

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
  const worktreeDictSectionId = findSectionIdByName(
    worktreeInitialState,
    dictSectionName,
  );
  const referenceDictSectionId = findSectionIdByName(
    referenceInitialState,
    dictSectionName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const panDelta = { x: 120, y: 80 };

  async function captureDictConfigLanguageRowAfterPan(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
  }) {
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: dictSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const configLanguageRow = sectionLocator
      .getByText("Config Language", { exact: true })
      .first();

    await expect(sectionLocator).toBeVisible();
    await expect(configLanguageRow).toBeVisible();

    const beforeMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const beforeAnchorPosition = await getLocatorRelativeCenterPosition({
      child: configLanguageRow,
      section: sectionLocator,
    });
    if (
      !beforeMetrics.rect ||
      !beforeMetrics.transform ||
      !beforeAnchorPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} dict pane-pan baseline metrics.`,
      );
    }

    // Pane pan should move the graph surface without detaching the dict row.
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
        const afterPan = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        if (!afterPan.rect || !afterPan.transform) {
          return 0;
        }
        return Math.max(
          Math.hypot(
            afterPan.rect.x - beforeMetrics.rect.x,
            afterPan.rect.y - beforeMetrics.rect.y,
          ),
          Math.hypot(
            afterPan.transform.x - beforeMetrics.transform.x,
            afterPan.transform.y - beforeMetrics.transform.y,
          ),
        );
      })
      .toBeGreaterThan(60);

    await expect
      .poll(async () => {
        const latestAnchorPosition = await getLocatorRelativeCenterPosition({
          child: configLanguageRow,
          section: sectionLocator,
        });
        if (!latestAnchorPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestAnchorPosition.x - beforeAnchorPosition.x),
          Math.abs(latestAnchorPosition.y - beforeAnchorPosition.y),
        );
      })
      .toBeLessThan(0.03);

    const afterMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterAnchorPosition = await getLocatorRelativeCenterPosition({
      child: configLanguageRow,
      section: sectionLocator,
    });
    if (!afterMetrics.transform || !afterAnchorPosition) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} dict pane-pan result metrics.`,
      );
    }

    return {
      anchorPositionDrift: {
        x: Math.abs(afterAnchorPosition.x - beforeAnchorPosition.x),
        y: Math.abs(afterAnchorPosition.y - beforeAnchorPosition.y),
      },
      paneState: await getLocalPaneState(args.targetPage),
      transformDelta: {
        x: afterMetrics.transform.x - beforeMetrics.transform.x,
        y: afterMetrics.transform.y - beforeMetrics.transform.y,
        zoom: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
      },
    };
  }

  try {
    const referenceResult = await captureDictConfigLanguageRowAfterPan({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceDictSectionId,
      side: "reference",
      targetPage: referencePage,
    });
    const worktreeResult = await captureDictConfigLanguageRowAfterPan({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeDictSectionId,
      side: "worktree",
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.anchorPositionDrift.x).toBeLessThan(0.03);
    expect(referenceResult.anchorPositionDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.anchorPositionDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.anchorPositionDrift.y).toBeLessThan(0.03);
    expect(
      Math.abs(
        worktreeResult.transformDelta.x - referenceResult.transformDelta.x,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.y - referenceResult.transformDelta.y,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.zoom -
          referenceResult.transformDelta.zoom,
      ),
    ).toBeLessThan(0.02);
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

test("settings graph parity probe keeps the chart data path row attached after fit view and toolbar zoom in on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  test.slow();
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
  const chartSectionName = "chartSectionDefault";
  const worktreeChartSectionId = findSectionIdByName(
    worktreeInitialState,
    chartSectionName,
  );
  const referenceChartSectionId = findSectionIdByName(
    referenceInitialState,
    chartSectionName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);

  async function captureChartToolbarZoom(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: chartSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const dataPathRow = sectionLocator.getByText("dataPath", { exact: true });

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
    await expect(sectionLocator).toBeVisible();
    await expect(dataPathRow).toBeVisible();

    const beforeMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const beforeAnchorPosition = await getLocatorRelativeCenterPosition({
      child: dataPathRow,
      section: sectionLocator,
    });
    const beforeDataPathRowBox = await dataPathRow.boundingBox();
    if (
      !beforeMetrics.transform ||
      !beforeMetrics.rect ||
      !beforeMetrics.titleRect ||
      !beforeAnchorPosition ||
      !beforeDataPathRowBox
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} chart toolbar zoom baseline metrics.`,
      );
    }

    // Keep the same chart row anchor attached while the shared zoom control
    // changes the graph viewport.
    await args.targetPage.getByRole("button", { name: "zoom in" }).click();

    await expect
      .poll(async () => {
        return (
          (
            await captureSettingsGraphSectionMetrics(
              args.targetPage,
              args.sectionId,
            )
          ).transform?.zoom ?? 0
        );
      })
      .toBeGreaterThan(beforeMetrics.transform.zoom * 1.08);

    await expect
      .poll(async () => {
        const latestAnchorPosition = await getLocatorRelativeCenterPosition({
          child: dataPathRow,
          section: sectionLocator,
        });
        if (!latestAnchorPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestAnchorPosition.x - beforeAnchorPosition.x),
          Math.abs(latestAnchorPosition.y - beforeAnchorPosition.y),
        );
      })
      .toBeLessThan(0.03);

    const afterMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterAnchorPosition = await getLocatorRelativeCenterPosition({
      child: dataPathRow,
      section: sectionLocator,
    });
    const afterDataPathRowBox = await dataPathRow.boundingBox();
    if (
      !afterMetrics.transform ||
      !afterMetrics.rect ||
      !afterMetrics.titleRect ||
      !afterAnchorPosition ||
      !afterDataPathRowBox
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} chart toolbar zoom result metrics.`,
      );
    }

    return {
      afterMetrics: {
        centerOffsetFromRootCenter: afterMetrics.centerOffsetFromRootCenter,
        rect: afterMetrics.rect,
        titleRect: afterMetrics.titleRect,
        transform: afterMetrics.transform,
      },
      anchorDrift: {
        x: Math.abs(afterAnchorPosition.x - beforeAnchorPosition.x),
        y: Math.abs(afterAnchorPosition.y - beforeAnchorPosition.y),
      },
      dataPathRowBox: afterDataPathRowBox,
      paneState: await getLocalPaneState(args.targetPage),
      zoomDelta: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
    };
  }

  try {
    const referenceResult = await captureChartToolbarZoom({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceChartSectionId,
      side: "reference",
      targetPage: referencePage,
    });
    const worktreeResult = await captureChartToolbarZoom({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeChartSectionId,
      side: "worktree",
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.anchorDrift.x).toBeLessThan(0.03);
    expect(referenceResult.anchorDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.anchorDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.anchorDrift.y).toBeLessThan(0.03);
    expect(
      Math.abs(worktreeResult.zoomDelta - referenceResult.zoomDelta),
    ).toBeLessThan(0.04);
    expect(
      Math.abs(
        (worktreeResult.afterMetrics.centerOffsetFromRootCenter ?? 0) -
          (referenceResult.afterMetrics.centerOffsetFromRootCenter ?? 0),
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.transform.x -
          referenceResult.afterMetrics.transform.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.transform.y -
          referenceResult.afterMetrics.transform.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.transform.zoom -
          referenceResult.afterMetrics.transform.zoom,
      ),
    ).toBeLessThan(0.04);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.rect.x -
          referenceResult.afterMetrics.rect.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.rect.y -
          referenceResult.afterMetrics.rect.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.rect.width -
          referenceResult.afterMetrics.rect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.rect.height -
          referenceResult.afterMetrics.rect.height,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.titleRect.width -
          referenceResult.afterMetrics.titleRect.width,
      ),
    ).toBeLessThan(12);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.titleRect.height -
          referenceResult.afterMetrics.titleRect.height,
      ),
    ).toBeLessThan(6);
    expect(
      Math.abs(
        worktreeResult.dataPathRowBox.width -
          referenceResult.dataPathRowBox.width,
      ),
    ).toBeLessThan(12);
    expect(
      Math.abs(
        worktreeResult.dataPathRowBox.height -
          referenceResult.dataPathRowBox.height,
      ),
    ).toBeLessThan(6);
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

test("settings graph parity probe keeps the chart data path row attached during normalized top-level drag on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  test.slow();
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
  const chartSectionName = "chartSectionDefault";
  const worktreeChartSectionId = findSectionIdByName(
    worktreeInitialState,
    chartSectionName,
  );
  const referenceChartSectionId = findSectionIdByName(
    referenceInitialState,
    chartSectionName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const dragDelta = { x: 120, y: 80 };

  async function captureChartDragAttachment(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: chartSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const dataPathRow = sectionLocator.getByText("dataPath", { exact: true });

    await expect(sectionLocator).toBeVisible();
    await expect(dataPathRow).toBeVisible();

    const beforeMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const beforeLayout = await waitForSettledTopLevelSectionLayout({
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const beforeAnchorPosition = await getLocatorRelativeCenterPosition({
      child: dataPathRow,
      section: sectionLocator,
    });
    if (
      !beforeMetrics.rect ||
      !beforeMetrics.titleRect ||
      !beforeMetrics.transform ||
      !beforeAnchorPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} chart drag baseline metrics.`,
      );
    }

    const dragPoint = await findSettingsGraphSectionHeaderDragPoint(
      args.targetPage,
      args.sectionId,
    );
    await args.targetPage.mouse.move(dragPoint.x, dragPoint.y);
    await args.targetPage.mouse.down();
    await args.targetPage.mouse.move(
      dragPoint.x + dragDelta.x,
      dragPoint.y + dragDelta.y,
      {
        steps: 10,
      },
    );
    await args.targetPage.mouse.up();

    await expect
      .poll(async () => {
        const afterLayout = await getActiveTopLevelSectionLayout(
          args.targetPage,
          args.sectionId,
        );
        if (!afterLayout) {
          return 0;
        }
        return Math.hypot(
          afterLayout.x - beforeLayout.x,
          afterLayout.y - beforeLayout.y,
        );
      })
      .toBeGreaterThan(80);

    await expect
      .poll(async () => {
        const latestAnchorPosition = await getLocatorRelativeCenterPosition({
          child: dataPathRow,
          section: sectionLocator,
        });
        if (!latestAnchorPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestAnchorPosition.x - beforeAnchorPosition.x),
          Math.abs(latestAnchorPosition.y - beforeAnchorPosition.y),
        );
      })
      .toBeLessThan(0.03);

    const afterMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterLayout = await waitForSettledTopLevelSectionLayout({
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterAnchorPosition = await getLocatorRelativeCenterPosition({
      child: dataPathRow,
      section: sectionLocator,
    });
    if (
      afterMetrics.centerOffsetFromRootCenter === null ||
      !afterMetrics.rect ||
      !afterMetrics.titleRect ||
      !afterMetrics.transform ||
      !afterAnchorPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} chart drag result metrics.`,
      );
    }

    return {
      afterMotion: {
        centerOffsetFromRootCenter: afterMetrics.centerOffsetFromRootCenter,
        rect: afterMetrics.rect,
        titleRect: afterMetrics.titleRect,
        transform: afterMetrics.transform,
      },
      anchorPositionDrift: {
        x: Math.abs(afterAnchorPosition.x - beforeAnchorPosition.x),
        y: Math.abs(afterAnchorPosition.y - beforeAnchorPosition.y),
      },
      layoutDelta: {
        x: afterLayout.x - beforeLayout.x,
        y: afterLayout.y - beforeLayout.y,
      },
      paneState: afterMetrics.paneState,
      rectDelta: {
        x: afterMetrics.rect.x - beforeMetrics.rect.x,
        y: afterMetrics.rect.y - beforeMetrics.rect.y,
      },
      transformDelta: {
        x: afterMetrics.transform.x - beforeMetrics.transform.x,
        y: afterMetrics.transform.y - beforeMetrics.transform.y,
        zoom: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
      },
    };
  }

  try {
    const referenceResult = await captureChartDragAttachment({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceChartSectionId,
      side: "reference",
      targetPage: referencePage,
    });
    const worktreeResult = await captureChartDragAttachment({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeChartSectionId,
      side: "worktree",
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.anchorPositionDrift.x).toBeLessThan(0.03);
    expect(referenceResult.anchorPositionDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.anchorPositionDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.anchorPositionDrift.y).toBeLessThan(0.03);
    expect(Math.abs(referenceResult.transformDelta.x)).toBeLessThan(2);
    expect(Math.abs(referenceResult.transformDelta.y)).toBeLessThan(2);
    expect(Math.abs(referenceResult.transformDelta.zoom)).toBeLessThan(0.02);
    expect(Math.abs(worktreeResult.transformDelta.x)).toBeLessThan(2);
    expect(Math.abs(worktreeResult.transformDelta.y)).toBeLessThan(2);
    expect(Math.abs(worktreeResult.transformDelta.zoom)).toBeLessThan(0.02);
    expect(
      Math.abs(worktreeResult.layoutDelta.x - referenceResult.layoutDelta.x),
    ).toBeLessThan(12);
    expect(
      Math.abs(worktreeResult.layoutDelta.y - referenceResult.layoutDelta.y),
    ).toBeLessThan(12);
    expect(
      Math.abs(worktreeResult.rectDelta.x - referenceResult.rectDelta.x),
    ).toBeLessThan(16);
    expect(
      Math.abs(worktreeResult.rectDelta.y - referenceResult.rectDelta.y),
    ).toBeLessThan(16);
    expect(
      Math.abs(
        worktreeResult.afterMotion.centerOffsetFromRootCenter -
          referenceResult.afterMotion.centerOffsetFromRootCenter,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.rect.width -
          referenceResult.afterMotion.rect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.rect.height -
          referenceResult.afterMotion.rect.height,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.titleRect.width -
          referenceResult.afterMotion.titleRect.width,
      ),
    ).toBeLessThan(12);
    expect(
      Math.abs(
        worktreeResult.afterMotion.titleRect.height -
          referenceResult.afterMotion.titleRect.height,
      ),
    ).toBeLessThan(6);
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

test("settings graph parity probe keeps the chart data path row attached during normalized pane pan on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  const chartSectionName = "chartSectionDefault";
  test.slow();

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
  const worktreeChartSectionId = findSectionIdByName(
    worktreeInitialState,
    chartSectionName,
  );
  const referenceChartSectionId = findSectionIdByName(
    referenceInitialState,
    chartSectionName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const panDelta = { x: 120, y: 80 };

  async function captureChartDataPathRowAfterPan(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
  }) {
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: chartSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const dataPathRow = sectionLocator.getByText("dataPath", { exact: true });

    await expect(sectionLocator).toBeVisible();
    await expect(dataPathRow).toBeVisible();

    const beforeMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const beforeAnchorPosition = await getLocatorRelativeCenterPosition({
      child: dataPathRow,
      section: sectionLocator,
    });
    if (
      !beforeMetrics.rect ||
      !beforeMetrics.transform ||
      !beforeAnchorPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} chart pane-pan baseline metrics.`,
      );
    }

    // Pane pan should move the graph surface without detaching the chart row.
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
        const afterPan = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        if (!afterPan.rect || !afterPan.transform) {
          return 0;
        }
        return Math.max(
          Math.hypot(
            afterPan.rect.x - beforeMetrics.rect.x,
            afterPan.rect.y - beforeMetrics.rect.y,
          ),
          Math.hypot(
            afterPan.transform.x - beforeMetrics.transform.x,
            afterPan.transform.y - beforeMetrics.transform.y,
          ),
        );
      })
      .toBeGreaterThan(60);

    await expect
      .poll(async () => {
        const latestAnchorPosition = await getLocatorRelativeCenterPosition({
          child: dataPathRow,
          section: sectionLocator,
        });
        if (!latestAnchorPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestAnchorPosition.x - beforeAnchorPosition.x),
          Math.abs(latestAnchorPosition.y - beforeAnchorPosition.y),
        );
      })
      .toBeLessThan(0.03);

    const afterMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterAnchorPosition = await getLocatorRelativeCenterPosition({
      child: dataPathRow,
      section: sectionLocator,
    });
    if (!afterMetrics.transform || !afterAnchorPosition) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} chart pane-pan result metrics.`,
      );
    }

    return {
      anchorPositionDrift: {
        x: Math.abs(afterAnchorPosition.x - beforeAnchorPosition.x),
        y: Math.abs(afterAnchorPosition.y - beforeAnchorPosition.y),
      },
      paneState: await getLocalPaneState(args.targetPage),
      transformDelta: {
        x: afterMetrics.transform.x - beforeMetrics.transform.x,
        y: afterMetrics.transform.y - beforeMetrics.transform.y,
        zoom: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
      },
    };
  }

  try {
    const referenceResult = await captureChartDataPathRowAfterPan({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceChartSectionId,
      side: "reference",
      targetPage: referencePage,
    });
    const worktreeResult = await captureChartDataPathRowAfterPan({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeChartSectionId,
      side: "worktree",
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.anchorPositionDrift.x).toBeLessThan(0.03);
    expect(referenceResult.anchorPositionDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.anchorPositionDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.anchorPositionDrift.y).toBeLessThan(0.03);
    expect(
      Math.abs(
        worktreeResult.transformDelta.x - referenceResult.transformDelta.x,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.y - referenceResult.transformDelta.y,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.zoom -
          referenceResult.transformDelta.zoom,
      ),
    ).toBeLessThan(0.02);
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

test("settings graph parity probe keeps the dropzone mode row attached after fit view and toolbar zoom in on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  test.slow();
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
  const dropzoneSectionName = "dropzoneParamCodeObjDefault";
  const worktreeDropzoneSectionId = findSectionIdByName(
    worktreeInitialState,
    dropzoneSectionName,
  );
  const referenceDropzoneSectionId = findSectionIdByName(
    referenceInitialState,
    dropzoneSectionName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const initialWorktreeDropzoneParamFilter = await getSectionParamFilterForPage(
    page,
    worktreeDropzoneSectionId,
  );
  const initialReferenceDropzoneParamFilter =
    await getSectionParamFilterForPage(
      referencePage,
      referenceDropzoneSectionId,
    );
  const normalizedDropzoneParamFilter = initialReferenceDropzoneParamFilter;

  async function captureDropzoneToolbarZoom(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetParamFilter: string;
    targetPage: Page;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await setSectionParamFilterForPage({
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      sectionId: args.sectionId,
      value: args.targetParamFilter,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: dropzoneSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const modeRow = sectionLocator.getByText("Mode", { exact: true }).first();

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
    await expect(sectionLocator).toBeVisible();
    await expect(modeRow).toBeVisible();

    const beforeMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const beforeAnchorPosition = await getLocatorRelativeCenterPosition({
      child: modeRow,
      section: sectionLocator,
    });
    const beforeModeRowBox = await modeRow.boundingBox();
    if (
      !beforeMetrics.transform ||
      !beforeMetrics.rect ||
      !beforeAnchorPosition ||
      !beforeModeRowBox
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} dropzone toolbar zoom baseline metrics.`,
      );
    }

    // Keep the same row anchor attached while the shared zoom control changes
    // the graph viewport.
    await args.targetPage.getByRole("button", { name: "zoom in" }).click();

    await expect
      .poll(async () => {
        return (
          (
            await captureSettingsGraphSectionMetrics(
              args.targetPage,
              args.sectionId,
            )
          ).transform?.zoom ?? 0
        );
      })
      .toBeGreaterThan(beforeMetrics.transform.zoom * 1.08);

    await expect
      .poll(async () => {
        const latestAnchorPosition = await getLocatorRelativeCenterPosition({
          child: modeRow,
          section: sectionLocator,
        });
        if (!latestAnchorPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestAnchorPosition.x - beforeAnchorPosition.x),
          Math.abs(latestAnchorPosition.y - beforeAnchorPosition.y),
        );
      })
      .toBeLessThan(0.03);

    const afterMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterAnchorPosition = await getLocatorRelativeCenterPosition({
      child: modeRow,
      section: sectionLocator,
    });
    const afterModeRowBox = await modeRow.boundingBox();
    if (
      !afterMetrics.transform ||
      !afterMetrics.rect ||
      !afterAnchorPosition ||
      !afterModeRowBox
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} dropzone toolbar zoom result metrics.`,
      );
    }

    return {
      afterMetrics: {
        centerOffsetFromRootCenter: afterMetrics.centerOffsetFromRootCenter,
        rect: afterMetrics.rect,
        transform: afterMetrics.transform,
      },
      anchorDrift: {
        x: Math.abs(afterAnchorPosition.x - beforeAnchorPosition.x),
        y: Math.abs(afterAnchorPosition.y - beforeAnchorPosition.y),
      },
      modeRowBox: afterModeRowBox,
      modeRowScale: {
        height: afterModeRowBox.height / beforeModeRowBox.height,
        width: afterModeRowBox.width / beforeModeRowBox.width,
      },
      paneState: await getLocalPaneState(args.targetPage),
      zoomDelta: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
    };
  }

  try {
    const referenceResult = await captureDropzoneToolbarZoom({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceDropzoneSectionId,
      side: "reference",
      targetParamFilter: normalizedDropzoneParamFilter,
      targetPage: referencePage,
    });
    const worktreeResult = await captureDropzoneToolbarZoom({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeDropzoneSectionId,
      side: "worktree",
      targetParamFilter: normalizedDropzoneParamFilter,
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.anchorDrift.x).toBeLessThan(0.03);
    expect(referenceResult.anchorDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.anchorDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.anchorDrift.y).toBeLessThan(0.03);
    expect(referenceResult.modeRowScale.width).toBeGreaterThan(1.05);
    expect(referenceResult.modeRowScale.height).toBeGreaterThan(1.05);
    expect(worktreeResult.modeRowScale.width).toBeGreaterThan(1.05);
    expect(worktreeResult.modeRowScale.height).toBeGreaterThan(1.05);
    expect(
      Math.abs(worktreeResult.zoomDelta - referenceResult.zoomDelta),
    ).toBeLessThan(0.04);
    expect(
      Math.abs(
        (worktreeResult.afterMetrics.centerOffsetFromRootCenter ?? 0) -
          (referenceResult.afterMetrics.centerOffsetFromRootCenter ?? 0),
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.transform.zoom -
          referenceResult.afterMetrics.transform.zoom,
      ),
    ).toBeLessThan(0.04);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.rect.x -
          referenceResult.afterMetrics.rect.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.rect.y -
          referenceResult.afterMetrics.rect.y,
      ),
    ).toBeLessThan(12);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.rect.width -
          referenceResult.afterMetrics.rect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMetrics.rect.height -
          referenceResult.afterMetrics.rect.height,
      ),
    ).toBeLessThan(12);
    expect(
      Math.abs(
        worktreeResult.modeRowBox.width - referenceResult.modeRowBox.width,
      ),
    ).toBeLessThan(12);
    expect(
      Math.abs(
        worktreeResult.modeRowBox.height - referenceResult.modeRowBox.height,
      ),
    ).toBeLessThan(6);
  } finally {
    await setSectionParamFilterForPage({
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      page,
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeDropzoneSectionId,
      value: initialWorktreeDropzoneParamFilter,
    }).catch(() => {});
    await setSectionParamFilterForPage({
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceDropzoneSectionId,
      value: initialReferenceDropzoneParamFilter,
    }).catch(() => {});
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

test("settings graph parity probe keeps the dropzone mode row attached during normalized top-level drag on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  test.slow();
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
  const dropzoneSectionName = "dropzoneParamCodeObjDefault";
  const worktreeDropzoneSectionId = findSectionIdByName(
    worktreeInitialState,
    dropzoneSectionName,
  );
  const referenceDropzoneSectionId = findSectionIdByName(
    referenceInitialState,
    dropzoneSectionName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const initialWorktreeDropzoneParamFilter = await getSectionParamFilterForPage(
    page,
    worktreeDropzoneSectionId,
  );
  const initialReferenceDropzoneParamFilter =
    await getSectionParamFilterForPage(
      referencePage,
      referenceDropzoneSectionId,
    );
  const normalizedDropzoneParamFilter = initialReferenceDropzoneParamFilter;
  const dragDelta = { x: 120, y: 80 };

  async function captureDropzoneDragAttachment(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetParamFilter: string;
    targetPage: Page;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await setSectionParamFilterForPage({
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      sectionId: args.sectionId,
      value: args.targetParamFilter,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: dropzoneSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const modeRow = sectionLocator.getByText("Mode", { exact: true }).first();

    await expect(sectionLocator).toBeVisible();
    await expect(modeRow).toBeVisible();

    const beforeMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const beforeLayout = await waitForSettledTopLevelSectionLayout({
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const beforeAnchorPosition = await getLocatorRelativeCenterPosition({
      child: modeRow,
      section: sectionLocator,
    });
    if (
      !beforeMetrics.rect ||
      !beforeMetrics.transform ||
      !beforeAnchorPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} dropzone drag baseline metrics.`,
      );
    }

    const dragPoint = await findSettingsGraphSectionHeaderDragPoint(
      args.targetPage,
      args.sectionId,
    );
    await args.targetPage.mouse.move(dragPoint.x, dragPoint.y);
    await args.targetPage.mouse.down();
    await args.targetPage.mouse.move(
      dragPoint.x + dragDelta.x,
      dragPoint.y + dragDelta.y,
      {
        steps: 10,
      },
    );
    await args.targetPage.mouse.up();

    await expect
      .poll(async () => {
        const afterLayout = await getActiveTopLevelSectionLayout(
          args.targetPage,
          args.sectionId,
        );
        if (!afterLayout) {
          return 0;
        }
        return Math.hypot(
          afterLayout.x - beforeLayout.x,
          afterLayout.y - beforeLayout.y,
        );
      })
      .toBeGreaterThan(80);

    await expect
      .poll(async () => {
        const latestAnchorPosition = await getLocatorRelativeCenterPosition({
          child: modeRow,
          section: sectionLocator,
        });
        if (!latestAnchorPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestAnchorPosition.x - beforeAnchorPosition.x),
          Math.abs(latestAnchorPosition.y - beforeAnchorPosition.y),
        );
      })
      .toBeLessThan(0.03);

    const afterMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterLayout = await waitForSettledTopLevelSectionLayout({
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterAnchorPosition = await getLocatorRelativeCenterPosition({
      child: modeRow,
      section: sectionLocator,
    });
    const afterModeRowBox = await modeRow.boundingBox();
    if (
      afterMetrics.centerOffsetFromRootCenter === null ||
      !afterMetrics.rect ||
      !afterMetrics.transform ||
      !afterAnchorPosition ||
      !afterModeRowBox
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} dropzone drag result metrics.`,
      );
    }

    return {
      afterMotion: {
        centerOffsetFromRootCenter: afterMetrics.centerOffsetFromRootCenter,
        rect: afterMetrics.rect,
        transform: afterMetrics.transform,
      },
      anchorPositionDrift: {
        x: Math.abs(afterAnchorPosition.x - beforeAnchorPosition.x),
        y: Math.abs(afterAnchorPosition.y - beforeAnchorPosition.y),
      },
      layoutDelta: {
        x: afterLayout.x - beforeLayout.x,
        y: afterLayout.y - beforeLayout.y,
      },
      modeRowBox: afterModeRowBox,
      paneState: afterMetrics.paneState,
      rectDelta: {
        x: afterMetrics.rect.x - beforeMetrics.rect.x,
        y: afterMetrics.rect.y - beforeMetrics.rect.y,
      },
      transformDelta: {
        x: afterMetrics.transform.x - beforeMetrics.transform.x,
        y: afterMetrics.transform.y - beforeMetrics.transform.y,
        zoom: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
      },
    };
  }

  try {
    const referenceResult = await captureDropzoneDragAttachment({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceDropzoneSectionId,
      side: "reference",
      targetParamFilter: normalizedDropzoneParamFilter,
      targetPage: referencePage,
    });
    const worktreeResult = await captureDropzoneDragAttachment({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeDropzoneSectionId,
      side: "worktree",
      targetParamFilter: normalizedDropzoneParamFilter,
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.anchorPositionDrift.x).toBeLessThan(0.03);
    expect(referenceResult.anchorPositionDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.anchorPositionDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.anchorPositionDrift.y).toBeLessThan(0.03);
    expect(Math.abs(referenceResult.transformDelta.x)).toBeLessThan(2);
    expect(Math.abs(referenceResult.transformDelta.y)).toBeLessThan(2);
    expect(Math.abs(referenceResult.transformDelta.zoom)).toBeLessThan(0.02);
    expect(Math.abs(worktreeResult.transformDelta.x)).toBeLessThan(2);
    expect(Math.abs(worktreeResult.transformDelta.y)).toBeLessThan(2);
    expect(Math.abs(worktreeResult.transformDelta.zoom)).toBeLessThan(0.02);
    expect(
      Math.abs(worktreeResult.layoutDelta.x - referenceResult.layoutDelta.x),
    ).toBeLessThan(12);
    expect(
      Math.abs(worktreeResult.layoutDelta.y - referenceResult.layoutDelta.y),
    ).toBeLessThan(12);
    expect(
      Math.abs(worktreeResult.rectDelta.x - referenceResult.rectDelta.x),
    ).toBeLessThan(16);
    expect(
      Math.abs(worktreeResult.rectDelta.y - referenceResult.rectDelta.y),
    ).toBeLessThan(16);
    expect(
      Math.abs(
        worktreeResult.afterMotion.centerOffsetFromRootCenter -
          referenceResult.afterMotion.centerOffsetFromRootCenter,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.rect.width -
          referenceResult.afterMotion.rect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.rect.height -
          referenceResult.afterMotion.rect.height,
      ),
    ).toBeLessThan(12);
    expect(
      Math.abs(
        worktreeResult.modeRowBox.width - referenceResult.modeRowBox.width,
      ),
    ).toBeLessThan(12);
    expect(
      Math.abs(
        worktreeResult.modeRowBox.height - referenceResult.modeRowBox.height,
      ),
    ).toBeLessThan(6);
  } finally {
    await setSectionParamFilterForPage({
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      page,
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeDropzoneSectionId,
      value: initialWorktreeDropzoneParamFilter,
    }).catch(() => {});
    await setSectionParamFilterForPage({
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceDropzoneSectionId,
      value: initialReferenceDropzoneParamFilter,
    }).catch(() => {});
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

test("settings graph parity probe keeps the dropzone mode row attached after normalized authoritative layout move on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  test.slow();
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
  const dropzoneSectionName = "dropzoneParamCodeObjDefault";
  const worktreeDropzoneSectionId = findSectionIdByName(
    worktreeInitialState,
    dropzoneSectionName,
  );
  const referenceDropzoneSectionId = findSectionIdByName(
    referenceInitialState,
    dropzoneSectionName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const initialWorktreeDropzoneParamFilter = await getSectionParamFilterForPage(
    page,
    worktreeDropzoneSectionId,
  );
  const initialReferenceDropzoneParamFilter =
    await getSectionParamFilterForPage(
      referencePage,
      referenceDropzoneSectionId,
    );
  const normalizedDropzoneParamFilter = initialReferenceDropzoneParamFilter;
  const moveDelta = { x: 120, y: 80 };

  async function captureDropzoneAfterAuthoritativeMove(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
    targetParamFilter: string;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await setSectionParamFilterForPage({
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      sectionId: args.sectionId,
      value: args.targetParamFilter,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: dropzoneSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const modeRow = sectionLocator.getByText("Mode", { exact: true }).first();

    await expect(sectionLocator).toBeVisible();
    await expect(modeRow).toBeVisible();

    const beforeLayout = await getActiveTopLevelSectionLayout(
      args.targetPage,
      args.sectionId,
    );
    if (!beforeLayout) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} dropzone authoritative-move baseline layout.`,
      );
    }

    await moveActiveTopLevelSectionByDelta({
      backendOrigin: args.backendOrigin,
      delta: moveDelta,
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      sectionId: args.sectionId,
    });

    const afterMoveLayout = await getActiveTopLevelSectionLayout(
      args.targetPage,
      args.sectionId,
    );
    if (!afterMoveLayout) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} dropzone authoritative-move layout after update.`,
      );
    }
    expect(
      Math.abs(afterMoveLayout.x - beforeLayout.x - moveDelta.x),
    ).toBeLessThan(1);
    expect(
      Math.abs(afterMoveLayout.y - beforeLayout.y - moveDelta.y),
    ).toBeLessThan(1);

    await setDurableActiveSectionIds(args.targetPage, []);
    expect(
      await fitGraphViewportToSection(args.targetPage, args.sectionId),
    ).toBe(true);
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

    await expect(modeRow).toBeVisible();

    const afterFit = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterAnchorPosition = await getLocatorRelativeCenterPosition({
      child: modeRow,
      section: sectionLocator,
    });
    const afterModeRowBox = await modeRow.boundingBox();
    if (
      afterFit.centerOffsetFromRootCenter === null ||
      !afterFit.rect ||
      !afterFit.transform ||
      !afterAnchorPosition ||
      !afterModeRowBox
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} dropzone authoritative-move metrics.`,
      );
    }

    return {
      afterFit: {
        centerOffsetFromRootCenter: afterFit.centerOffsetFromRootCenter,
        rect: afterFit.rect,
        transform: afterFit.transform,
      },
      anchorPosition: afterAnchorPosition,
      layoutDelta: {
        x: afterMoveLayout.x - beforeLayout.x,
        y: afterMoveLayout.y - beforeLayout.y,
      },
      modeRowBox: afterModeRowBox,
      paneState: afterFit.paneState,
    };
  }

  try {
    const referenceResult = await captureDropzoneAfterAuthoritativeMove({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceDropzoneSectionId,
      side: "reference",
      targetPage: referencePage,
      targetParamFilter: normalizedDropzoneParamFilter,
    });
    const worktreeResult = await captureDropzoneAfterAuthoritativeMove({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeDropzoneSectionId,
      side: "worktree",
      targetPage: page,
      targetParamFilter: normalizedDropzoneParamFilter,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(
      Math.abs(worktreeResult.layoutDelta.x - referenceResult.layoutDelta.x),
    ).toBeLessThan(1);
    expect(
      Math.abs(worktreeResult.layoutDelta.y - referenceResult.layoutDelta.y),
    ).toBeLessThan(1);
    expect(
      Math.abs(
        worktreeResult.afterFit.centerOffsetFromRootCenter -
          referenceResult.afterFit.centerOffsetFromRootCenter,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterFit.transform.zoom -
          referenceResult.afterFit.transform.zoom,
      ),
    ).toBeLessThan(0.02);
    expect(
      Math.abs(
        worktreeResult.afterFit.rect.x - referenceResult.afterFit.rect.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterFit.rect.y - referenceResult.afterFit.rect.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterFit.rect.width -
          referenceResult.afterFit.rect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterFit.rect.height -
          referenceResult.afterFit.rect.height,
      ),
    ).toBeLessThan(12);
    expect(
      Math.abs(
        worktreeResult.anchorPosition.x - referenceResult.anchorPosition.x,
      ),
    ).toBeLessThan(0.03);
    expect(
      Math.abs(
        worktreeResult.anchorPosition.y - referenceResult.anchorPosition.y,
      ),
    ).toBeLessThan(0.03);
    expect(
      Math.abs(
        worktreeResult.modeRowBox.width - referenceResult.modeRowBox.width,
      ),
    ).toBeLessThan(12);
    expect(
      Math.abs(
        worktreeResult.modeRowBox.height - referenceResult.modeRowBox.height,
      ),
    ).toBeLessThan(6);
  } finally {
    await setSectionParamFilterForPage({
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      page,
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeDropzoneSectionId,
      value: initialWorktreeDropzoneParamFilter,
    }).catch(() => {});
    await setSectionParamFilterForPage({
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceDropzoneSectionId,
      value: initialReferenceDropzoneParamFilter,
    }).catch(() => {});
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

test("settings graph parity probe keeps the spreadsheet body search input working after normalized motion on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  const spreadsheetSectionName = "spreadsheetSectionDefault";
  test.slow();

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
  const worktreeSpreadsheetSectionId = findSectionIdByName(
    worktreeInitialState,
    spreadsheetSectionName,
  );
  const referenceSpreadsheetSectionId = findSectionIdByName(
    referenceInitialState,
    spreadsheetSectionName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const panDelta = { x: 120, y: 80 };
  const inputValue = "density";

  async function captureSpreadsheetSearchAfterMotion(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
  }) {
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: spreadsheetSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);

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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const searchInput = sectionLocator
      .locator(`[id="${args.sectionId}-args-filter"]`)
      .first();

    await expect(sectionLocator).toBeVisible();
    await expect(searchInput).toBeVisible();

    const before = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const beforeInputPosition = await getSectionChildRelativeCenterPosition(
      args.targetPage,
      args.sectionId,
      `${args.sectionId}-args-filter`,
    );
    if (!before.rect || !before.transform || !beforeInputPosition) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} spreadsheet search baseline metrics.`,
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
        const afterPan = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        if (!afterPan.rect || !afterPan.transform) {
          return 0;
        }
        return Math.max(
          Math.hypot(
            afterPan.rect.x - before.rect.x,
            afterPan.rect.y - before.rect.y,
          ),
          Math.hypot(
            afterPan.transform.x - before.transform.x,
            afterPan.transform.y - before.transform.y,
          ),
        );
      })
      .toBeGreaterThan(60);

    await expect
      .poll(async () => {
        const latestInputPosition = await getSectionChildRelativeCenterPosition(
          args.targetPage,
          args.sectionId,
          `${args.sectionId}-args-filter`,
        );
        if (!latestInputPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestInputPosition.x - beforeInputPosition.x),
          Math.abs(latestInputPosition.y - beforeInputPosition.y),
        );
      })
      .toBeLessThan(0.03);

    const afterPan = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const afterPanInputPosition = await getSectionChildRelativeCenterPosition(
      args.targetPage,
      args.sectionId,
      `${args.sectionId}-args-filter`,
    );
    if (!afterPan.transform) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} spreadsheet search pan metrics.`,
      );
    }

    await args.targetPage.getByRole("button", { name: "zoom in" }).click();

    await expect
      .poll(async () => {
        return (
          (
            await captureSettingsGraphSectionMetrics(
              args.targetPage,
              args.sectionId,
            )
          ).transform?.zoom ?? 0
        );
      })
      .toBeGreaterThan(afterPan.transform.zoom * 1.08);

    await searchInput.click();
    await expect(searchInput).toBeFocused();
    await searchInput.fill(inputValue);
    await expect(searchInput).toHaveValue(inputValue);

    const afterZoomMetrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    if (!afterPanInputPosition || !afterZoomMetrics.transform) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} spreadsheet search zoom metrics.`,
      );
    }

    await searchInput.fill("");
    await expect(searchInput).toHaveValue("");

    return {
      panInputPositionDrift: {
        x: Math.abs(afterPanInputPosition.x - beforeInputPosition.x),
        y: Math.abs(afterPanInputPosition.y - beforeInputPosition.y),
      },
      paneState: await getLocalPaneState(args.targetPage),
      zoomDelta: afterZoomMetrics.transform.zoom - afterPan.transform.zoom,
    };
  }

  try {
    const referenceResult = await captureSpreadsheetSearchAfterMotion({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceSpreadsheetSectionId,
      side: "reference",
      targetPage: referencePage,
    });
    const worktreeResult = await captureSpreadsheetSearchAfterMotion({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeSpreadsheetSectionId,
      side: "worktree",
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.panInputPositionDrift.x).toBeLessThan(0.03);
    expect(referenceResult.panInputPositionDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.panInputPositionDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.panInputPositionDrift.y).toBeLessThan(0.03);
    expect(
      Math.abs(worktreeResult.zoomDelta - referenceResult.zoomDelta),
    ).toBeLessThan(0.04);
  } finally {
    await restoreInitialViewModeLayout({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      page,
      projectConfigId: worktreeProjectConfigId,
    }).catch(() => {});
    await restoreInitialViewModeLayout({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
    }).catch(() => {});
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

test("settings graph parity probe keeps the dropzone args filter editable after normalized pane pan on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  const dropzoneSectionName = "dropzoneParamCodeObjDefault";
  test.slow();

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
  const worktreeDropzoneSectionId = findSectionIdByName(
    worktreeInitialState,
    dropzoneSectionName,
  );
  const referenceDropzoneSectionId = findSectionIdByName(
    referenceInitialState,
    dropzoneSectionName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const initialWorktreeDropzoneParamFilter = await getSectionParamFilterForPage(
    page,
    worktreeDropzoneSectionId,
  );
  const initialReferenceDropzoneParamFilter =
    await getSectionParamFilterForPage(
      referencePage,
      referenceDropzoneSectionId,
    );
  const normalizedDropzoneParamFilter = initialReferenceDropzoneParamFilter;
  const panDelta = { x: 120, y: 80 };
  const filterValue = "dropzone pane pan";

  async function captureDropzoneFilterAfterPan(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
    targetParamFilter: string;
  }) {
    await setSectionParamFilterForPage({
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      sectionId: args.sectionId,
      value: args.targetParamFilter,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: dropzoneSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);

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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const filterInput = sectionLocator
      .locator(`[id="${args.sectionId}-args-filter"]`)
      .first();

    await expect(sectionLocator).toBeVisible();
    await expect(filterInput).toBeVisible();

    const beforeMetrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const beforeFilterPosition = await getSectionChildRelativeCenterPosition(
      args.targetPage,
      args.sectionId,
      `${args.sectionId}-args-filter`,
    );
    if (
      !beforeMetrics.rect ||
      !beforeMetrics.transform ||
      !beforeFilterPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} dropzone pane-pan baseline metrics.`,
      );
    }

    // Pane pan should move the graph surface without detaching the dropzone filter.
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
        const afterPan = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        if (!afterPan.rect || !afterPan.transform) {
          return 0;
        }
        return Math.max(
          Math.hypot(
            afterPan.rect.x - beforeMetrics.rect.x,
            afterPan.rect.y - beforeMetrics.rect.y,
          ),
          Math.hypot(
            afterPan.transform.x - beforeMetrics.transform.x,
            afterPan.transform.y - beforeMetrics.transform.y,
          ),
        );
      })
      .toBeGreaterThan(60);

    await expect
      .poll(async () => {
        const latestFilterPosition =
          await getSectionChildRelativeCenterPosition(
            args.targetPage,
            args.sectionId,
            `${args.sectionId}-args-filter`,
          );
        if (!latestFilterPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestFilterPosition.x - beforeFilterPosition.x),
          Math.abs(latestFilterPosition.y - beforeFilterPosition.y),
        );
      })
      .toBeLessThan(0.03);

    const afterMetrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const afterFilterPosition = await getSectionChildRelativeCenterPosition(
      args.targetPage,
      args.sectionId,
      `${args.sectionId}-args-filter`,
    );
    if (!afterMetrics.transform || !afterFilterPosition) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} dropzone pane-pan result metrics.`,
      );
    }

    await filterInput.click();
    await expect(filterInput).toBeFocused();
    await filterInput.fill(filterValue);
    await expect(filterInput).toHaveValue(filterValue);
    await filterInput.fill(args.targetParamFilter);
    await expect(filterInput).toHaveValue(args.targetParamFilter);

    return {
      filterPositionDrift: {
        x: Math.abs(afterFilterPosition.x - beforeFilterPosition.x),
        y: Math.abs(afterFilterPosition.y - beforeFilterPosition.y),
      },
      paneState: await getLocalPaneState(args.targetPage),
      transformDelta: {
        x: afterMetrics.transform.x - beforeMetrics.transform.x,
        y: afterMetrics.transform.y - beforeMetrics.transform.y,
        zoom: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
      },
    };
  }

  try {
    const referenceResult = await captureDropzoneFilterAfterPan({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceDropzoneSectionId,
      side: "reference",
      targetPage: referencePage,
      targetParamFilter: normalizedDropzoneParamFilter,
    });
    const worktreeResult = await captureDropzoneFilterAfterPan({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeDropzoneSectionId,
      side: "worktree",
      targetPage: page,
      targetParamFilter: normalizedDropzoneParamFilter,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.filterPositionDrift.x).toBeLessThan(0.03);
    expect(referenceResult.filterPositionDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.filterPositionDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.filterPositionDrift.y).toBeLessThan(0.03);
    expect(
      Math.abs(
        worktreeResult.transformDelta.x - referenceResult.transformDelta.x,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.y - referenceResult.transformDelta.y,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.zoom -
          referenceResult.transformDelta.zoom,
      ),
    ).toBeLessThan(0.02);
  } finally {
    await setSectionParamFilterForPage({
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      page,
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeDropzoneSectionId,
      value: initialWorktreeDropzoneParamFilter,
    }).catch(() => {});
    await setSectionParamFilterForPage({
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceDropzoneSectionId,
      value: initialReferenceDropzoneParamFilter,
    }).catch(() => {});
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

test("settings graph parity probe keeps the group args filter editable after normalized pane pan on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  const groupSectionName = "groupSectionDefault";
  test.slow();

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
  const worktreeGroupSectionId = findSectionIdByName(
    worktreeInitialState,
    groupSectionName,
  );
  const referenceGroupSectionId = findSectionIdByName(
    referenceInitialState,
    groupSectionName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const panDelta = { x: 120, y: 80 };
  const filterValue = "stream";

  async function captureGroupArgsFilterAfterPan(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
  }) {
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: groupSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);

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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const filterInput = sectionLocator
      .locator(`[id="${args.sectionId}-args-filter"]`)
      .first();

    await expect(sectionLocator).toBeVisible();
    await expect(filterInput).toBeVisible();

    const beforeMetrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const beforeFilterPosition = await getSectionChildRelativeCenterPosition(
      args.targetPage,
      args.sectionId,
      `${args.sectionId}-args-filter`,
    );
    if (
      !beforeMetrics.rect ||
      !beforeMetrics.transform ||
      !beforeFilterPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} group args baseline metrics.`,
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
        const afterPan = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        if (!afterPan.rect || !afterPan.transform) {
          return 0;
        }
        return Math.max(
          Math.hypot(
            afterPan.rect.x - beforeMetrics.rect.x,
            afterPan.rect.y - beforeMetrics.rect.y,
          ),
          Math.hypot(
            afterPan.transform.x - beforeMetrics.transform.x,
            afterPan.transform.y - beforeMetrics.transform.y,
          ),
        );
      })
      .toBeGreaterThan(60);

    await expect
      .poll(async () => {
        const latestFilterPosition =
          await getSectionChildRelativeCenterPosition(
            args.targetPage,
            args.sectionId,
            `${args.sectionId}-args-filter`,
          );
        if (!latestFilterPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestFilterPosition.x - beforeFilterPosition.x),
          Math.abs(latestFilterPosition.y - beforeFilterPosition.y),
        );
      })
      .toBeLessThan(0.03);

    const afterMetrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const afterFilterPosition = await getSectionChildRelativeCenterPosition(
      args.targetPage,
      args.sectionId,
      `${args.sectionId}-args-filter`,
    );
    if (!afterMetrics.transform || !afterFilterPosition) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} group args result metrics.`,
      );
    }

    await filterInput.click();
    await expect(filterInput).toBeFocused();
    await filterInput.fill(filterValue);
    await expect(filterInput).toHaveValue(filterValue);
    await filterInput.fill("");
    await expect(filterInput).toHaveValue("");

    return {
      filterPositionDrift: {
        x: Math.abs(afterFilterPosition.x - beforeFilterPosition.x),
        y: Math.abs(afterFilterPosition.y - beforeFilterPosition.y),
      },
      paneState: await getLocalPaneState(args.targetPage),
      transformDelta: {
        x: afterMetrics.transform.x - beforeMetrics.transform.x,
        y: afterMetrics.transform.y - beforeMetrics.transform.y,
        zoom: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
      },
    };
  }

  try {
    const referenceResult = await captureGroupArgsFilterAfterPan({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceGroupSectionId,
      side: "reference",
      targetPage: referencePage,
    });
    const worktreeResult = await captureGroupArgsFilterAfterPan({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeGroupSectionId,
      side: "worktree",
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.filterPositionDrift.x).toBeLessThan(0.03);
    expect(referenceResult.filterPositionDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.filterPositionDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.filterPositionDrift.y).toBeLessThan(0.03);
    expect(
      Math.abs(
        worktreeResult.transformDelta.x - referenceResult.transformDelta.x,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.y - referenceResult.transformDelta.y,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.zoom -
          referenceResult.transformDelta.zoom,
      ),
    ).toBeLessThan(0.02);
  } finally {
    await restoreInitialViewModeLayout({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      page,
      projectConfigId: worktreeProjectConfigId,
    }).catch(() => {});
    await restoreInitialViewModeLayout({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
    }).catch(() => {});
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

test("settings graph parity probe keeps the widened draw section attached during normalized pane pan on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  const drawSectionName = "drawSectionDefault";
  test.slow();

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
  const worktreeDrawSectionId = findSectionIdByName(
    worktreeInitialState,
    drawSectionName,
  );
  const referenceDrawSectionId = findSectionIdByName(
    referenceInitialState,
    drawSectionName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const panDelta = { x: 120, y: 80 };

  async function captureDrawSectionAfterPan(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
  }) {
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: drawSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);

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

    await expect
      .poll(async () => {
        return (
          (
            await captureSettingsGraphSectionMetrics(
              args.targetPage,
              args.sectionId,
            )
          ).rect?.width ?? 0
        );
      })
      .toBeGreaterThan(500);
    await expect
      .poll(async () => {
        return (
          (
            await captureSettingsGraphSectionMetrics(
              args.targetPage,
              args.sectionId,
            )
          ).rect?.height ?? 0
        );
      })
      .toBeGreaterThan(300);

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const drawArgsFilter = sectionLocator
      .locator(`[id="${args.sectionId}-args-filter"]`)
      .first();

    await expect(sectionLocator).toBeVisible();
    await expect(drawArgsFilter).toBeVisible();

    const beforeMetrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const beforeAnchorPosition = await getSectionChildRelativeCenterPosition(
      args.targetPage,
      args.sectionId,
      `${args.sectionId}-args-filter`,
    );
    if (
      !beforeMetrics.rect ||
      !beforeMetrics.transform ||
      !beforeAnchorPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} draw-section baseline metrics.`,
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
        const afterPan = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        if (!afterPan.rect || !afterPan.transform) {
          return 0;
        }
        return Math.max(
          Math.hypot(
            afterPan.rect.x - beforeMetrics.rect.x,
            afterPan.rect.y - beforeMetrics.rect.y,
          ),
          Math.hypot(
            afterPan.transform.x - beforeMetrics.transform.x,
            afterPan.transform.y - beforeMetrics.transform.y,
          ),
        );
      })
      .toBeGreaterThan(60);

    await expect
      .poll(async () => {
        const latestAnchorPosition =
          await getSectionChildRelativeCenterPosition(
            args.targetPage,
            args.sectionId,
            `${args.sectionId}-args-filter`,
          );
        if (!latestAnchorPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestAnchorPosition.x - beforeAnchorPosition.x),
          Math.abs(latestAnchorPosition.y - beforeAnchorPosition.y),
        );
      })
      .toBeLessThan(0.03);

    const afterMetrics = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const afterAnchorPosition = await getSectionChildRelativeCenterPosition(
      args.targetPage,
      args.sectionId,
      `${args.sectionId}-args-filter`,
    );
    if (!afterMetrics.transform || !afterAnchorPosition) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} draw-section result metrics.`,
      );
    }

    return {
      anchorPositionDrift: {
        x: Math.abs(afterAnchorPosition.x - beforeAnchorPosition.x),
        y: Math.abs(afterAnchorPosition.y - beforeAnchorPosition.y),
      },
      paneState: await getLocalPaneState(args.targetPage),
      transformDelta: {
        x: afterMetrics.transform.x - beforeMetrics.transform.x,
        y: afterMetrics.transform.y - beforeMetrics.transform.y,
        zoom: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
      },
    };
  }

  try {
    const referenceResult = await captureDrawSectionAfterPan({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceDrawSectionId,
      side: "reference",
      targetPage: referencePage,
    });
    const worktreeResult = await captureDrawSectionAfterPan({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeDrawSectionId,
      side: "worktree",
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.anchorPositionDrift.x).toBeLessThan(0.03);
    expect(referenceResult.anchorPositionDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.anchorPositionDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.anchorPositionDrift.y).toBeLessThan(0.03);
    expect(
      Math.abs(
        worktreeResult.transformDelta.x - referenceResult.transformDelta.x,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.y - referenceResult.transformDelta.y,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.zoom -
          referenceResult.transformDelta.zoom,
      ),
    ).toBeLessThan(0.02);
  } finally {
    await restoreInitialViewModeLayout({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      page,
      projectConfigId: worktreeProjectConfigId,
    }).catch(() => {});
    await restoreInitialViewModeLayout({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
    }).catch(() => {});
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

test("settings graph parity probe keeps the chat windowing auto-create control attached during normalized top-level drag on read-only main legacy and worktree canary", async ({
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
  const worktreeChatWindowingSectionId = findSectionIdByName(
    worktreeInitialState,
    "chatWindowing",
  );
  const referenceChatWindowingSectionId = findSectionIdByName(
    referenceInitialState,
    "chatWindowing",
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const dragDelta = { x: 120, y: 80 };

  async function captureChatWindowingDragAttachment(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    targetPage: Page;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const autoCreateAnchor = sectionLocator
      .getByRole("button", { name: /Auto Create Initial Chat/i })
      .first();

    await expect(sectionLocator).toBeVisible();
    await expect(autoCreateAnchor).toBeVisible();

    const beforeMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const beforeLayout = await waitForSettledTopLevelSectionLayout({
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const beforeAnchorPosition = await getLocatorRelativeCenterPosition({
      child: autoCreateAnchor,
      section: sectionLocator,
    });
    if (
      !beforeMetrics.rect ||
      !beforeMetrics.transform ||
      !beforeAnchorPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} chat drag baseline metrics.`,
      );
    }

    const dragPoint = await findSettingsGraphSectionHeaderDragPoint(
      args.targetPage,
      args.sectionId,
    );
    await args.targetPage.mouse.move(dragPoint.x, dragPoint.y);
    await args.targetPage.mouse.down();
    await args.targetPage.mouse.move(
      dragPoint.x + dragDelta.x,
      dragPoint.y + dragDelta.y,
      {
        steps: 10,
      },
    );
    await args.targetPage.mouse.up();

    await expect
      .poll(async () => {
        const afterLayout = await getActiveTopLevelSectionLayout(
          args.targetPage,
          args.sectionId,
        );
        if (!afterLayout) {
          return 0;
        }
        return Math.hypot(
          afterLayout.x - beforeLayout.x,
          afterLayout.y - beforeLayout.y,
        );
      })
      .toBeGreaterThan(80);

    await expect
      .poll(async () => {
        const latestAnchorPosition = await getLocatorRelativeCenterPosition({
          child: autoCreateAnchor,
          section: sectionLocator,
        });
        if (!latestAnchorPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestAnchorPosition.x - beforeAnchorPosition.x),
          Math.abs(latestAnchorPosition.y - beforeAnchorPosition.y),
        );
      })
      .toBeLessThan(0.03);

    const afterMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterLayout = await waitForSettledTopLevelSectionLayout({
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterAnchorPosition = await getLocatorRelativeCenterPosition({
      child: autoCreateAnchor,
      section: sectionLocator,
    });
    if (!afterMetrics.rect || !afterMetrics.transform || !afterAnchorPosition) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} chat drag result metrics.`,
      );
    }

    return {
      anchorPositionDrift: {
        x: Math.abs(afterAnchorPosition.x - beforeAnchorPosition.x),
        y: Math.abs(afterAnchorPosition.y - beforeAnchorPosition.y),
      },
      layoutDelta: {
        x: afterLayout.x - beforeLayout.x,
        y: afterLayout.y - beforeLayout.y,
      },
      paneState: afterMetrics.paneState,
      rectDelta: {
        x: afterMetrics.rect.x - beforeMetrics.rect.x,
        y: afterMetrics.rect.y - beforeMetrics.rect.y,
      },
      transformDelta: {
        x: afterMetrics.transform.x - beforeMetrics.transform.x,
        y: afterMetrics.transform.y - beforeMetrics.transform.y,
        zoom: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
      },
    };
  }

  try {
    const referenceResult = await captureChatWindowingDragAttachment({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceChatWindowingSectionId,
      targetPage: referencePage,
    });
    const worktreeResult = await captureChatWindowingDragAttachment({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeChatWindowingSectionId,
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.anchorPositionDrift.x).toBeLessThan(0.03);
    expect(referenceResult.anchorPositionDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.anchorPositionDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.anchorPositionDrift.y).toBeLessThan(0.03);
    expect(Math.abs(referenceResult.transformDelta.x)).toBeLessThan(2);
    expect(Math.abs(referenceResult.transformDelta.y)).toBeLessThan(2);
    expect(Math.abs(referenceResult.transformDelta.zoom)).toBeLessThan(0.02);
    expect(Math.abs(worktreeResult.transformDelta.x)).toBeLessThan(2);
    expect(Math.abs(worktreeResult.transformDelta.y)).toBeLessThan(2);
    expect(Math.abs(worktreeResult.transformDelta.zoom)).toBeLessThan(0.02);
    expect(
      Math.abs(worktreeResult.layoutDelta.x - referenceResult.layoutDelta.x),
    ).toBeLessThan(12);
    expect(
      Math.abs(worktreeResult.layoutDelta.y - referenceResult.layoutDelta.y),
    ).toBeLessThan(12);
    expect(
      Math.abs(worktreeResult.rectDelta.x - referenceResult.rectDelta.x),
    ).toBeLessThan(16);
    expect(
      Math.abs(worktreeResult.rectDelta.y - referenceResult.rectDelta.y),
    ).toBeLessThan(16);
  } finally {
    await restoreInitialViewModeLayout({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      page,
      projectConfigId: worktreeProjectConfigId,
    }).catch(() => {});
    await restoreInitialViewModeLayout({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
    }).catch(() => {});
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

test("settings graph parity probe keeps the chat windowing auto-create control attached during normalized pane pan on read-only main legacy and worktree canary", async ({
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
  const worktreeChatWindowingSectionId = findSectionIdByName(
    worktreeInitialState,
    "chatWindowing",
  );
  const referenceChatWindowingSectionId = findSectionIdByName(
    referenceInitialState,
    "chatWindowing",
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const panDelta = { x: 120, y: 80 };

  async function captureChatWindowingAutoCreateAnchorAfterPan(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    targetPage: Page;
  }) {
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const autoCreateAnchor = sectionLocator
      .getByRole("button", { name: /Auto Create Initial Chat/i })
      .first();

    await expect(sectionLocator).toBeVisible();
    await expect(autoCreateAnchor).toBeVisible();

    const beforeMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const beforeAnchorPosition = await getLocatorRelativeCenterPosition({
      child: autoCreateAnchor,
      section: sectionLocator,
    });
    if (
      !beforeMetrics.rect ||
      !beforeMetrics.transform ||
      !beforeAnchorPosition
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} chat anchor baseline metrics.`,
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
        const afterPan = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        if (!afterPan.rect || !afterPan.transform) {
          return 0;
        }
        return Math.max(
          Math.hypot(
            afterPan.rect.x - beforeMetrics.rect.x,
            afterPan.rect.y - beforeMetrics.rect.y,
          ),
          Math.hypot(
            afterPan.transform.x - beforeMetrics.transform.x,
            afterPan.transform.y - beforeMetrics.transform.y,
          ),
        );
      })
      .toBeGreaterThan(60);

    await expect
      .poll(async () => {
        const latestAnchorPosition = await getLocatorRelativeCenterPosition({
          child: autoCreateAnchor,
          section: sectionLocator,
        });
        if (!latestAnchorPosition) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestAnchorPosition.x - beforeAnchorPosition.x),
          Math.abs(latestAnchorPosition.y - beforeAnchorPosition.y),
        );
      })
      .toBeLessThan(0.03);

    const afterMetrics = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterAnchorPosition = await getLocatorRelativeCenterPosition({
      child: autoCreateAnchor,
      section: sectionLocator,
    });
    if (!afterMetrics.transform || !afterAnchorPosition) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} chat anchor result metrics.`,
      );
    }

    return {
      anchorPositionDrift: {
        x: Math.abs(afterAnchorPosition.x - beforeAnchorPosition.x),
        y: Math.abs(afterAnchorPosition.y - beforeAnchorPosition.y),
      },
      paneState: await getLocalPaneState(args.targetPage),
      transformDelta: {
        x: afterMetrics.transform.x - beforeMetrics.transform.x,
        y: afterMetrics.transform.y - beforeMetrics.transform.y,
        zoom: afterMetrics.transform.zoom - beforeMetrics.transform.zoom,
      },
    };
  }

  try {
    const referenceResult = await captureChatWindowingAutoCreateAnchorAfterPan({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceChatWindowingSectionId,
      targetPage: referencePage,
    });
    const worktreeResult = await captureChatWindowingAutoCreateAnchorAfterPan({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeChatWindowingSectionId,
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(referenceResult.anchorPositionDrift.x).toBeLessThan(0.03);
    expect(referenceResult.anchorPositionDrift.y).toBeLessThan(0.03);
    expect(worktreeResult.anchorPositionDrift.x).toBeLessThan(0.03);
    expect(worktreeResult.anchorPositionDrift.y).toBeLessThan(0.03);
    expect(
      Math.abs(
        worktreeResult.transformDelta.x - referenceResult.transformDelta.x,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.y - referenceResult.transformDelta.y,
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        worktreeResult.transformDelta.zoom -
          referenceResult.transformDelta.zoom,
      ),
    ).toBeLessThan(0.02);
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

test("settings graph parity probe keeps shared title editing working after normalized pane pan on read-only main legacy and worktree canary", async ({
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
  const panDelta = { x: 120, y: 80 };
  const referenceOriginalTitle =
    referenceInitialState.projectState.sections[
      sharedSection.referenceSectionId
    ]?.name ?? sharedSection.name;
  const worktreeOriginalTitle =
    worktreeInitialState.projectState.sections[sharedSection.worktreeSectionId]
      ?.name ?? sharedSection.name;

  async function captureTitleEditAfterPan(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    nextTitle: string;
    originalTitle: string;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    targetPage: Page;
  }) {
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const titleText = sectionLocator.locator("header p").first();
    const titleInput = sectionLocator.locator("header input").first();

    await expect(sectionLocator).toBeVisible();
    await expect(titleText).toBeVisible();
    await expect(titleText).toHaveText(args.originalTitle);

    const beforePan = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    if (!beforePan.rect || !beforePan.transform) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} title-edit baseline metrics for ${args.originalTitle}.`,
      );
    }

    const panStart = await findSettingsGraphPanePoint(args.targetPage, {
      panDelta,
      sectionId: args.sectionId,
    });
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
        const afterPan = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        if (!afterPan.rect || !afterPan.transform) {
          return 0;
        }
        return Math.max(
          Math.hypot(
            afterPan.rect.x - beforePan.rect.x,
            afterPan.rect.y - beforePan.rect.y,
          ),
          Math.hypot(
            afterPan.transform.x - beforePan.transform.x,
            afterPan.transform.y - beforePan.transform.y,
          ),
        );
      })
      .toBeGreaterThan(60);

    const afterPan = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    if (
      afterPan.centerOffsetFromRootCenter === null ||
      !afterPan.rect ||
      !afterPan.titleRect ||
      !afterPan.transform
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} title-edit post-pan metrics for ${args.originalTitle}.`,
      );
    }

    await titleText.dblclick();
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toBeFocused();
    await titleInput.fill(args.nextTitle);
    await titleInput.press("Enter");

    await expect
      .poll(async () => {
        const latestState = await getLatestProjectStateFromBackendOrigin(
          args.targetPage,
          args.backendOrigin,
          args.frontendOrigin,
          args.projectConfigId,
        );
        return latestState.projectState.sections[args.sectionId]?.name ?? null;
      })
      .toBe(args.nextTitle);
    await expect(titleText).toHaveText(args.nextTitle);
    await expect
      .poll(async () => {
        const metrics = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        return {
          hasRect: metrics.rect !== null,
          surfaceKind: metrics.surfaceKind,
        };
      })
      .toEqual({
        hasRect: true,
        surfaceKind: args.expectedSurfaceKind,
      });

    return {
      afterPan: {
        centerOffsetFromRootCenter: afterPan.centerOffsetFromRootCenter,
        rect: afterPan.rect,
        titleRect: afterPan.titleRect,
        transform: afterPan.transform,
      },
      paneState: await getLocalPaneState(args.targetPage),
    };
  }

  try {
    const referenceResult = await captureTitleEditAfterPan({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      nextTitle: `${referenceOriginalTitle} main parity`,
      originalTitle: referenceOriginalTitle,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: sharedSection.referenceSectionId,
      targetPage: referencePage,
    });
    const worktreeResult = await captureTitleEditAfterPan({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      nextTitle: `${worktreeOriginalTitle} canary parity`,
      originalTitle: worktreeOriginalTitle,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: sharedSection.worktreeSectionId,
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(
      Math.abs(
        worktreeResult.afterPan.centerOffsetFromRootCenter -
          referenceResult.afterPan.centerOffsetFromRootCenter,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterPan.transform.x -
          referenceResult.afterPan.transform.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterPan.transform.y -
          referenceResult.afterPan.transform.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterPan.transform.zoom -
          referenceResult.afterPan.transform.zoom,
      ),
    ).toBeLessThan(0.02);
    expect(
      Math.abs(
        worktreeResult.afterPan.rect.x - referenceResult.afterPan.rect.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterPan.rect.y - referenceResult.afterPan.rect.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterPan.rect.width -
          referenceResult.afterPan.rect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterPan.rect.height -
          referenceResult.afterPan.rect.height,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterPan.titleRect.x -
          referenceResult.afterPan.titleRect.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterPan.titleRect.y -
          referenceResult.afterPan.titleRect.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterPan.titleRect.width -
          referenceResult.afterPan.titleRect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterPan.titleRect.height -
          referenceResult.afterPan.titleRect.height,
      ),
    ).toBeLessThan(8);
  } finally {
    await restoreSectionNameForPage({
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      name: worktreeOriginalTitle,
      page,
      projectConfigId: worktreeProjectConfigId,
      sectionId: sharedSection.worktreeSectionId,
    }).catch(() => {});
    await restoreSectionNameForPage({
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      name: referenceOriginalTitle,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
      sectionId: sharedSection.referenceSectionId,
    }).catch(() => {});
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

test("settings graph parity probe keeps shared title editing working after normalized pan and zoom on read-only main legacy and worktree canary", async ({
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
  const panDelta = { x: 120, y: 80 };
  const referenceOriginalTitle =
    referenceInitialState.projectState.sections[
      sharedSection.referenceSectionId
    ]?.name ?? sharedSection.name;
  const worktreeOriginalTitle =
    worktreeInitialState.projectState.sections[sharedSection.worktreeSectionId]
      ?.name ?? sharedSection.name;

  async function captureTitleEditAfterPanAndZoom(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    nextTitle: string;
    originalTitle: string;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    targetPage: Page;
  }) {
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const titleText = sectionLocator.locator("header p").first();
    const titleInput = sectionLocator.locator("header input").first();

    await expect(sectionLocator).toBeVisible();
    await expect(titleText).toBeVisible();
    await expect(titleText).toHaveText(args.originalTitle);

    const beforePan = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    if (!beforePan.rect || !beforePan.transform) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} title-edit motion baseline metrics for ${args.originalTitle}.`,
      );
    }

    const panStart = await findSettingsGraphPanePoint(args.targetPage, {
      panDelta,
      sectionId: args.sectionId,
    });
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
        const afterPan = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        if (!afterPan.rect || !afterPan.transform) {
          return 0;
        }
        return Math.max(
          Math.hypot(
            afterPan.rect.x - beforePan.rect.x,
            afterPan.rect.y - beforePan.rect.y,
          ),
          Math.hypot(
            afterPan.transform.x - beforePan.transform.x,
            afterPan.transform.y - beforePan.transform.y,
          ),
        );
      })
      .toBeGreaterThan(60);

    const afterPan = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    if (!afterPan.transform) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} title-edit post-pan metrics for ${args.originalTitle}.`,
      );
    }

    await args.targetPage.getByRole("button", { name: "zoom in" }).click();
    await expect
      .poll(async () => {
        return (
          (
            await captureSettingsGraphSectionMetrics(
              args.targetPage,
              args.sectionId,
            )
          ).transform?.zoom ?? 0
        );
      })
      .toBeGreaterThan(afterPan.transform.zoom * 1.08);

    await expect(titleText).toBeVisible();

    const afterMotion = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    if (
      afterMotion.centerOffsetFromRootCenter === null ||
      !afterMotion.rect ||
      !afterMotion.titleRect ||
      !afterMotion.transform
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} title-edit post-motion metrics for ${args.originalTitle}.`,
      );
    }

    await titleText.dblclick();
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toBeFocused();
    await titleInput.fill(args.nextTitle);
    await titleInput.press("Enter");

    await expect
      .poll(async () => {
        const latestState = await getLatestProjectStateFromBackendOrigin(
          args.targetPage,
          args.backendOrigin,
          args.frontendOrigin,
          args.projectConfigId,
        );
        return latestState.projectState.sections[args.sectionId]?.name ?? null;
      })
      .toBe(args.nextTitle);
    await expect(titleText).toHaveText(args.nextTitle);
    await expect
      .poll(async () => {
        const metrics = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        return {
          hasRect: metrics.rect !== null,
          surfaceKind: metrics.surfaceKind,
        };
      })
      .toEqual({
        hasRect: true,
        surfaceKind: args.expectedSurfaceKind,
      });

    return {
      afterMotion: {
        centerOffsetFromRootCenter: afterMotion.centerOffsetFromRootCenter,
        rect: afterMotion.rect,
        titleRect: afterMotion.titleRect,
        transform: afterMotion.transform,
      },
      paneState: await getLocalPaneState(args.targetPage),
      zoomDelta: afterMotion.transform.zoom - afterPan.transform.zoom,
    };
  }

  try {
    const referenceResult = await captureTitleEditAfterPanAndZoom({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      nextTitle: `${referenceOriginalTitle} main motion parity`,
      originalTitle: referenceOriginalTitle,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: sharedSection.referenceSectionId,
      targetPage: referencePage,
    });
    const worktreeResult = await captureTitleEditAfterPanAndZoom({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      nextTitle: `${worktreeOriginalTitle} canary motion parity`,
      originalTitle: worktreeOriginalTitle,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: sharedSection.worktreeSectionId,
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(
      Math.abs(
        worktreeResult.afterMotion.centerOffsetFromRootCenter -
          referenceResult.afterMotion.centerOffsetFromRootCenter,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.transform.x -
          referenceResult.afterMotion.transform.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.transform.y -
          referenceResult.afterMotion.transform.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.transform.zoom -
          referenceResult.afterMotion.transform.zoom,
      ),
    ).toBeLessThan(0.04);
    expect(
      Math.abs(worktreeResult.zoomDelta - referenceResult.zoomDelta),
    ).toBeLessThan(0.04);
    expect(
      Math.abs(
        worktreeResult.afterMotion.rect.x - referenceResult.afterMotion.rect.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.rect.y - referenceResult.afterMotion.rect.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.rect.width -
          referenceResult.afterMotion.rect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.rect.height -
          referenceResult.afterMotion.rect.height,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.titleRect.x -
          referenceResult.afterMotion.titleRect.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.titleRect.y -
          referenceResult.afterMotion.titleRect.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.titleRect.width -
          referenceResult.afterMotion.titleRect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.titleRect.height -
          referenceResult.afterMotion.titleRect.height,
      ),
    ).toBeLessThan(8);
  } finally {
    await restoreSectionNameForPage({
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      name: worktreeOriginalTitle,
      page,
      projectConfigId: worktreeProjectConfigId,
      sectionId: sharedSection.worktreeSectionId,
    }).catch(() => {});
    await restoreSectionNameForPage({
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      name: referenceOriginalTitle,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
      sectionId: sharedSection.referenceSectionId,
    }).catch(() => {});
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

test("settings graph parity probe keeps the section sizing policy title editing working after normalized pan and zoom on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  test.slow();
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
  const sectionSizingPolicyName = "sectionSizingPolicy";
  const worktreeSectionSizingPolicyId = findSectionIdByName(
    worktreeInitialState,
    sectionSizingPolicyName,
  );
  const referenceSectionSizingPolicyId = findSectionIdByName(
    referenceInitialState,
    sectionSizingPolicyName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const panDelta = { x: 120, y: 80 };
  const referenceOriginalTitle =
    referenceInitialState.projectState.sections[referenceSectionSizingPolicyId]
      ?.name ?? sectionSizingPolicyName;
  const worktreeOriginalTitle =
    worktreeInitialState.projectState.sections[worktreeSectionSizingPolicyId]
      ?.name ?? sectionSizingPolicyName;

  async function captureSectionSizingPolicyTitleEditAfterPanAndZoom(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    nextTitle: string;
    originalTitle: string;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: sectionSizingPolicyName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const titleText = sectionLocator.locator("header p").first();
    const titleInput = sectionLocator.locator("header input").first();

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
    await expect(sectionLocator).toBeVisible();
    await expect(titleText).toBeVisible();
    await expect(titleText).toHaveText(args.originalTitle);

    const beforeMotion = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    if (!beforeMotion.rect || !beforeMotion.transform) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} section sizing policy title-edit motion baseline metrics for ${args.originalTitle}.`,
      );
    }

    await applyViewportFromBackendOrigin({
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      viewport: {
        x: beforeMotion.transform.x + panDelta.x,
        y: beforeMotion.transform.y + panDelta.y,
        zoom: beforeMotion.transform.zoom,
      },
    });

    await expect
      .poll(async () => {
        const afterPan = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        if (!afterPan.transform) {
          return 0;
        }
        return Math.hypot(
          afterPan.transform.x - beforeMotion.transform.x,
          afterPan.transform.y - beforeMotion.transform.y,
        );
      })
      .toBeGreaterThan(20);

    const afterPan = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    if (!afterPan.transform) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} section sizing policy title-edit post-pan metrics for ${args.originalTitle}.`,
      );
    }

    await args.targetPage.getByRole("button", { name: "zoom in" }).click();
    await expect
      .poll(async () => {
        return (
          (
            await captureSettingsGraphSectionMetrics(
              args.targetPage,
              args.sectionId,
            )
          ).transform?.zoom ?? 0
        );
      })
      .toBeGreaterThan(afterPan.transform.zoom * 1.08);

    await expect(titleText).toBeVisible();

    const afterMotion = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    if (
      afterMotion.centerOffsetFromRootCenter === null ||
      !afterMotion.rect ||
      !afterMotion.titleRect ||
      !afterMotion.transform
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} section sizing policy title-edit post-motion metrics for ${args.originalTitle}.`,
      );
    }

    await titleText.dblclick();
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toBeFocused();
    await titleInput.fill(args.nextTitle);
    await titleInput.press("Enter");

    await expect
      .poll(async () => {
        const latestState = await getLatestProjectStateFromBackendOrigin(
          args.targetPage,
          args.backendOrigin,
          args.frontendOrigin,
          args.projectConfigId,
        );
        return latestState.projectState.sections[args.sectionId]?.name ?? null;
      })
      .toBe(args.nextTitle);
    await expect(titleText).toHaveText(args.nextTitle);
    await expect
      .poll(async () => {
        const metrics = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        return {
          hasRect: metrics.rect !== null,
          surfaceKind: metrics.surfaceKind,
        };
      })
      .toEqual({
        hasRect: true,
        surfaceKind: args.expectedSurfaceKind,
      });

    return {
      afterMotion: {
        centerOffsetFromRootCenter: afterMotion.centerOffsetFromRootCenter,
        rect: afterMotion.rect,
        titleRect: afterMotion.titleRect,
        transform: afterMotion.transform,
      },
      paneState: await getLocalPaneState(args.targetPage),
      transformDelta: {
        x: afterMotion.transform.x - beforeMotion.transform.x,
        y: afterMotion.transform.y - beforeMotion.transform.y,
        zoom: afterMotion.transform.zoom - beforeMotion.transform.zoom,
      },
      zoomDelta: afterMotion.transform.zoom - afterPan.transform.zoom,
    };
  }

  try {
    const referenceResult =
      await captureSectionSizingPolicyTitleEditAfterPanAndZoom({
        activeViewModeId: referenceAllSettingsViewModeId,
        backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
        expectedSurfaceKind: "legacy",
        frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
        initialState: referenceInitialState,
        nextTitle: `${referenceOriginalTitle} main motion parity`,
        originalTitle: referenceOriginalTitle,
        pageTab: referencePage.getByRole("button", {
          exact: true,
          name: "All Settings",
        }),
        projectConfigId: referenceProjectConfigId,
        sectionId: referenceSectionSizingPolicyId,
        side: "reference",
        targetPage: referencePage,
      });
    const worktreeResult =
      await captureSectionSizingPolicyTitleEditAfterPanAndZoom({
        activeViewModeId: worktreeAllSettingsViewModeId,
        backendOrigin: WORKTREE_BACKEND_ORIGIN,
        expectedSurfaceKind: "canary",
        frontendOrigin: WORKTREE_BASE_URL,
        initialState: worktreeInitialState,
        nextTitle: `${worktreeOriginalTitle} canary motion parity`,
        originalTitle: worktreeOriginalTitle,
        pageTab: page.getByRole("button", {
          exact: true,
          name: "All Settings",
        }),
        projectConfigId: worktreeProjectConfigId,
        sectionId: worktreeSectionSizingPolicyId,
        side: "worktree",
        targetPage: page,
      });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(
      Math.abs(
        worktreeResult.transformDelta.x - referenceResult.transformDelta.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.transformDelta.y - referenceResult.transformDelta.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.centerOffsetFromRootCenter -
          referenceResult.afterMotion.centerOffsetFromRootCenter,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.transform.zoom -
          referenceResult.afterMotion.transform.zoom,
      ),
    ).toBeLessThan(0.04);
    expect(
      Math.abs(
        worktreeResult.transformDelta.zoom -
          referenceResult.transformDelta.zoom,
      ),
    ).toBeLessThan(0.04);
    expect(
      Math.abs(worktreeResult.zoomDelta - referenceResult.zoomDelta),
    ).toBeLessThan(0.04);
    expect(
      Math.abs(
        worktreeResult.afterMotion.rect.x - referenceResult.afterMotion.rect.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.rect.y - referenceResult.afterMotion.rect.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.rect.width -
          referenceResult.afterMotion.rect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.rect.height -
          referenceResult.afterMotion.rect.height,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.titleRect.x -
          referenceResult.afterMotion.titleRect.x,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.titleRect.y -
          referenceResult.afterMotion.titleRect.y,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.titleRect.width -
          referenceResult.afterMotion.titleRect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterMotion.titleRect.height -
          referenceResult.afterMotion.titleRect.height,
      ),
    ).toBeLessThan(8);
  } finally {
    await restoreSectionNameForPage({
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      name: worktreeOriginalTitle,
      page,
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeSectionSizingPolicyId,
    }).catch(() => {});
    await restoreSectionNameForPage({
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      name: referenceOriginalTitle,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceSectionSizingPolicyId,
    }).catch(() => {});
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

test("settings graph parity probe keeps the section sizing policy title editing working after normalized top-level drag on read-only main legacy and worktree canary", async ({
  context,
  page,
}) => {
  test.slow();
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
  const sectionSizingPolicyName = "sectionSizingPolicy";
  const worktreeSectionSizingPolicyId = findSectionIdByName(
    worktreeInitialState,
    sectionSizingPolicyName,
  );
  const referenceSectionSizingPolicyId = findSectionIdByName(
    referenceInitialState,
    sectionSizingPolicyName,
  );
  const initialWorktreePaneState = await getLocalPaneState(page);
  const initialReferencePaneState = await getLocalPaneState(referencePage);
  const dragDelta = { x: 120, y: 80 };
  const referenceOriginalTitle =
    referenceInitialState.projectState.sections[referenceSectionSizingPolicyId]
      ?.name ?? sectionSizingPolicyName;
  const worktreeOriginalTitle =
    worktreeInitialState.projectState.sections[worktreeSectionSizingPolicyId]
      ?.name ?? sectionSizingPolicyName;

  async function captureSectionSizingPolicyTitleEditAfterDrag(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    initialState: ProjectStateSingleConfigWithCompletedOpIds;
    nextTitle: string;
    originalTitle: string;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    side: "reference" | "worktree";
    targetPage: Page;
  }) {
    await restoreInitialViewModeLayout({
      activeViewModeId: args.activeViewModeId,
      backendOrigin: args.backendOrigin,
      frontendOrigin: args.frontendOrigin,
      initialState: args.initialState,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
    });
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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
    const preflight = await runSettingsGraphComparePreflight({
      backendOrigin: args.backendOrigin,
      expectedSurfaceKind: args.expectedSurfaceKind,
      expectedViewModeName: "All Settings",
      frontendOrigin: args.frontendOrigin,
      page: args.targetPage,
      projectConfigId: args.projectConfigId,
      requireFitView: true,
      side: args.side,
      targetSectionName: sectionSizingPolicyName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(args.sectionId);
    await clearSettingsGraphFocusedEditableTarget(args.targetPage);

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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const titleText = sectionLocator.locator("header p").first();
    const titleInput = sectionLocator.locator("header input").first();

    await expect(sectionLocator).toBeVisible();
    await expect(titleText).toBeVisible();
    await expect(titleText).toHaveText(args.originalTitle);

    const beforeDrag = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    const beforeLayout = await getActiveTopLevelSectionLayout(
      args.targetPage,
      args.sectionId,
    );
    if (
      !beforeDrag.rect ||
      !beforeDrag.titleRect ||
      !beforeDrag.transform ||
      !beforeLayout
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} section sizing policy title-edit drag baseline metrics for ${args.originalTitle}.`,
      );
    }

    const dragPoint = await findSettingsGraphSectionHeaderDragPoint(
      args.targetPage,
      args.sectionId,
    );
    await args.targetPage.mouse.move(dragPoint.x, dragPoint.y);
    await args.targetPage.mouse.down();
    await args.targetPage.mouse.move(
      dragPoint.x + dragDelta.x,
      dragPoint.y + dragDelta.y,
      {
        steps: 10,
      },
    );
    await args.targetPage.mouse.up();

    await expect
      .poll(async () => {
        const afterLayout = await getActiveTopLevelSectionLayout(
          args.targetPage,
          args.sectionId,
        );
        if (!afterLayout) {
          return 0;
        }
        return Math.hypot(
          afterLayout.x - beforeLayout.x,
          afterLayout.y - beforeLayout.y,
        );
      })
      .toBeGreaterThan(80);

    const afterDrag = await waitForSettledSectionMetrics({
      expectedSurfaceKind: args.expectedSurfaceKind,
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    const afterLayout = await waitForSettledTopLevelSectionLayout({
      page: args.targetPage,
      sectionId: args.sectionId,
    });
    if (
      afterDrag.centerOffsetFromRootCenter === null ||
      !afterDrag.rect ||
      !afterDrag.titleRect ||
      !afterDrag.transform ||
      !afterLayout
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} section sizing policy title-edit post-drag metrics for ${args.originalTitle}.`,
      );
    }

    await titleText.dblclick();
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toBeFocused();
    await titleInput.fill(args.nextTitle);
    await titleInput.press("Enter");

    await expect
      .poll(async () => {
        const latestState = await getLatestProjectStateFromBackendOrigin(
          args.targetPage,
          args.backendOrigin,
          args.frontendOrigin,
          args.projectConfigId,
        );
        return latestState.projectState.sections[args.sectionId]?.name ?? null;
      })
      .toBe(args.nextTitle);
    await expect(titleText).toHaveText(args.nextTitle);
    await expect
      .poll(async () => {
        const metrics = await captureSettingsGraphSectionMetrics(
          args.targetPage,
          args.sectionId,
        );
        return {
          hasRect: metrics.rect !== null,
          surfaceKind: metrics.surfaceKind,
        };
      })
      .toEqual({
        hasRect: true,
        surfaceKind: args.expectedSurfaceKind,
      });

    return {
      afterDrag: {
        centerOffsetFromRootCenter: afterDrag.centerOffsetFromRootCenter,
        rect: afterDrag.rect,
        titleRect: afterDrag.titleRect,
        transform: afterDrag.transform,
      },
      layoutDelta: {
        x: afterLayout.x - beforeLayout.x,
        y: afterLayout.y - beforeLayout.y,
      },
      paneState: await getLocalPaneState(args.targetPage),
      rectDelta: {
        x: afterDrag.rect.x - beforeDrag.rect.x,
        y: afterDrag.rect.y - beforeDrag.rect.y,
      },
      titleRectDelta: {
        x: afterDrag.titleRect.x - beforeDrag.titleRect.x,
        y: afterDrag.titleRect.y - beforeDrag.titleRect.y,
      },
      transformDelta: {
        x: afterDrag.transform.x - beforeDrag.transform.x,
        y: afterDrag.transform.y - beforeDrag.transform.y,
        zoom: afterDrag.transform.zoom - beforeDrag.transform.zoom,
      },
    };
  }

  try {
    const referenceResult = await captureSectionSizingPolicyTitleEditAfterDrag({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      initialState: referenceInitialState,
      nextTitle: `${referenceOriginalTitle} main drag parity`,
      originalTitle: referenceOriginalTitle,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceSectionSizingPolicyId,
      side: "reference",
      targetPage: referencePage,
    });
    const worktreeResult = await captureSectionSizingPolicyTitleEditAfterDrag({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      initialState: worktreeInitialState,
      nextTitle: `${worktreeOriginalTitle} canary drag parity`,
      originalTitle: worktreeOriginalTitle,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeSectionSizingPolicyId,
      side: "worktree",
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(Math.abs(referenceResult.transformDelta.x)).toBeLessThan(8);
    expect(Math.abs(referenceResult.transformDelta.y)).toBeLessThan(8);
    expect(Math.abs(referenceResult.transformDelta.zoom)).toBeLessThan(0.02);
    expect(Math.abs(worktreeResult.transformDelta.x)).toBeLessThan(8);
    expect(Math.abs(worktreeResult.transformDelta.y)).toBeLessThan(8);
    expect(Math.abs(worktreeResult.transformDelta.zoom)).toBeLessThan(0.02);
    expect(
      Math.abs(worktreeResult.layoutDelta.x - referenceResult.layoutDelta.x),
    ).toBeLessThan(12);
    expect(
      Math.abs(worktreeResult.layoutDelta.y - referenceResult.layoutDelta.y),
    ).toBeLessThan(12);
    expect(
      Math.abs(worktreeResult.rectDelta.x - referenceResult.rectDelta.x),
    ).toBeLessThan(16);
    expect(
      Math.abs(worktreeResult.rectDelta.y - referenceResult.rectDelta.y),
    ).toBeLessThan(16);
    expect(
      Math.abs(
        worktreeResult.titleRectDelta.x - referenceResult.titleRectDelta.x,
      ),
    ).toBeLessThan(16);
    expect(
      Math.abs(
        worktreeResult.titleRectDelta.y - referenceResult.titleRectDelta.y,
      ),
    ).toBeLessThan(16);
    expect(
      Math.abs(
        worktreeResult.afterDrag.centerOffsetFromRootCenter -
          referenceResult.afterDrag.centerOffsetFromRootCenter,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.afterDrag.transform.zoom -
          referenceResult.afterDrag.transform.zoom,
      ),
    ).toBeLessThan(0.02);
  } finally {
    await restoreSectionNameForPage({
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      frontendOrigin: WORKTREE_BASE_URL,
      name: worktreeOriginalTitle,
      page,
      projectConfigId: worktreeProjectConfigId,
      sectionId: worktreeSectionSizingPolicyId,
    }).catch(() => {});
    await restoreSectionNameForPage({
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      name: referenceOriginalTitle,
      page: referencePage,
      projectConfigId: referenceProjectConfigId,
      sectionId: referenceSectionSizingPolicyId,
    }).catch(() => {});
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

test("settings graph parity probe composes shared programmatic panBy and zoom in on read-only main legacy and worktree canary", async ({
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
    preferredNames: ["browserSectionDefault", "taskBoardSectionDefault"],
    referenceState: referenceInitialState,
    viewModeName: "All Settings",
    worktreeState: worktreeInitialState,
  });
  const panDelta = { x: -60, y: 30 };

  async function captureProgrammaticPanByAndZoom(args: {
    activeViewModeId: string;
    backendOrigin: string;
    expectedSurfaceKind: "legacy" | "canary";
    frontendOrigin: string;
    pageTab: Locator;
    projectConfigId: string;
    sectionId: string;
    targetPage: Page;
  }) {
    await normalizeSettingsGraphComparePaneState(args.targetPage);
    await setDurableActiveSectionIds(args.targetPage, []);
    await setPageViewModeAndClearViewport(
      args.targetPage,
      args.backendOrigin,
      args.frontendOrigin,
      args.projectConfigId,
      args.activeViewModeId,
      args.expectedSurfaceKind,
    );

    await expect(args.pageTab).toBeVisible();
    await args.pageTab.click();
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

    const sectionLocator = getSettingsGraphSectionLocator(
      args.targetPage,
      args.sectionId,
    );
    const titleText = sectionLocator.locator("header p").first();

    await expect(sectionLocator).toBeVisible();
    await expect(titleText).toBeVisible();

    const beforeMotion = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    if (
      !beforeMotion.rect ||
      !beforeMotion.titleRect ||
      !beforeMotion.transform
    ) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} programmatic pan baseline metrics.`,
      );
    }

    await args.targetPage.evaluate(async (delta) => {
      const { zoomIn } = await import(
        "/src/forks/xyflow/core/hooks/useViewportHelper.ts"
      );
      const { useReactFlow } = await import("/src/forks/xyflow/core/store");
      zoomIn.cancel();
      useReactFlow.getState().panBy(delta);
      zoomIn();
      if (typeof zoomIn.flush === "function") {
        zoomIn.flush();
      }
    }, panDelta);

    await expect
      .poll(async () => {
        const transform = (
          await captureSettingsGraphSectionMetrics(
            args.targetPage,
            args.sectionId,
          )
        ).transform;
        if (!transform) {
          return 0;
        }
        return Math.hypot(
          transform.x - beforeMotion.transform.x,
          transform.y - beforeMotion.transform.y,
        );
      })
      .toBeGreaterThan(20);

    await expect
      .poll(async () => {
        return (
          (
            await captureSettingsGraphSectionMetrics(
              args.targetPage,
              args.sectionId,
            )
          ).transform?.zoom ?? 0
        );
      })
      .toBeGreaterThan(beforeMotion.transform.zoom * 1.08);

    const afterMotion = await captureSettingsGraphSectionMetrics(
      args.targetPage,
      args.sectionId,
    );
    if (!afterMotion.rect || !afterMotion.titleRect || !afterMotion.transform) {
      throw new Error(
        `Missing ${args.expectedSurfaceKind} programmatic pan result metrics.`,
      );
    }

    await expect(titleText).toBeVisible();

    return {
      paneState: await getLocalPaneState(args.targetPage),
      rect: afterMotion.rect,
      titleRect: afterMotion.titleRect,
      transform: afterMotion.transform,
      zoomDelta: afterMotion.transform.zoom - beforeMotion.transform.zoom,
    };
  }

  try {
    const referenceResult = await captureProgrammaticPanByAndZoom({
      activeViewModeId: referenceAllSettingsViewModeId,
      backendOrigin: MAIN_REFERENCE_BACKEND_ORIGIN,
      expectedSurfaceKind: "legacy",
      frontendOrigin: MAIN_REFERENCE_FRONTEND_URL,
      pageTab: referencePage.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: referenceProjectConfigId,
      sectionId: sharedSection.referenceSectionId,
      targetPage: referencePage,
    });
    const worktreeResult = await captureProgrammaticPanByAndZoom({
      activeViewModeId: worktreeAllSettingsViewModeId,
      backendOrigin: WORKTREE_BACKEND_ORIGIN,
      expectedSurfaceKind: "canary",
      frontendOrigin: WORKTREE_BASE_URL,
      pageTab: page.getByRole("button", {
        exact: true,
        name: "All Settings",
      }),
      projectConfigId: worktreeProjectConfigId,
      sectionId: sharedSection.worktreeSectionId,
      targetPage: page,
    });

    expect(referenceResult.paneState).toEqual(
      SETTINGS_GRAPH_COMPARE_PANE_STATE,
    );
    expect(worktreeResult.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(
      Math.abs(worktreeResult.transform.x - referenceResult.transform.x),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeResult.transform.y - referenceResult.transform.y),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeResult.transform.zoom - referenceResult.transform.zoom),
    ).toBeLessThan(0.04);
    expect(
      Math.abs(worktreeResult.zoomDelta - referenceResult.zoomDelta),
    ).toBeLessThan(0.04);
    expect(
      Math.abs(worktreeResult.rect.x - referenceResult.rect.x),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeResult.rect.y - referenceResult.rect.y),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeResult.rect.width - referenceResult.rect.width),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeResult.rect.height - referenceResult.rect.height),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeResult.titleRect.x - referenceResult.titleRect.x),
    ).toBeLessThan(8);
    expect(
      Math.abs(worktreeResult.titleRect.y - referenceResult.titleRect.y),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.titleRect.width - referenceResult.titleRect.width,
      ),
    ).toBeLessThan(8);
    expect(
      Math.abs(
        worktreeResult.titleRect.height - referenceResult.titleRect.height,
      ),
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

async function cancelDebouncedViewportUpdate(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { debouncedDispatchViewportUpdate } = await import(
      "/src/state/actions/sectionInfos.ts"
    );
    debouncedDispatchViewportUpdate.cancel();
  });
}

async function applyViewportFromBackendOrigin(args: {
  backendOrigin: string;
  frontendOrigin: string;
  page: Page;
  projectConfigId: string;
  viewport: { x: number; y: number; zoom: number } | null;
}): Promise<ProjectStateSingleConfigWithCompletedOpIds> {
  await cancelDebouncedViewportUpdate(args.page);
  await postBackendForPage(
    args.page,
    args.backendOrigin,
    args.frontendOrigin,
    "/setViewport",
    {
      projectConfigId: args.projectConfigId,
      viewport: args.viewport,
    },
  );
  const stateUpdate = await getLatestProjectStateFromBackendOrigin(
    args.page,
    args.backendOrigin,
    args.frontendOrigin,
    args.projectConfigId,
  );
  await cancelDebouncedViewportUpdate(args.page);
  await applyProjectStateUpdate(args.page, stateUpdate);
  return stateUpdate;
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

async function restoreInitialViewModeLayout(args: {
  activeViewModeId: string;
  backendOrigin: string;
  frontendOrigin: string;
  initialState: ProjectStateSingleConfigWithCompletedOpIds;
  page: Page;
  projectConfigId: string;
}): Promise<void> {
  const initialViewMode =
    args.initialState.projectState.projectConfig.viewModes[
      args.activeViewModeId
    ];
  if (!initialViewMode) {
    throw new Error(`Missing initial view mode ${args.activeViewModeId}.`);
  }

  const initialLayout =
    Object.keys(initialViewMode.topLevelSections).length > 0
      ? initialViewMode.topLevelSections
      : args.initialState.projectState.projectConfig.topLevelSections;
  await postBackendForPage(
    args.page,
    args.backendOrigin,
    args.frontendOrigin,
    "/setActiveViewMode",
    {
      activeViewModeId: args.activeViewModeId,
      projectConfigId: args.projectConfigId,
    },
  );
  await postBackendForPage(
    args.page,
    args.backendOrigin,
    args.frontendOrigin,
    "/setTopLevelSectionLayout",
    {
      projectConfigId: args.projectConfigId,
      topLevelSections: initialLayout,
    },
  );
  await postBackendForPage(
    args.page,
    args.backendOrigin,
    args.frontendOrigin,
    "/setViewport",
    {
      projectConfigId: args.projectConfigId,
      viewport: initialViewMode.viewport ?? null,
    },
  );
  const restoredState = await getLatestProjectStateFromBackendOrigin(
    args.page,
    args.backendOrigin,
    args.frontendOrigin,
    args.projectConfigId,
  );
  await applyProjectStateUpdate(args.page, restoredState);
}

async function restoreSectionNameForPage(args: {
  backendOrigin: string;
  frontendOrigin: string;
  name: string;
  page: Page;
  projectConfigId: string;
  sectionId: string;
}): Promise<void> {
  await postBackendForPage(
    args.page,
    args.backendOrigin,
    args.frontendOrigin,
    "/setSectionName",
    {
      name: args.name,
      projectConfigId: args.projectConfigId,
      sectionId: args.sectionId,
    },
  );
  const restoredState = await getLatestProjectStateFromBackendOrigin(
    args.page,
    args.backendOrigin,
    args.frontendOrigin,
    args.projectConfigId,
  );
  await applyProjectStateUpdate(args.page, restoredState);
}

async function getSectionParamFilterForPage(
  page: Page,
  sectionId: string,
): Promise<string> {
  return page.evaluate(async (targetSectionId) => {
    const { getCurrEffectiveSectionImplWithTypeGuard } = await import(
      "/src/state/actions/sectionInfos.ts"
    );
    const { useProjectState } = await import("/src/state/definitions.ts");
    const { isBaseSectionWithParamsImpl } = await import(
      "/src/utils/generatedTypes.ts"
    );
    const paramsImpl = getCurrEffectiveSectionImplWithTypeGuard(
      useProjectState.getState(),
      targetSectionId,
      isBaseSectionWithParamsImpl,
    );
    return paramsImpl.paramFilter;
  }, sectionId);
}

async function setSectionParamFilterForPage(args: {
  backendOrigin: string;
  frontendOrigin: string;
  page: Page;
  projectConfigId: string;
  sectionId: string;
  value: string;
}): Promise<void> {
  const currentValue = await getSectionParamFilterForPage(
    args.page,
    args.sectionId,
  );
  if (currentValue === args.value) {
    return;
  }

  await postBackendForPage(
    args.page,
    args.backendOrigin,
    args.frontendOrigin,
    "/setSectionParamFilter",
    {
      projectConfigId: args.projectConfigId,
      sectionId: args.sectionId,
      value: args.value,
    },
  );
  const restoredState = await getLatestProjectStateFromBackendOrigin(
    args.page,
    args.backendOrigin,
    args.frontendOrigin,
    args.projectConfigId,
  );
  await applyProjectStateUpdate(args.page, restoredState);
  await expect
    .poll(async () => {
      return getSectionParamFilterForPage(args.page, args.sectionId);
    })
    .toBe(args.value);
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

async function moveActiveTopLevelSectionByDelta(args: {
  backendOrigin: string;
  delta: { x: number; y: number };
  frontendOrigin: string;
  page: Page;
  projectConfigId: string;
  sectionId: string;
}): Promise<void> {
  const currentLayouts = await getActiveTopLevelSectionLayouts(args.page);
  const currentLayout = currentLayouts[args.sectionId];
  if (!currentLayout) {
    throw new Error(
      `Missing active top-level layout for section ${args.sectionId}.`,
    );
  }
  await postBackendForPage(
    args.page,
    args.backendOrigin,
    args.frontendOrigin,
    "/setTopLevelSectionLayout",
    {
      projectConfigId: args.projectConfigId,
      topLevelSections: {
        ...currentLayouts,
        [args.sectionId]: {
          ...currentLayout,
          x: currentLayout.x + args.delta.x,
          y: currentLayout.y + args.delta.y,
        },
      },
    },
  );
  const expectedLayout = {
    x: currentLayout.x + args.delta.x,
    y: currentLayout.y + args.delta.y,
    zIndex: currentLayout.zIndex,
  };
  const movedState = await getLatestProjectStateFromBackendOrigin(
    args.page,
    args.backendOrigin,
    args.frontendOrigin,
    args.projectConfigId,
  );
  await applyProjectStateUpdate(args.page, movedState);
  await expect
    .poll(async () => {
      const nextLayout = await getActiveTopLevelSectionLayout(
        args.page,
        args.sectionId,
      );
      if (!nextLayout) {
        return null;
      }
      return {
        x: nextLayout.x,
        y: nextLayout.y,
        zIndex: nextLayout.zIndex,
      };
    })
    .toEqual(expectedLayout);
}

async function getActiveTopLevelSectionLayout(
  page: Page,
  sectionId: string,
): Promise<{ x: number; y: number; zIndex: number } | null> {
  return page.evaluate(async (targetSectionId) => {
    const { getActiveViewModeTopLevelSections } = await import(
      "/src/state/actions/sectionInfos"
    );
    const { useProjectState } = await import("/src/state/definitions.ts");
    const layout = getActiveViewModeTopLevelSections(
      useProjectState.getState(),
    )[targetSectionId];
    if (!layout) {
      return null;
    }
    return {
      x: layout.x,
      y: layout.y,
      zIndex: layout.zIndex,
    };
  }, sectionId);
}

async function getActiveTopLevelSectionLayouts(
  page: Page,
): Promise<Record<string, { x: number; y: number; zIndex: number }>> {
  return page.evaluate(async () => {
    const { getActiveViewModeTopLevelSections } = await import(
      "/src/state/actions/sectionInfos"
    );
    const { useProjectState } = await import("/src/state/definitions.ts");
    const layouts = getActiveViewModeTopLevelSections(
      useProjectState.getState(),
    );
    return Object.fromEntries(
      Object.entries(layouts).map(([sectionId, layout]) => [
        sectionId,
        {
          x: layout.x,
          y: layout.y,
          zIndex: layout.zIndex,
        },
      ]),
    );
  });
}

function resolveScreenPointAnchoredViewport(
  viewport: {
    x: number;
    y: number;
    zoom: number;
  },
  screenPoint: { x: number; y: number },
  nextZoom: number,
): {
  x: number;
  y: number;
  zoom: number;
} {
  const anchorWorldPoint = {
    x: (screenPoint.x - viewport.x) / viewport.zoom,
    y: (screenPoint.y - viewport.y) / viewport.zoom,
  };
  return {
    x: screenPoint.x - anchorWorldPoint.x * nextZoom,
    y: screenPoint.y - anchorWorldPoint.y * nextZoom,
    zoom: nextZoom,
  };
}

function getSettingsGraphSectionLocator(
  page: Page,
  sectionId: string,
): Locator {
  return page
    .locator(
      `[data-testid="graph-substrate-canary-section"][data-section-id="${sectionId}"], .react-flow__node[data-id="${sectionId}"]`,
    )
    .first();
}

async function getSectionChildRelativeCenterPosition(
  page: Page,
  sectionId: string,
  childId: string,
): Promise<{ x: number; y: number } | null> {
  return getSectionChildRelativeCenterBySelector(
    page,
    sectionId,
    `[id="${childId}"]`,
  );
}

async function getSectionChildRelativeCenterBySelector(
  page: Page,
  sectionId: string,
  childSelector: string,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(
    ({ targetSectionId, targetChildSelector }) => {
      const section =
        document.querySelector<HTMLElement>(
          `[data-testid="graph-substrate-canary-section"][data-section-id="${targetSectionId}"]`,
        ) ??
        document.querySelector<HTMLElement>(
          `.react-flow__node[data-id="${targetSectionId}"]`,
        );
      const child =
        section?.querySelector<HTMLElement>(targetChildSelector) ?? null;
      if (!section || !child) {
        return null;
      }
      const sectionRect = section.getBoundingClientRect();
      const childRect = child.getBoundingClientRect();
      if (sectionRect.width <= 0 || sectionRect.height <= 0) {
        return null;
      }
      return {
        x:
          (childRect.left + childRect.width / 2 - sectionRect.left) /
          sectionRect.width,
        y:
          (childRect.top + childRect.height / 2 - sectionRect.top) /
          sectionRect.height,
      };
    },
    {
      targetSectionId: sectionId,
      targetChildSelector: childSelector,
    },
  );
}

async function getLocatorRelativeCenterPosition(args: {
  child: Locator;
  section: Locator;
}): Promise<{ x: number; y: number } | null> {
  const [sectionBox, childBox] = await Promise.all([
    args.section.boundingBox(),
    args.child.boundingBox(),
  ]);
  if (
    !sectionBox ||
    !childBox ||
    sectionBox.width <= 0 ||
    sectionBox.height <= 0
  ) {
    return null;
  }

  return {
    x: (childBox.x + childBox.width / 2 - sectionBox.x) / sectionBox.width,
    y: (childBox.y + childBox.height / 2 - sectionBox.y) / sectionBox.height,
  };
}

function findSharedVisibleTopLevelSectionByName(args: {
  preferredNames?: string[];
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
  const preferredSharedName = args.preferredNames?.find((name) => {
    return worktreeNames.includes(name) && referenceNames.has(name);
  });
  const sharedName =
    preferredSharedName ??
    worktreeNames.find((name) => referenceNames.has(name));
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

async function isSettingsGraphSectionActive(
  page: Page,
  sectionId: string,
): Promise<boolean> {
  return page.evaluate((targetSectionId) => {
    const section =
      document.querySelector<HTMLElement>(
        `[data-testid="graph-substrate-canary-section"][data-section-id="${targetSectionId}"] section`,
      ) ??
      document.querySelector<HTMLElement>(
        `.react-flow__node[data-id="${targetSectionId}"] section`,
      );
    return section?.getAttribute("data-section-active") === "true";
  }, sectionId);
}

async function getSettingsGraphViewportWithSectionMovedOffscreen(
  page: Page,
  sectionId: string,
): Promise<{ x: number; y: number; zoom: number } | null> {
  return page.evaluate(
    async ({ extraMargin, targetSectionId }) => {
      const pane =
        document.querySelector<HTMLElement>(
          '[data-testid="graph-substrate-canary"]',
        ) ?? document.querySelector<HTMLElement>(".react-flow");
      const viewport =
        document.querySelector<HTMLElement>(
          '[data-testid="graph-substrate-canary-viewport"]',
        ) ?? document.querySelector<HTMLElement>(".react-flow__viewport");
      const section =
        document.querySelector<HTMLElement>(
          `[data-testid="graph-substrate-canary-section"][data-section-id="${targetSectionId}"]`,
        ) ??
        document.querySelector<HTMLElement>(
          `.react-flow__node[data-id="${targetSectionId}"]`,
        );
      if (!pane || !viewport || !section) {
        return null;
      }

      const { useLocalStorage } = await import("/src/state/definitions.ts");
      const paneBounds = pane.getBoundingClientRect();
      const { overviewTrueWidth, uiEditorTrueWidth } =
        useLocalStorage.getState();
      const paneRect = {
        bottom: paneBounds.bottom,
        left: paneBounds.left + overviewTrueWidth,
        right: paneBounds.right - uiEditorTrueWidth,
        top: paneBounds.top,
      };
      const sectionRect = section.getBoundingClientRect();
      const transform = window.getComputedStyle(viewport).transform;
      const matrix =
        !transform || transform === "none"
          ? new DOMMatrixReadOnly()
          : new DOMMatrixReadOnly(transform);
      if (
        !Number.isFinite(matrix.a) ||
        !Number.isFinite(matrix.e) ||
        !Number.isFinite(matrix.f) ||
        matrix.a <= 0
      ) {
        return null;
      }

      return {
        x:
          matrix.e -
          (sectionRect.left - paneRect.left + sectionRect.width + extraMargin),
        y:
          matrix.f -
          (sectionRect.top - paneRect.top + sectionRect.height + extraMargin),
        zoom: matrix.a,
      };
    },
    {
      extraMargin: 140,
      targetSectionId: sectionId,
    },
  );
}

async function isSettingsGraphSectionCenterInsidePane(
  page: Page,
  sectionId: string,
): Promise<boolean | null> {
  return page.evaluate(async (targetSectionId) => {
    const pane =
      document.querySelector<HTMLElement>(
        '[data-testid="graph-substrate-canary"]',
      ) ?? document.querySelector<HTMLElement>(".react-flow");
    const section =
      document.querySelector<HTMLElement>(
        `[data-testid="graph-substrate-canary-section"][data-section-id="${targetSectionId}"]`,
      ) ??
      document.querySelector<HTMLElement>(
        `.react-flow__node[data-id="${targetSectionId}"]`,
      );
    if (!pane || !section) {
      return null;
    }

    const { useLocalStorage } = await import("/src/state/definitions.ts");
    const paneBounds = pane.getBoundingClientRect();
    const { overviewTrueWidth, uiEditorTrueWidth } = useLocalStorage.getState();
    const paneRect = {
      bottom: paneBounds.bottom,
      left: paneBounds.left + overviewTrueWidth,
      right: paneBounds.right - uiEditorTrueWidth,
      top: paneBounds.top,
    };
    const sectionRect = section.getBoundingClientRect();
    const centerX = sectionRect.left + sectionRect.width / 2;
    const centerY = sectionRect.top + sectionRect.height / 2;
    return (
      centerX >= paneRect.left &&
      centerX <= paneRect.right &&
      centerY >= paneRect.top &&
      centerY <= paneRect.bottom
    );
  }, sectionId);
}

async function isCanvasScopeFocused(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) {
      return false;
    }
    return (
      activeElement.closest('[data-tab-scope="canvas"]') instanceof HTMLElement
    );
  });
}

async function getFocusedCanvasSectionId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) {
      return null;
    }
    const sectionNode = activeElement.closest(
      "[data-section-id], .react-flow__node[data-id]",
    );
    if (!(sectionNode instanceof HTMLElement)) {
      return null;
    }
    return (
      sectionNode.getAttribute("data-section-id") ??
      sectionNode.getAttribute("data-id")
    );
  });
}
