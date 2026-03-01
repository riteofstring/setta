import { expect, test, type Page } from "@playwright/test";
import {
  ensureAppReady,
  postBackend,
  readSceneGraphRendererPerfLabels,
} from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

test("settings view tabs filter sections and minimap", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("setta.sceneGraphRenderer.enabled", "0");
  });
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

test("settings all-settings flow exposes scene-graph renderer perf labels", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("setta.sceneGraphRenderer.enabled", "1");
    localStorage.setItem("setta.sceneGraphRenderer.backend", "auto");
    localStorage.setItem("setta.sceneGraphRenderer.domIslandRadius", "2");
    localStorage.setItem("setta.sceneGraphRenderer.debugOverlay", "0");
  });
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTab).toBeVisible();
  await allTab.click();
  await page.waitForFunction(() => {
    const root = document.querySelector(".react-flow");
    if (!root) {
      return false;
    }
    return (
      root.getAttribute("data-scene-graph-renderer-probe-status") === "ready"
    );
  });

  const labels = await readSceneGraphRendererPerfLabels(page);
  expect(labels.enabled).toBe(true);
  expect(labels.requestedBackend).toBe("auto");
  expect(["webgpu", "webgl", "dom"]).toContain(labels.resolvedBackend);
  expect(labels.probeStatus).toBe("ready");
  expect(labels.domIslandRadius).toBe(2);

  await testInfo.attach("scene-graph-renderer-perf-labels.json", {
    body: Buffer.from(JSON.stringify(labels, null, 2)),
    contentType: "application/json",
  });
});

test("settings project defaults renderer on across tabs and keeps explicit kill switch", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const initializedKey = "__setta_scene_graph_rollout_test_initialized";
    if (sessionStorage.getItem(initializedKey) === "1") {
      return;
    }
    sessionStorage.setItem(initializedKey, "1");
    localStorage.removeItem("setta.sceneGraphRenderer.enabled");
    localStorage.removeItem("setta.sceneGraphRenderer.backend");
    localStorage.removeItem("setta.sceneGraphRenderer.domIslandRadius");
    localStorage.removeItem("setta.sceneGraphRenderer.debugOverlay");
  });
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTab).toBeVisible();
  await allTab.click();
  await page.waitForFunction(() => {
    const root = document.querySelector(".react-flow");
    if (!(root instanceof HTMLElement)) {
      return false;
    }
    return (
      root.getAttribute("data-scene-graph-renderer-probe-status") === "ready"
    );
  });

  const rolloutLabels = await readSceneGraphRendererPerfLabels(page);
  expect(rolloutLabels.enabled).toBe(true);
  expect(rolloutLabels.requestedBackend).toBe("auto");
  expect(["webgpu", "webgl", "dom"]).toContain(rolloutLabels.resolvedBackend);

  const coreTab = page.getByRole("button", {
    name: "Core",
    exact: true,
  });
  await expect(coreTab).toBeVisible();
  await coreTab.click();
  await page.waitForFunction(() => {
    const root = document.querySelector(".react-flow");
    if (!(root instanceof HTMLElement)) {
      return false;
    }
    return (
      root.getAttribute("data-scene-graph-renderer-probe-status") === "ready"
    );
  });
  const rolloutCoreLabels = await readSceneGraphRendererPerfLabels(page);
  expect(rolloutCoreLabels.enabled).toBe(true);

  await page.evaluate(() => {
    localStorage.setItem("setta.sceneGraphRenderer.enabled", "0");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allTabAfterReload = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTabAfterReload).toBeVisible();
  await allTabAfterReload.click();
  await page.waitForFunction(() => {
    const root = document.querySelector(".react-flow");
    if (!(root instanceof HTMLElement)) {
      return false;
    }
    return (
      root.getAttribute("data-scene-graph-renderer-probe-status") === "ready"
    );
  });

  const killSwitchLabels = await readSceneGraphRendererPerfLabels(page);
  expect(killSwitchLabels.enabled).toBe(false);
  expect(killSwitchLabels.resolvedBackend).toBe("dom");
  expect(killSwitchLabels.resolutionReason).toBe("renderer_disabled");
});

test("settings all-settings flow exposes scene-graph layer snapshot metadata when active", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("setta.sceneGraphRenderer.enabled", "1");
    localStorage.setItem("setta.sceneGraphRenderer.backend", "webgl");
    localStorage.setItem("setta.sceneGraphRenderer.domIslandRadius", "2");
    localStorage.setItem("setta.sceneGraphRenderer.debugOverlay", "0");
  });
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTab).toBeVisible();
  await allTab.click();
  await page.waitForFunction(() => {
    const root = document.querySelector(".react-flow");
    if (!root) {
      return false;
    }
    return (
      root.getAttribute("data-scene-graph-renderer-probe-status") === "ready"
    );
  });

  const labels = await readSceneGraphRendererPerfLabels(page);
  expect(labels.enabled).toBe(true);
  expect(labels.requestedBackend).toBe("webgl");
  expect(["webgl", "dom"]).toContain(labels.resolvedBackend);

  if (labels.resolvedBackend === "webgl") {
    await page.waitForFunction(() => {
      const layer = document.querySelector(".setta-scene-graph-renderer-layer");
      if (!(layer instanceof HTMLCanvasElement)) {
        return false;
      }
      return (
        layer.getAttribute("data-scene-graph-layer-visible") === "1" &&
        layer.getAttribute("data-scene-graph-layer-backend") === "webgl" &&
        Number(layer.getAttribute("data-scene-graph-layer-sections") ?? "0") >
          10
      );
    });
  }

  const layerState = await page.evaluate(() => {
    const layer = document.querySelector(".setta-scene-graph-renderer-layer");
    if (!(layer instanceof HTMLCanvasElement)) {
      throw new Error("Missing scene graph renderer canvas layer.");
    }
    return {
      visible: layer.getAttribute("data-scene-graph-layer-visible"),
      backend: layer.getAttribute("data-scene-graph-layer-backend"),
      sections: Number(
        layer.getAttribute("data-scene-graph-layer-sections") ?? "0",
      ),
      edges: Number(layer.getAttribute("data-scene-graph-layer-edges") ?? "0"),
      activeSections: Number(
        layer.getAttribute("data-scene-graph-layer-active-sections") ?? "0",
      ),
      selectedEdges: Number(
        layer.getAttribute("data-scene-graph-layer-selected-edges") ?? "0",
      ),
      hoveredSection:
        layer.getAttribute("data-scene-graph-layer-hovered-section") ?? "",
      hoveredEdge:
        layer.getAttribute("data-scene-graph-layer-hovered-edge") ?? "",
      cameraZoom: Number(
        layer.getAttribute("data-scene-graph-layer-camera-zoom") ?? "0",
      ),
      snapshotPipelineMode:
        layer.getAttribute("data-scene-graph-layer-snapshot-pipeline-mode") ??
        "",
      snapshotBuildMs: Number(
        layer.getAttribute("data-scene-graph-layer-snapshot-build-ms") ?? "0",
      ),
      snapshotDiffMs: Number(
        layer.getAttribute("data-scene-graph-layer-snapshot-diff-ms") ?? "0",
      ),
      snapshotTotalMs: Number(
        layer.getAttribute("data-scene-graph-layer-snapshot-total-ms") ?? "0",
      ),
      updateResourcesMs: Number(
        layer.getAttribute("data-scene-graph-layer-update-resources-ms") ?? "0",
      ),
      pendingBuildRequests: Number(
        layer.getAttribute("data-scene-graph-layer-pending-build-requests") ??
          "0",
      ),
      staleBuildResponses: Number(
        layer.getAttribute("data-scene-graph-layer-stale-build-responses") ??
          "0",
      ),
      sectionCacheSize: Number(
        layer.getAttribute("data-scene-graph-layer-section-cache-size") ?? "0",
      ),
      sectionCacheCapacity: Number(
        layer.getAttribute("data-scene-graph-layer-section-cache-capacity") ??
          "0",
      ),
      edgeCacheSize: Number(
        layer.getAttribute("data-scene-graph-layer-edge-cache-size") ?? "0",
      ),
      edgeCacheCapacity: Number(
        layer.getAttribute("data-scene-graph-layer-edge-cache-capacity") ?? "0",
      ),
      sectionCacheEvictions: Number(
        layer.getAttribute("data-scene-graph-layer-section-cache-evictions") ??
          "0",
      ),
      edgeCacheEvictions: Number(
        layer.getAttribute("data-scene-graph-layer-edge-cache-evictions") ??
          "0",
      ),
      totalCacheEvictions: Number(
        layer.getAttribute("data-scene-graph-layer-total-cache-evictions") ??
          "0",
      ),
      bufferPressure: Number(
        layer.getAttribute("data-scene-graph-layer-buffer-pressure") ?? "0",
      ),
    };
  });
  const compatibilityState = await page.evaluate(() => {
    const root = document.querySelector(".react-flow");
    if (!(root instanceof HTMLElement)) {
      throw new Error("Missing .react-flow root.");
    }
    return {
      domIslandCount: Number(
        root.getAttribute("data-scene-graph-renderer-dom-island-count") ?? "0",
      ),
      sceneCompatibleSectionCount: Number(
        root.getAttribute(
          "data-scene-graph-renderer-scene-compatible-section-count",
        ) ?? "0",
      ),
      domOnlySectionCount: Number(
        root.getAttribute("data-scene-graph-renderer-dom-only-section-count") ??
          "0",
      ),
      unresolvedSectionCount: Number(
        root.getAttribute(
          "data-scene-graph-renderer-unresolved-section-count",
        ) ?? "0",
      ),
      forcedDomSectionCount: Number(
        root.getAttribute(
          "data-scene-graph-renderer-forced-dom-section-count",
        ) ?? "0",
      ),
    };
  });

  if (labels.resolvedBackend === "webgl") {
    expect(layerState.visible).toBe("1");
    expect(layerState.backend).toBe("webgl");
    expect(layerState.sections).toBeGreaterThan(10);
    expect(layerState.edges).toBeGreaterThanOrEqual(0);
    expect(layerState.activeSections).toBeGreaterThanOrEqual(0);
    expect(layerState.selectedEdges).toBeGreaterThanOrEqual(0);
    expect(layerState.cameraZoom).toBeGreaterThan(0);
    expect(["worker", "main-thread"]).toContain(
      layerState.snapshotPipelineMode,
    );
    expect(layerState.snapshotBuildMs).toBeGreaterThanOrEqual(0);
    expect(layerState.snapshotDiffMs).toBeGreaterThanOrEqual(0);
    expect(layerState.snapshotTotalMs).toBeGreaterThanOrEqual(0);
    expect(layerState.updateResourcesMs).toBeGreaterThanOrEqual(0);
    expect(layerState.pendingBuildRequests).toBeGreaterThanOrEqual(0);
    expect(layerState.staleBuildResponses).toBeGreaterThanOrEqual(0);
    expect(layerState.sectionCacheCapacity).toBeGreaterThan(0);
    expect(layerState.edgeCacheCapacity).toBeGreaterThan(0);
    expect(layerState.sectionCacheSize).toBeGreaterThanOrEqual(0);
    expect(layerState.edgeCacheSize).toBeGreaterThanOrEqual(0);
    expect(layerState.sectionCacheEvictions).toBeGreaterThanOrEqual(0);
    expect(layerState.edgeCacheEvictions).toBeGreaterThanOrEqual(0);
    expect(layerState.totalCacheEvictions).toBeGreaterThanOrEqual(0);
    expect(layerState.bufferPressure).toBeGreaterThanOrEqual(0);
    expect(layerState.bufferPressure).toBeLessThanOrEqual(1);
    expect(compatibilityState.sceneCompatibleSectionCount).toBeGreaterThan(0);
    expect(compatibilityState.domOnlySectionCount).toBeGreaterThanOrEqual(0);
    expect(compatibilityState.unresolvedSectionCount).toBeGreaterThanOrEqual(0);
    expect(compatibilityState.forcedDomSectionCount).toBe(
      compatibilityState.domOnlySectionCount +
        compatibilityState.unresolvedSectionCount,
    );
    expect(compatibilityState.domIslandCount).toBeGreaterThanOrEqual(
      compatibilityState.forcedDomSectionCount,
    );

    let zoomBefore = layerState.cameraZoom;
    let firstNode = page.locator(".react-flow__node").first();
    if ((await firstNode.count()) === 0) {
      const clickTarget = await findSceneOnlyPromotionClickTarget(page);
      if (clickTarget) {
        await page.mouse.click(clickTarget.clientX, clickTarget.clientY);
        await page.waitForSelector(
          `.react-flow__node[data-id="${clickTarget.sectionId}"]`,
        );
        firstNode = page
          .locator(`.react-flow__node[data-id="${clickTarget.sectionId}"]`)
          .first();
      }
    }
    if ((await firstNode.count()) > 0) {
      await expect(firstNode).toBeVisible();
      const firstNodeId = await firstNode.getAttribute("data-id");
      await firstNode.click();
      await page.waitForFunction(() => {
        const layer = document.querySelector(
          ".setta-scene-graph-renderer-layer",
        );
        if (!(layer instanceof HTMLCanvasElement)) {
          return false;
        }
        return (
          Number(
            layer.getAttribute("data-scene-graph-layer-active-sections") ?? "0",
          ) > 0
        );
      });
      await firstNode.hover();
      await page.waitForFunction(() => {
        const layer = document.querySelector(
          ".setta-scene-graph-renderer-layer",
        );
        if (!(layer instanceof HTMLCanvasElement)) {
          return false;
        }
        return (
          (layer.getAttribute("data-scene-graph-layer-hovered-section") ?? "")
            .length > 0
        );
      });

      const hoveredLayerState = await page.evaluate(() => {
        const layer = document.querySelector(
          ".setta-scene-graph-renderer-layer",
        );
        if (!(layer instanceof HTMLCanvasElement)) {
          throw new Error("Missing scene graph renderer canvas layer.");
        }
        return {
          hoveredSection:
            layer.getAttribute("data-scene-graph-layer-hovered-section") ?? "",
          cameraZoom: Number(
            layer.getAttribute("data-scene-graph-layer-camera-zoom") ?? "0",
          ),
        };
      });
      if (firstNodeId && firstNodeId.length > 0) {
        expect(hoveredLayerState.hoveredSection).toBe(firstNodeId);
      } else {
        expect(hoveredLayerState.hoveredSection.length).toBeGreaterThan(0);
      }
      zoomBefore = hoveredLayerState.cameraZoom;
    }

    const zoomInButton = page.getByRole("button", { name: "zoom in" });
    await expect(zoomInButton).toBeVisible();
    await zoomInButton.click();
    await page.waitForFunction((beforeZoom) => {
      const layer = document.querySelector(".setta-scene-graph-renderer-layer");
      if (!(layer instanceof HTMLCanvasElement)) {
        return false;
      }
      return (
        Number(
          layer.getAttribute("data-scene-graph-layer-camera-zoom") ?? "0",
        ) > beforeZoom
      );
    }, zoomBefore);
  } else {
    expect(layerState.visible).toBe("0");
    expect(layerState.backend).toBe("dom");
    expect(compatibilityState.sceneCompatibleSectionCount).toBe(0);
    expect(compatibilityState.domOnlySectionCount).toBe(0);
    expect(compatibilityState.unresolvedSectionCount).toBe(0);
    expect(compatibilityState.forcedDomSectionCount).toBe(0);
  }
});

test("settings all-settings promotes scene-only sections into DOM islands on first click", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("setta.sceneGraphRenderer.enabled", "1");
    localStorage.setItem("setta.sceneGraphRenderer.backend", "webgl");
    localStorage.setItem("setta.sceneGraphRenderer.domIslandRadius", "0");
    localStorage.setItem("setta.sceneGraphRenderer.debugOverlay", "0");
  });
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTab).toBeVisible();
  await allTab.click();
  await page.waitForFunction(() => {
    const root = document.querySelector(".react-flow");
    if (!root) {
      return false;
    }
    return (
      root.getAttribute("data-scene-graph-renderer-probe-status") === "ready"
    );
  });

  const labels = await readSceneGraphRendererPerfLabels(page);
  test.skip(
    labels.resolvedBackend !== "webgl",
    "Scene-only DOM island promotion requires the WebGL backend.",
  );

  const clickTarget = await findSceneOnlyPromotionClickTarget(page);

  expect(clickTarget).not.toBeNull();
  if (!clickTarget) {
    return;
  }

  await page.mouse.click(clickTarget.clientX, clickTarget.clientY);
  await page.waitForFunction((sectionId) => {
    const layer = document.querySelector(".setta-scene-graph-renderer-layer");
    if (!(layer instanceof HTMLCanvasElement)) {
      return false;
    }
    const activeSectionCount = Number(
      layer.getAttribute("data-scene-graph-layer-active-sections") ?? "0",
    );
    const mountedNode = document.querySelector(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    return activeSectionCount > 0 && mountedNode instanceof HTMLElement;
  }, clickTarget.sectionId);

  const promotedState = await page.evaluate((sectionId) => {
    const layer = document.querySelector(".setta-scene-graph-renderer-layer");
    const root = document.querySelector(".react-flow");
    return {
      isDomMounted:
        document.querySelector(`.react-flow__node[data-id="${sectionId}"]`) !==
        null,
      activeSectionCount:
        layer instanceof HTMLCanvasElement
          ? Number(
              layer.getAttribute("data-scene-graph-layer-active-sections") ??
                "0",
            )
          : 0,
      domIslandCount:
        root instanceof HTMLElement
          ? Number(
              root.getAttribute("data-scene-graph-renderer-dom-island-count") ??
                "0",
            )
          : 0,
    };
  }, clickTarget.sectionId);

  expect(promotedState.activeSectionCount).toBeGreaterThan(0);
  expect(promotedState.domIslandCount).toBeGreaterThan(0);
  expect(promotedState.isDomMounted).toBe(true);
});

test("settings view modes keep visible sections when layout payload is partial", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("setta.sceneGraphRenderer.enabled", "0");
  });
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

test("settings all-settings forces unsupported section types to DOM islands", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("setta.sceneGraphRenderer.enabled", "1");
    localStorage.setItem("setta.sceneGraphRenderer.backend", "webgl");
    localStorage.setItem("setta.sceneGraphRenderer.domIslandRadius", "0");
    localStorage.setItem("setta.sceneGraphRenderer.debugOverlay", "0");
  });
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTab).toBeVisible();
  await allTab.click();
  await page.waitForFunction(() => {
    const root = document.querySelector(".react-flow");
    if (!(root instanceof HTMLElement)) {
      return false;
    }
    return (
      root.getAttribute("data-scene-graph-renderer-probe-status") === "ready"
    );
  });

  const labels = await readSceneGraphRendererPerfLabels(page);
  test.skip(
    labels.resolvedBackend !== "webgl",
    "Compatibility forced-DOM assertions require the WebGL backend.",
  );

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const createResponse = await postBackend<CreateTopLevelSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Chat",
      controlCodeObjType: null,
      implOverrides: null,
      position: { x: 2400, y: 1200 },
      topLevelSections: null,
      viewportBounds: null,
    },
  );
  if (!createResponse?.sectionId) {
    throw new Error("Failed to create unsupported top-level section.");
  }

  const unsupportedSectionId = createResponse.sectionId;
  try {
    const latestState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, latestState);

    await page.waitForFunction((sectionId) => {
      const root = document.querySelector(".react-flow");
      if (!(root instanceof HTMLElement)) {
        return false;
      }
      const forcedDomCount = Number(
        root.getAttribute(
          "data-scene-graph-renderer-forced-dom-section-count",
        ) ?? "0",
      );
      const domOnlyCount = Number(
        root.getAttribute("data-scene-graph-renderer-dom-only-section-count") ??
          "0",
      );
      const sectionNode = document.querySelector(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      return (
        forcedDomCount > 0 &&
        domOnlyCount > 0 &&
        sectionNode instanceof HTMLElement
      );
    }, unsupportedSectionId);

    const compatibilityState = await page.evaluate((sectionId) => {
      const root = document.querySelector(".react-flow");
      if (!(root instanceof HTMLElement)) {
        throw new Error("Missing .react-flow root.");
      }
      return {
        forcedDomCount: Number(
          root.getAttribute(
            "data-scene-graph-renderer-forced-dom-section-count",
          ) ?? "0",
        ),
        domOnlyCount: Number(
          root.getAttribute(
            "data-scene-graph-renderer-dom-only-section-count",
          ) ?? "0",
        ),
        unresolvedCount: Number(
          root.getAttribute(
            "data-scene-graph-renderer-unresolved-section-count",
          ) ?? "0",
        ),
        domIslandCount: Number(
          root.getAttribute("data-scene-graph-renderer-dom-island-count") ??
            "0",
        ),
        sectionIsDomMounted:
          document.querySelector(
            `.react-flow__node[data-id="${sectionId}"]`,
          ) !== null,
      };
    }, unsupportedSectionId);

    expect(compatibilityState.domOnlyCount).toBeGreaterThan(0);
    expect(compatibilityState.forcedDomCount).toBeGreaterThan(0);
    expect(compatibilityState.forcedDomCount).toBe(
      compatibilityState.domOnlyCount + compatibilityState.unresolvedCount,
    );
    expect(compatibilityState.domIslandCount).toBeGreaterThanOrEqual(
      compatibilityState.forcedDomCount,
    );
    expect(compatibilityState.sectionIsDomMounted).toBe(true);
  } finally {
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: [unsupportedSectionId],
    });
    const latestState = await getLatestProjectState(page, projectConfigId);
    await applyProjectStateUpdate(page, latestState);
  }
});

test("settings all-settings keeps chart, spreadsheet, task board, browser, image, social, and draw sections scene-compatible", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("setta.sceneGraphRenderer.enabled", "1");
    localStorage.setItem("setta.sceneGraphRenderer.backend", "webgl");
    localStorage.setItem("setta.sceneGraphRenderer.domIslandRadius", "0");
    localStorage.setItem("setta.sceneGraphRenderer.debugOverlay", "0");
  });
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTab).toBeVisible();
  await allTab.click();
  await page.waitForFunction(() => {
    const root = document.querySelector(".react-flow");
    if (!(root instanceof HTMLElement)) {
      return false;
    }
    return (
      root.getAttribute("data-scene-graph-renderer-probe-status") === "ready"
    );
  });

  const labels = await readSceneGraphRendererPerfLabels(page);
  test.skip(
    labels.resolvedBackend !== "webgl",
    "Compatibility scene-only assertions require the WebGL backend.",
  );

  const projectConfigId = await getProjectConfigIdFromBackend(page);
  const baselineState = await page.evaluate(() => {
    const root = document.querySelector(".react-flow");
    if (!(root instanceof HTMLElement)) {
      throw new Error("Missing .react-flow root.");
    }
    return {
      sceneCompatibleCount: Number(
        root.getAttribute(
          "data-scene-graph-renderer-scene-compatible-section-count",
        ) ?? "0",
      ),
      domOnlyCount: Number(
        root.getAttribute("data-scene-graph-renderer-dom-only-section-count") ??
          "0",
      ),
      unresolvedCount: Number(
        root.getAttribute(
          "data-scene-graph-renderer-unresolved-section-count",
        ) ?? "0",
      ),
      forcedDomCount: Number(
        root.getAttribute(
          "data-scene-graph-renderer-forced-dom-section-count",
        ) ?? "0",
      ),
    };
  });

  const sectionIdsToDelete: string[] = [];
  const sceneCompatibleImplTypes: Array<
    | "Chart"
    | "Spreadsheet"
    | "TaskBoard"
    | "Browser"
    | "Image"
    | "Social"
    | "Draw"
  > = [
    "Chart",
    "Spreadsheet",
    "TaskBoard",
    "Browser",
    "Image",
    "Social",
    "Draw",
  ];
  try {
    for (let index = 0; index < sceneCompatibleImplTypes.length; index += 1) {
      const implType = sceneCompatibleImplTypes[index];
      const createResponse = await postBackend<CreateTopLevelSectionResponse>(
        page,
        "/createTopLevelSection",
        {
          projectConfigId,
          implType,
          controlCodeObjType: null,
          implOverrides: null,
          position: {
            x: 2600 + index * 220,
            y: 1400 + index * 180,
          },
          topLevelSections: null,
          viewportBounds: null,
        },
      );
      if (!createResponse?.sectionId) {
        throw new Error(`Failed to create ${implType} top-level section.`);
      }
      sectionIdsToDelete.push(createResponse.sectionId);

      const latestState = await getLatestProjectState(page, projectConfigId);
      await applyProjectStateUpdate(page, latestState);

      await page.waitForFunction((expectedState) => {
        const root = document.querySelector(".react-flow");
        if (!(root instanceof HTMLElement)) {
          return false;
        }
        const sceneCompatibleCount = Number(
          root.getAttribute(
            "data-scene-graph-renderer-scene-compatible-section-count",
          ) ?? "0",
        );
        const domOnlyCount = Number(
          root.getAttribute(
            "data-scene-graph-renderer-dom-only-section-count",
          ) ?? "0",
        );
        const unresolvedCount = Number(
          root.getAttribute(
            "data-scene-graph-renderer-unresolved-section-count",
          ) ?? "0",
        );
        const forcedDomCount = Number(
          root.getAttribute(
            "data-scene-graph-renderer-forced-dom-section-count",
          ) ?? "0",
        );
        return (
          sceneCompatibleCount >= expectedState.sceneCompatibleCount &&
          domOnlyCount === expectedState.domOnlyCount &&
          unresolvedCount === expectedState.unresolvedCount &&
          forcedDomCount === expectedState.forcedDomCount
        );
      }, {
        sceneCompatibleCount: baselineState.sceneCompatibleCount + index + 1,
        domOnlyCount: baselineState.domOnlyCount,
        unresolvedCount: baselineState.unresolvedCount,
        forcedDomCount: baselineState.forcedDomCount,
      });
    }

    const compatibilityState = await page.evaluate(() => {
      const root = document.querySelector(".react-flow");
      if (!(root instanceof HTMLElement)) {
        throw new Error("Missing .react-flow root.");
      }
      return {
        sceneCompatibleCount: Number(
          root.getAttribute(
            "data-scene-graph-renderer-scene-compatible-section-count",
          ) ?? "0",
        ),
        domOnlyCount: Number(
          root.getAttribute(
            "data-scene-graph-renderer-dom-only-section-count",
          ) ?? "0",
        ),
        unresolvedCount: Number(
          root.getAttribute(
            "data-scene-graph-renderer-unresolved-section-count",
          ) ?? "0",
        ),
        forcedDomCount: Number(
          root.getAttribute(
            "data-scene-graph-renderer-forced-dom-section-count",
          ) ?? "0",
        ),
      };
    });

    expect(compatibilityState.sceneCompatibleCount).toBeGreaterThanOrEqual(
      baselineState.sceneCompatibleCount + sceneCompatibleImplTypes.length,
    );
    expect(compatibilityState.domOnlyCount).toBe(baselineState.domOnlyCount);
    expect(compatibilityState.unresolvedCount).toBe(
      baselineState.unresolvedCount,
    );
    expect(compatibilityState.forcedDomCount).toBe(
      baselineState.forcedDomCount,
    );
  } finally {
    if (sectionIdsToDelete.length > 0) {
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: sectionIdsToDelete,
      });
      const latestState = await getLatestProjectState(page, projectConfigId);
      await applyProjectStateUpdate(page, latestState);
    }
  }
});

type SceneOnlyPromotionClickTarget = {
  sectionId: string;
  clientX: number;
  clientY: number;
};

async function findSceneOnlyPromotionClickTarget(
  page: Page,
): Promise<SceneOnlyPromotionClickTarget | null> {
  return page.evaluate(() => {
    const root = document.querySelector(".react-flow");
    if (!(root instanceof HTMLElement)) {
      return null;
    }
    const sectionId =
      root.getAttribute(
        "data-scene-graph-renderer-scene-only-click-target-section-id",
      ) ?? "";
    if (sectionId.length === 0) {
      return null;
    }
    const paneX = Number(
      root.getAttribute(
        "data-scene-graph-renderer-scene-only-click-target-pane-x",
      ) ?? "NaN",
    );
    const paneY = Number(
      root.getAttribute(
        "data-scene-graph-renderer-scene-only-click-target-pane-y",
      ) ?? "NaN",
    );
    if (!Number.isFinite(paneX) || !Number.isFinite(paneY)) {
      return null;
    }
    const pane = document.querySelector(".react-flow__pane");
    if (!(pane instanceof HTMLElement)) {
      throw new Error("Missing pane element.");
    }
    const paneRect = pane.getBoundingClientRect();
    if (
      paneX < 0 ||
      paneY < 0 ||
      paneX > paneRect.width ||
      paneY > paneRect.height
    ) {
      return null;
    }
    return {
      sectionId,
      clientX: paneRect.left + paneX,
      clientY: paneRect.top + paneY,
    };
  });
}

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

type CreateTopLevelSectionResponse = {
  sectionId: string;
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
