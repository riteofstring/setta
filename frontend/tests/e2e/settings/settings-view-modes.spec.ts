import { expect, test, type Page } from "@playwright/test";
import {
  isSettingsGraphDirectOpenReady,
  resolveSettingsGraphDirectOpenPhase,
  type SettingsGraphDirectOpenSnapshot,
} from "components/Pages/Project/graphSubstrate/settingsGraphDirectOpenState";
import { type SettingsGraphPageLifecycleDiagnostic } from "components/Pages/Project/graphSubstrate/settingsGraphProbePageLifecycle";
import {
  ensureAppReady,
  getActiveProjectConfigIdFromPageStore,
  postBackend,
} from "../helpers";
import {
  applyAuthoritativeViewportFromBackend,
  captureSettingsGraphSectionMetrics,
  findSectionIdByName,
  findSettingsGraphPanePoint,
  findSettingsGraphSectionDragPoint,
  findSettingsGraphSectionWheelPanPoint,
  findSharedVisibleSettingsGraphSection,
  findViewModeId,
  fitGraphViewportToSection,
  getCanarySectionCenterOffsetFromRootCenter,
  getLatestProjectState,
  getLocalPaneState,
  getSettingsGraphRootRelativePoint,
  getSettingsGraphSectionTitleBoundingBox,
  normalizeSettingsGraphComparePaneState,
  readSettingsGraphCanaryInstrumentationSnapshot,
  runSettingsGraphComparePreflight,
  runSettingsGraphMotionPerfSequence,
  setLocalPaneState,
  SETTINGS_GRAPH_COMPARE_PANE_STATE,
  startSettingsGraphMotionPerfCapture,
  stopSettingsGraphMotionPerfCapture,
  waitForFrontendProjectConfigState,
  type ProjectStateSingleConfigWithCompletedOpIds,
} from "./graphSubstrateParityProbe";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const MOD_KEY = process.platform === "darwin" ? "Meta" : "Control";

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
  await expect(page.getByTestId("rf__minimap")).toBeVisible();
  await expect.poll(async () => getMiniMapNodeCount(page)).toBeGreaterThan(1);

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

test("settings graph substrate canary preserves the All Settings multi-column spread on first render", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const expectedSectionOrder = getExpectedCanarySectionOrder(
    initialState,
    allSettingsViewModeId,
  );

  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTab).toBeVisible();
  try {
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await allTab.click();

    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
    await expect(page.getByTestId("rf__background")).toBeVisible();
    await expect
      .poll(async () => {
        const [minimapNodeCount, canarySectionCount] = await Promise.all([
          getMiniMapNodeCount(page),
          getCanarySectionCount(page),
        ]);
        return minimapNodeCount - canarySectionCount;
      })
      .toBe(0);
    await expect
      .poll(async () => (await getCanarySectionOrder(page)).join(","))
      .toBe(expectedSectionOrder.join(","));
    await expect
      .poll(async () => (await getCanaryPaneViewportGaps(page))?.bottom ?? 9999)
      .toBeLessThan(80);
    await expect
      .poll(async () => (await getCanarySectionGridSpread(page)).columnCount)
      .toBeGreaterThan(1);

    const spread = await getCanarySectionGridSpread(page);
    expect(spread.columnCount).toBeGreaterThan(1);
    await expect
      .poll(async () => {
        const drift = await getCanaryAutoFitDrift(page);
        return drift?.zoom ?? Number.POSITIVE_INFINITY;
      })
      .toBeLessThan(0.03);
  } finally {
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialState.projectState.projectConfig.viewport,
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

test("settings graph substrate canary exposes live instrumentation on normalized All Settings", async ({
  page,
}) => {
  test.setTimeout(120000);

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
  const panDelta = { x: 120, y: 80 };

  const readTargetMotionState = async () => {
    const [bodyAnchorOffset, metrics, snapshot] = await Promise.all([
      getCanarySectionBodyAnchorOffset(page, targetSectionId),
      captureSettingsGraphSectionMetrics(page, targetSectionId),
      readSettingsGraphCanaryInstrumentationSnapshot(page),
    ]);
    return {
      bodyAnchorOffset,
      metrics,
      snapshot,
    };
  };

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

    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);

    await expect
      .poll(async () => {
        const snapshot =
          await readSettingsGraphCanaryInstrumentationSnapshot(page);
        return snapshot?.mounted === true ? snapshot : null;
      })
      .not.toBeNull();

    const autoFitSnapshot =
      await readSettingsGraphCanaryInstrumentationSnapshot(page);
    expect(autoFitSnapshot).not.toBeNull();
    if (!autoFitSnapshot) {
      throw new Error("Missing auto-fit canary instrumentation snapshot.");
    }

    const preflight = await runSettingsGraphComparePreflight({
      expectedSurfaceKind: "canary",
      expectedViewModeName: "All Settings",
      page,
      projectConfigId,
      requireFitView: true,
      side: "worktree",
      targetSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(targetSectionId);

    await expect
      .poll(async () => {
        const snapshot =
          await readSettingsGraphCanaryInstrumentationSnapshot(page);
        return snapshot &&
          snapshot.mounted === true &&
          snapshot.mountedSectionBodyCount > 0
          ? snapshot
          : null;
      })
      .not.toBeNull();

    const focusedSnapshot =
      await readSettingsGraphCanaryInstrumentationSnapshot(page);
    const focusedVisibleSectionCount = await page
      .getByTestId("graph-substrate-canary-section")
      .count();
    expect(focusedSnapshot).not.toBeNull();
    if (!focusedSnapshot) {
      throw new Error("Missing canary instrumentation snapshot.");
    }

    expect(autoFitSnapshot.mounted).toBe(true);
    expect(autoFitSnapshot.mountedSceneSectionCount).toBeGreaterThan(1);
    expect(autoFitSnapshot.mountedSectionBodyCount).toBeGreaterThanOrEqual(0);
    expect(autoFitSnapshot.mountedSectionBodyCount).toBeLessThan(
      Math.max(4, Math.ceil(autoFitSnapshot.mountedSceneSectionCount / 4)),
    );
    expect(autoFitSnapshot.pixiDrawableCount).toBeGreaterThan(1);
    expect(autoFitSnapshot.pixiSyncCount).toBeGreaterThan(0);
    expect(autoFitSnapshot.sceneSyncCount).toBeGreaterThan(0);
    expect(
      autoFitSnapshot.unresolvedSectionSeedFallbackCount,
    ).toBeGreaterThanOrEqual(0);
    expect(autoFitSnapshot.viewportZoom ?? 0).toBeGreaterThan(0);
    expect(autoFitSnapshot.visibleViewportSize?.width ?? 0).toBeGreaterThan(0);
    expect(autoFitSnapshot.visibleViewportSize?.height ?? 0).toBeGreaterThan(0);

    expect(focusedSnapshot.mounted).toBe(true);
    expect(focusedSnapshot.mountedSceneSectionCount).toBe(
      autoFitSnapshot.mountedSceneSectionCount,
    );
    expect(focusedSnapshot.mountedSectionBodyCount).toBeGreaterThan(0);
    expect(focusedSnapshot.mountedSectionBodyCount).toBeLessThan(
      focusedSnapshot.mountedSceneSectionCount,
    );
    expect(focusedVisibleSectionCount).toBeGreaterThan(0);
    expect(focusedVisibleSectionCount).toBeLessThan(
      focusedSnapshot.mountedSceneSectionCount,
    );
    expect(focusedSnapshot.pixiDrawableCount).toBeGreaterThan(0);
    expect(focusedSnapshot.pixiDrawableCount).toBeLessThan(
      focusedSnapshot.mountedSceneSectionCount,
    );
    expect(focusedSnapshot.pixiDrawableCount).toBeLessThan(
      autoFitSnapshot.pixiDrawableCount,
    );
    expect(focusedSnapshot.mountedSectionBodyCount).toBeLessThan(
      Math.max(4, Math.ceil(focusedSnapshot.mountedSceneSectionCount / 4)),
    );

    await expect
      .poll(async () => {
        const [snapshot, titleRect] = await Promise.all([
          readSettingsGraphCanaryInstrumentationSnapshot(page),
          getSettingsGraphSectionTitleBoundingBox(page, targetSectionId),
        ]);
        if ((snapshot?.mountedSectionBodyCount ?? 0) <= 0) {
          return 0;
        }
        return titleRect?.width ?? 0;
      })
      .toBeGreaterThan(0);

    // Keep the focused mount-gate lane honest under viewport motion on the
    // same canonical target instead of treating the fit-only snapshot as enough.
    const baselineMotionState = await readTargetMotionState();
    expect(baselineMotionState.bodyAnchorOffset).not.toBeNull();
    expect(baselineMotionState.metrics.transform).not.toBeNull();
    expect(baselineMotionState.metrics.titleRect?.width ?? 0).toBeGreaterThan(
      0,
    );

    const panStart = await findSettingsGraphPanePoint(page, {
      panDelta,
      sectionId: targetSectionId,
    });
    await page.mouse.move(panStart.x, panStart.y);
    await page.mouse.down();
    await page.mouse.move(panStart.x + panDelta.x, panStart.y + panDelta.y, {
      steps: 10,
    });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const motionState = await readTargetMotionState();
        const beforeTransform = baselineMotionState.metrics.transform;
        const afterTransform = motionState.metrics.transform;
        if (!beforeTransform || !afterTransform) {
          return 0;
        }
        return Math.hypot(
          afterTransform.x - beforeTransform.x,
          afterTransform.y - beforeTransform.y,
        );
      })
      .toBeGreaterThan(80);

    const afterPanState = await readTargetMotionState();
    expect(afterPanState.bodyAnchorOffset).not.toBeNull();
    expect(afterPanState.metrics.transform).not.toBeNull();
    expect(afterPanState.metrics.titleRect?.width ?? 0).toBeGreaterThan(0);
    expect(
      afterPanState.snapshot?.mountedSectionBodyCount ?? 0,
    ).toBeGreaterThan(0);
    expect(
      afterPanState.snapshot?.mountedSectionBodyCount ??
        Number.POSITIVE_INFINITY,
    ).toBeLessThan(
      afterPanState.snapshot?.mountedSceneSectionCount ??
        Number.POSITIVE_INFINITY,
    );
    expect(afterPanState.snapshot?.pixiDrawableCount ?? 0).toBeGreaterThan(0);
    expect(
      afterPanState.snapshot?.pixiDrawableCount ?? Number.POSITIVE_INFINITY,
    ).toBeLessThan(
      afterPanState.snapshot?.mountedSceneSectionCount ??
        Number.POSITIVE_INFINITY,
    );
    expect(afterPanState.snapshot?.pixiSyncCount).toBe(
      focusedSnapshot.pixiSyncCount,
    );

    await page.getByRole("button", { name: "zoom in" }).click();

    await expect
      .poll(async () => {
        const motionState = await readTargetMotionState();
        return motionState.metrics.transform?.zoom ?? 0;
      })
      .toBeGreaterThan((afterPanState.metrics.transform?.zoom ?? 0) * 1.08);

    const afterZoomState = await readTargetMotionState();
    expect(afterZoomState.bodyAnchorOffset).not.toBeNull();
    expect(afterZoomState.metrics.transform).not.toBeNull();
    expect(afterZoomState.metrics.titleRect?.width ?? 0).toBeGreaterThan(0);
    expect(
      afterZoomState.snapshot?.mountedSectionBodyCount ?? 0,
    ).toBeGreaterThan(0);
    expect(
      afterZoomState.snapshot?.mountedSectionBodyCount ??
        Number.POSITIVE_INFINITY,
    ).toBeLessThan(
      afterZoomState.snapshot?.mountedSceneSectionCount ??
        Number.POSITIVE_INFINITY,
    );
    expect(afterZoomState.snapshot?.pixiDrawableCount ?? 0).toBeGreaterThan(0);
    expect(
      afterZoomState.snapshot?.pixiDrawableCount ?? Number.POSITIVE_INFINITY,
    ).toBeLessThan(
      afterZoomState.snapshot?.mountedSceneSectionCount ??
        Number.POSITIVE_INFINITY,
    );
    expect(afterZoomState.snapshot?.pixiSyncCount).toBe(
      focusedSnapshot.pixiSyncCount,
    );

    console.info(
      "settings-graph-canary-body-visibility",
      JSON.stringify(
        {
          afterPanSnapshot: afterPanState.snapshot,
          afterZoomSnapshot: afterZoomState.snapshot,
          autoFitSnapshot,
          baselineMotionSnapshot: baselineMotionState.snapshot,
          focusedSnapshot,
          panDelta,
          targetSectionId,
          targetSectionName,
        },
        null,
        2,
      ),
    );
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
    const restoredState = await getLatestProjectState(
      page,
      projectConfigId,
    ).catch(() => null);
    if (restoredState) {
      await applyProjectStateUpdate(page, restoredState).catch(() => {});
    }
  }
});

test("settings graph worktree performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on the live canary", async ({
  page,
}) => {
  test.slow();
  test.setTimeout(180000);

  let activePage = page;
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
  const readSettledMetrics = async () => {
    await expect
      .poll(async () => {
        const metrics = await captureSettingsGraphSectionMetrics(
          activePage,
          targetSectionId,
        );
        return metrics.rect && metrics.transform && metrics.titleRect
          ? "ready"
          : "pending";
      })
      .toBe("ready");

    return captureSettingsGraphSectionMetrics(activePage, targetSectionId);
  };

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
    const preflight = await runSettingsGraphComparePreflight({
      expectedSurfaceKind: "canary",
      expectedViewModeName: "All Settings",
      page: activePage,
      projectConfigId,
      requireFitView: true,
      side: "worktree",
      targetSectionName,
    });
    expect(preflight.status).toBe("ok");
    expect(preflight.issues).toEqual([]);
    expect(preflight.targetSectionId).toBe(targetSectionId);

    const beforeMetrics = await readSettledMetrics();

    const motionPoint = await findSettingsGraphPanePoint(activePage);
    await startSettingsGraphMotionPerfCapture(activePage);
    await runSettingsGraphMotionPerfSequence(activePage, {
      modifierKey: MOD_KEY,
      point: motionPoint,
      settleFrameCount: 2,
      steps: [
        { deltaX: 160, deltaY: 120, modified: false, repeat: 6 },
        { deltaX: -160, deltaY: -120, modified: false, repeat: 6 },
        { deltaX: 0, deltaY: -180, modified: true, repeat: 4 },
        { deltaX: 0, deltaY: 180, modified: true, repeat: 4 },
      ],
    });
    const perf = await stopSettingsGraphMotionPerfCapture(
      activePage,
      targetSectionId,
    );

    const afterMetrics = await readSettledMetrics();

    console.info(
      "settings-graph-worktree-performance-probe",
      JSON.stringify(
        {
          afterMetrics,
          beforeMetrics,
          perf,
          targetSectionId,
          targetSectionName,
        },
        null,
        2,
      ),
    );

    expect(perf.surfaceKind).toBe("canary");
    expect(perf.sampleCount).toBeGreaterThanOrEqual(20);
    expect(perf.pageHiddenDuringCapture).toBe(false);
    expect(perf.visibilityLossCount).toBe(0);
    expect(perf.hiddenDurationMs).toBe(0);
    expect(perf.focusLossCount).toBe(0);
    expect(perf.endedVisible).toBe(true);
    expect(perf.motionAttribution).not.toBeNull();
    expect(perf.rootDomNodeCount).toBeGreaterThan(0);
    expect(perf.sectionDomNodeCount).toBeGreaterThan(0);
    expect(perf.visibleSectionCount).toBeGreaterThan(0);
    expect(perf.transform).not.toBeNull();

    const allowedResidualCanaryMotionOwners = [
      "interactionMiscStateSync",
      "interactionReactFlowStateSync",
      "mountedSectionBodyIdSetReuseCheck",
      "pixiDrawableModelResolve",
      "pixiDrawableReuseCheck",
      "pixiViewportPresent",
      "presentedSceneSectionAreaSwitchReactRender",
      "presentedSceneSectionArrayReuseCheck",
      "presentedSceneSectionBodyContentReactRender",
      "presentedSceneSectionBodySubtreeReactRender",
      "presentedSceneSectionCanvasSectionBodyReactRender",
      "presentedSceneSectionContainerReactRender",
      "presentedSceneSectionCoreShellLayerReactRender",
      "presentedSceneSectionEntryBodyGateReactRender",
      "presentedSceneSectionEntryImperativeFlush",
      "presentedSceneSectionEntryShellReactRender",
      "presentedSceneSectionHeaderReactRender",
      "presentedSceneSectionKwargsControlsReactRender",
      "presentedSceneSectionParamDndListDuplicateIndexResolve",
      "presentedSceneSectionPinnedParamDndListRowsReactRender",
      "presentedSceneSectionParamInputReactRender",
      "presentedSceneSectionParamNameInputReactRender",
      "presentedSceneSectionParamTextLabelReactRender",
      "presentedSceneSectionParamDndListTreeResolve",
      "presentedSceneSectionParamGroupEdgesStripReactRender",
      "presentedSceneSectionParamGroupPinnedParamsReactRender",
      "presentedSceneSectionParamGroupContainerReactRender",
      "presentedSceneSectionParamGroupUnpinnedParamsReactRender",
      "presentedSceneSectionParamGroupUnpinnedAreaReactRender",
      "presentedSceneSectionUnpinnedParamDndListRowsReactRender",
      "presentedSceneBodyMountFilter",
      "presentedSceneSectionEntriesResolve",
      "presentedSceneSectionSubtreeReactRender",
      "presentedSceneSectionVisibilityFilter",
      "presentedSceneVisibleViewportWorldRectResolve",
    ] as const;
    const unexpectedCanaryMotionOwners = Object.entries(
      perf.motionAttribution ?? {},
    )
      .filter(([owner, entry]) => {
        return (
          !allowedResidualCanaryMotionOwners.includes(
            owner as (typeof allowedResidualCanaryMotionOwners)[number],
          ) &&
          (entry.count > 0 ||
            entry.totalDurationMs > 0 ||
            entry.maxDurationMs > 0)
        );
      })
      .map(([owner]) => owner);

    expect(perf.motionAttribution?.reactFlowViewportPublish.count ?? 0).toBe(0);
    expect(
      perf.motionAttribution?.reactFlowTransformSubscriptionCallback.count ?? 0,
    ).toBe(0);
    expect(
      perf.motionAttribution?.reactFlowTransformFollowerCallback.count ?? 0,
    ).toBe(0);
    expect(unexpectedCanaryMotionOwners).toEqual([]);
    const longTaskBreakdownEntries = Object.values(
      perf.longTaskBreakdownByPhase,
    );
    const longTaskBreakdownCount = longTaskBreakdownEntries.reduce(
      (total, entry) => total + entry.count,
      0,
    );
    const longTaskBreakdownTotalDurationMs = longTaskBreakdownEntries.reduce(
      (total, entry) => total + entry.totalDurationMs,
      0,
    );
    expect(longTaskBreakdownCount).toBe(perf.longTaskCount);
    expect(
      Math.abs(longTaskBreakdownTotalDurationMs - perf.longTaskTotalDurationMs),
    ).toBeLessThan(0.01);
    expect([null, ...allowedResidualCanaryMotionOwners]).toContain(
      perf.dominantCanaryMotionAttributionOwner,
    );
    expect(beforeMetrics.surfaceKind).toBe("canary");
    expect(afterMetrics.surfaceKind).toBe("canary");
    expect(beforeMetrics.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(afterMetrics.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(beforeMetrics.titleRect?.width ?? 0).toBeGreaterThan(0);
    expect(afterMetrics.titleRect?.width ?? 0).toBeGreaterThan(0);
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

test("settings graph substrate canary zoom in control respects the normalized All Settings fit", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  let createdSectionId: string | null = null;
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();
    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);

    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.zoom ?? null)
      .toBeCloseTo(0.1, 2);

    const initialTransform = await getCanaryViewportTransform(page);
    expect(initialTransform).not.toBeNull();
    if (!initialTransform) {
      throw new Error("Missing canary viewport transform before zoom in.");
    }
    const expectedZoomInTransform = await getCanaryExpectedToolbarZoomTransform(
      page,
      initialTransform.zoom * 1.2,
    );
    expect(expectedZoomInTransform).not.toBeNull();
    if (!expectedZoomInTransform) {
      throw new Error("Missing expected canary zoom-in transform.");
    }

    await page.getByRole("button", { name: "zoom in" }).click();

    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.zoom ?? null)
      .toBeCloseTo(initialTransform.zoom * 1.2, 2);
    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.x ?? null)
      .toBeCloseTo(expectedZoomInTransform.x, 1);
    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.y ?? null)
      .toBeCloseTo(expectedZoomInTransform.y, 1);
  } finally {
    await allTab.click().catch(() => {});
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
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

test("settings graph substrate canary fit view reapplies the same All Settings bounds fit after manual pan", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();
    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);

    await expect
      .poll(async () => (await getCanaryAutoFitDrift(page))?.zoom ?? 9999)
      .toBeLessThan(0.03);

    await page.getByRole("button", { name: "fit view" }).click();

    const expectedFitViewTransform = await getCanaryViewportTransform(page);
    if (!expectedFitViewTransform) {
      throw new Error("Missing explicit canary fit-view transform.");
    }

    const panStart = await findCanaryPanePoint(page);
    await page.mouse.move(panStart.x, panStart.y);
    await page.mouse.down();
    await page.mouse.move(panStart.x + 160, panStart.y + 100, { steps: 10 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const viewport = await getCanaryViewportTransform(page);
        if (!viewport) {
          return 0;
        }
        return Math.hypot(
          viewport.x - expectedFitViewTransform.x,
          viewport.y - expectedFitViewTransform.y,
        );
      })
      .toBeGreaterThan(120);

    await page.getByRole("button", { name: "fit view" }).click();

    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.x ?? null)
      .toBeCloseTo(expectedFitViewTransform.x, 1);
    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.y ?? null)
      .toBeCloseTo(expectedFitViewTransform.y, 1);
    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.zoom ?? null)
      .toBeCloseTo(expectedFitViewTransform.zoom, 2);
  } finally {
    await allTab.click().catch(() => {});
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
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

test("settings graph substrate canary fit view uses the latest All Settings scene after a fast switch from Core", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const drawSectionId = findSectionIdByName(initialState, "drawSectionDefault");
  const coreTab = page.getByRole("button", { name: "Core", exact: true });
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(coreTab).toBeVisible();
    await coreTab.click();
    await page.waitForSelector(READY_SELECTOR);

    await expect(allTab).toBeVisible();
    await allTab.click();
    await page.getByRole("button", { name: "fit view" }).click();

    const canaryRoot = page.getByTestId("graph-substrate-canary");
    await expect(canaryRoot).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);
    await expect
      .poll(async () => (await getCanaryAutoFitDrift(page))?.zoom ?? 9999)
      .toBeLessThan(0.03);

    const [drawMetrics, rootBounds] = await Promise.all([
      captureSettingsGraphSectionMetrics(page, drawSectionId),
      canaryRoot.boundingBox(),
    ]);
    if (!drawMetrics.rect || !rootBounds) {
      throw new Error("Missing canary bounds after fast-switch fit view.");
    }

    expect(drawMetrics.rect.x + drawMetrics.rect.width).toBeGreaterThan(
      rootBounds.x + 8,
    );
    expect(drawMetrics.rect.x).toBeLessThan(
      rootBounds.x + rootBounds.width - 8,
    );
    expect(drawMetrics.rect.y + drawMetrics.rect.height).toBeGreaterThan(
      rootBounds.y + 8,
    );
    expect(drawMetrics.rect.y).toBeLessThan(
      rootBounds.y + rootBounds.height - 8,
    );
  } finally {
    await allTab.click().catch(() => {});
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== allSettingsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings graph substrate canary applies an explicit shared viewport write after a local targeted fit", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const drawSectionId = findSectionIdByName(initialState, "drawSectionDefault");
  const initialPaneState = await getLocalPaneState(page);
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();
    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);

    await setComparePaneVisibility(page, {
      overviewVisible: false,
      uiEditorVisible: false,
    });
    expect(await fitGraphViewportToSection(page, drawSectionId)).toBe(true);

    const fittedTransform = await getCanaryViewportTransform(page);
    if (!fittedTransform) {
      throw new Error("Missing canary viewport transform after local fit.");
    }

    const targetViewport = {
      x: fittedTransform.x - 180,
      y: fittedTransform.y + 120,
      zoom: fittedTransform.zoom,
    };

    const stateWithSharedViewport = await applyAuthoritativeViewportFromBackend(
      page,
      projectConfigId,
      targetViewport,
    );
    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          const { useProjectState } = await import("/src/state/definitions.ts");
          return useProjectState.getState().projectConfig.viewport;
        });
      })
      .toEqual(targetViewport);

    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.x ?? null)
      .toBeCloseTo(targetViewport.x, 0);
    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.y ?? null)
      .toBeCloseTo(targetViewport.y, 0);
    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.zoom ?? null)
      .toBeCloseTo(targetViewport.zoom, 2);
  } finally {
    await setLocalPaneState(page, initialPaneState).catch(() => {});
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== allSettingsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings graph parity probe captures the same named section on legacy and canary surfaces after normalized fit", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const coreViewModeId = findViewModeId(initialState, "Core");
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const initialPaneState = await getLocalPaneState(page);
  const sharedSection = findSharedVisibleSettingsGraphSection(initialState, [
    "Core",
    "All Settings",
  ]);
  const sectionId = sharedSection.sectionId;
  const sectionName = sharedSection.name;
  const expectedCenterOffset =
    (SETTINGS_GRAPH_COMPARE_PANE_STATE.overviewTrueWidth -
      SETTINGS_GRAPH_COMPARE_PANE_STATE.uiEditorTrueWidth) /
    2;
  const coreTab = page.getByRole("button", { name: "Core", exact: true });
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  try {
    await normalizeSettingsGraphComparePaneState(page);

    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: coreViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const legacyStateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, legacyStateWithoutViewport);

    await expect(coreTab).toBeVisible();
    await coreTab.click();
    await page.waitForSelector(READY_SELECTOR);
    await expect(page.getByTestId("graph-substrate-canary")).toHaveCount(0);
    await normalizeSettingsGraphComparePaneState(page);
    expect(await fitGraphViewportToSection(page, sectionId)).toBe(true);

    await expect
      .poll(async () => {
        return (await captureSettingsGraphSectionMetrics(page, sectionId))
          .surfaceKind;
      })
      .toBe("legacy");
    await expect
      .poll(async () => {
        return Math.abs(
          ((await captureSettingsGraphSectionMetrics(page, sectionId))
            .centerOffsetFromRootCenter ?? Number.POSITIVE_INFINITY) -
            expectedCenterOffset,
        );
      })
      .toBeLessThan(8);

    const legacyMetrics = await captureSettingsGraphSectionMetrics(
      page,
      sectionId,
    );
    if (!legacyMetrics.rect || !legacyMetrics.transform) {
      throw new Error(`Missing legacy metrics for ${sectionName}.`);
    }
    expect(legacyMetrics.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);

    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const canaryStateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, canaryStateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();
    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);
    await normalizeSettingsGraphComparePaneState(page);
    expect(await fitGraphViewportToSection(page, sectionId)).toBe(true);

    await expect
      .poll(async () => {
        return (await captureSettingsGraphSectionMetrics(page, sectionId))
          .surfaceKind;
      })
      .toBe("canary");
    await expect
      .poll(async () => {
        return Math.abs(
          ((await captureSettingsGraphSectionMetrics(page, sectionId))
            .centerOffsetFromRootCenter ?? Number.POSITIVE_INFINITY) -
            expectedCenterOffset,
        );
      })
      .toBeLessThan(8);

    const canaryMetrics = await captureSettingsGraphSectionMetrics(
      page,
      sectionId,
    );
    if (!canaryMetrics.rect || !canaryMetrics.transform) {
      throw new Error(`Missing canary metrics for ${sectionName}.`);
    }
    expect(canaryMetrics.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);

    expect(
      Math.abs(canaryMetrics.rect.width - legacyMetrics.rect.width),
    ).toBeLessThan(8);
    expect(
      Math.abs(canaryMetrics.rect.height - legacyMetrics.rect.height),
    ).toBeLessThan(8);
    expect(
      Math.abs(canaryMetrics.transform.zoom - legacyMetrics.transform.zoom),
    ).toBeLessThan(0.02);
    expect(
      Math.abs(canaryMetrics.transform.x - legacyMetrics.transform.x),
    ).toBeLessThan(8);
    expect(Math.abs(canaryMetrics.rect.x - legacyMetrics.rect.x)).toBeLessThan(
      8,
    );
  } finally {
    await setLocalPaneState(page, initialPaneState).catch(() => {});
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== allSettingsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings graph parity probe applies the same short pan delta on legacy and canary surfaces after normalized fit", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const coreViewModeId = findViewModeId(initialState, "Core");
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const initialPaneState = await getLocalPaneState(page);
  const sharedSection = findSharedVisibleSettingsGraphSection(initialState, [
    "Core",
    "All Settings",
  ]);
  const sectionId = sharedSection.sectionId;
  const sectionName = sharedSection.name;
  const panDelta = { x: 140, y: 90 };
  const coreTab = page.getByRole("button", { name: "Core", exact: true });
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  async function captureNamedSectionPanDelta({
    tab,
    viewModeId,
    expectedSurfaceKind,
  }: {
    tab: ReturnType<Page["getByRole"]>;
    viewModeId: string;
    expectedSurfaceKind: "legacy" | "canary";
  }) {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: viewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(tab).toBeVisible();
    await tab.click();
    if (expectedSurfaceKind === "legacy") {
      await page.waitForSelector(READY_SELECTOR);
    } else {
      await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
      await expect
        .poll(() => page.getByTestId("graph-substrate-canary-section").count())
        .toBeGreaterThan(1);
    }

    await normalizeSettingsGraphComparePaneState(page);
    expect(await fitGraphViewportToSection(page, sectionId)).toBe(true);
    await expect
      .poll(async () => {
        return (await captureSettingsGraphSectionMetrics(page, sectionId))
          .surfaceKind;
      })
      .toBe(expectedSurfaceKind);

    const before = await captureSettingsGraphSectionMetrics(page, sectionId);
    if (!before.rect || !before.transform) {
      throw new Error(
        `Missing ${expectedSurfaceKind} pan baseline metrics for ${sectionName}.`,
      );
    }

    const panStart = await findSettingsGraphPanePoint(page);
    await page.mouse.move(panStart.x, panStart.y);
    await page.mouse.down();
    await page.mouse.move(panStart.x + panDelta.x, panStart.y + panDelta.y, {
      steps: 10,
    });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const after = await captureSettingsGraphSectionMetrics(page, sectionId);
        if (!after.transform) {
          return 0;
        }
        return Math.hypot(
          after.transform.x - before.transform.x,
          after.transform.y - before.transform.y,
        );
      })
      .toBeGreaterThan(120);

    const after = await captureSettingsGraphSectionMetrics(page, sectionId);
    if (!after.rect || !after.transform) {
      throw new Error(
        `Missing ${expectedSurfaceKind} pan result metrics for ${sectionName}.`,
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
    await normalizeSettingsGraphComparePaneState(page);

    const legacyPan = await captureNamedSectionPanDelta({
      tab: coreTab,
      viewModeId: coreViewModeId,
      expectedSurfaceKind: "legacy",
    });
    const canaryPan = await captureNamedSectionPanDelta({
      tab: allTab,
      viewModeId: allSettingsViewModeId,
      expectedSurfaceKind: "canary",
    });

    expect(legacyPan.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(canaryPan.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(
      Math.abs(canaryPan.transformDelta.x - legacyPan.transformDelta.x),
    ).toBeLessThan(8);
    expect(
      Math.abs(canaryPan.transformDelta.y - legacyPan.transformDelta.y),
    ).toBeLessThan(8);
    expect(Math.abs(canaryPan.transformDelta.zoom)).toBeLessThan(0.02);
    expect(Math.abs(legacyPan.transformDelta.zoom)).toBeLessThan(0.02);
    expect(
      Math.abs(canaryPan.rectDelta.x - legacyPan.rectDelta.x),
    ).toBeLessThan(8);
    expect(
      Math.abs(canaryPan.rectDelta.y - legacyPan.rectDelta.y),
    ).toBeLessThan(8);
  } finally {
    await setLocalPaneState(page, initialPaneState).catch(() => {});
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== allSettingsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings graph parity probe applies the same short top-level drag delta on legacy and canary surfaces after normalized fit", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const coreViewModeId = findViewModeId(initialState, "Core");
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialCoreViewport =
    initialState.projectState.projectConfig.viewModes[coreViewModeId]
      ?.viewport ?? null;
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const initialPaneState = await getLocalPaneState(page);
  const sharedSection = findSharedVisibleSettingsGraphSection(initialState, [
    "Core",
    "All Settings",
  ]);
  const sectionId = sharedSection.sectionId;
  const sectionName = sharedSection.name;
  const dragDelta = { x: 120, y: 80 };
  const coreTab = page.getByRole("button", { name: "Core", exact: true });
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  async function restoreInitialViewModeLayout(viewModeId: string) {
    const initialViewMode =
      initialState.projectState.projectConfig.viewModes[viewModeId];
    if (!initialViewMode) {
      throw new Error(`Missing initial view mode ${viewModeId}.`);
    }
    const initialLayout =
      Object.keys(initialViewMode.topLevelSections).length > 0
        ? initialViewMode.topLevelSections
        : initialState.projectState.projectConfig.topLevelSections;
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: viewModeId,
    });
    await postBackend(page, "/setTopLevelSectionLayout", {
      projectConfigId,
      topLevelSections: initialLayout,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport:
        viewModeId === coreViewModeId
          ? initialCoreViewport
          : viewModeId === allSettingsViewModeId
            ? initialAllSettingsViewport
            : initialViewMode.viewport ?? null,
    });
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }

  async function captureNamedSectionDragDelta({
    tab,
    viewModeId,
    expectedSurfaceKind,
  }: {
    tab: ReturnType<Page["getByRole"]>;
    viewModeId: string;
    expectedSurfaceKind: "legacy" | "canary";
  }) {
    await restoreInitialViewModeLayout(viewModeId);
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: viewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(tab).toBeVisible();
    await tab.click();
    if (expectedSurfaceKind === "legacy") {
      await page.waitForSelector(READY_SELECTOR);
    } else {
      await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
      await expect
        .poll(() => page.getByTestId("graph-substrate-canary-section").count())
        .toBeGreaterThan(1);
    }

    await normalizeSettingsGraphComparePaneState(page);
    expect(await fitGraphViewportToSection(page, sectionId)).toBe(true);
    await expect
      .poll(async () => {
        return (await captureSettingsGraphSectionMetrics(page, sectionId))
          .surfaceKind;
      })
      .toBe(expectedSurfaceKind);

    const beforeMetrics = await captureSettingsGraphSectionMetrics(
      page,
      sectionId,
    );
    const beforeLayout = await getActiveTopLevelSectionLayout(page, sectionId);
    if (!beforeMetrics.rect || !beforeMetrics.transform || !beforeLayout) {
      throw new Error(
        `Missing ${expectedSurfaceKind} drag baseline metrics for ${sectionName}.`,
      );
    }

    const dragPoint = await findSettingsGraphSectionDragPoint(page, sectionId);
    await page.mouse.move(dragPoint.x, dragPoint.y);
    await page.mouse.down();
    await page.mouse.move(
      dragPoint.x + dragDelta.x,
      dragPoint.y + dragDelta.y,
      {
        steps: 10,
      },
    );
    await page.mouse.up();

    await expect
      .poll(async () => {
        const after = await getActiveTopLevelSectionLayout(page, sectionId);
        if (!after) {
          return 0;
        }
        return Math.hypot(after.x - beforeLayout.x, after.y - beforeLayout.y);
      })
      .toBeGreaterThan(80);

    const afterMetrics = await captureSettingsGraphSectionMetrics(
      page,
      sectionId,
    );
    const afterLayout = await getActiveTopLevelSectionLayout(page, sectionId);
    if (!afterMetrics.rect || !afterMetrics.transform || !afterLayout) {
      throw new Error(
        `Missing ${expectedSurfaceKind} drag result metrics for ${sectionName}.`,
      );
    }

    return {
      paneState: afterMetrics.paneState,
      layoutDelta: {
        x: afterLayout.x - beforeLayout.x,
        y: afterLayout.y - beforeLayout.y,
      },
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
    await normalizeSettingsGraphComparePaneState(page);

    const legacyDrag = await captureNamedSectionDragDelta({
      tab: coreTab,
      viewModeId: coreViewModeId,
      expectedSurfaceKind: "legacy",
    });
    const canaryDrag = await captureNamedSectionDragDelta({
      tab: allTab,
      viewModeId: allSettingsViewModeId,
      expectedSurfaceKind: "canary",
    });

    expect(legacyDrag.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(canaryDrag.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(Math.abs(legacyDrag.transformDelta.x)).toBeLessThan(8);
    expect(Math.abs(legacyDrag.transformDelta.y)).toBeLessThan(8);
    expect(Math.abs(legacyDrag.transformDelta.zoom)).toBeLessThan(0.02);
    expect(Math.abs(canaryDrag.transformDelta.x)).toBeLessThan(8);
    expect(Math.abs(canaryDrag.transformDelta.y)).toBeLessThan(8);
    expect(Math.abs(canaryDrag.transformDelta.zoom)).toBeLessThan(0.02);
    expect(
      Math.abs(canaryDrag.layoutDelta.x - legacyDrag.layoutDelta.x),
    ).toBeLessThan(12);
    expect(
      Math.abs(canaryDrag.layoutDelta.y - legacyDrag.layoutDelta.y),
    ).toBeLessThan(12);
    expect(
      Math.abs(canaryDrag.rectDelta.x - legacyDrag.rectDelta.x),
    ).toBeLessThan(16);
    expect(
      Math.abs(canaryDrag.rectDelta.y - legacyDrag.rectDelta.y),
    ).toBeLessThan(16);
  } finally {
    await setLocalPaneState(page, initialPaneState).catch(() => {});
    await restoreInitialViewModeLayout(coreViewModeId).catch(() => {});
    await restoreInitialViewModeLayout(allSettingsViewModeId).catch(() => {});
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (
        initialActiveViewModeId !== coreViewModeId &&
        initialActiveViewModeId !== allSettingsViewModeId
      ) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings graph parity probe applies the same modified-wheel zoom delta on legacy and canary surfaces after normalized fit", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const coreViewModeId = findViewModeId(initialState, "Core");
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const initialPaneState = await getLocalPaneState(page);
  const sharedSection = findSharedVisibleSettingsGraphSection(initialState, [
    "Core",
    "All Settings",
  ]);
  const sectionId = sharedSection.sectionId;
  const sectionName = sharedSection.name;
  const coreTab = page.getByRole("button", { name: "Core", exact: true });
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  async function captureNamedSectionModifiedWheelZoom({
    tab,
    viewModeId,
    expectedSurfaceKind,
  }: {
    tab: ReturnType<Page["getByRole"]>;
    viewModeId: string;
    expectedSurfaceKind: "legacy" | "canary";
  }) {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: viewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(tab).toBeVisible();
    await tab.click();
    if (expectedSurfaceKind === "legacy") {
      await page.waitForSelector(READY_SELECTOR);
    } else {
      await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
      await expect
        .poll(() => page.getByTestId("graph-substrate-canary-section").count())
        .toBeGreaterThan(1);
    }

    await normalizeSettingsGraphComparePaneState(page);
    expect(await fitGraphViewportToSection(page, sectionId)).toBe(true);
    await expect
      .poll(async () => {
        return (await captureSettingsGraphSectionMetrics(page, sectionId))
          .surfaceKind;
      })
      .toBe(expectedSurfaceKind);

    const before = await captureSettingsGraphSectionMetrics(page, sectionId);
    if (!before.rect || !before.transform) {
      throw new Error(
        `Missing ${expectedSurfaceKind} zoom baseline metrics for ${sectionName}.`,
      );
    }

    const zoomPoint = await findSettingsGraphPanePoint(page);
    const rootRelativeZoomPoint = await getSettingsGraphRootRelativePoint(
      page,
      zoomPoint,
    );
    await page.mouse.move(zoomPoint.x, zoomPoint.y);
    await page.keyboard.down(MOD_KEY);
    await page.mouse.wheel(0, -240);
    await page.keyboard.up(MOD_KEY);

    await expect
      .poll(async () => {
        const after = await captureSettingsGraphSectionMetrics(page, sectionId);
        return after.transform?.zoom ?? 0;
      })
      .toBeGreaterThan(before.transform.zoom);

    const after = await captureSettingsGraphSectionMetrics(page, sectionId);
    if (!after.rect || !after.transform) {
      throw new Error(
        `Missing ${expectedSurfaceKind} zoom result metrics for ${sectionName}.`,
      );
    }

    const expectedAnchoredTransform = resolveScreenPointAnchoredViewport(
      before.transform,
      rootRelativeZoomPoint,
      after.transform.zoom,
    );

    return {
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
      anchorDrift: {
        x: Math.abs(after.transform.x - expectedAnchoredTransform.x),
        y: Math.abs(after.transform.y - expectedAnchoredTransform.y),
      },
    };
  }

  try {
    await normalizeSettingsGraphComparePaneState(page);

    const legacyZoom = await captureNamedSectionModifiedWheelZoom({
      tab: coreTab,
      viewModeId: coreViewModeId,
      expectedSurfaceKind: "legacy",
    });
    const canaryZoom = await captureNamedSectionModifiedWheelZoom({
      tab: allTab,
      viewModeId: allSettingsViewModeId,
      expectedSurfaceKind: "canary",
    });

    expect(legacyZoom.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(canaryZoom.paneState).toEqual(SETTINGS_GRAPH_COMPARE_PANE_STATE);
    expect(legacyZoom.anchorDrift.x).toBeLessThan(1);
    expect(legacyZoom.anchorDrift.y).toBeLessThan(1);
    expect(canaryZoom.anchorDrift.x).toBeLessThan(1);
    expect(canaryZoom.anchorDrift.y).toBeLessThan(1);
    expect(
      Math.abs(canaryZoom.transformDelta.zoom - legacyZoom.transformDelta.zoom),
    ).toBeLessThan(0.02);
    expect(
      Math.abs(canaryZoom.transformDelta.x - legacyZoom.transformDelta.x),
    ).toBeLessThan(8);
    expect(
      Math.abs(canaryZoom.transformDelta.y - legacyZoom.transformDelta.y),
    ).toBeLessThan(8);
    expect(
      Math.abs(canaryZoom.rectDelta.x - legacyZoom.rectDelta.x),
    ).toBeLessThan(8);
    expect(
      Math.abs(canaryZoom.rectDelta.y - legacyZoom.rectDelta.y),
    ).toBeLessThan(8);
    expect(
      Math.abs(canaryZoom.rectDelta.width - legacyZoom.rectDelta.width),
    ).toBeLessThan(8);
    expect(
      Math.abs(canaryZoom.rectDelta.height - legacyZoom.rectDelta.height),
    ).toBeLessThan(8);
  } finally {
    await setLocalPaneState(page, initialPaneState).catch(() => {});
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== allSettingsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings graph substrate canary restores the persisted shared viewport on All Settings", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const targetViewport = { x: 320, y: -180, zoom: 0.42 };
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  const coreTab = page.getByRole("button", { name: "Core", exact: true });
  let allSettingsInitialViewport: {
    x: number;
    y: number;
    zoom: number;
  } | null = null;

  try {
    await expect(allTab).toBeVisible();
    await allTab.click();
    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);

    const allSettingsInitialState = await getLatestProjectState(
      page,
      projectConfigId,
    );
    allSettingsInitialViewport =
      allSettingsInitialState.projectState.projectConfig.viewport;
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: targetViewport,
    });
    const stateWithViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithViewport);

    await expect(coreTab).toBeVisible();
    await coreTab.click();
    await page.waitForSelector(READY_SELECTOR);

    await allTab.click();

    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);

    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.x ?? null)
      .toBeCloseTo(targetViewport.x, 0);
    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.y ?? null)
      .toBeCloseTo(targetViewport.y, 0);
    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.zoom ?? null)
      .toBeCloseTo(targetViewport.zoom, 2);
  } finally {
    await allTab.click().catch(() => {});
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: allSettingsInitialViewport,
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

test("settings graph substrate canary restores the persisted shared viewport on All Settings after a full reload", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTab).toBeVisible();

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const allSettingsInitialViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const targetViewport = { x: 320, y: -180, zoom: 0.42 };

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: targetViewport,
    });
    const stateWithViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithViewport);

    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);
    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.x ?? null)
      .toBeCloseTo(targetViewport.x, 0);
    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.y ?? null)
      .toBeCloseTo(targetViewport.y, 0);
    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.zoom ?? null)
      .toBeCloseTo(targetViewport.zoom, 2);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(allTab).toBeVisible();
    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);
    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.x ?? null)
      .toBeCloseTo(targetViewport.x, 0);
    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.y ?? null)
      .toBeCloseTo(targetViewport.y, 0);
    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.zoom ?? null)
      .toBeCloseTo(targetViewport.zoom, 2);
  } finally {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: allSettingsInitialViewport,
    });
    if (
      initialActiveViewModeId &&
      initialActiveViewModeId !== allSettingsViewModeId
    ) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      await postBackend(page, "/setViewport", {
        projectConfigId,
        viewport: initialState.projectState.projectConfig.viewport,
      });
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings graph substrate canary keeps shared node-internals size authoritative when layout size is cleared locally", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialPaneState = await getLocalPaneState(page);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const targetSectionId = findSectionIdByName(
    initialState,
    "rotaryParamCodeObjDefault",
  );

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
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await page
      .getByRole("button", { name: "All Settings", exact: true })
      .click();
    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
    await expect
      .poll(() => fitGraphViewportToSection(page, targetSectionId))
      .toBe(true);

    const baselineSectionSize = await getCanarySceneSectionSize(
      page,
      targetSectionId,
    );
    expect(baselineSectionSize).not.toBeNull();
    if (!baselineSectionSize) {
      throw new Error("Missing baseline canary scene section size.");
    }
    expect(baselineSectionSize.resolvedSize).not.toBeNull();

    // Remove persisted and measured layout authority so the canary must keep
    // using the shared node-internals size for this section.
    await clearCanarySectionLayoutSizeKeepSharedNodeSize(page, targetSectionId);

    await expect
      .poll(async () => await getCanarySceneSectionSize(page, targetSectionId))
      .toEqual({
        height: baselineSectionSize.resolvedSize?.height ?? null,
        resolvedSize: baselineSectionSize.resolvedSize,
        width: baselineSectionSize.resolvedSize?.width ?? null,
      });
    await expect
      .poll(async () => JSON.stringify(await getCanarySceneBounds(page)))
      .not.toBe("null");
  } finally {
    await setLocalPaneState(page, initialPaneState).catch(() => {});
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
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

test("settings graph substrate canary falls back to section-model size when layout and shared node state are only partially populated", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialPaneState = await getLocalPaneState(page);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const targetSectionId = findSectionIdByName(
    initialState,
    "rotaryParamCodeObjDefault",
  );

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
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await page
      .getByRole("button", { name: "All Settings", exact: true })
      .click();
    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
    await expect
      .poll(() => fitGraphViewportToSection(page, targetSectionId))
      .toBe(true);

    const baselineSectionSize = await getCanarySceneSectionSize(
      page,
      targetSectionId,
    );
    expect(baselineSectionSize).not.toBeNull();
    if (!baselineSectionSize?.resolvedSize) {
      throw new Error("Missing baseline canary scene section size.");
    }

    const expectedModelHeight = await page.evaluate(async () => {
      const { useSettings } = await import("/src/state/definitions.ts");
      return useSettings.getState().sectionSizingPolicy.byType.Dict.minHeight;
    });

    // Leave the shared sources partially populated so the canary cannot accept
    // a shared-node pair and must fall back through the section-model sizing
    // path instead of returning null.
    await setCanarySectionPartialMixedSizeState(page, targetSectionId, {
      layoutWidth: baselineSectionSize.resolvedSize.width,
      nodeHeight: baselineSectionSize.resolvedSize.height,
    });

    await expect
      .poll(async () => await getCanarySceneSectionSize(page, targetSectionId))
      .toEqual({
        height: expectedModelHeight,
        resolvedSize: {
          width: baselineSectionSize.resolvedSize.width,
          height: expectedModelHeight,
        },
        width: baselineSectionSize.resolvedSize.width,
      });
  } finally {
    await setLocalPaneState(page, initialPaneState).catch(() => {});
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
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

test("settings graph substrate canary top-level layout persistence clears mixed partial node size instead of storing a split pair", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialPaneState = await getLocalPaneState(page);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const targetSectionId = findSectionIdByName(
    initialState,
    "rotaryParamCodeObjDefault",
  );

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
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await page
      .getByRole("button", { name: "All Settings", exact: true })
      .click();
    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
    await expect
      .poll(() => fitGraphViewportToSection(page, targetSectionId))
      .toBe(true);

    const baselineSectionSize = await getCanarySceneSectionSize(
      page,
      targetSectionId,
    );
    expect(baselineSectionSize).not.toBeNull();
    if (!baselineSectionSize?.resolvedSize) {
      throw new Error("Missing baseline canary scene section size.");
    }

    await setCanarySectionPartialMixedSizeState(page, targetSectionId, {
      layoutWidth: baselineSectionSize.resolvedSize.width,
      nodeHeight: baselineSectionSize.resolvedSize.height,
    });

    await expect
      .poll(() => getActiveTopLevelSectionLayoutSize(page, targetSectionId))
      .toEqual({
        h: null,
        w: baselineSectionSize.resolvedSize.width,
      });

    await persistActiveTopLevelLayoutSnapshot(page);

    await expect
      .poll(() => getActiveTopLevelSectionLayoutSize(page, targetSectionId))
      .toEqual({
        h: null,
        w: null,
      });
  } finally {
    await setLocalPaneState(page, initialPaneState).catch(() => {});
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
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

test("settings graph substrate canary renders the shell-owned border without a duplicate DOM border tone", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialPaneState = await getLocalPaneState(page);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const targetSectionId = findSectionIdByName(
    initialState,
    "rotaryParamCodeObjDefault",
  );

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
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await page
      .getByRole("button", { name: "All Settings", exact: true })
      .click();
    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
    const canarySection = page.locator(
      `[data-testid="graph-substrate-canary-section"][data-section-id="${targetSectionId}"]`,
    );
    await expect(canarySection).toBeVisible();

    const shellPixiLayer = page.getByTestId(
      "graph-substrate-canary-section-pixi-layer",
    );
    await expect(shellPixiLayer).toBeVisible();
    await expect(
      canarySection.getByTestId("graph-substrate-canary-section-border"),
    ).toHaveCount(0);

    const shellPixiCanvasMetrics = await shellPixiLayer.evaluate((node) => {
      const canvas = node as HTMLCanvasElement;
      return {
        clientHeight: canvas.clientHeight,
        clientWidth: canvas.clientWidth,
        height: canvas.height,
        width: canvas.width,
      };
    });
    expect(shellPixiCanvasMetrics.clientWidth).toBeGreaterThan(0);
    expect(shellPixiCanvasMetrics.clientHeight).toBeGreaterThan(0);
    expect(shellPixiCanvasMetrics.width).toBeGreaterThan(0);
    expect(shellPixiCanvasMetrics.height).toBeGreaterThan(0);

    const domShell = canarySection.locator(
      `section[data-section-id="${targetSectionId}"][data-section-type]`,
    );
    await expect(domShell).toBeVisible();

    const domShellStyle = await domShell.evaluate((node) => {
      const computedStyle = window.getComputedStyle(node as HTMLElement);
      return {
        backgroundColor: computedStyle.backgroundColor,
        borderTopColor: computedStyle.borderTopColor,
        borderTopWidth: computedStyle.borderTopWidth,
      };
    });
    expect(domShellStyle.borderTopWidth).not.toBe("0px");
    expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(
      domShellStyle.backgroundColor,
    );
    expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(
      domShellStyle.borderTopColor,
    );
  } finally {
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
    await setLocalPaneState(page, initialPaneState);
  }
});

test("settings graph substrate canary renders the shell-owned surface frame without a duplicate DOM frame border", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialPaneState = await getLocalPaneState(page);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  let createdSectionId: string | null = null;

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
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await page
      .getByRole("button", { name: "All Settings", exact: true })
      .click();
    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();

    const created = await postBackend<{ sectionId?: string }>(
      page,
      "/createTopLevelSection",
      {
        projectConfigId,
        implType: "Code",
      },
    );
    if (!created?.sectionId) {
      throw new Error("Missing sectionId when creating code section.");
    }
    createdSectionId = created.sectionId;

    const createdState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, createdState);

    await expect
      .poll(() => fitGraphViewportToSection(page, createdSectionId))
      .toBe(true);

    const canarySection = page.locator(
      `[data-testid="graph-substrate-canary-section"][data-section-id="${createdSectionId}"]`,
    );
    await expect(canarySection).toBeVisible();
    await expect(
      page.getByTestId("graph-substrate-canary-section-pixi-layer"),
    ).toBeVisible();

    const domSurface = page.locator(`#${createdSectionId}-CustomResizable`);
    await expect(domSurface).toBeVisible();
    const domSurfaceFrameStyle = await domSurface.evaluate((node) => {
      const computedStyle = window.getComputedStyle(
        node as HTMLElement,
        "::before",
      );
      return {
        borderTopWidth: computedStyle.borderTopWidth,
      };
    });
    expect(domSurfaceFrameStyle.borderTopWidth).toBe("0px");
  } finally {
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
    }
    if (createdSectionId) {
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [createdSectionId],
      });
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
    await setLocalPaneState(page, initialPaneState);
  }
});

test("settings graph substrate canary renders the shell-owned top drag handle without a duplicate DOM handle", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialPaneState = await getLocalPaneState(page);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  let createdSectionId: string | null = null;

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
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await page
      .getByRole("button", { name: "All Settings", exact: true })
      .click();
    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();

    const created = await postBackend<{ sectionId?: string }>(
      page,
      "/createTopLevelSection",
      {
        projectConfigId,
        implType: "MetaControl",
      },
    );
    if (!created?.sectionId) {
      throw new Error("Missing sectionId when creating meta-control section.");
    }
    createdSectionId = created.sectionId;

    const createdState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, createdState);

    await expect
      .poll(() => fitGraphViewportToSection(page, createdSectionId))
      .toBe(true);

    const canarySection = page.locator(
      `[data-testid="graph-substrate-canary-section"][data-section-id="${createdSectionId}"]`,
    );
    await expect(canarySection).toBeVisible();
    const shellPixiLayer = page.getByTestId(
      "graph-substrate-canary-section-pixi-layer",
    );
    await expect(shellPixiLayer).toBeVisible();

    await expect(
      canarySection.getByTestId(
        "graph-substrate-canary-section-top-drag-handle",
      ),
    ).toHaveCount(0);
    await expect(
      canarySection.getByTestId("section-top-drag-handle"),
    ).toHaveCount(0);

    const canvasDataUrlBeforeHover = await shellPixiLayer.evaluate((node) => {
      return (node as HTMLCanvasElement).toDataURL();
    });

    await canarySection.hover();

    await expect
      .poll(async () => {
        const canvasDataUrlAfterHover = await shellPixiLayer.evaluate(
          (node) => {
            return (node as HTMLCanvasElement).toDataURL();
          },
        );
        return canvasDataUrlAfterHover === canvasDataUrlBeforeHover;
      })
      .toBe(false);

    const canvasDataUrlAfterHover = await shellPixiLayer.evaluate((node) => {
      return (node as HTMLCanvasElement).toDataURL();
    });
    expect(canvasDataUrlAfterHover).not.toBe(canvasDataUrlBeforeHover);
  } finally {
    if (createdSectionId) {
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [createdSectionId],
      });
      const stateWithoutCreatedSection = await getLatestProjectState(
        page,
        projectConfigId,
      );
      await applyProjectStateUpdate(page, stateWithoutCreatedSection);
    }
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
    await setLocalPaneState(page, initialPaneState);
  }
});

test("settings graph substrate canary does not persist a provisional initial viewport", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();
    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);

    // Wait past the viewport debounce to catch accidental persistence of the
    // provisional fallback camera.
    await page.waitForTimeout(1200);

    const latestState = await getLatestProjectState(page, projectConfigId);
    const allSettingsViewMode =
      latestState.projectState.projectConfig.viewModes[allSettingsViewModeId];
    expect(latestState.projectState.projectConfig.viewport).toBeNull();
    expect(latestState.projectState.projectConfig.viewportInitialized).toBe(
      false,
    );
    expect(allSettingsViewMode?.viewport).toBeNull();
    expect(allSettingsViewMode?.viewportInitialized).toBe(false);
  } finally {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== allSettingsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings graph substrate canary preserves a recent viewport change across a fast view-mode switch", async ({
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
  const coreTab = page.getByRole("button", { name: "Core", exact: true });
  let allSettingsInitialViewport: {
    x: number;
    y: number;
    zoom: number;
  } | null = null;

  try {
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();
    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);
    await expect
      .poll(async () => {
        const drift = await getCanaryAutoFitDrift(page);
        return drift?.zoom ?? Number.POSITIVE_INFINITY;
      })
      .toBeLessThan(0.03);

    const allSettingsInitialState = await getLatestProjectState(
      page,
      projectConfigId,
    );
    allSettingsInitialViewport =
      allSettingsInitialState.projectState.projectConfig.viewport;

    const panStart = await findCanaryPanePoint(page);
    await page.mouse.move(panStart.x, panStart.y);
    await page.mouse.down();
    await page.mouse.move(panStart.x + 140, panStart.y + 90, { steps: 10 });
    await page.mouse.up();

    // A fast tab switch should keep the latest user-owned canary camera.
    const expectedViewport = await getCanaryViewportTransform(page);
    if (!expectedViewport) {
      throw new Error("Missing panned canary viewport.");
    }

    await expect(coreTab).toBeVisible();
    await coreTab.click();
    await page.waitForSelector(READY_SELECTOR);

    await allTab.click();
    await expect(page.getByTestId("graph-substrate-canary")).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);

    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.x ?? null)
      .toBeCloseTo(expectedViewport.x, 0);
    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.y ?? null)
      .toBeCloseTo(expectedViewport.y, 0);
    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.zoom ?? null)
      .toBeCloseTo(expectedViewport.zoom, 2);
  } finally {
    await allTab.click().catch(() => {});
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: allSettingsInitialViewport,
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

test("settings graph substrate canary focus shortcut restores an offscreen section into the canvas lane", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();

    const canaryPane = page.getByTestId("graph-substrate-canary");
    const canarySections = page.getByTestId("graph-substrate-canary-section");
    await expect(canaryPane).toHaveAttribute("data-tab-scope", "canvas");
    await expect.poll(() => canarySections.count()).toBeGreaterThan(1);
    const targetSection = canarySections.first();
    const targetSectionId = await targetSection.getAttribute("data-section-id");
    if (!targetSectionId) {
      throw new Error("Missing focus target section id.");
    }
    const targetFocusable = targetSection.locator("button").first();
    await targetFocusable.focus();
    await expect(targetFocusable).toBeFocused();

    const offscreenViewport = await getCanaryViewportWithSectionMovedOffscreen(
      page,
      0,
    );
    if (!offscreenViewport) {
      throw new Error("Missing offscreen canary viewport.");
    }

    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: offscreenViewport,
    });
    const stateWithOffscreenViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithOffscreenViewport);

    await expect
      .poll(async () => isCanarySectionCenterInsidePane(page, 0))
      .toBe(false);
    await page.getByRole("button", { name: "Core", exact: true }).focus();
    await expect.poll(() => isCanvasScopeFocused(page)).toBe(false);

    // The shared canvas-focus shortcut should use the canary viewport
    // controller and pull the first section back into the visible pane.
    await page.keyboard.press("Control+Shift+3");

    await expect.poll(() => isCanvasScopeFocused(page)).toBe(true);
    await expect
      .poll(async () => getFocusedCanvasSectionId(page))
      .toBe(targetSectionId);
    await expect
      .poll(async () => isCanarySectionCenterInsidePane(page, 0))
      .toBe(true);
    await expect
      .poll(async () => {
        const viewport = await getCanaryViewportTransform(page);
        if (!viewport) {
          return 0;
        }
        return Math.hypot(
          viewport.x - offscreenViewport.x,
          viewport.y - offscreenViewport.y,
        );
      })
      .toBeGreaterThan(20);
  } finally {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== allSettingsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings graph substrate canary matches legacy plain-wheel pan behavior on the custom surface", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

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
  if (!initialFirstBox || !initialSecondBox) {
    throw new Error(
      "Missing multi-section canary bounds for pan and zoom test.",
    );
  }

  const panStart = await findCanaryPanePoint(page);
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
  const movedSecondBox = await secondSection.boundingBox();
  if (!movedFirstBox) {
    throw new Error("Missing moved canary section bounds.");
  }
  if (!movedSecondBox) {
    throw new Error("Missing moved canary section bounds.");
  }
  const viewportAfterDrag = await getCanaryViewportTransform(page);
  if (!viewportAfterDrag) {
    throw new Error("Missing dragged canary viewport.");
  }

  const zoomStart = await findCanaryPanePoint(page);
  await page.mouse.move(zoomStart.x, zoomStart.y);
  await page.mouse.wheel(0, -240);

  await expect
    .poll(async () => (await getCanaryViewportTransform(page))?.zoom ?? null)
    .toBeCloseTo(initialScale, 2);
  await expect
    .poll(async () => {
      const scrolledBox = await firstSection.boundingBox();
      if (!scrolledBox) {
        return 0;
      }
      return Math.hypot(
        scrolledBox.x - movedFirstBox.x,
        scrolledBox.y - movedFirstBox.y,
      );
    })
    .toBeGreaterThan(150);
  await expect
    .poll(async () => {
      const scrolledBox = await secondSection.boundingBox();
      if (!scrolledBox) {
        return 0;
      }
      return Math.hypot(
        scrolledBox.x - movedSecondBox.x,
        scrolledBox.y - movedSecondBox.y,
      );
    })
    .toBeGreaterThan(150);
  await expect
    .poll(async () => (await getCanaryViewportTransform(page))?.x ?? null)
    .toBeCloseTo(viewportAfterDrag.x, 0);
  await expect
    .poll(async () => (await getCanaryViewportTransform(page))?.y ?? null)
    .toBeCloseTo(viewportAfterDrag.y + 240, 0);
});

test("settings graph substrate canary keeps plain-wheel pan working from section chrome on the custom surface", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTab).toBeVisible();
  await allTab.click();

  const canaryPane = page.getByTestId("graph-substrate-canary");
  const canarySections = page.getByTestId("graph-substrate-canary-section");
  await expect.poll(() => canarySections.count()).toBeGreaterThan(1);
  await expect(canaryPane).toBeVisible();
  await expect(page.locator(".react-flow__pane")).toHaveCount(0);

  let targetSection = canarySections.first();
  let sectionId: string | null = null;
  let wheelPoint: { x: number; y: number } | null = null;
  const sectionCount = await canarySections.count();
  for (let index = 0; index < sectionCount; index += 1) {
    const candidateSection = canarySections.nth(index);
    const candidateSectionId =
      await candidateSection.getAttribute("data-section-id");
    if (!candidateSectionId) {
      continue;
    }
    try {
      const candidateWheelPoint = await findSettingsGraphSectionWheelPanPoint(
        page,
        candidateSectionId,
      );
      targetSection = candidateSection;
      sectionId = candidateSectionId;
      wheelPoint = candidateWheelPoint;
      break;
    } catch {
      continue;
    }
  }
  await expect(targetSection).toBeVisible();
  if (!sectionId || !wheelPoint) {
    throw new Error(
      "Unable to find a canary section with a non-nowheel wheel-pan point.",
    );
  }

  const initialTransform = await getCanaryViewportTransform(page);
  const initialBox = await targetSection.boundingBox();
  if (!initialTransform || !initialBox) {
    throw new Error(
      "Missing canary viewport baseline for section chrome wheel test.",
    );
  }

  await page.mouse.move(wheelPoint.x, wheelPoint.y);
  await page.mouse.wheel(0, -240);

  await expect
    .poll(async () => (await getCanaryViewportTransform(page))?.zoom ?? null)
    .toBeCloseTo(initialTransform.zoom, 2);
  await expect
    .poll(async () => {
      const currentTransform = await getCanaryViewportTransform(page);
      return currentTransform?.y ?? null;
    })
    .toBeCloseTo(initialTransform.y + 240, 0);
  await expect
    .poll(async () => {
      const movedBox = await targetSection.boundingBox();
      if (!movedBox) {
        return 0;
      }
      return Math.hypot(movedBox.x - initialBox.x, movedBox.y - initialBox.y);
    })
    .toBeGreaterThan(150);
});

test("settings graph substrate canary matches legacy modified-wheel zoom behavior on the custom surface", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();

    const canaryPane = page.getByTestId("graph-substrate-canary");
    const canarySections = page.getByTestId("graph-substrate-canary-section");
    await expect(canaryPane).toBeVisible();
    await expect.poll(() => canarySections.count()).toBeGreaterThan(1);
    await expect(page.locator(".react-flow__pane")).toHaveCount(0);

    const zoomPoint = await findCanaryPanePoint(page);
    const rootRelativeZoomPoint = await getCanaryRootRelativePoint(
      page,
      zoomPoint,
    );
    const initialTransform = await getCanaryViewportTransform(page);
    if (!initialTransform) {
      throw new Error(
        "Missing canary viewport transform before modified-wheel zoom.",
      );
    }
    await page.mouse.move(zoomPoint.x, zoomPoint.y);
    await page.keyboard.down(MOD_KEY);
    await page.mouse.wheel(0, -240);
    await page.keyboard.up(MOD_KEY);

    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.zoom ?? null)
      .toBeGreaterThan(initialTransform.zoom);
    await expect
      .poll(async () => {
        const currentTransform = await getCanaryViewportTransform(page);
        if (!currentTransform) {
          return Number.POSITIVE_INFINITY;
        }
        const expectedTransform = resolveScreenPointAnchoredViewport(
          initialTransform,
          rootRelativeZoomPoint,
          currentTransform.zoom,
        );
        return Math.abs(currentTransform.x - expectedTransform.x);
      })
      .toBeLessThan(1);
    await expect
      .poll(async () => {
        const currentTransform = await getCanaryViewportTransform(page);
        if (!currentTransform) {
          return Number.POSITIVE_INFINITY;
        }
        const expectedTransform = resolveScreenPointAnchoredViewport(
          initialTransform,
          rootRelativeZoomPoint,
          currentTransform.zoom,
        );
        return Math.abs(currentTransform.y - expectedTransform.y);
      })
      .toBeLessThan(1);
  } finally {
    await allTab.click().catch(() => {});
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
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

test("settings graph substrate canary allows modified-wheel zoom from a nowheel section body on the custom surface", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const spreadsheetSectionId = findSectionIdByName(
    initialState,
    "spreadsheetSectionDefault",
  );
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();

    const canaryPane = page.getByTestId("graph-substrate-canary");
    const canarySections = page.getByTestId("graph-substrate-canary-section");
    await expect(canaryPane).toBeVisible();
    await expect.poll(() => canarySections.count()).toBeGreaterThan(1);
    await expect(page.locator(".react-flow__pane")).toHaveCount(0);
    expect(await fitGraphViewportToSection(page, spreadsheetSectionId)).toBe(
      true,
    );

    const zoomPoint = await findCanarySectionNoWheelPoint(
      page,
      spreadsheetSectionId,
    );
    const rootRelativeZoomPoint = await getCanaryRootRelativePoint(
      page,
      zoomPoint,
    );
    const initialTransform = await getCanaryViewportTransform(page);
    if (!initialTransform) {
      throw new Error(
        "Missing canary viewport transform before nowheel modified-wheel zoom.",
      );
    }

    await page.mouse.move(zoomPoint.x, zoomPoint.y);
    await page.keyboard.down(MOD_KEY);
    await page.mouse.wheel(0, -240);
    await page.keyboard.up(MOD_KEY);

    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.zoom ?? null)
      .toBeGreaterThan(initialTransform.zoom);
    await expect
      .poll(async () => {
        const currentTransform = await getCanaryViewportTransform(page);
        if (!currentTransform) {
          return Number.POSITIVE_INFINITY;
        }
        const expectedTransform = resolveScreenPointAnchoredViewport(
          initialTransform,
          rootRelativeZoomPoint,
          currentTransform.zoom,
        );
        return Math.abs(currentTransform.x - expectedTransform.x);
      })
      .toBeLessThan(1);
    await expect
      .poll(async () => {
        const currentTransform = await getCanaryViewportTransform(page);
        if (!currentTransform) {
          return Number.POSITIVE_INFINITY;
        }
        const expectedTransform = resolveScreenPointAnchoredViewport(
          initialTransform,
          rootRelativeZoomPoint,
          currentTransform.zoom,
        );
        return Math.abs(currentTransform.y - expectedTransform.y);
      })
      .toBeLessThan(1);
  } finally {
    await allTab.click().catch(() => {});
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
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

test("settings graph substrate canary blank pane click clears the active section durably", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const initialActiveIds = [
    ...initialState.projectState.projectConfig.activeIds,
  ];
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();

    const canarySections = page.getByTestId("graph-substrate-canary-section");
    await expect.poll(() => canarySections.count()).toBeGreaterThan(1);
    const targetSection = canarySections.first();
    const sectionId = await targetSection.getAttribute("data-section-id");
    if (!sectionId) {
      throw new Error(
        "Missing canary section id for blank-pane deselect test.",
      );
    }

    await setDurableActiveSectionIds(page, [sectionId]);
    await expect
      .poll(async () => isCanarySectionActive(page, sectionId))
      .toBe(true);
    await expect
      .poll(async () => isCanarySectionOutlineActive(page, sectionId))
      .toBe(true);
    await expect
      .poll(async () => {
        return (await getLatestProjectState(page, projectConfigId)).projectState
          .projectConfig.activeIds;
      })
      .toEqual([sectionId]);

    const blankPanePoint = await findCanaryPanePoint(page);
    await page.mouse.click(blankPanePoint.x, blankPanePoint.y);

    await expect
      .poll(async () => isCanarySectionActive(page, sectionId))
      .toBe(false);
    await expect
      .poll(async () => isCanarySectionOutlineActive(page, sectionId))
      .toBe(false);
    await expect
      .poll(async () => {
        return (await getLatestProjectState(page, projectConfigId)).projectState
          .projectConfig.activeIds;
      })
      .toEqual([]);
  } finally {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    await setDurableActiveSectionIds(page, initialActiveIds);
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== allSettingsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
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
  if (!initialBox) {
    throw new Error("Missing canary bounds for title edit test.");
  }

  const panStart = await findCanaryPanePoint(page);
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

  // Plain wheel now pans on this surface; use the shared zoom control to keep
  // the post-motion editing handoff check aligned with the live zoom contract.
  await page.getByRole("button", { name: "zoom in" }).click();

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

test("settings graph substrate canary keeps a body search input working after pan and zoom", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const initialPaneState = await getLocalPaneState(page);
  const spreadsheetSectionId = findSectionIdByName(
    initialState,
    "spreadsheetSectionDefault",
  );
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();

    const canaryPane = page.getByTestId("graph-substrate-canary");
    const targetSection = page.locator(
      `[data-testid="graph-substrate-canary-section"][data-section-id="${spreadsheetSectionId}"]`,
    );
    await expect(canaryPane).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);

    await setComparePaneVisibility(page, {
      overviewVisible: false,
      uiEditorVisible: false,
    });
    expect(await fitGraphViewportToSection(page, spreadsheetSectionId)).toBe(
      true,
    );

    await expect(targetSection).toBeVisible();
    // The filter input placeholder depends on active-section state, so anchor
    // the motion/editing guard to the stable section-scoped filter id instead.
    const sectionSearchInput = targetSection.locator(
      `[id="${spreadsheetSectionId}-args-filter"]`,
    );
    await expect(sectionSearchInput).toBeVisible();
    await expect(targetSection).toHaveAttribute("data-dragging", "false");

    const initialScale = await getCanaryViewportScale(page);
    const initialBox = await targetSection.boundingBox();
    if (!initialBox) {
      throw new Error("Missing canary bounds for body search test.");
    }

    const panStart = await findCanaryPanePoint(page);
    await page.mouse.move(panStart.x, panStart.y);
    await page.mouse.down();
    await page.mouse.move(panStart.x + 120, panStart.y + 80, { steps: 10 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const movedBox = await targetSection.boundingBox();
        if (!movedBox) {
          return 0;
        }
        return Math.hypot(movedBox.x - initialBox.x, movedBox.y - initialBox.y);
      })
      .toBeGreaterThan(60);

    await page.getByRole("button", { name: "zoom in" }).click();
    await expect
      .poll(() => getCanaryViewportScale(page))
      .toBeGreaterThan(initialScale * 1.08);

    // The canary must preserve body-input focus and typing handoff
    // after custom viewport motion.
    await sectionSearchInput.click();
    await expect(sectionSearchInput).toBeFocused();
    await sectionSearchInput.fill("density");
    await expect(sectionSearchInput).toHaveValue("density");
    await expect(targetSection).toHaveAttribute("data-dragging", "false");
    await sectionSearchInput.fill("");
    await expect(sectionSearchInput).toHaveValue("");
  } finally {
    await setLocalPaneState(page, initialPaneState);
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== allSettingsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings graph substrate canary can fit a named body-heavy section into a wide-card compare state", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const groupSectionId = findSectionIdByName(
    initialState,
    "groupSectionDefault",
  );
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();

    const canaryPane = page.getByTestId("graph-substrate-canary");
    await expect(canaryPane).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);
    await setComparePaneVisibility(page, {
      overviewVisible: false,
      uiEditorVisible: false,
    });

    const initialTargetBox = await getCanarySectionBoundingBox(
      page,
      groupSectionId,
    );
    if (!initialTargetBox) {
      throw new Error(
        "Missing groupSectionDefault canary bounds before targeted fit.",
      );
    }

    // Future parity probes can use the shared fitView path to normalize one
    // named wide/body-heavy card into a stable compare state instead of
    // relying on click ordering or viewport carry-over.
    expect(await fitGraphViewportToSection(page, groupSectionId)).toBe(true);

    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.zoom ?? 0)
      .toBeGreaterThan(1);
    await expect
      .poll(async () => {
        const targetBox = await getCanarySectionBoundingBox(
          page,
          groupSectionId,
        );
        return targetBox?.width ?? 0;
      })
      .toBeGreaterThan(Math.max(initialTargetBox.width * 6, 500));
    await expect
      .poll(async () => {
        const targetBox = await getCanarySectionBoundingBox(
          page,
          groupSectionId,
        );
        return targetBox?.height ?? 0;
      })
      .toBeGreaterThan(Math.max(initialTargetBox.height * 6, 300));
  } finally {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== allSettingsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings graph substrate canary targeted fit stays deterministic after clearing durable selection noise", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const initialActiveIds = [
    ...initialState.projectState.projectConfig.activeIds,
  ];
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const groupSectionId = findSectionIdByName(
    initialState,
    "groupSectionDefault",
  );
  const distractorSectionId = getExpectedCanarySectionOrder(
    initialState,
    allSettingsViewModeId,
  ).find((sectionId) => sectionId !== groupSectionId);
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  if (!distractorSectionId) {
    throw new Error(
      "Missing a second visible All Settings section for selection normalization.",
    );
  }

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();

    const canaryPane = page.getByTestId("graph-substrate-canary");
    await expect(canaryPane).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);
    await setComparePaneVisibility(page, {
      overviewVisible: false,
      uiEditorVisible: false,
    });

    await setDurableActiveSectionIds(page, [distractorSectionId]);
    await expect
      .poll(async () => isCanarySectionActive(page, distractorSectionId))
      .toBe(true);

    // Live CDP compares should explicitly neutralize persisted active-section
    // state before judging graph-surface drift, otherwise selection/list chrome
    // can masquerade as renderer movement.
    await setDurableActiveSectionIds(page, []);
    await expect
      .poll(async () => isCanarySectionActive(page, distractorSectionId))
      .toBe(false);
    await expect
      .poll(async () => {
        return (await getLatestProjectState(page, projectConfigId)).projectState
          .projectConfig.activeIds;
      })
      .toEqual([]);

    expect(await fitGraphViewportToSection(page, groupSectionId)).toBe(true);

    await expect
      .poll(async () => (await getCanaryViewportTransform(page))?.zoom ?? 0)
      .toBeGreaterThan(1);
    await expect
      .poll(async () => {
        return Math.abs(
          (await getCanarySectionCenterOffsetFromRootCenter(
            page,
            groupSectionId,
          )) ?? Number.POSITIVE_INFINITY,
        );
      })
      .toBeLessThan(40);
  } finally {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    await setDurableActiveSectionIds(page, initialActiveIds);
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== allSettingsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings graph substrate canary fit view mirrors legacy hidden pane widths", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const groupSectionId = findSectionIdByName(
    initialState,
    "groupSectionDefault",
  );
  const initialPaneState = await getLocalPaneState(page);
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();

    const canaryPane = page.getByTestId("graph-substrate-canary");
    await expect(canaryPane).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);

    await normalizeSettingsGraphComparePaneState(page);

    expect(await fitGraphViewportToSection(page, groupSectionId)).toBe(true);

    const expectedCenterOffset =
      (SETTINGS_GRAPH_COMPARE_PANE_STATE.overviewTrueWidth -
        SETTINGS_GRAPH_COMPARE_PANE_STATE.uiEditorTrueWidth) /
      2;

    await expect
      .poll(async () => {
        return Math.abs(
          ((await getCanarySectionCenterOffsetFromRootCenter(
            page,
            groupSectionId,
          )) ?? Number.POSITIVE_INFINITY) - expectedCenterOffset,
        );
      })
      .toBeLessThan(8);
  } finally {
    await setLocalPaneState(page, initialPaneState);
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== allSettingsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings legacy graph surface can fit a named param-default section into a wide-card compare state", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const paramDefaultsViewModeId = findViewModeId(
    initialState,
    "Param Defaults",
  );
  const initialParamDefaultsViewport =
    initialState.projectState.projectConfig.viewModes[paramDefaultsViewModeId]
      ?.viewport ?? null;
  const textAreaParamSectionId = findSectionIdByName(
    initialState,
    "textAreaParamCodeObjDefault",
  );
  const paramTab = page.getByRole("button", {
    name: "Param Defaults",
    exact: true,
  });

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: paramDefaultsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(paramTab).toBeVisible();
    await paramTab.click();
    await page.waitForSelector(READY_SELECTOR);
    await waitForNodeCount(page, 13);
    await setComparePaneVisibility(page, {
      overviewVisible: false,
      uiEditorVisible: false,
    });

    const targetSection = page.locator(
      `[id="${textAreaParamSectionId}-CustomResizable"]`,
    );
    const initialTargetBox = await targetSection.boundingBox();
    if (!initialTargetBox) {
      throw new Error(
        "Missing textAreaParamCodeObjDefault bounds before targeted fit.",
      );
    }
    const initialViewportScale = await getViewportScale(page);

    // Locks down the legacy reference-side normalizer used by the live
    // drawSectionDefault compare lane on main.
    expect(await fitGraphViewportToSection(page, textAreaParamSectionId)).toBe(
      true,
    );

    await expect
      .poll(async () => await getViewportScale(page))
      .toBeGreaterThan(initialViewportScale * 1.5);
    await expect
      .poll(async () => (await targetSection.boundingBox())?.width ?? 0)
      .toBeGreaterThan(Math.max(initialTargetBox.width * 4, 500));
    await expect
      .poll(async () => (await targetSection.boundingBox())?.height ?? 0)
      .toBeGreaterThan(Math.max(initialTargetBox.height * 4, 300));
  } finally {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: paramDefaultsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialParamDefaultsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== paramDefaultsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings graph substrate canary keeps a widened body-heavy section attached during pane pan", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const spreadsheetSectionId = findSectionIdByName(
    initialState,
    "spreadsheetSectionDefault",
  );
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();

    const canaryPane = page.getByTestId("graph-substrate-canary");
    const targetSection = page.locator(
      `[data-testid="graph-substrate-canary-section"][data-section-id="${spreadsheetSectionId}"]`,
    );
    await expect(canaryPane).toBeVisible();
    await expect(targetSection).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);

    await setComparePaneVisibility(page, {
      overviewVisible: false,
      uiEditorVisible: false,
    });
    expect(await fitGraphViewportToSection(page, spreadsheetSectionId)).toBe(
      true,
    );

    await expect
      .poll(async () => {
        const targetBox = await getCanarySectionBoundingBox(
          page,
          spreadsheetSectionId,
        );
        return targetBox?.width ?? 0;
      })
      .toBeGreaterThan(500);
    await expect
      .poll(async () => {
        const targetBox = await getCanarySectionBoundingBox(
          page,
          spreadsheetSectionId,
        );
        return targetBox?.height ?? 0;
      })
      .toBeGreaterThan(300);

    // Locks down the next named wide-card motion lane: a real pane pan must
    // move the widened body-heavy card without letting the body drift inside
    // the section shell.
    const initialSectionBox = await getCanarySectionBoundingBox(
      page,
      spreadsheetSectionId,
    );
    const initialBodyAnchorOffset = await getCanarySectionBodyAnchorOffset(
      page,
      spreadsheetSectionId,
    );
    const initialViewportTransform = await getCanaryViewportTransform(page);
    if (
      !initialSectionBox ||
      !initialBodyAnchorOffset ||
      !initialViewportTransform
    ) {
      throw new Error(
        "Missing wide-card section bounds, body anchor, or viewport before pane pan.",
      );
    }

    const panStart = await findCanaryPanePoint(page);
    await page.mouse.move(panStart.x, panStart.y);
    await page.mouse.down();
    await page.mouse.move(panStart.x + 180, panStart.y + 120, { steps: 10 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const latestViewportTransform = await getCanaryViewportTransform(page);
        if (!latestViewportTransform) {
          return 0;
        }
        return Math.hypot(
          latestViewportTransform.x - initialViewportTransform.x,
          latestViewportTransform.y - initialViewportTransform.y,
        );
      })
      .toBeGreaterThan(120);
    await expect
      .poll(async () => {
        const movedBox = await getCanarySectionBoundingBox(
          page,
          spreadsheetSectionId,
        );
        if (!movedBox) {
          return 0;
        }
        return Math.hypot(
          movedBox.x - initialSectionBox.x,
          movedBox.y - initialSectionBox.y,
        );
      })
      .toBeGreaterThan(120);
    await expect
      .poll(async () => {
        const latestBodyAnchorOffset = await getCanarySectionBodyAnchorOffset(
          page,
          spreadsheetSectionId,
        );
        if (!latestBodyAnchorOffset) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestBodyAnchorOffset.x - initialBodyAnchorOffset.x),
          Math.abs(latestBodyAnchorOffset.y - initialBodyAnchorOffset.y),
        );
      })
      .toBeLessThan(16);
    await expect(targetSection).toHaveAttribute("data-dragging", "false");
  } finally {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== allSettingsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings graph substrate canary keeps a widened draw section attached during pane pan", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const drawSectionId = findSectionIdByName(initialState, "drawSectionDefault");
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();

    const canaryPane = page.getByTestId("graph-substrate-canary");
    const targetSection = page.locator(
      `[data-testid="graph-substrate-canary-section"][data-section-id="${drawSectionId}"]`,
    );
    await expect(canaryPane).toBeVisible();
    await expect(targetSection).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);

    await setComparePaneVisibility(page, {
      overviewVisible: false,
      uiEditorVisible: false,
    });
    expect(await fitGraphViewportToSection(page, drawSectionId)).toBe(true);

    await expect
      .poll(async () => {
        const targetBox = await getCanarySectionBoundingBox(
          page,
          drawSectionId,
        );
        return targetBox?.width ?? 0;
      })
      .toBeGreaterThan(500);
    await expect
      .poll(async () => {
        const targetBox = await getCanarySectionBoundingBox(
          page,
          drawSectionId,
        );
        return targetBox?.height ?? 0;
      })
      .toBeGreaterThan(300);

    // Locks down the next non-group/non-spreadsheet motion lane: the widened
    // draw section must pan with the viewport while its body stays attached to
    // the same shell.
    const initialSectionBox = await getCanarySectionBoundingBox(
      page,
      drawSectionId,
    );
    const initialBodyAnchorOffset = await getCanarySectionBodyAnchorOffset(
      page,
      drawSectionId,
    );
    const initialViewportTransform = await getCanaryViewportTransform(page);
    if (
      !initialSectionBox ||
      !initialBodyAnchorOffset ||
      !initialViewportTransform
    ) {
      throw new Error(
        "Missing widened draw-section bounds, body anchor, or viewport before pane pan.",
      );
    }

    const panStart = await findCanaryPanePoint(page);
    await page.mouse.move(panStart.x, panStart.y);
    await page.mouse.down();
    await page.mouse.move(panStart.x + 180, panStart.y + 120, { steps: 10 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const latestViewportTransform = await getCanaryViewportTransform(page);
        if (!latestViewportTransform) {
          return 0;
        }
        return Math.hypot(
          latestViewportTransform.x - initialViewportTransform.x,
          latestViewportTransform.y - initialViewportTransform.y,
        );
      })
      .toBeGreaterThan(120);
    await expect
      .poll(async () => {
        const movedBox = await getCanarySectionBoundingBox(page, drawSectionId);
        if (!movedBox) {
          return 0;
        }
        return Math.hypot(
          movedBox.x - initialSectionBox.x,
          movedBox.y - initialSectionBox.y,
        );
      })
      .toBeGreaterThan(120);
    await expect
      .poll(async () => {
        const latestBodyAnchorOffset = await getCanarySectionBodyAnchorOffset(
          page,
          drawSectionId,
        );
        if (!latestBodyAnchorOffset) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestBodyAnchorOffset.x - initialBodyAnchorOffset.x),
          Math.abs(latestBodyAnchorOffset.y - initialBodyAnchorOffset.y),
        );
      })
      .toBeLessThan(16);
    await expect(targetSection).toHaveAttribute("data-dragging", "false");
  } finally {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== allSettingsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings graph substrate canary keeps a widened draw section frontmost after top-level drag", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const drawSectionId = findSectionIdByName(initialState, "drawSectionDefault");
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();

    const canaryPane = page.getByTestId("graph-substrate-canary");
    const targetSection = page.locator(
      `[data-testid="graph-substrate-canary-section"][data-section-id="${drawSectionId}"]`,
    );
    await expect(canaryPane).toBeVisible();
    await expect(targetSection).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);

    await setComparePaneVisibility(page, {
      overviewVisible: false,
      uiEditorVisible: false,
    });
    expect(await fitGraphViewportToSection(page, drawSectionId)).toBe(true);

    const initialTargetLayout = await getActiveTopLevelSectionLayout(
      page,
      drawSectionId,
    );
    if (!initialTargetLayout) {
      throw new Error("Missing drawSectionDefault layout before drag.");
    }

    const overlapPlan = await getCanaryOverlapDropPlan(page, drawSectionId);
    if (!overlapPlan) {
      throw new Error("Missing overlap drag plan for drawSectionDefault.");
    }

    if (
      !(await getActiveTopLevelSectionLayout(
        page,
        overlapPlan.overlapSectionId,
      ))
    ) {
      throw new Error("Missing overlap target layout before draw.");
    }

    const dragTarget = await findDraggableCanarySection(page, drawSectionId);
    await page.mouse.move(dragTarget.point.x, dragTarget.point.y);
    await page.mouse.down();
    await expect(targetSection).toHaveAttribute("data-dragging", "true");
    await page.mouse.move(
      dragTarget.point.x + overlapPlan.delta.x,
      dragTarget.point.y + overlapPlan.delta.y,
      {
        steps: 12,
      },
    );
    await page.mouse.up();
    await expect(targetSection).toHaveAttribute("data-dragging", "false");

    await expect
      .poll(async () => {
        const movedLayout = await getActiveTopLevelSectionLayout(
          page,
          drawSectionId,
        );
        if (!movedLayout) {
          return 0;
        }
        return Math.hypot(
          movedLayout.x - initialTargetLayout.x,
          movedLayout.y - initialTargetLayout.y,
        );
      })
      .toBeGreaterThan(80);

    await expect
      .poll(async () => {
        const movedLayout = await getActiveTopLevelSectionLayout(
          page,
          drawSectionId,
        );
        const overlapLayout = await getActiveTopLevelSectionLayout(
          page,
          overlapPlan.overlapSectionId,
        );
        if (!movedLayout || !overlapLayout) {
          return Number.NEGATIVE_INFINITY;
        }
        return movedLayout.zIndex - overlapLayout.zIndex;
      })
      .toBeGreaterThan(0);

    await setDurableActiveSectionIds(page, []);
    await expect
      .poll(async () => isCanarySectionActive(page, drawSectionId))
      .toBe(false);

    const overlapPoint = await getCanarySectionIntersectionPoint(
      page,
      drawSectionId,
      overlapPlan.overlapSectionId,
    );
    if (!overlapPoint) {
      throw new Error("Missing overlap point after draw-section drag.");
    }

    await expect
      .poll(async () => {
        const movedZIndex = await getCanarySectionRenderedZIndex(
          page,
          drawSectionId,
        );
        const overlapZIndex = await getCanarySectionRenderedZIndex(
          page,
          overlapPlan.overlapSectionId,
        );
        if (movedZIndex === null || overlapZIndex === null) {
          return Number.NEGATIVE_INFINITY;
        }
        return movedZIndex - overlapZIndex;
      })
      .toBeGreaterThan(0);
  } finally {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== allSettingsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings graph substrate canary keeps a widened body-heavy section attached during top-level drag", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const groupSectionId = findSectionIdByName(
    initialState,
    "groupSectionDefault",
  );
  const groupSectionLayout =
    initialState.projectState.projectConfig.topLevelSections[groupSectionId];
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  if (!groupSectionLayout) {
    throw new Error("Missing groupSectionDefault top-level layout.");
  }

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();

    const canaryPane = page.getByTestId("graph-substrate-canary");
    const targetSection = page.locator(
      `[data-testid="graph-substrate-canary-section"][data-section-id="${groupSectionId}"]`,
    );
    await expect(canaryPane).toBeVisible();
    await expect(targetSection).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);

    await setComparePaneVisibility(page, {
      overviewVisible: false,
      uiEditorVisible: false,
    });
    expect(await fitGraphViewportToSection(page, groupSectionId)).toBe(true);

    await expect
      .poll(async () => {
        const targetBox = await getCanarySectionBoundingBox(
          page,
          groupSectionId,
        );
        return targetBox?.width ?? 0;
      })
      .toBeGreaterThan(500);
    await expect
      .poll(async () => {
        const targetBox = await getCanarySectionBoundingBox(
          page,
          groupSectionId,
        );
        return targetBox?.height ?? 0;
      })
      .toBeGreaterThan(300);

    // Locks down the live parity blocker that CDP mouse drag could not prove:
    // the widened body content must stay attached to the same section shell
    // while the real top-level drag path is active.
    const initialSectionBox = await getCanarySectionBoundingBox(
      page,
      groupSectionId,
    );
    const initialBodyAnchorOffset = await getCanarySectionBodyAnchorOffset(
      page,
      groupSectionId,
    );
    if (!initialSectionBox || !initialBodyAnchorOffset) {
      throw new Error(
        "Missing wide-card section bounds or body anchor before drag.",
      );
    }

    const dragTarget = await findDraggableCanarySection(page, groupSectionId);
    await page.mouse.move(dragTarget.point.x, dragTarget.point.y);
    await page.mouse.down();
    await expect(targetSection).toHaveAttribute("data-dragging", "true");
    await page.mouse.move(dragTarget.point.x + 180, dragTarget.point.y + 110, {
      steps: 10,
    });

    await expect
      .poll(async () => {
        const movedBox = await getCanarySectionBoundingBox(
          page,
          groupSectionId,
        );
        if (!movedBox) {
          return 0;
        }
        return Math.hypot(
          movedBox.x - initialSectionBox.x,
          movedBox.y - initialSectionBox.y,
        );
      })
      .toBeGreaterThan(80);
    await expect
      .poll(async () => {
        const latestBodyAnchorOffset = await getCanarySectionBodyAnchorOffset(
          page,
          groupSectionId,
        );
        if (!latestBodyAnchorOffset) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestBodyAnchorOffset.x - initialBodyAnchorOffset.x),
          Math.abs(latestBodyAnchorOffset.y - initialBodyAnchorOffset.y),
        );
      })
      .toBeLessThan(16);

    await page.mouse.up();

    await expect
      .poll(async () => {
        const latestState = await getLatestProjectState(page, projectConfigId);
        const latestLayout =
          latestState.projectState.projectConfig.topLevelSections[
            groupSectionId
          ];
        if (!latestLayout) {
          return false;
        }
        return (
          latestLayout.x !== groupSectionLayout.x ||
          latestLayout.y !== groupSectionLayout.y
        );
      })
      .toBe(true);
  } finally {
    await postBackend(page, "/setTopLevelSectionLayout", {
      projectConfigId,
      topLevelSections:
        initialState.projectState.projectConfig.topLevelSections,
    });
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== allSettingsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
    }
    const restoredState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, restoredState);
  }
});

test("settings graph substrate canary keeps a widened spreadsheet section attached during top-level drag", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const initialState = await getLatestProjectState(page, projectConfigId);
  const initialActiveViewModeId =
    initialState.projectState.projectConfig.activeViewModeId;
  const allSettingsViewModeId = findViewModeId(initialState, "All Settings");
  const initialAllSettingsViewport =
    initialState.projectState.projectConfig.viewModes[allSettingsViewModeId]
      ?.viewport ?? null;
  const spreadsheetSectionId = findSectionIdByName(
    initialState,
    "spreadsheetSectionDefault",
  );
  const spreadsheetSectionLayout =
    initialState.projectState.projectConfig.topLevelSections[
      spreadsheetSectionId
    ];
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });

  if (!spreadsheetSectionLayout) {
    throw new Error("Missing spreadsheetSectionDefault top-level layout.");
  }

  try {
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    const stateWithoutViewport = await getLatestProjectState(
      page,
      projectConfigId,
    );
    await applyProjectStateUpdate(page, stateWithoutViewport);

    await expect(allTab).toBeVisible();
    await allTab.click();

    const canaryPane = page.getByTestId("graph-substrate-canary");
    const targetSection = page.locator(
      `[data-testid="graph-substrate-canary-section"][data-section-id="${spreadsheetSectionId}"]`,
    );
    await expect(canaryPane).toBeVisible();
    await expect(targetSection).toBeVisible();
    await expect
      .poll(() => page.getByTestId("graph-substrate-canary-section").count())
      .toBeGreaterThan(1);

    await setComparePaneVisibility(page, {
      overviewVisible: false,
      uiEditorVisible: false,
    });
    expect(await fitGraphViewportToSection(page, spreadsheetSectionId)).toBe(
      true,
    );

    await expect
      .poll(async () => {
        const targetBox = await getCanarySectionBoundingBox(
          page,
          spreadsheetSectionId,
        );
        return targetBox?.width ?? 0;
      })
      .toBeGreaterThan(500);
    await expect
      .poll(async () => {
        const targetBox = await getCanarySectionBoundingBox(
          page,
          spreadsheetSectionId,
        );
        return targetBox?.height ?? 0;
      })
      .toBeGreaterThan(300);

    const initialSectionBox = await getCanarySectionBoundingBox(
      page,
      spreadsheetSectionId,
    );
    const initialBodyAnchorOffset = await getCanarySectionBodyAnchorOffset(
      page,
      spreadsheetSectionId,
    );
    if (!initialSectionBox || !initialBodyAnchorOffset) {
      throw new Error(
        "Missing widened spreadsheet section bounds or body anchor before drag.",
      );
    }

    const dragTarget = await findDraggableCanarySection(
      page,
      spreadsheetSectionId,
    );
    await page.mouse.move(dragTarget.point.x, dragTarget.point.y);
    await page.mouse.down();
    await expect(targetSection).toHaveAttribute("data-dragging", "true");
    await page.mouse.move(dragTarget.point.x + 180, dragTarget.point.y + 110, {
      steps: 10,
    });

    await expect
      .poll(async () => {
        const movedBox = await getCanarySectionBoundingBox(
          page,
          spreadsheetSectionId,
        );
        if (!movedBox) {
          return 0;
        }
        return Math.hypot(
          movedBox.x - initialSectionBox.x,
          movedBox.y - initialSectionBox.y,
        );
      })
      .toBeGreaterThan(80);
    await expect
      .poll(async () => {
        const latestBodyAnchorOffset = await getCanarySectionBodyAnchorOffset(
          page,
          spreadsheetSectionId,
        );
        if (!latestBodyAnchorOffset) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(latestBodyAnchorOffset.x - initialBodyAnchorOffset.x),
          Math.abs(latestBodyAnchorOffset.y - initialBodyAnchorOffset.y),
        );
      })
      .toBeLessThan(16);

    await page.mouse.up();

    await expect
      .poll(async () => {
        const latestState = await getLatestProjectState(page, projectConfigId);
        const latestLayout =
          latestState.projectState.projectConfig.topLevelSections[
            spreadsheetSectionId
          ];
        if (!latestLayout) {
          return false;
        }
        return (
          latestLayout.x !== spreadsheetSectionLayout.x ||
          latestLayout.y !== spreadsheetSectionLayout.y
        );
      })
      .toBe(true);
  } finally {
    await postBackend(page, "/setTopLevelSectionLayout", {
      projectConfigId,
      topLevelSections:
        initialState.projectState.projectConfig.topLevelSections,
    });
    await postBackend(page, "/setActiveViewMode", {
      projectConfigId,
      activeViewModeId: allSettingsViewModeId,
    });
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialAllSettingsViewport,
    });
    if (initialActiveViewModeId) {
      await postBackend(page, "/setActiveViewMode", {
        projectConfigId,
        activeViewModeId: initialActiveViewModeId,
      });
      if (initialActiveViewModeId !== allSettingsViewModeId) {
        await postBackend(page, "/setViewport", {
          projectConfigId,
          viewport: initialState.projectState.projectConfig.viewport,
        });
      }
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

async function waitForInitialSettingsGraphReady(page: Page): Promise<void> {
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
        "settings-graph-worktree-direct-open-progress",
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
            lifecycle: readSettingsGraphPageLifecycleDiagnostic(page),
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

function readSettingsGraphPageLifecycleDiagnostic(
  page: Page,
): SettingsGraphPageLifecycleDiagnostic {
  const context = page.context();
  const browser = context.browser();
  return {
    browserConnected: browser ? browser.isConnected() : null,
    openPageCount: context.pages().length,
    pageClosed: page.isClosed(),
    pageUrl: page.url(),
  };
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

async function getCanarySectionCount(page: Page): Promise<number> {
  return page.getByTestId("graph-substrate-canary-section").count();
}

async function getCanarySectionOrder(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="graph-substrate-canary-section"]',
      ),
    )
      .map((section) => section.dataset.sectionId ?? "")
      .filter((sectionId) => sectionId !== "");
  });
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

async function getCanaryViewportTransform(page: Page): Promise<{
  x: number;
  y: number;
  zoom: number;
} | null> {
  return page.evaluate(() => {
    const viewport = document.querySelector(
      '[data-testid="graph-substrate-canary-viewport"]',
    );
    if (!viewport) {
      return null;
    }
    const transform = window.getComputedStyle(viewport).transform;
    if (!transform || transform === "none") {
      return { x: 0, y: 0, zoom: 1 };
    }
    const matrix = new DOMMatrixReadOnly(transform);
    if (
      !Number.isFinite(matrix.a) ||
      !Number.isFinite(matrix.e) ||
      !Number.isFinite(matrix.f)
    ) {
      return null;
    }
    return {
      x: matrix.e,
      y: matrix.f,
      zoom: matrix.a,
    };
  });
}

async function getCanaryExpectedToolbarZoomTransform(
  page: Page,
  nextZoom: number,
): Promise<{
  x: number;
  y: number;
  zoom: number;
} | null> {
  return page.evaluate((targetZoom) => {
    const root = document.querySelector<HTMLElement>(
      '[data-testid="graph-substrate-canary"]',
    );
    const viewport = document.querySelector<HTMLElement>(
      '[data-testid="graph-substrate-canary-viewport"]',
    );
    if (!root || !viewport) {
      return null;
    }
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
    const centerScreenPoint = {
      x: root.clientWidth / 2,
      y: root.clientHeight / 2,
    };
    const anchorWorldPoint = {
      x: (centerScreenPoint.x - matrix.e) / matrix.a,
      y: (centerScreenPoint.y - matrix.f) / matrix.a,
    };
    return {
      x: centerScreenPoint.x - anchorWorldPoint.x * targetZoom,
      y: centerScreenPoint.y - anchorWorldPoint.y * targetZoom,
      zoom: targetZoom,
    };
  }, nextZoom);
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

async function getCanaryExpectedAutoFitTransform(page: Page): Promise<{
  x: number;
  y: number;
  zoom: number;
} | null> {
  return page.evaluate(async () => {
    const { CLOSED_PANE_WIDTH } = await import("/src/utils/constants.ts");
    const root = document.querySelector<HTMLElement>(
      '[data-testid="graph-substrate-canary"]',
    );
    if (!root) {
      return null;
    }

    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="graph-substrate-canary-section"]',
      ),
    );
    if (sections.length < 2) {
      return null;
    }

    const persistedLocalState = localStorage.getItem("setta_data");
    let overviewVis = true;
    let overviewTrueWidth = 0;
    let uiEditorVis = false;
    let uiEditorTrueWidth = 0;
    if (persistedLocalState) {
      const parsed = JSON.parse(persistedLocalState) as
        | {
            state?: {
              overviewVis?: unknown;
              overviewTrueWidth?: unknown;
              uiEditorVis?: unknown;
              uiEditorTrueWidth?: unknown;
            };
          }
        | {
            overviewVis?: unknown;
            overviewTrueWidth?: unknown;
            uiEditorVis?: unknown;
            uiEditorTrueWidth?: unknown;
          };
      const persistedState =
        "state" in parsed && parsed.state ? parsed.state : parsed;
      if (typeof persistedState.overviewVis === "boolean") {
        overviewVis = persistedState.overviewVis;
      }
      if (typeof persistedState.overviewTrueWidth === "number") {
        overviewTrueWidth = persistedState.overviewTrueWidth;
      }
      if (typeof persistedState.uiEditorVis === "boolean") {
        uiEditorVis = persistedState.uiEditorVis;
      }
      if (typeof persistedState.uiEditorTrueWidth === "number") {
        uiEditorTrueWidth = persistedState.uiEditorTrueWidth;
      }
    }
    const effectiveOverviewWidth = overviewVis
      ? overviewTrueWidth
      : CLOSED_PANE_WIDTH;
    const effectiveUiEditorWidth = uiEditorVis
      ? uiEditorTrueWidth
      : CLOSED_PANE_WIDTH;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const section of sections) {
      const rectWidth = section.offsetWidth;
      const rectHeight = section.offsetHeight;
      if (rectWidth <= 0 || rectHeight <= 0) {
        return null;
      }
      const transform = getComputedStyle(section).transform;
      const matrix =
        !transform || transform === "none"
          ? new DOMMatrixReadOnly()
          : new DOMMatrixReadOnly(transform);
      minX = Math.min(minX, matrix.e);
      minY = Math.min(minY, matrix.f);
      maxX = Math.max(maxX, matrix.e + rectWidth);
      maxY = Math.max(maxY, matrix.f + rectHeight);
    }

    const padding = 0.12;
    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;
    const visibleWidth = Math.max(
      root.clientWidth - effectiveOverviewWidth - effectiveUiEditorWidth,
      0,
    );
    if (boundsWidth <= 0 || boundsHeight <= 0) {
      return null;
    }

    const zoom = Math.min(
      visibleWidth / (boundsWidth * (1 + padding)),
      root.clientHeight / (boundsHeight * (1 + padding)),
    );
    const centerX = effectiveOverviewWidth + visibleWidth / 2;
    const centerY = root.clientHeight / 2;

    return {
      x: centerX - (minX + boundsWidth / 2) * zoom,
      y: centerY - (minY + boundsHeight / 2) * zoom,
      zoom,
    };
  });
}

async function getCanaryAutoFitDrift(page: Page): Promise<{
  x: number;
  y: number;
  zoom: number;
} | null> {
  const [current, expected] = await Promise.all([
    getCanaryViewportTransform(page),
    getCanaryExpectedAutoFitTransform(page),
  ]);
  if (!current || !expected) {
    return null;
  }
  return {
    x: Math.abs(current.x - expected.x),
    y: Math.abs(current.y - expected.y),
    zoom: Math.abs(current.zoom - expected.zoom),
  };
}

async function findDraggableCanarySection(
  page: Page,
  targetSectionId?: string,
): Promise<{
  index: number;
  point: { x: number; y: number };
  sectionId: string;
}> {
  const draggable = await page.evaluate((requestedSectionId) => {
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
      if (
        requestedSectionId &&
        section.getAttribute("data-section-id") !== requestedSectionId
      ) {
        continue;
      }
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
          return {
            index,
            point: { x, y },
            sectionId: section.getAttribute("data-section-id") ?? "",
          };
        }
      }
    }
    return null;
  }, targetSectionId);

  if (!draggable) {
    if (targetSectionId) {
      throw new Error(
        `Unable to find a draggable canary point for section ${targetSectionId}.`,
      );
    }
    throw new Error("Unable to find a draggable canary section.");
  }
  return draggable;
}

async function getCanarySectionGridSpread(
  page: Page,
): Promise<{ columnCount: number; rowCount: number }> {
  return page.evaluate(() => {
    const tolerancePx = 40;
    const xs: number[] = [];
    const ys: number[] = [];
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="graph-substrate-canary-section"]',
      ),
    );

    if (sections.length < 2) {
      return { columnCount: 0, rowCount: 0 };
    }

    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return { columnCount: 0, rowCount: 0 };
      }
      xs.push(rect.x);
      ys.push(rect.y);
    }

    function countBuckets(values: number[]) {
      const buckets: number[] = [];
      for (const value of values) {
        if (buckets.some((bucket) => Math.abs(bucket - value) <= tolerancePx)) {
          continue;
        }
        buckets.push(value);
      }
      return buckets.length;
    }

    return {
      columnCount: countBuckets(xs),
      rowCount: countBuckets(ys),
    };
  });
}

async function findCanaryPanePoint(
  page: Page,
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>(
      '[data-testid="graph-substrate-canary"]',
    );
    if (!pane) {
      return null;
    }
    const rect = pane.getBoundingClientRect();
    const margin = 24;
    const columns = 8;
    const rows = 6;

    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) {
        const x =
          rect.left +
          margin +
          ((rect.width - margin * 2) * column) / Math.max(columns, 1);
        const y =
          rect.top +
          margin +
          ((rect.height - margin * 2) * row) / Math.max(rows, 1);
        const element = document.elementFromPoint(x, y);
        if (!(element instanceof Element)) {
          continue;
        }
        const section = element.closest(
          '[data-testid="graph-substrate-canary-section"]',
        );
        if (section) {
          continue;
        }
        if (element.closest('[data-testid="graph-substrate-canary"]')) {
          return { x, y };
        }
      }
    }

    return null;
  });

  if (!point) {
    throw new Error("Unable to find a pan or zoom point on the canary pane.");
  }
  return point;
}

async function getCanaryRootRelativePoint(
  page: Page,
  point: { x: number; y: number },
): Promise<{ x: number; y: number }> {
  const rootRelativePoint = await page.evaluate((screenPoint) => {
    const pane = document.querySelector<HTMLElement>(
      '[data-testid="graph-substrate-canary"]',
    );
    if (!pane) {
      return null;
    }
    const rect = pane.getBoundingClientRect();
    return {
      x: screenPoint.x - rect.left,
      y: screenPoint.y - rect.top,
    };
  }, point);

  if (!rootRelativePoint) {
    throw new Error("Unable to resolve a root-relative canary point.");
  }

  return rootRelativePoint;
}

async function findCanarySectionNoWheelPoint(
  page: Page,
  sectionId: string,
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate((targetSectionId: string) => {
    const section = document.querySelector<HTMLElement>(
      `[data-testid="graph-substrate-canary-section"][data-section-id="${targetSectionId}"]`,
    );
    if (!section) {
      return null;
    }

    const xs = [0.2, 0.35, 0.5, 0.65, 0.8];
    const ys = [0.2, 0.35, 0.5, 0.65, 0.8];
    const bounds = section.getBoundingClientRect();
    for (const yPct of ys) {
      for (const xPct of xs) {
        const x = bounds.x + bounds.width * xPct;
        const y = bounds.y + bounds.height * yPct;
        const element = document.elementFromPoint(x, y);
        if (!(element instanceof Element)) {
          continue;
        }
        if (!element.closest(".nowheel")) {
          continue;
        }
        if (
          element.closest('[data-testid="graph-substrate-canary-section"]') !==
          section
        ) {
          continue;
        }
        return { x, y };
      }
    }

    return null;
  }, sectionId);

  if (!point) {
    throw new Error(
      `Unable to find a visible nowheel point for canary section ${sectionId}.`,
    );
  }

  return point;
}

async function getCanaryPaneViewportGaps(page: Page): Promise<{
  top: number;
  bottom: number;
  height: number;
} | null> {
  return page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>(
      '[data-testid="graph-substrate-canary"]',
    );
    if (!pane) {
      return null;
    }
    const rect = pane.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: window.innerHeight - rect.bottom,
      height: rect.height,
    };
  });
}

async function getCanaryViewportWithSectionMovedOffscreen(
  page: Page,
  sectionIndex: number,
): Promise<{
  x: number;
  y: number;
  zoom: number;
} | null> {
  return page.evaluate(
    ({ extraMargin, sectionIndex: targetIndex }) => {
      const pane = document.querySelector<HTMLElement>(
        '[data-testid="graph-substrate-canary"]',
      );
      const viewport = document.querySelector<HTMLElement>(
        '[data-testid="graph-substrate-canary-viewport"]',
      );
      const sections = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-testid="graph-substrate-canary-section"]',
        ),
      );
      const section = sections[targetIndex];
      if (!pane || !viewport || !section) {
        return null;
      }
      const paneRect = pane.getBoundingClientRect();
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
      sectionIndex,
    },
  );
}

async function isCanarySectionCenterInsidePane(
  page: Page,
  sectionIndex: number,
): Promise<boolean | null> {
  return page.evaluate((targetIndex) => {
    const pane = document.querySelector<HTMLElement>(
      '[data-testid="graph-substrate-canary"]',
    );
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="graph-substrate-canary-section"]',
      ),
    );
    const section = sections[targetIndex];
    if (!pane || !section) {
      return null;
    }
    const paneRect = pane.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    const centerX = sectionRect.left + sectionRect.width / 2;
    const centerY = sectionRect.top + sectionRect.height / 2;
    return (
      centerX >= paneRect.left &&
      centerX <= paneRect.right &&
      centerY >= paneRect.top &&
      centerY <= paneRect.bottom
    );
  }, sectionIndex);
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
    const sectionNode = activeElement.closest("[data-section-id]");
    if (!(sectionNode instanceof HTMLElement)) {
      return null;
    }
    return sectionNode.getAttribute("data-section-id");
  });
}

async function getCanarySectionBoundingBox(
  page: Page,
  sectionId: string,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const section = page
    .locator(
      `[data-testid="graph-substrate-canary-section"][data-section-id="${sectionId}"]`,
    )
    .first();
  return await section.boundingBox();
}

async function getCanarySectionBodyAnchorOffset(
  page: Page,
  sectionId: string,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate((targetSectionId) => {
    const section = document.querySelector<HTMLElement>(
      `[data-testid="graph-substrate-canary-section"][data-section-id="${targetSectionId}"]`,
    );
    if (!section) {
      return null;
    }

    const sectionRect = section.getBoundingClientRect();
    const minBodyTop =
      sectionRect.top + Math.min(44, Math.max(24, sectionRect.height * 0.2));
    const preferredSelectors = [
      "input",
      "textarea",
      "select",
      "button",
      "[role='combobox']",
      "[role='textbox']",
      "[contenteditable='true']",
      "label",
    ];
    const candidates: HTMLElement[] = [];

    for (const selector of preferredSelectors) {
      candidates.push(
        ...Array.from(section.querySelectorAll<HTMLElement>(selector)),
      );
    }
    candidates.push(...Array.from(section.querySelectorAll<HTMLElement>("*")));

    for (const candidate of candidates) {
      if (candidate === section) {
        continue;
      }
      const rect = candidate.getBoundingClientRect();
      const style = window.getComputedStyle(candidate);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        continue;
      }
      if (rect.width < 16 || rect.height < 10 || rect.top < minBodyTop) {
        continue;
      }
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      if (
        centerX < sectionRect.left ||
        centerX > sectionRect.right ||
        centerY < minBodyTop ||
        centerY > sectionRect.bottom
      ) {
        continue;
      }
      return {
        x: centerX - sectionRect.left,
        y: centerY - sectionRect.top,
      };
    }

    return null;
  }, sectionId);
}

async function getCanaryOverlapDropPlan(
  page: Page,
  sectionId: string,
): Promise<{
  overlapSectionId: string;
  delta: { x: number; y: number };
} | null> {
  return page.evaluate((sourceSectionId) => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="graph-substrate-canary-section"]',
      ),
    );
    const sourceSection = sections.find(
      (section) => section.getAttribute("data-section-id") === sourceSectionId,
    );
    if (!sourceSection) {
      return null;
    }

    const sourceRect = sourceSection.getBoundingClientRect();
    let bestPlan: {
      overlapSectionId: string;
      delta: { x: number; y: number };
      distance: number;
    } | null = null;

    for (const section of sections) {
      const overlapSectionId = section.getAttribute("data-section-id");
      if (!overlapSectionId || overlapSectionId === sourceSectionId) {
        continue;
      }
      const rect = section.getBoundingClientRect();
      const desiredLeft =
        rect.left + Math.min(48, Math.max(24, rect.width * 0.12));
      const desiredTop =
        rect.top + Math.min(48, Math.max(24, rect.height * 0.12));
      const delta = {
        x: desiredLeft - sourceRect.left,
        y: desiredTop - sourceRect.top,
      };
      const projectedRect = {
        left: sourceRect.left + delta.x,
        top: sourceRect.top + delta.y,
        right: sourceRect.right + delta.x,
        bottom: sourceRect.bottom + delta.y,
      };
      const overlapWidth =
        Math.min(projectedRect.right, rect.right) -
        Math.max(projectedRect.left, rect.left);
      const overlapHeight =
        Math.min(projectedRect.bottom, rect.bottom) -
        Math.max(projectedRect.top, rect.top);
      if (overlapWidth < 60 || overlapHeight < 60) {
        continue;
      }

      const distance = Math.hypot(
        rect.left + rect.width / 2 - (sourceRect.left + sourceRect.width / 2),
        rect.top + rect.height / 2 - (sourceRect.top + sourceRect.height / 2),
      );
      if (bestPlan && bestPlan.distance <= distance) {
        continue;
      }
      bestPlan = {
        overlapSectionId,
        delta,
        distance,
      };
    }

    if (!bestPlan) {
      return null;
    }
    return {
      overlapSectionId: bestPlan.overlapSectionId,
      delta: bestPlan.delta,
    };
  }, sectionId);
}

async function getCanarySectionIntersectionPoint(
  page: Page,
  firstSectionId: string,
  secondSectionId: string,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(
    ({ sourceSectionId, overlapSectionId }) => {
      const sourceSection = document.querySelector<HTMLElement>(
        `[data-testid="graph-substrate-canary-section"][data-section-id="${sourceSectionId}"]`,
      );
      const overlapSection = document.querySelector<HTMLElement>(
        `[data-testid="graph-substrate-canary-section"][data-section-id="${overlapSectionId}"]`,
      );
      if (!sourceSection || !overlapSection) {
        return null;
      }
      const sourceRect = sourceSection.getBoundingClientRect();
      const overlapRect = overlapSection.getBoundingClientRect();
      const left = Math.max(sourceRect.left, overlapRect.left);
      const top = Math.max(sourceRect.top, overlapRect.top);
      const right = Math.min(sourceRect.right, overlapRect.right);
      const bottom = Math.min(sourceRect.bottom, overlapRect.bottom);
      if (right - left < 10 || bottom - top < 10) {
        return null;
      }
      return {
        x: left + (right - left) / 2,
        y: top + (bottom - top) / 2,
      };
    },
    {
      sourceSectionId: firstSectionId,
      overlapSectionId: secondSectionId,
    },
  );
}

async function getCanarySectionRenderedZIndex(
  page: Page,
  sectionId: string,
): Promise<number | null> {
  return page.evaluate((targetSectionId) => {
    const section = document.querySelector<HTMLElement>(
      `[data-testid="graph-substrate-canary-section"][data-section-id="${targetSectionId}"]`,
    );
    if (!section) {
      return null;
    }
    const rawZIndex = window.getComputedStyle(section).zIndex;
    const zIndex = Number(rawZIndex);
    return Number.isFinite(zIndex) ? zIndex : null;
  }, sectionId);
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

async function isCanarySectionActive(
  page: Page,
  sectionId: string,
): Promise<boolean> {
  return page.evaluate((id) => {
    const section = document.querySelector<HTMLElement>(
      `[data-testid="graph-substrate-canary-section"][data-section-id="${id}"] section`,
    );
    if (!section) {
      return false;
    }
    return section.getAttribute("data-section-active") === "true";
  }, sectionId);
}

async function isCanarySectionOutlineActive(
  page: Page,
  sectionId: string,
): Promise<boolean> {
  return page.evaluate((id) => {
    const outlineTone = document
      .querySelector<HTMLElement>(
        `[data-testid="graph-substrate-canary-section"][data-section-id="${id}"] [data-testid="graph-substrate-canary-section-outline"]`,
      )
      ?.getAttribute("data-outline-tone");
    return (
      outlineTone === "active" ||
      outlineTone === "global-active" ||
      outlineTone === "other-project-active"
    );
  }, sectionId);
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

async function getActiveTopLevelSectionLayoutSize(
  page: Page,
  sectionId: string,
): Promise<{ h: number | null; w: number | null } | null> {
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
      h: layout.h ?? null,
      w: layout.w ?? null,
    };
  }, sectionId);
}

async function getCanarySceneSectionSize(
  page: Page,
  sectionId: string,
): Promise<{
  height: number | null;
  resolvedSize: { width: number; height: number } | null;
  width: number | null;
} | null> {
  return page.evaluate(async (targetSectionId) => {
    const { useSettingsGraphSubstrateCanarySceneStore } = await import(
      "/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySceneStore.ts"
    );
    const section =
      useSettingsGraphSubstrateCanarySceneStore
        .getState()
        .sceneSnapshot.sectionsById.get(targetSectionId) ?? null;
    if (!section) {
      return null;
    }
    return {
      height: section.height,
      resolvedSize: section.resolvedSize,
      width: section.width,
    };
  }, sectionId);
}

async function getCanarySceneBounds(page: Page): Promise<{
  height: number;
  width: number;
  x: number;
  y: number;
} | null> {
  return page.evaluate(async () => {
    const { useSettingsGraphSubstrateCanarySceneStore } = await import(
      "/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySceneStore.ts"
    );
    return (
      useSettingsGraphSubstrateCanarySceneStore.getState().sceneSnapshot
        .sceneBounds ?? null
    );
  });
}

async function clearCanarySectionLayoutSizeKeepSharedNodeSize(
  page: Page,
  sectionId: string,
): Promise<void> {
  await page.evaluate(async (targetSectionId) => {
    const { useNodeInternals, useProjectState, useSectionElementSizeRegistry } =
      await import("/src/state/definitions.ts");

    const currentNode = useNodeInternals.getState().x.get(targetSectionId);
    if (
      !currentNode ||
      typeof currentNode.width !== "number" ||
      currentNode.width <= 0 ||
      typeof currentNode.height !== "number" ||
      currentNode.height <= 0
    ) {
      throw new Error("Missing authoritative node-internals size.");
    }

    useProjectState.setState((state) => {
      const activeViewModeId = state.projectConfig.activeViewModeId;
      if (!activeViewModeId) {
        throw new Error("Missing active view mode.");
      }

      const viewMode = state.projectConfig.viewModes[activeViewModeId];
      if (!viewMode) {
        throw new Error(`Missing active view mode ${activeViewModeId}.`);
      }

      const sharedLayout =
        state.projectConfig.topLevelSections[targetSectionId];
      if (sharedLayout) {
        sharedLayout.w = null;
        sharedLayout.h = null;
      }

      const viewModeLayout = viewMode.topLevelSections[targetSectionId];
      if (viewModeLayout) {
        viewModeLayout.w = null;
        viewModeLayout.h = null;
      }
    });

    useSectionElementSizeRegistry.setState((currentSizes) => {
      if (!(targetSectionId in currentSizes)) {
        return currentSizes;
      }
      const nextSizes = { ...currentSizes };
      delete nextSizes[targetSectionId];
      return nextSizes;
    });

    useNodeInternals.setState((state) => {
      const nextNodeInternals = new Map(state.x);
      nextNodeInternals.set(targetSectionId, {
        ...currentNode,
        width: currentNode.width,
        height: currentNode.height,
      });
      return { x: nextNodeInternals };
    });
  }, sectionId);
}

async function setCanarySectionPartialMixedSizeState(
  page: Page,
  sectionId: string,
  {
    layoutWidth,
    nodeHeight,
  }: {
    layoutWidth: number;
    nodeHeight: number;
  },
): Promise<void> {
  await page.evaluate(
    async ({ targetSectionId, nextLayoutWidth, nextNodeHeight }) => {
      const {
        useNodeInternals,
        useProjectState,
        useSectionElementSizeRegistry,
      } = await import("/src/state/definitions.ts");

      useProjectState.setState((state) => {
        const activeViewModeId = state.projectConfig.activeViewModeId;
        if (!activeViewModeId) {
          throw new Error("Missing active view mode.");
        }

        const viewMode = state.projectConfig.viewModes[activeViewModeId];
        if (!viewMode) {
          throw new Error(`Missing active view mode ${activeViewModeId}.`);
        }

        const sharedLayout =
          state.projectConfig.topLevelSections[targetSectionId];
        if (sharedLayout) {
          sharedLayout.w = nextLayoutWidth;
          sharedLayout.h = null;
        }

        const viewModeLayout = viewMode.topLevelSections[targetSectionId];
        if (viewModeLayout) {
          viewModeLayout.w = nextLayoutWidth;
          viewModeLayout.h = null;
        }
      });

      useSectionElementSizeRegistry.setState((currentSizes) => {
        if (!(targetSectionId in currentSizes)) {
          return currentSizes;
        }
        const nextSizes = { ...currentSizes };
        delete nextSizes[targetSectionId];
        return nextSizes;
      });

      useNodeInternals.setState((state) => {
        const currentNode = state.x.get(targetSectionId);
        if (!currentNode) {
          throw new Error("Missing authoritative node-internals entry.");
        }

        const nextNodes = new Map(state.x);
        nextNodes.set(targetSectionId, {
          ...currentNode,
          width: null,
          height: nextNodeHeight,
        });
        return { x: nextNodes };
      });
    },
    {
      targetSectionId: sectionId,
      nextLayoutWidth: layoutWidth,
      nextNodeHeight: nodeHeight,
    },
  );
}

async function persistActiveTopLevelLayoutSnapshot(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { debounced_route_set_top_level_section_layout } = await import(
      "/src/state/actions/sectionInfos.ts"
    );
    debounced_route_set_top_level_section_layout();
  });
}

function getExpectedCanarySectionOrder(
  payload: ProjectStateSingleConfigWithCompletedOpIds,
  viewModeId: string,
): string[] {
  const { parentSectionMap, projectConfig, sections } = payload.projectState;
  const viewMode = projectConfig.viewModes[viewModeId];
  if (!viewMode) {
    throw new Error(`Missing active view mode ${viewModeId}`);
  }
  const topLevelSections = resolveActiveViewModeTopLevelSections(
    projectConfig.topLevelSections,
    viewMode.topLevelSections,
  );
  return Object.keys(topLevelSections).filter((sectionId) => {
    if (parentSectionMap[sectionId]) {
      return false;
    }
    if (!(sectionId in sections)) {
      return false;
    }
    return viewMode.visibilityBySectionId[sectionId] === true;
  });
}

function resolveActiveViewModeTopLevelSections(
  topLevelSections: Record<string, { x: number; y: number }>,
  viewModeTopLevelSections: Record<string, { x: number; y: number }>,
): Record<string, { x: number; y: number }> {
  if (Object.keys(viewModeTopLevelSections).length === 0) {
    return topLevelSections;
  }
  if (Object.keys(topLevelSections).length === 0) {
    return viewModeTopLevelSections;
  }
  return { ...topLevelSections, ...viewModeTopLevelSections };
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

async function setComparePaneVisibility(
  page: Page,
  {
    overviewVisible,
    uiEditorVisible,
  }: {
    overviewVisible: boolean;
    uiEditorVisible: boolean;
  },
): Promise<void> {
  await page.evaluate(
    async (desiredVisibility: {
      overviewVisible: boolean;
      uiEditorVisible: boolean;
    }) => {
      const { togglePaneVisibility } = await import(
        "/src/components/Panes/paneLayout.ts"
      );
      const { useLocalStorage } = await import("/src/state/definitions.ts");
      const { PaneNameEnum } = await import("/src/utils/constants.ts");
      const paneTargets = [
        {
          paneName: PaneNameEnum.overview,
          desiredVisible: desiredVisibility.overviewVisible,
          visibilityKey: "overviewVis",
        },
        {
          paneName: PaneNameEnum.uiEditor,
          desiredVisible: desiredVisibility.uiEditorVisible,
          visibilityKey: "uiEditorVis",
        },
      ];

      for (const paneTarget of paneTargets) {
        const currentState = useLocalStorage.getState();
        const isVisible =
          paneTarget.visibilityKey === "overviewVis"
            ? currentState.overviewVis
            : currentState.uiEditorVis;
        if (isVisible === paneTarget.desiredVisible) {
          continue;
        }
        togglePaneVisibility(paneTarget.paneName);
      }
    },
    { overviewVisible, uiEditorVisible },
  );

  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const { useLocalStorage } = await import("/src/state/definitions.ts");
        const state = useLocalStorage.getState();
        return {
          overviewVisible: state.overviewVis,
          uiEditorVisible: state.uiEditorVis,
        };
      });
    })
    .toEqual({
      overviewVisible,
      uiEditorVisible,
    });
}

async function getProjectConfigIdFromBackend(page: Page): Promise<string> {
  return getActiveProjectConfigIdFromPageStore(page);
}
