import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  getCurrentProjectConfigId,
  openIsolatedProject,
  postBackend,
  readSceneGraphRendererPerfLabels,
} from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

const SCENE_GRAPH_RENDERER_ENABLED_KEY = "setta.sceneGraphRenderer.enabled";
const SCENE_GRAPH_RENDERER_BACKEND_KEY = "setta.sceneGraphRenderer.backend";
const SCENE_GRAPH_RENDERER_DOM_ISLAND_RADIUS_KEY =
  "setta.sceneGraphRenderer.domIslandRadius";
const SCENE_GRAPH_RENDERER_DEBUG_OVERLAY_KEY =
  "setta.sceneGraphRenderer.debugOverlay";
const SCENE_GRAPH_RENDERER_ROLLOUT_PROJECT_CONFIG_IDS_KEY =
  "setta.sceneGraphRenderer.rolloutProjectConfigIds";
const SCENE_GRAPH_RENDERER_ROLLOUT_PROJECT_CONFIG_NAMES_KEY =
  "setta.sceneGraphRenderer.rolloutProjectConfigNames";
const SCENE_GRAPH_RENDERER_STORAGE_KEYS = {
  enabled: SCENE_GRAPH_RENDERER_ENABLED_KEY,
  backend: SCENE_GRAPH_RENDERER_BACKEND_KEY,
  domIslandRadius: SCENE_GRAPH_RENDERER_DOM_ISLAND_RADIUS_KEY,
  debugOverlay: SCENE_GRAPH_RENDERER_DEBUG_OVERLAY_KEY,
  rolloutProjectConfigIds: SCENE_GRAPH_RENDERER_ROLLOUT_PROJECT_CONFIG_IDS_KEY,
  rolloutProjectConfigNames:
    SCENE_GRAPH_RENDERER_ROLLOUT_PROJECT_CONFIG_NAMES_KEY,
};

const VIEWPORT_PAN_SWEEP_STEPS = 6;
const VIEWPORT_ZOOM_SWEEP_STEPS = 6;
const SYNTHETIC_SECTION_COUNT = 64;

const SYNTHETIC_IMPL_TYPES: Array<
  | "Chart"
  | "Spreadsheet"
  | "TaskBoard"
  | "Browser"
  | "Image"
  | "Social"
  | "Draw"
  | "Chat"
> = [
  "Chart",
  "Spreadsheet",
  "TaskBoard",
  "Browser",
  "Image",
  "Social",
  "Draw",
  "Chat",
];

type CreateTopLevelSectionResponse = {
  sectionId?: string;
};

type ViewportTransform = {
  x: number;
  y: number;
  zoom: number;
};

type SceneGraphLayerSnapshot = {
  layerVisible: boolean;
  layerBackend: "webgpu" | "webgl" | "dom";
  layerSections: number;
  layerEdges: number;
  layerSnapshotBuildMs: number;
  layerSnapshotDiffMs: number;
  layerSnapshotTotalMs: number;
  layerUpdateResourcesMs: number;
  layerPendingBuildRequests: number;
  layerStaleBuildResponses: number;
  layerBufferPressure: number;
  domNodeCount: number;
  reactFlowNodeCount: number;
  sceneCompatibleSectionCount: number;
  domOnlySectionCount: number;
  unresolvedSectionCount: number;
  forcedDomSectionCount: number;
};

type ViewportSweepMetrics = {
  panStepLatenciesMs: number[];
  zoomStepLatenciesMs: number[];
  panP50Ms: number;
  panP95Ms: number;
  zoomP50Ms: number;
  zoomP95Ms: number;
};

type BackendBenchmarkResult = {
  scenario: string;
  mode: "dom" | "auto";
  labels: Awaited<ReturnType<typeof readSceneGraphRendererPerfLabels>>;
  snapshot: SceneGraphLayerSnapshot;
  viewportSweep: ViewportSweepMetrics;
};

test.describe("scene graph benchmark suite", () => {
  test("captures settings stress benchmark metrics for dom and auto modes", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300000);

    await ensureAppReady(page);

    // Run the same surface with both renderer modes so the benchmark output is comparable.
    const results: BackendBenchmarkResult[] = [];
    for (const mode of ["dom", "auto"] as const) {
      await setRendererMode(page, mode);
      await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(READY_SELECTOR);
      await openAllSettingsTab(page);
      await waitForSceneGraphProbeReady(page);

      const labels = await readSceneGraphRendererPerfLabels(page);
      const projectConfigId = await getCurrentProjectConfigId(page);
      const viewportSweep = await runViewportSweepBenchmark(page, projectConfigId);
      const snapshot = await readSceneGraphLayerSnapshot(page);

      assertSnapshotMatchesResolvedBackend(snapshot, labels.resolvedBackend, 12);

      results.push({
        scenario: "settings-all-settings",
        mode,
        labels,
        snapshot,
        viewportSweep,
      });
    }

    await attachBenchmarkResults(testInfo, "settings-benchmark-results", results);
    logBenchmarkResults(results);
  });

  test("captures synthetic mixed-section benchmark metrics for dom and auto modes", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300000);

    let isolatedProjectContext: Awaited<
      ReturnType<typeof openIsolatedProject>
    > | null = null;

    try {
      await ensureAppReady(page);
      isolatedProjectContext = await openIsolatedProject(page);
      await setRendererModeWithoutReload(page, "dom");
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(READY_SELECTOR);
      await waitForSceneGraphProbeReady(page);

      // Build a large mixed project so benchmark coverage is not tied to settings-only content.
      await createSyntheticMixedSections(
        page,
        isolatedProjectContext.projectConfigId,
        SYNTHETIC_SECTION_COUNT,
      );
      await waitForSectionPopulation(page, SYNTHETIC_SECTION_COUNT);

      const results: BackendBenchmarkResult[] = [];
      for (const mode of ["dom", "auto"] as const) {
        await setRendererMode(page, mode);
        await waitForSceneGraphProbeReady(page);

        const labels = await readSceneGraphRendererPerfLabels(page);
        const projectConfigId = isolatedProjectContext.projectConfigId;
        const viewportSweep = await runViewportSweepBenchmark(page, projectConfigId);
        const snapshot = await readSceneGraphLayerSnapshot(page);

        assertSnapshotMatchesResolvedBackend(
          snapshot,
          labels.resolvedBackend,
          SYNTHETIC_SECTION_COUNT,
        );
        await assertSceneGraphPromotionParityWhenAvailable(page, labels.resolvedBackend);

        results.push({
          scenario: "synthetic-mixed-sections",
          mode,
          labels,
          snapshot,
          viewportSweep,
        });
      }

      await attachBenchmarkResults(
        testInfo,
        "synthetic-benchmark-results",
        results,
      );
      logBenchmarkResults(results);
    } finally {
      await clearRendererStorage(page);
      await cleanupIsolatedProject(page, isolatedProjectContext);
    }
  });
});

async function attachBenchmarkResults(
  testInfo: TestInfo,
  attachmentName: string,
  results: BackendBenchmarkResult[],
): Promise<void> {
  await testInfo.attach(`${attachmentName}.json`, {
    body: Buffer.from(JSON.stringify(results, null, 2)),
    contentType: "application/json",
  });
}

function logBenchmarkResults(results: BackendBenchmarkResult[]): void {
  console.log(
    `SCENE_GRAPH_BENCHMARK_RESULTS ${JSON.stringify(results, null, 2)}`,
  );
}

async function openAllSettingsTab(page: Page): Promise<void> {
  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTab).toBeVisible();
  await allTab.click();
}

async function setRendererMode(page: Page, mode: "dom" | "auto"): Promise<void> {
  await setRendererModeWithoutReload(page, mode);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
}

async function setRendererModeWithoutReload(
  page: Page,
  mode: "dom" | "auto",
): Promise<void> {
  await page.evaluate(({ nextMode, storageKeys }) => {
    localStorage.removeItem(storageKeys.rolloutProjectConfigIds);
    localStorage.removeItem(storageKeys.rolloutProjectConfigNames);
    if (nextMode === "dom") {
      localStorage.setItem(storageKeys.enabled, "0");
      localStorage.removeItem(storageKeys.backend);
      localStorage.removeItem(storageKeys.domIslandRadius);
      localStorage.removeItem(storageKeys.debugOverlay);
      return;
    }
    localStorage.setItem(storageKeys.enabled, "1");
    localStorage.setItem(storageKeys.backend, "auto");
    localStorage.setItem(storageKeys.domIslandRadius, "2");
    localStorage.setItem(storageKeys.debugOverlay, "0");
  }, { nextMode: mode, storageKeys: SCENE_GRAPH_RENDERER_STORAGE_KEYS });
}

async function clearRendererStorage(page: Page): Promise<void> {
  await page.evaluate((storageKeys) => {
    localStorage.removeItem(storageKeys.enabled);
    localStorage.removeItem(storageKeys.backend);
    localStorage.removeItem(storageKeys.domIslandRadius);
    localStorage.removeItem(storageKeys.debugOverlay);
    localStorage.removeItem(storageKeys.rolloutProjectConfigIds);
    localStorage.removeItem(storageKeys.rolloutProjectConfigNames);
  }, SCENE_GRAPH_RENDERER_STORAGE_KEYS);
}

async function waitForSceneGraphProbeReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const root = document.querySelector(".react-flow");
    if (!(root instanceof HTMLElement)) {
      return false;
    }
    return root.getAttribute("data-scene-graph-renderer-probe-status") === "ready";
  });
}

async function createSyntheticMixedSections(
  page: Page,
  projectConfigId: string,
  count: number,
): Promise<void> {
  const columns = 8;
  const xStart = 1800;
  const yStart = 900;
  const xStep = 260;
  const yStep = 200;

  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const implType = SYNTHETIC_IMPL_TYPES[index % SYNTHETIC_IMPL_TYPES.length];
    const created = await postBackend<CreateTopLevelSectionResponse>(
      page,
      "/createTopLevelSection",
      {
        projectConfigId,
        implType,
        controlCodeObjType: null,
        implOverrides: null,
        position: {
          x: xStart + xStep * column,
          y: yStart + yStep * row,
        },
        topLevelSections: null,
        viewportBounds: null,
      },
    );
    if (!created?.sectionId) {
      throw new Error(`Failed to create synthetic ${implType} section.`);
    }
  }
}

async function waitForSectionPopulation(
  page: Page,
  expectedCount: number,
): Promise<void> {
  await page.waitForFunction((minimumCount) => {
    const root = document.querySelector(".react-flow");
    if (!(root instanceof HTMLElement)) {
      return false;
    }

    const sceneCompatibleCount = Number(
      root.getAttribute("data-scene-graph-renderer-scene-compatible-section-count") ??
        "0",
    );
    const domOnlyCount = Number(
      root.getAttribute("data-scene-graph-renderer-dom-only-section-count") ?? "0",
    );
    const unresolvedCount = Number(
      root.getAttribute("data-scene-graph-renderer-unresolved-section-count") ?? "0",
    );

    const totalTrackedCount = sceneCompatibleCount + domOnlyCount + unresolvedCount;
    const mountedNodeCount = document.querySelectorAll(".react-flow__node").length;
    return totalTrackedCount >= minimumCount || mountedNodeCount >= minimumCount;
  }, expectedCount);
}

async function runViewportSweepBenchmark(
  page: Page,
  projectConfigId: string,
): Promise<ViewportSweepMetrics> {
  const baselineViewport = await readViewportTransform(page);
  const panTargets = buildPanTargets(baselineViewport, VIEWPORT_PAN_SWEEP_STEPS);
  const zoomTargets = buildZoomTargets(
    baselineViewport,
    VIEWPORT_ZOOM_SWEEP_STEPS,
  );

  const panStepLatenciesMs: number[] = [];
  for (const target of panTargets) {
    const startMs = Date.now();
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: target,
    });
    await page.waitForTimeout(25);
    panStepLatenciesMs.push(Date.now() - startMs);
  }

  const zoomStepLatenciesMs: number[] = [];
  for (const target of zoomTargets) {
    const startMs = Date.now();
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: target,
    });
    await page.waitForTimeout(25);
    zoomStepLatenciesMs.push(Date.now() - startMs);
  }

  await postBackend(page, "/setViewport", {
    projectConfigId,
    viewport: baselineViewport,
  });
  await page.waitForTimeout(25);

  return {
    panStepLatenciesMs,
    zoomStepLatenciesMs,
    panP50Ms: percentile(panStepLatenciesMs, 0.5),
    panP95Ms: percentile(panStepLatenciesMs, 0.95),
    zoomP50Ms: percentile(zoomStepLatenciesMs, 0.5),
    zoomP95Ms: percentile(zoomStepLatenciesMs, 0.95),
  };
}

function buildPanTargets(
  baseline: ViewportTransform,
  steps: number,
): ViewportTransform[] {
  const targets: ViewportTransform[] = [];
  for (let index = 0; index < steps; index += 1) {
    const direction = index % 2 === 0 ? 1 : -1;
    const magnitude = Math.floor(index / 2) + 1;
    targets.push({
      x: baseline.x + direction * magnitude * 160,
      y: baseline.y + direction * magnitude * 120,
      zoom: baseline.zoom,
    });
  }
  return targets;
}

function buildZoomTargets(
  baseline: ViewportTransform,
  steps: number,
): ViewportTransform[] {
  const targets: ViewportTransform[] = [];
  for (let index = 0; index < steps; index += 1) {
    const direction = index % 2 === 0 ? 1 : -1;
    const magnitude = Math.floor(index / 2) + 1;
    const nextZoom = clampZoom(baseline.zoom + direction * magnitude * 0.07);
    targets.push({
      x: baseline.x,
      y: baseline.y,
      zoom: nextZoom,
    });
  }
  return targets;
}

function clampZoom(zoom: number): number {
  return Math.max(0.2, Math.min(2.5, Number(zoom.toFixed(3))));
}

async function readViewportTransform(page: Page): Promise<ViewportTransform> {
  return await page.evaluate(() => {
    const viewport = document.querySelector(".react-flow__viewport");
    if (!(viewport instanceof HTMLElement)) {
      throw new Error("Missing react-flow viewport.");
    }
    const transform = window.getComputedStyle(viewport).transform;
    if (!transform || transform === "none") {
      return { x: 0, y: 0, zoom: 1 };
    }
    const matrix = new DOMMatrixReadOnly(transform);
    return {
      x: Number(matrix.e.toFixed(3)),
      y: Number(matrix.f.toFixed(3)),
      zoom: Number(matrix.a.toFixed(3)),
    };
  });
}

async function readSceneGraphLayerSnapshot(
  page: Page,
): Promise<SceneGraphLayerSnapshot> {
  return await page.evaluate(() => {
    const root = document.querySelector(".react-flow");
    if (!(root instanceof HTMLElement)) {
      throw new Error("Missing .react-flow root.");
    }
    const layer = document.querySelector(".setta-scene-graph-renderer-layer");
    const canvasLayer = layer instanceof HTMLCanvasElement ? layer : null;

    return {
      layerVisible:
        (canvasLayer?.getAttribute("data-scene-graph-layer-visible") ?? "0") === "1",
      layerBackend:
        (canvasLayer?.getAttribute("data-scene-graph-layer-backend") as
          | "webgpu"
          | "webgl"
          | "dom"
          | null) ?? "dom",
      layerSections: Number(
        canvasLayer?.getAttribute("data-scene-graph-layer-sections") ?? "0",
      ),
      layerEdges: Number(
        canvasLayer?.getAttribute("data-scene-graph-layer-edges") ?? "0",
      ),
      layerSnapshotBuildMs: Number(
        canvasLayer?.getAttribute("data-scene-graph-layer-snapshot-build-ms") ?? "0",
      ),
      layerSnapshotDiffMs: Number(
        canvasLayer?.getAttribute("data-scene-graph-layer-snapshot-diff-ms") ?? "0",
      ),
      layerSnapshotTotalMs: Number(
        canvasLayer?.getAttribute("data-scene-graph-layer-snapshot-total-ms") ?? "0",
      ),
      layerUpdateResourcesMs: Number(
        canvasLayer?.getAttribute("data-scene-graph-layer-update-resources-ms") ?? "0",
      ),
      layerPendingBuildRequests: Number(
        canvasLayer?.getAttribute("data-scene-graph-layer-pending-build-requests") ??
          "0",
      ),
      layerStaleBuildResponses: Number(
        canvasLayer?.getAttribute("data-scene-graph-layer-stale-build-responses") ??
          "0",
      ),
      layerBufferPressure: Number(
        canvasLayer?.getAttribute("data-scene-graph-layer-buffer-pressure") ?? "0",
      ),
      domNodeCount: document.querySelectorAll("*").length,
      reactFlowNodeCount: document.querySelectorAll(".react-flow__node").length,
      sceneCompatibleSectionCount: Number(
        root.getAttribute("data-scene-graph-renderer-scene-compatible-section-count") ??
          "0",
      ),
      domOnlySectionCount: Number(
        root.getAttribute("data-scene-graph-renderer-dom-only-section-count") ?? "0",
      ),
      unresolvedSectionCount: Number(
        root.getAttribute("data-scene-graph-renderer-unresolved-section-count") ?? "0",
      ),
      forcedDomSectionCount: Number(
        root.getAttribute("data-scene-graph-renderer-forced-dom-section-count") ?? "0",
      ),
    };
  });
}

function assertSnapshotMatchesResolvedBackend(
  snapshot: SceneGraphLayerSnapshot,
  resolvedBackend: "webgpu" | "webgl" | "dom",
  minimumSectionCount: number,
): void {
  if (resolvedBackend === "dom") {
    expect(snapshot.layerVisible).toBe(false);
    expect(snapshot.layerBackend).toBe("dom");
    expect(snapshot.layerSections).toBeGreaterThanOrEqual(0);
    expect(snapshot.reactFlowNodeCount).toBeGreaterThan(0);
    return;
  }

  expect(snapshot.layerVisible).toBe(true);
  expect(snapshot.layerBackend).toBe(resolvedBackend);
  expect(snapshot.layerSections).toBeGreaterThanOrEqual(minimumSectionCount);
  expect(snapshot.sceneCompatibleSectionCount).toBeGreaterThan(0);
  expect(snapshot.domOnlySectionCount).toBeGreaterThanOrEqual(0);
  expect(snapshot.unresolvedSectionCount).toBeGreaterThanOrEqual(0);
  expect(snapshot.forcedDomSectionCount).toBe(
    snapshot.domOnlySectionCount + snapshot.unresolvedSectionCount,
  );
  expect(snapshot.layerSnapshotBuildMs).toBeGreaterThanOrEqual(0);
  expect(snapshot.layerSnapshotDiffMs).toBeGreaterThanOrEqual(0);
  expect(snapshot.layerSnapshotTotalMs).toBeGreaterThanOrEqual(0);
  expect(snapshot.layerUpdateResourcesMs).toBeGreaterThanOrEqual(0);
  expect(snapshot.layerPendingBuildRequests).toBeGreaterThanOrEqual(0);
  expect(snapshot.layerStaleBuildResponses).toBeGreaterThanOrEqual(0);
  expect(snapshot.layerBufferPressure).toBeGreaterThanOrEqual(0);
  expect(snapshot.layerBufferPressure).toBeLessThanOrEqual(1);
}

async function assertSceneGraphPromotionParityWhenAvailable(
  page: Page,
  resolvedBackend: "webgpu" | "webgl" | "dom",
): Promise<void> {
  if (resolvedBackend === "dom") {
    return;
  }

  const clickTarget = await page.evaluate(() => {
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
      return null;
    }
    const paneRect = pane.getBoundingClientRect();
    return {
      sectionId,
      clientX: paneRect.left + paneX,
      clientY: paneRect.top + paneY,
    };
  });

  if (!clickTarget) {
    return;
  }

  await page.mouse.click(clickTarget.clientX, clickTarget.clientY);
  await page.waitForSelector(`.react-flow__node[data-id="${clickTarget.sectionId}"]`);
  const promotedNode = page.locator(
    `.react-flow__node[data-id="${clickTarget.sectionId}"]`,
  );
  await expect(promotedNode).toBeVisible();
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const clampedQuantile = Math.max(0, Math.min(1, quantile));
  const index = Math.min(
    sorted.length - 1,
    Math.floor(clampedQuantile * (sorted.length - 1)),
  );
  return sorted[index] ?? 0;
}
