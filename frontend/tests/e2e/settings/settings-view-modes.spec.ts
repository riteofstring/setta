import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady, postBackend } from "../helpers";

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

    const searchableSection = canarySections
      .filter({ hasText: "spreadsheetSectionDefault" })
      .first();
    await expect(searchableSection).toBeVisible();
    const sectionSearchInput = searchableSection.getByPlaceholder("⌘ + K");
    await expect(sectionSearchInput).toBeVisible();
    await expect(searchableSection).toHaveAttribute("data-dragging", "false");

    const initialScale = await getCanaryViewportScale(page);
    const initialBox = await searchableSection.boundingBox();
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
        const movedBox = await searchableSection.boundingBox();
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
    await expect(searchableSection).toHaveAttribute("data-dragging", "false");
    await sectionSearchInput.fill("");
    await expect(sectionSearchInput).toHaveValue("");
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
    await setCanaryComparePaneVisibility(page, {
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

    // Future parity probes can use the production viewport controller to
    // normalize one named wide/body-heavy card into a stable compare state
    // instead of relying on click ordering or viewport carry-over.
    expect(await fitCanaryViewportToSection(page, groupSectionId)).toBe(true);

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

    await setCanaryComparePaneVisibility(page, {
      overviewVisible: false,
      uiEditorVisible: false,
    });
    expect(await fitCanaryViewportToSection(page, spreadsheetSectionId)).toBe(
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

    await setCanaryComparePaneVisibility(page, {
      overviewVisible: false,
      uiEditorVisible: false,
    });
    expect(await fitCanaryViewportToSection(page, drawSectionId)).toBe(true);

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

    await setCanaryComparePaneVisibility(page, {
      overviewVisible: false,
      uiEditorVisible: false,
    });
    expect(await fitCanaryViewportToSection(page, groupSectionId)).toBe(true);

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
  return page.evaluate(() => {
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
    let overviewTrueWidth = 0;
    let uiEditorTrueWidth = 0;
    if (persistedLocalState) {
      const parsed = JSON.parse(persistedLocalState) as
        | {
            state?: {
              overviewTrueWidth?: unknown;
              uiEditorTrueWidth?: unknown;
            };
          }
        | {
            overviewTrueWidth?: unknown;
            uiEditorTrueWidth?: unknown;
          };
      const persistedState =
        "state" in parsed && parsed.state ? parsed.state : parsed;
      if (typeof persistedState.overviewTrueWidth === "number") {
        overviewTrueWidth = persistedState.overviewTrueWidth;
      }
      if (typeof persistedState.uiEditorTrueWidth === "number") {
        uiEditorTrueWidth = persistedState.uiEditorTrueWidth;
      }
    }

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
      root.clientWidth - overviewTrueWidth - uiEditorTrueWidth,
      0,
    );
    if (boundsWidth <= 0 || boundsHeight <= 0) {
      return null;
    }

    const zoom = Math.min(
      visibleWidth / (boundsWidth * (1 + padding)),
      root.clientHeight / (boundsHeight * (1 + padding)),
    );
    const centerX = overviewTrueWidth + visibleWidth / 2;
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

async function fitCanaryViewportToSection(
  page: Page,
  sectionId: string,
): Promise<boolean> {
  return page.evaluate(async (targetSectionId) => {
    const { useReactFlow } = await import(
      "/src/forks/xyflow/core/store/index.ts"
    );
    const viewportController = useReactFlow.getState().viewportController;
    if (!viewportController) {
      return false;
    }
    return viewportController.fitView({
      nodes: [{ id: targetSectionId }],
      padding: 0.1,
    });
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

type ProjectStateSingleConfigWithCompletedOpIds = {
  projectState: {
    parentSectionMap: Record<string, string | null | undefined>;
    projectConfig: {
      activeIds: Array<string>;
      activeViewModeId: string | null;
      topLevelSections: Record<string, { x: number; y: number }>;
      viewModes: Record<
        string,
        {
          id: string;
          name: string;
          topLevelSections: Record<string, { x: number; y: number }>;
          visibilityBySectionId: Record<string, boolean>;
          viewport: { x: number; y: number; zoom: number } | null;
          viewportInitialized: boolean;
        }
      >;
      viewport: { x: number; y: number; zoom: number } | null;
      viewportInitialized: boolean;
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

function findSectionIdByName(
  payload: ProjectStateSingleConfigWithCompletedOpIds,
  name: string,
): string {
  for (const [sectionId, section] of Object.entries(
    payload.projectState.sections,
  )) {
    if (section.name === name) {
      return sectionId;
    }
  }
  throw new Error(`Missing section ${name}`);
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

async function setCanaryComparePaneVisibility(
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
