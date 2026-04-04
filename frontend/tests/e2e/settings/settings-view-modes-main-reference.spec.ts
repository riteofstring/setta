import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  captureSettingsGraphSectionMetrics,
  findSectionIdByName,
  findSettingsGraphPanePoint,
  findSettingsGraphSectionDragPoint,
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

test("settings graph parity probe keeps the spreadsheet body search input working after normalized motion on read-only main legacy and worktree canary", async ({
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

function getSettingsGraphSectionLocator(
  page: Page,
  sectionId: string,
): Locator {
  return page.locator(`.react-flow__node[data-id="${sectionId}"]`).first();
}

async function getSectionChildRelativeCenterPosition(
  page: Page,
  sectionId: string,
  childId: string,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(
    ({ targetSectionId, targetChildId }) => {
      const section =
        document.querySelector<HTMLElement>(
          `[data-testid="graph-substrate-canary-section"][data-section-id="${targetSectionId}"]`,
        ) ??
        document.querySelector<HTMLElement>(
          `.react-flow__node[data-id="${targetSectionId}"]`,
        );
      const child =
        section?.querySelector<HTMLElement>(`[id="${targetChildId}"]`) ?? null;
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
      targetChildId: childId,
    },
  );
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
