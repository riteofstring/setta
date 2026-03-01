import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
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

const SYNTHETIC_SECTION_COUNT = 64;
const SETTINGS_STRESS_MIN_SECTION_COUNT = 30;
const PAN_EVENT_COUNT = 60;
const ZOOM_EVENT_COUNT = 60;
const EVENT_INTERVAL_MS = 8;
const FRAME_SETTLE_MS = 250;

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

type InteractionFrameMetrics = {
  eventCount: number;
  frameCount: number;
  sampleWindowMs: number;
  frameTimeP50Ms: number;
  frameTimeP95Ms: number;
  fpsP50: number;
  fpsP95: number;
  droppedFrameCount: number;
  longFrameCount: number;
  startHitchMs: number;
  stopHitchMs: number;
  transformDelta: ViewportTransform;
};

type InteractionBenchmarkMetrics = {
  pan: InteractionFrameMetrics;
  zoom: InteractionFrameMetrics;
  zoomMethod:
    | "wheel_with_zoom_activation_key"
    | "zoom_in_controls_fallback";
};

type BackendBenchmarkResult = {
  scenario: string;
  mode: "dom" | "auto";
  labels: Awaited<ReturnType<typeof readSceneGraphRendererPerfLabels>>;
  snapshot: SceneGraphLayerSnapshot;
  interactionMetrics: InteractionBenchmarkMetrics;
};

test.describe("scene graph benchmark suite", () => {
  test("captures settings stress benchmark metrics for dom and auto modes", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300000);

    await ensureAppReady(page);

    const results: BackendBenchmarkResult[] = [];
    for (const mode of ["dom", "auto"] as const) {
      await setRendererMode(page, mode);
      await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(READY_SELECTOR);
      await openAllSettingsTab(page);
      await waitForSceneGraphProbeReady(page);
      await waitForSectionPopulation(page, SETTINGS_STRESS_MIN_SECTION_COUNT);

      const labels = await readSceneGraphRendererPerfLabels(page);
      await waitForSceneLayerSnapshotReady(page, labels.resolvedBackend);
      const snapshot = await readSceneGraphLayerSnapshot(page);
      const interactionMetrics = await runWheelInteractionBenchmark(page);

      assertSnapshotMatchesResolvedBackend(
        snapshot,
        labels.resolvedBackend,
        SETTINGS_STRESS_MIN_SECTION_COUNT,
      );
      assertInteractionMetrics(interactionMetrics);

      results.push({
        scenario: "settings-all-settings",
        mode,
        labels,
        snapshot,
        interactionMetrics,
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
        await waitForSectionPopulation(page, SYNTHETIC_SECTION_COUNT);

        const labels = await readSceneGraphRendererPerfLabels(page);
        await waitForSceneLayerSnapshotReady(page, labels.resolvedBackend);
        const snapshot = await readSceneGraphLayerSnapshot(page);
        const interactionMetrics = await runWheelInteractionBenchmark(page);

        assertSnapshotMatchesResolvedBackend(
          snapshot,
          labels.resolvedBackend,
          SYNTHETIC_SECTION_COUNT,
        );
        assertInteractionMetrics(interactionMetrics);
        await assertSceneGraphPromotionParityWhenAvailable(page, labels.resolvedBackend);

        results.push({
          scenario: "synthetic-mixed-sections",
          mode,
          labels,
          snapshot,
          interactionMetrics,
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
  await page.evaluate(
    ({ nextMode, storageKeys }) => {
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
    },
    { nextMode: mode, storageKeys: SCENE_GRAPH_RENDERER_STORAGE_KEYS },
  );
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

async function waitForSceneLayerSnapshotReady(
  page: Page,
  resolvedBackend: "webgpu" | "webgl" | "dom",
): Promise<void> {
  if (resolvedBackend === "dom") {
    return;
  }
  await page.waitForFunction(() => {
    const layer = document.querySelector(".setta-scene-graph-renderer-layer");
    if (!(layer instanceof HTMLCanvasElement)) {
      return false;
    }
    const sectionCount = Number(
      layer.getAttribute("data-scene-graph-layer-sections") ?? "0",
    );
    return sectionCount > 0;
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

async function runWheelInteractionBenchmark(
  page: Page,
): Promise<InteractionBenchmarkMetrics> {
  return await page.evaluate(
    async ({ panEventCount, zoomEventCount, eventIntervalMs, settleMs }) => {
      const pane = document.querySelector(".react-flow__pane");
      const viewport = document.querySelector(".react-flow__viewport");
      if (!(pane instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
        throw new Error("Missing react-flow pane or viewport.");
      }

      const readTransform = () => {
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
      };

      const percentile = (values: number[], quantile: number): number => {
        if (values.length === 0) {
          return 0;
        }
        const sorted = [...values].sort((left, right) => left - right);
        const clampedQuantile = Math.max(0, Math.min(1, quantile));
        const index = Math.min(
          sorted.length - 1,
          Math.floor(clampedQuantile * (sorted.length - 1)),
        );
        return Number((sorted[index] ?? 0).toFixed(3));
      };

      const sleep = (ms: number) => {
        return new Promise<void>((resolve) => {
          setTimeout(resolve, ms);
        });
      };

      const paneRect = pane.getBoundingClientRect();
      const centerX = paneRect.left + paneRect.width / 2;
      const centerY = paneRect.top + paneRect.height / 2;

      const dispatchWheel = (params: {
        deltaX: number;
        deltaY: number;
        ctrlKey?: boolean;
      }) => {
        pane.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: centerX,
            clientY: centerY,
            deltaX: params.deltaX,
            deltaY: params.deltaY,
            deltaMode: 0,
            ctrlKey: params.ctrlKey ?? false,
          }),
        );
      };

      const ensureZoomHeadroom = async () => {
        const currentTransform = readTransform();
        if (currentTransform.zoom < 9.5) {
          return;
        }
        const resetZoomButton = Array.from(
          document.querySelectorAll("button"),
        ).find((button) => {
          const ariaLabel = (button.getAttribute("aria-label") ?? "").trim();
          const text = (button.textContent ?? "").trim();
          return (
            ariaLabel.toLowerCase() === "reset zoom" ||
            text.toLowerCase() === "reset zoom"
          );
        });
        if (!(resetZoomButton instanceof HTMLButtonElement)) {
          return;
        }
        resetZoomButton.click();
        await sleep(120);
      };

      const measureInteraction = async (
        runWheelSequence: () => Promise<number>,
      ): Promise<InteractionFrameMetrics> => {
        const frameTimestamps: number[] = [];
        let sampleActive = true;

        const sampleFrame = (timestamp: number) => {
          frameTimestamps.push(timestamp);
          if (sampleActive) {
            requestAnimationFrame(sampleFrame);
          }
        };

        requestAnimationFrame(sampleFrame);
        await sleep(32);

        const transformBefore = readTransform();
        const interactionStart = performance.now();
        const eventCount = await runWheelSequence();
        const interactionEnd = performance.now();

        await sleep(settleMs);
        sampleActive = false;
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });

        const transformAfter = readTransform();
        const sampledIntervals: number[] = [];

        for (let index = 1; index < frameTimestamps.length; index += 1) {
          const interval = frameTimestamps[index] - frameTimestamps[index - 1];
          const intervalEndTimestamp = frameTimestamps[index];
          if (intervalEndTimestamp < interactionStart) {
            continue;
          }
          if (intervalEndTimestamp > interactionEnd + settleMs) {
            continue;
          }
          if (!Number.isFinite(interval) || interval <= 0) {
            continue;
          }
          sampledIntervals.push(interval);
        }

        const fpsSamples = sampledIntervals.map((interval) => 1000 / interval);
        const firstFrameAfterStart =
          frameTimestamps.find((timestamp) => timestamp >= interactionStart) ?? null;
        const firstFrameAfterEnd =
          frameTimestamps.find((timestamp) => timestamp >= interactionEnd) ?? null;

        return {
          eventCount,
          frameCount: sampledIntervals.length,
          sampleWindowMs: Number((interactionEnd - interactionStart).toFixed(3)),
          frameTimeP50Ms: percentile(sampledIntervals, 0.5),
          frameTimeP95Ms: percentile(sampledIntervals, 0.95),
          fpsP50: percentile(fpsSamples, 0.5),
          fpsP95: percentile(fpsSamples, 0.95),
          droppedFrameCount: sampledIntervals.filter((interval) => interval > 20).length,
          longFrameCount: sampledIntervals.filter((interval) => interval > 50).length,
          startHitchMs:
            firstFrameAfterStart === null
              ? 0
              : Number((firstFrameAfterStart - interactionStart).toFixed(3)),
          stopHitchMs:
            firstFrameAfterEnd === null
              ? 0
              : Number((firstFrameAfterEnd - interactionEnd).toFixed(3)),
          transformDelta: {
            x: Number((transformAfter.x - transformBefore.x).toFixed(3)),
            y: Number((transformAfter.y - transformBefore.y).toFixed(3)),
            zoom: Number((transformAfter.zoom - transformBefore.zoom).toFixed(3)),
          },
        };
      };

      const pan = await measureInteraction(async () => {
        for (let index = 0; index < panEventCount; index += 1) {
          dispatchWheel({ deltaX: 24, deltaY: 18 });
          await sleep(eventIntervalMs);
        }
        return panEventCount;
      });

      await ensureZoomHeadroom();
      const flowStoreModule = await import("/src/forks/xyflow/core/store");
      const reactFlowStore = (flowStoreModule as {
        useReactFlow?: {
          setState: (nextState: { zoomActivationKeyPressed: boolean }) => void;
        };
      }).useReactFlow;
      if (!reactFlowStore || typeof reactFlowStore.setState !== "function") {
        throw new Error("Missing react-flow store for zoom activation measurements.");
      }

      reactFlowStore.setState({ zoomActivationKeyPressed: true });
      await sleep(60);
      const zoom = await measureInteraction(async () => {
        for (let index = 0; index < zoomEventCount; index += 1) {
          dispatchWheel({ deltaX: 0, deltaY: -55 });
          await sleep(eventIntervalMs);
        }
        return zoomEventCount;
      });
      reactFlowStore.setState({ zoomActivationKeyPressed: false });
      await sleep(40);

      let zoomMethod: InteractionBenchmarkMetrics["zoomMethod"] =
        "wheel_with_zoom_activation_key";
      let zoomMetrics = zoom;
      if (Math.abs(zoomMetrics.transformDelta.zoom) <= 0.01) {
        const zoomInButton = Array.from(
          document.querySelectorAll("button"),
        ).find((button) => {
          const ariaLabel = (button.getAttribute("aria-label") ?? "").trim();
          const text = (button.textContent ?? "").trim();
          return (
            ariaLabel.toLowerCase() === "zoom in" ||
            text.toLowerCase() === "zoom in"
          );
        });
        if (!(zoomInButton instanceof HTMLButtonElement)) {
          throw new Error(
            "Unable to locate zoom-in button for fallback interaction metrics.",
          );
        }
        const fallbackEventCount = Math.max(16, Math.floor(zoomEventCount / 2));
        zoomMetrics = await measureInteraction(async () => {
          for (let index = 0; index < fallbackEventCount; index += 1) {
            zoomInButton.click();
            await sleep(eventIntervalMs);
          }
          return fallbackEventCount;
        });
        zoomMethod = "zoom_in_controls_fallback";
      }

      return { pan, zoom: zoomMetrics, zoomMethod };
    },
    {
      panEventCount: PAN_EVENT_COUNT,
      zoomEventCount: ZOOM_EVENT_COUNT,
      eventIntervalMs: EVENT_INTERVAL_MS,
      settleMs: FRAME_SETTLE_MS,
    },
  );
}

function assertInteractionMetrics(metrics: InteractionBenchmarkMetrics): void {
  expect(metrics.pan.eventCount).toBe(PAN_EVENT_COUNT);
  expect(metrics.pan.frameCount).toBeGreaterThan(10);
  expect(metrics.pan.frameTimeP50Ms).toBeGreaterThan(0);
  expect(metrics.pan.frameTimeP95Ms).toBeGreaterThan(0);
  expect(metrics.pan.fpsP50).toBeGreaterThan(0);
  expect(metrics.pan.fpsP95).toBeGreaterThan(0);
  expect(metrics.pan.startHitchMs).toBeGreaterThanOrEqual(0);
  expect(metrics.pan.stopHitchMs).toBeGreaterThanOrEqual(0);
  expect(
    Math.abs(metrics.pan.transformDelta.x) + Math.abs(metrics.pan.transformDelta.y),
  ).toBeGreaterThan(10);

  if (metrics.zoomMethod === "wheel_with_zoom_activation_key") {
    expect(metrics.zoom.eventCount).toBe(ZOOM_EVENT_COUNT);
  } else {
    expect(metrics.zoom.eventCount).toBeGreaterThanOrEqual(16);
    expect(metrics.zoom.eventCount).toBeLessThan(ZOOM_EVENT_COUNT);
  }
  expect(metrics.zoom.frameCount).toBeGreaterThan(10);
  expect(metrics.zoom.frameTimeP50Ms).toBeGreaterThan(0);
  expect(metrics.zoom.frameTimeP95Ms).toBeGreaterThan(0);
  expect(metrics.zoom.fpsP50).toBeGreaterThan(0);
  expect(metrics.zoom.fpsP95).toBeGreaterThan(0);
  expect(metrics.zoom.startHitchMs).toBeGreaterThanOrEqual(0);
  expect(metrics.zoom.stopHitchMs).toBeGreaterThanOrEqual(0);
  expect(Math.abs(metrics.zoom.transformDelta.zoom)).toBeGreaterThan(0.01);
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
