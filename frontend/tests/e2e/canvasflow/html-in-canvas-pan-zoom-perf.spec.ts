import { expect, test, type CDPSession, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  getCurrentProjectConfigId,
  openIsolatedProject,
} from "../helpers";

const CANVAS_SELECTOR = ".canvas-flow__canvas";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const DEFAULT_COUNTS = [100, 500, 1000, 2500, 3000];
const DEFAULT_STEPS = 36;
const NODE_WIDTH = 260;
const NODE_HEIGHT = 120;
const NODE_GAP_X = 340;
const NODE_GAP_Y = 190;
const CREATE_CHUNK_SIZE = 100;
const DEFAULT_START_VIEWPORT = { x: 80, y: 80, zoom: 1 };
const DEFAULT_ISOLATION_VARIANTS = [
  "default",
  "no-edges",
  "rect-nodes",
  "skip-transform",
  "minimap-off",
  "resize-observer-off",
] as const;
const CANVAS_FLOW_PERF_VARIANTS = [
  ...DEFAULT_ISOLATION_VARIANTS,
  "snapshot-cache",
] as const;
const PERF_TARGETS = ["seeded-textblocks", "settings-all"] as const;
const TRACE_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "blink",
  "cc",
  "toplevel",
].join(",");

type CanvasStats = {
  drawElementImageMs: number;
  drawnNodes: number;
  edgeCount: number;
  edgeDrawMs: number;
  mountedNodes: number;
  paintSequence: number;
  registeredNodes: number;
  snapshotCacheHits: number;
  snapshotCacheMisses: number;
  snapshotCaptureMs: number;
  totalPaintMs: number;
  transformAssignmentMs: number;
  viewportDurableSyncs: number;
  viewportFinalizes: number;
  viewportX: number;
  viewportY: number;
  viewportZoom: number;
  visibleNodes: number;
  visibilityScanMs: number;
};

type GestureMetrics = {
  averageInputLatencyMs: number;
  defaultPreventedCount: number;
  durationMs: number;
  firstInputLatencyMs: number;
  fps: number;
  frames: number;
  lastInputLatencyMs: number;
  p95InputLatencyMs: number;
  settleLatencyMs: number;
  settleTimedOut: boolean;
  timedOutPaints: number;
};

type PerformanceSnapshot = {
  jsHeapUsedMb: number;
  layoutDurationMs: number;
  recalcStyleDurationMs: number;
  scriptDurationMs: number;
  taskDurationMs: number;
};

type TraceSummary = {
  compositeMs: number;
  paintMs: number;
};

type MeasuredGesture = GestureMetrics & {
  afterStats: CanvasStats;
  beforeStats: CanvasStats;
  performanceDelta: PerformanceSnapshot;
  traceSummary: TraceSummary;
};

type MatrixResult = {
  count: number;
  initialStats: CanvasStats;
  pan: MeasuredGesture;
  variant: CanvasFlowPerfVariant;
  zoom: MeasuredGesture;
};

type SeededPerfProject = {
  count: number;
  projectConfigId: string;
  projectName: string;
};
type CanvasFlowStartViewport = typeof DEFAULT_START_VIEWPORT;
type CanvasFlowPerfVariant = (typeof CANVAS_FLOW_PERF_VARIANTS)[number];
type CanvasFlowPerfTarget = (typeof PERF_TARGETS)[number];
type CanvasFlowSupportOptions = {
  requireCaptureElementImage?: boolean;
};

test.skip(
  process.env.SETTA_CANVASFLOW_PERF !== "1",
  "CanvasFlow pan/zoom perf matrix is opt-in. Set SETTA_CANVASFLOW_PERF=1.",
);

test("records CanvasFlow pan and zoom performance matrix", async ({ page }) => {
  test.setTimeout(20 * 60 * 1000);

  const counts = parseCounts(
    process.env.SETTA_CANVASFLOW_PERF_COUNTS,
    DEFAULT_COUNTS,
  );
  const steps = parsePositiveInteger(
    process.env.SETTA_CANVASFLOW_PERF_STEPS,
    DEFAULT_STEPS,
  );
  const variants = parseVariants(process.env.SETTA_CANVASFLOW_PERF_VARIANTS);
  const startViewport = parseStartViewport({
    x: process.env.SETTA_CANVASFLOW_PERF_START_X,
    y: process.env.SETTA_CANVASFLOW_PERF_START_Y,
    zoom: process.env.SETTA_CANVASFLOW_PERF_START_ZOOM,
  });
  const target = parsePerfTarget(process.env.SETTA_CANVASFLOW_PERF_TARGET);
  const supportOptions = {
    requireCaptureElementImage: variants.includes("snapshot-cache"),
  };
  const results: MatrixResult[] = [];

  await page.setViewportSize({ width: 1400, height: 900 });
  await ensureAppReady(page);
  await forceCanvasFlowZoomOnWheel(page);
  await assertCanvasFlowSupport(page, supportOptions);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");

  if (target === "settings-all") {
    const count = await gotoSettingsAllView(page, supportOptions);
    const settingsStartViewport = shouldCenterStartViewportOnCurrentView()
      ? await resolveCenteredStartViewport(page, startViewport.zoom)
      : startViewport;
    for (const variant of variants) {
      results.push(
        await measureCurrentCanvasFlowProject(
          page,
          cdp,
          count,
          steps,
          settingsStartViewport,
          variant,
        ),
      );
    }

    await writeMatrixReport(results, {
      counts: [count],
      datasetDescription:
        "- Dataset: Settings project, All Settings view loaded through the normal settings-project materialization path, using real rich settings `SectionContainer` node bodies and current canvas culling.",
      startViewport: settingsStartViewport,
      steps,
      target,
      usedSeededProjects: false,
      variants,
    });

    assertMatrixResults(results, steps);
    return;
  }

  const seededProjects = await findSeededCanvasFlowPerfProjects(page, counts);

  if (seededProjects.size === counts.length) {
    for (const count of counts) {
      const project = seededProjects.get(count);
      if (!project) {
        throw new Error(`Missing seeded CanvasFlow perf project for ${count}.`);
      }
      await gotoSeededCanvasFlowPerfProject(page, project);
      await forceCanvasFlowZoomOnWheel(page);
      await assertCanvasFlowSupport(page, supportOptions);
      for (const variant of variants) {
        results.push(
          await measureCurrentCanvasFlowProject(
            page,
            cdp,
            count,
            steps,
            startViewport,
            variant,
          ),
        );
      }
    }
  } else {
    const projectContext = await openIsolatedProject(page);
    let createdSyntheticCount = 0;
    let currentNodeCount = await readCanvasNodeCount(page);

    try {
      for (const count of counts) {
        if (count > currentNodeCount) {
          const nextSyntheticCount =
            createdSyntheticCount + (count - currentNodeCount);
          await createSyntheticTextBlockSections(page, {
            fromIndex: createdSyntheticCount,
            layoutCount: count,
            projectConfigId: projectContext.projectConfigId,
            toIndex: nextSyntheticCount,
          });
          createdSyntheticCount = nextSyntheticCount;
          currentNodeCount = count;
        }
        for (const variant of variants) {
          results.push(
            await measureCurrentCanvasFlowProject(
              page,
              cdp,
              count,
              steps,
              startViewport,
              variant,
            ),
          );
        }
      }
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  }

  await writeMatrixReport(results, {
    counts,
    datasetDescription:
      seededProjects.size === counts.length
        ? "- Dataset: Go-seeded TextBlock perf projects loaded by the normal backend project-state path, using real `SectionContainer` wrappers, simple TextBlock node bodies, the active CanvasFlow renderer, and current canvas culling."
        : "- Dataset: backend-created TextBlock sections hydrated through the normal frontend project update path, using real `SectionContainer` wrappers, simple TextBlock node bodies, the active CanvasFlow renderer, and current canvas culling.",
    startViewport,
    steps,
    target,
    usedSeededProjects: seededProjects.size === counts.length,
    variants,
  });

  assertMatrixResults(results, steps);
});

function assertMatrixResults(results: MatrixResult[], steps: number) {
  for (const result of results) {
    expect(result.initialStats.registeredNodes).toBe(result.count);
    expect(result.pan.frames).toBe(steps);
    expect(result.zoom.frames).toBe(steps);
    expect(result.pan.afterStats.drawnNodes).toBeGreaterThan(0);
    expect(result.zoom.afterStats.drawnNodes).toBeGreaterThan(0);
  }
}

async function measureCurrentCanvasFlowProject(
  page: Page,
  cdp: CDPSession,
  count: number,
  steps: number,
  startViewport: CanvasFlowStartViewport,
  variant: CanvasFlowPerfVariant,
): Promise<MatrixResult> {
  await waitForCanvasGraph(page, count);
  await setCanvasFlowPerfVariant(page, variant);

  await setCanvasViewport(page, startViewport);
  const initialStats = await readCanvasStats(page);

  const pan = await measureGesture(page, cdp, "pan", steps);
  await setCanvasViewport(page, startViewport);
  const zoom = await measureGesture(page, cdp, "zoom", steps);

  return { count, initialStats, pan, variant, zoom };
}

function parseCounts(value: string | undefined, fallback: number[]): number[] {
  if (!value?.trim()) {
    return fallback;
  }
  const counts = value
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((count) => Number.isInteger(count) && count > 0);
  if (counts.length === 0) {
    throw new Error(`Invalid SETTA_CANVASFLOW_PERF_COUNTS: ${value}`);
  }
  return counts;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value?.trim()) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got ${value}`);
  }
  return parsed;
}

function parseStartViewport({
  x,
  y,
  zoom,
}: {
  x: string | undefined;
  y: string | undefined;
  zoom: string | undefined;
}): CanvasFlowStartViewport {
  return {
    x: parseFiniteNumber(
      x,
      DEFAULT_START_VIEWPORT.x,
      "SETTA_CANVASFLOW_PERF_START_X",
    ),
    y: parseFiniteNumber(
      y,
      DEFAULT_START_VIEWPORT.y,
      "SETTA_CANVASFLOW_PERF_START_Y",
    ),
    zoom: parsePositiveNumber(
      zoom,
      DEFAULT_START_VIEWPORT.zoom,
      "SETTA_CANVASFLOW_PERF_START_ZOOM",
    ),
  };
}

function parseFiniteNumber(
  value: string | undefined,
  fallback: number,
  label: string,
) {
  if (!value?.trim()) {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected ${label} to be a finite number, got ${value}`);
  }
  return parsed;
}

function parsePositiveNumber(
  value: string | undefined,
  fallback: number,
  label: string,
) {
  const parsed = parseFiniteNumber(value, fallback, label);
  if (parsed <= 0) {
    throw new Error(`Expected ${label} to be positive, got ${value}`);
  }
  return parsed;
}

function parsePerfTarget(value: string | undefined): CanvasFlowPerfTarget {
  if (!value?.trim()) {
    return "seeded-textblocks";
  }
  const target = value.trim();
  if (PERF_TARGETS.includes(target as CanvasFlowPerfTarget)) {
    return target as CanvasFlowPerfTarget;
  }
  throw new Error(`Invalid SETTA_CANVASFLOW_PERF_TARGET: ${value}`);
}

function shouldCenterStartViewportOnCurrentView() {
  return Boolean(
    process.env.SETTA_CANVASFLOW_PERF_START_ZOOM?.trim() &&
      !process.env.SETTA_CANVASFLOW_PERF_START_X?.trim() &&
      !process.env.SETTA_CANVASFLOW_PERF_START_Y?.trim(),
  );
}

function parseVariants(value: string | undefined): CanvasFlowPerfVariant[] {
  if (!value?.trim()) {
    return process.env.SETTA_CANVASFLOW_PERF_ISOLATION === "1"
      ? [...DEFAULT_ISOLATION_VARIANTS]
      : ["default"];
  }
  const requested = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const invalid = requested.filter(
    (variant) =>
      !CANVAS_FLOW_PERF_VARIANTS.includes(variant as CanvasFlowPerfVariant),
  );
  if (invalid.length > 0) {
    throw new Error(
      `Invalid SETTA_CANVASFLOW_PERF_VARIANTS: ${invalid.join(", ")}`,
    );
  }
  return requested as CanvasFlowPerfVariant[];
}

async function findSeededCanvasFlowPerfProjects(
  page: Page,
  counts: number[],
): Promise<Map<number, SeededPerfProject>> {
  const projects = await page.evaluate(async (targetCounts) => {
    const { callOpenAPI, res200 } = await import(
      "/tests/e2e/browserAppSubsystemSdk.ts"
    );
    const { loadAllProjectMetadata } = await import("/src/openapi/http");
    const response = await callOpenAPI(loadAllProjectMetadata());
    if (!res200(response)) {
      throw new Error(
        `Failed to load project metadata for CanvasFlow perf projects: ${response.status}`,
      );
    }
    const metadata = response.data as {
      projectMetadata?: Array<{ id?: string; name?: string }>;
    };
    const targetNames = new Map(
      targetCounts.map((count) => [`canvasflow_perf_${count}`, count]),
    );
    const matches: SeededPerfProject[] = [];
    for (const entry of metadata.projectMetadata ?? []) {
      if (!entry.id || !entry.name) {
        continue;
      }
      const count = targetNames.get(entry.name);
      if (!count) {
        continue;
      }
      matches.push({
        count,
        projectConfigId: entry.id,
        projectName: entry.name,
      });
    }
    return matches;
  }, counts);
  return new Map(projects.map((project) => [project.count, project]));
}

async function gotoSeededCanvasFlowPerfProject(
  page: Page,
  project: SeededPerfProject,
) {
  const currentUrl = new URL(page.url());
  const targetUrl = new URL(`/${project.projectName}`, currentUrl.origin);
  const backendOrigin = currentUrl.searchParams.get("__setta_backend_origin");
  if (backendOrigin) {
    targetUrl.searchParams.set("__setta_backend_origin", backendOrigin);
  }
  await page.goto(targetUrl.toString(), { waitUntil: "domcontentloaded" });
  await expect(page.locator(CANVAS_SELECTOR)).toBeVisible({ timeout: 180000 });
  await expect
    .poll(async () => await getCurrentProjectConfigId(page), {
      timeout: 180000,
    })
    .toBe(project.projectConfigId);
}

async function gotoSettingsAllView(
  page: Page,
  supportOptions: CanvasFlowSupportOptions,
): Promise<number> {
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await expect(page.locator(CANVAS_SELECTOR)).toBeVisible({ timeout: 180000 });
  await forceCanvasFlowZoomOnWheel(page);
  await assertCanvasFlowSupport(page, supportOptions);

  const allSettingsTab = page.getByRole("button", {
    exact: true,
    name: "All Settings",
  });
  await expect(allSettingsTab).toBeVisible({ timeout: 180000 });
  await allSettingsTab.click();

  await expect
    .poll(
      async () => {
        return await page.evaluate((selector) => {
          const canvas = document.querySelector<HTMLCanvasElement>(selector);
          (
            canvas as (HTMLCanvasElement & { requestPaint?: () => void }) | null
          )?.requestPaint?.();
          const registeredNodes = Number.parseInt(
            canvas?.dataset.registeredNodes ?? "0",
            10,
          );
          return Number.isFinite(registeredNodes) ? registeredNodes : 0;
        }, CANVAS_SELECTOR);
      },
      { timeout: 180000 },
    )
    .toBeGreaterThan(13);

  await flushCanvasPaint(page);
  return (await readCanvasStats(page)).registeredNodes;
}

async function resolveCenteredStartViewport(
  page: Page,
  zoom: number,
): Promise<CanvasFlowStartViewport> {
  return await page.evaluate(
    async ({ selector, targetZoom }) => {
      const { useReactFlow } = await import(
        "/src/forks/xyflow/core/store/index.ts"
      );
      const canvas = document.querySelector<HTMLCanvasElement>(selector);
      if (!canvas) {
        throw new Error("Missing CanvasFlow canvas.");
      }
      const rect = canvas.getBoundingClientRect();
      const [currentX, currentY, currentZoom] =
        useReactFlow.getState().transform;
      const safeCurrentZoom =
        Number.isFinite(currentZoom) && currentZoom > 0 ? currentZoom : 1;
      const centerWorldX = (rect.width / 2 - currentX) / safeCurrentZoom;
      const centerWorldY = (rect.height / 2 - currentY) / safeCurrentZoom;
      return {
        x: rect.width / 2 - centerWorldX * targetZoom,
        y: rect.height / 2 - centerWorldY * targetZoom,
        zoom: targetZoom,
      };
    },
    { selector: CANVAS_SELECTOR, targetZoom: zoom },
  );
}

async function forceCanvasFlowZoomOnWheel(page: Page) {
  await page.evaluate(async () => {
    const { useSettings } = await import("/src/state/definitions.ts");
    useSettings.setState((state) => ({
      gui: {
        ...state.gui,
        panOnScroll: false,
        zoomOnScroll: true,
      },
    }));
  });
}

async function assertCanvasFlowSupport(
  page: Page,
  options: CanvasFlowSupportOptions,
) {
  await expect(page.locator(CANVAS_SELECTOR)).toBeVisible();
  const support = await page.evaluate((selector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    if (canvas) {
      canvas.dataset.canvasFlowDiagnostics = "enabled";
    }
    const ctx = canvas?.getContext("2d") as
      | (CanvasRenderingContext2D & {
          drawElementImage?: unknown;
        })
      | null
      | undefined;
    return {
      captureElementImage: typeof (
        canvas as { captureElementImage?: unknown } | null
      )?.captureElementImage,
      drawElementImage: typeof ctx?.drawElementImage,
      requestPaint: typeof (canvas as { requestPaint?: unknown } | null)
        ?.requestPaint,
      layoutSubtree: canvas ? "layoutSubtree" in canvas : false,
      reactFlowViewportCount: document.querySelectorAll(".react-flow__viewport")
        .length,
      svgEdgeLayerCount: document.querySelectorAll("svg.react-flow__edges")
        .length,
    };
  }, CANVAS_SELECTOR);
  expect(support.drawElementImage).toBe("function");
  expect(support.requestPaint).toBe("function");
  if (options.requireCaptureElementImage) {
    expect(support.captureElementImage).toBe("function");
  }
  expect(support.layoutSubtree).toBe(true);
  expect(support.reactFlowViewportCount).toBe(0);
  expect(support.svgEdgeLayerCount).toBe(0);
}

async function setCanvasFlowPerfVariant(
  page: Page,
  variant: CanvasFlowPerfVariant,
) {
  await page.evaluate(async (nextVariant) => {
    const windowRef = window as typeof window & {
      __settaCanvasFlowPerfDisableResizeObserver?: boolean;
      __settaCanvasFlowPerfVariant?: string;
    };
    const paintVariantByIsolationVariant: Record<string, string | undefined> = {
      default: undefined,
      "minimap-off": undefined,
      "no-edges": "no-edges",
      "rect-nodes": "rect-nodes",
      "resize-observer-off": undefined,
      "skip-transform": "skip-transform",
      "snapshot-cache": "snapshot-cache",
    };
    const paintVariant = paintVariantByIsolationVariant[nextVariant];
    if (paintVariant) {
      windowRef.__settaCanvasFlowPerfVariant = paintVariant;
    } else {
      delete windowRef.__settaCanvasFlowPerfVariant;
    }
    windowRef.__settaCanvasFlowPerfDisableResizeObserver =
      nextVariant === "resize-observer-off";

    const { useLocalStorage } = await import("/src/state/definitions.ts");
    useLocalStorage.setState({
      showMinimap: nextVariant !== "minimap-off",
    });
  }, variant);
  await flushCanvasPaint(page);
}

async function createSyntheticTextBlockSections(
  page: Page,
  payload: {
    fromIndex: number;
    layoutCount: number;
    projectConfigId: string;
    toIndex: number;
  },
) {
  for (
    let chunkStart = payload.fromIndex;
    chunkStart < payload.toIndex;
    chunkStart += CREATE_CHUNK_SIZE
  ) {
    const chunkEnd = Math.min(chunkStart + CREATE_CHUNK_SIZE, payload.toIndex);
    const operations = Array.from(
      { length: chunkEnd - chunkStart },
      (_, offset) => {
        const index = chunkStart + offset;
        const columns = Math.ceil(Math.sqrt(payload.layoutCount));
        const row = Math.floor(index / columns);
        const column = index % columns;
        return {
          controlCodeObjType: null,
          implOverrides: {
            size: {
              height: NODE_HEIGHT,
              width: NODE_WIDTH,
            },
            text: `CanvasFlow performance node ${index}`,
            textDisplayMode: "Render",
            type: "TextBlock",
          },
          implType: "TextBlock",
          name: `Perf ${index}`,
          position: {
            x: column * NODE_GAP_X,
            y: row * NODE_GAP_Y,
          },
          topLevelSections: null,
          viewportBounds: null,
        };
      },
    );
    await page.evaluate(
      async ({ operations, projectConfigId }) => {
        const { callOpenAPI, res200 } = await import(
          "/tests/e2e/browserAppSubsystemSdk.ts"
        );
        const { createTopLevelSection, getLatestProjectState } = await import(
          "/src/openapi/http"
        );
        const { getCurrProjectConfigId, processProjectStateUpdateFromBackend } =
          await import("/src/state/actions/sectionInfos.ts");
        if (getCurrProjectConfigId() !== projectConfigId) {
          throw new Error(
            `Active project mismatch while seeding CanvasFlow perf graph: expected ${projectConfigId}.`,
          );
        }
        const responses = await Promise.all(
          operations.map((operation) =>
            callOpenAPI(
              createTopLevelSection({
                body: {
                  projectConfigId,
                  ...operation,
                },
              }),
            ),
          ),
        );
        for (const response of responses) {
          if (!res200(response)) {
            throw new Error(
              `Failed CanvasFlow perf section creation: ${response.status}`,
            );
          }
        }
        const latestProjectStateResponse = await callOpenAPI(
          getLatestProjectState({
            body: { projectConfigId },
          }),
        );
        if (!res200(latestProjectStateResponse)) {
          throw new Error(
            `Failed CanvasFlow perf hydration: ${latestProjectStateResponse.status}`,
          );
        }
        processProjectStateUpdateFromBackend(latestProjectStateResponse.data);
      },
      { operations, projectConfigId: payload.projectConfigId },
    );
  }
}

async function readCanvasNodeCount(page: Page) {
  return await page.evaluate(() => {
    return document.querySelectorAll(".canvas-flow__node").length;
  });
}

async function waitForCanvasGraph(page: Page, count: number) {
  const timeout = Math.max(30000, Math.min(180000, count * 80));
  await expect
    .poll(
      async () => {
        return await page.evaluate(
          ({ expectedCount, selector }) => {
            const canvas = document.querySelector<HTMLCanvasElement>(selector);
            (
              canvas as
                | (HTMLCanvasElement & { requestPaint?: () => void })
                | null
            )?.requestPaint?.();
            const drawnNodes = Number.parseInt(
              canvas?.dataset.drawnNodes ?? "0",
              10,
            );
            const nodeCount =
              document.querySelectorAll(".canvas-flow__node").length;
            const registeredNodes = Number.parseInt(
              canvas?.dataset.registeredNodes ?? "0",
              10,
            );
            return (
              registeredNodes === expectedCount &&
              nodeCount > 0 &&
              drawnNodes > 0
            );
          },
          { expectedCount: count, selector: CANVAS_SELECTOR },
        );
      },
      { timeout },
    )
    .toBe(true);
  await flushCanvasPaint(page);
}

async function setCanvasViewport(
  page: Page,
  viewport: { x: number; y: number; zoom: number },
) {
  await page.evaluate(async (nextViewport) => {
    const { useReactFlow } = await import(
      "/src/forks/xyflow/core/store/index.ts"
    );
    useReactFlow.setState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      transform: [nextViewport.x, nextViewport.y, nextViewport.zoom],
    });
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".canvas-flow__canvas",
    );
    (
      canvas as (HTMLCanvasElement & { requestPaint?: () => void }) | null
    )?.requestPaint?.();
  }, viewport);
  await flushCanvasPaint(page);
}

async function flushCanvasPaint(page: Page) {
  await page.evaluate(async (selector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    if (!canvas) {
      throw new Error("Missing CanvasFlow canvas.");
    }
    const currentSequence = readPaintSequence(canvas);
    (
      canvas as HTMLCanvasElement & { requestPaint?: () => void }
    ).requestPaint?.();
    await waitForPaintAfter(canvas, currentSequence);

    function readPaintSequence(target: HTMLCanvasElement) {
      const sequence = Number.parseInt(target.dataset.paintSequence ?? "0", 10);
      return Number.isFinite(sequence) ? sequence : 0;
    }

    async function waitForPaintAfter(
      target: HTMLCanvasElement,
      previousSequence: number,
    ) {
      const deadline = performance.now() + 2000;
      while (performance.now() < deadline) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        if (readPaintSequence(target) > previousSequence) {
          return;
        }
      }
    }
  }, CANVAS_SELECTOR);
}

async function readCanvasStats(page: Page): Promise<CanvasStats> {
  return await page.locator(CANVAS_SELECTOR).evaluate((canvas) => {
    const dataset = (canvas as HTMLCanvasElement).dataset;
    return {
      drawElementImageMs: readNumber(dataset.drawElementImageMs),
      drawnNodes: readNumber(dataset.drawnNodes),
      edgeCount: readNumber(dataset.edgeCount),
      edgeDrawMs: readNumber(dataset.edgeDrawMs),
      mountedNodes: readNumber(dataset.mountedNodes),
      paintSequence: readNumber(dataset.paintSequence),
      registeredNodes: readNumber(dataset.registeredNodes),
      snapshotCacheHits: readNumber(dataset.snapshotCacheHits),
      snapshotCacheMisses: readNumber(dataset.snapshotCacheMisses),
      snapshotCaptureMs: readNumber(dataset.snapshotCaptureMs),
      totalPaintMs: readNumber(dataset.totalPaintMs),
      transformAssignmentMs: readNumber(dataset.transformAssignmentMs),
      viewportDurableSyncs: readNumber(dataset.viewportDurableSyncs),
      viewportFinalizes: readNumber(dataset.viewportFinalizes),
      viewportX: readNumber(dataset.viewportX),
      viewportY: readNumber(dataset.viewportY),
      viewportZoom: readNumber(dataset.viewportZoom),
      visibleNodes: readNumber(dataset.visibleNodes),
      visibilityScanMs: readNumber(dataset.visibilityScanMs),
    };

    function readNumber(value: string | undefined) {
      const parsed = Number.parseFloat(value ?? "0");
      return Number.isFinite(parsed) ? parsed : 0;
    }
  });
}

async function measureGesture(
  page: Page,
  cdp: CDPSession,
  kind: "pan" | "zoom",
  steps: number,
): Promise<MeasuredGesture> {
  const beforeStats = await readCanvasStats(page);
  const beforePerformance = await readPerformanceSnapshot(cdp);
  const traceComplete = waitForTraceComplete(cdp);
  await cdp.send("Tracing.start", {
    categories: TRACE_CATEGORIES,
    transferMode: "ReturnAsStream",
  });

  const gesture = await page.evaluate(
    async ({ kind: gestureKind, selector, steps: gestureSteps }) => {
      const { useReactFlow } = await import(
        "/src/forks/xyflow/core/store/index.ts"
      );
      const canvas = document.querySelector<HTMLCanvasElement>(selector);
      if (!canvas) {
        throw new Error("Missing CanvasFlow canvas.");
      }
      const rect = canvas.getBoundingClientRect();
      const startX = rect.left + rect.width * 0.74;
      const startY = rect.top + rect.height * 0.62;
      const latencies: number[] = [];
      let defaultPreventedCount = 0;
      let timedOutPaints = 0;
      let settleLatencyMs = 0;
      let settleTimedOut = false;
      const startTime = performance.now();
      let lastSamplePaintTime = startTime;

      if (gestureKind === "pan") {
        const pointerId = 9101;
        const originalSetPointerCapture = canvas.setPointerCapture;
        const originalReleasePointerCapture = canvas.releasePointerCapture;
        canvas.setPointerCapture = () => undefined;
        canvas.releasePointerCapture = () => undefined;
        try {
          canvas.dispatchEvent(
            new PointerEvent("pointerdown", {
              bubbles: true,
              button: 0,
              buttons: 1,
              cancelable: true,
              clientX: startX,
              clientY: startY,
              isPrimary: true,
              pointerId,
              pointerType: "mouse",
            }),
          );
          for (let index = 0; index < gestureSteps; index += 1) {
            const previousSequence = readPaintSequence(canvas);
            const eventStart = performance.now();
            canvas.dispatchEvent(
              new PointerEvent("pointermove", {
                bubbles: true,
                buttons: 1,
                cancelable: true,
                clientX: startX - (index + 1) * 24,
                clientY: startY + Math.sin(index / 4) * 12,
                isPrimary: true,
                pointerId,
                pointerType: "mouse",
              }),
            );
            const paintResult = await waitForPaintAfter(
              canvas,
              previousSequence,
            );
            latencies.push(paintResult.time - eventStart);
            lastSamplePaintTime = paintResult.time;
            if (paintResult.timedOut) {
              timedOutPaints += 1;
            }
          }
          const settleStart = performance.now();
          canvas.dispatchEvent(
            new PointerEvent("pointerup", {
              bubbles: true,
              button: 0,
              buttons: 0,
              cancelable: true,
              clientX: startX - gestureSteps * 24,
              clientY: startY,
              isPrimary: true,
              pointerId,
              pointerType: "mouse",
            }),
          );
          const settleResult = await waitForViewportInteractionEnd(
            useReactFlow,
            500,
          );
          settleLatencyMs =
            Math.max(settleResult.time, getLastPaintTime(canvas)) - settleStart;
          settleTimedOut = settleResult.timedOut;
        } finally {
          canvas.setPointerCapture = originalSetPointerCapture;
          canvas.releasePointerCapture = originalReleasePointerCapture;
        }
      } else {
        for (let index = 0; index < gestureSteps; index += 1) {
          const previousSequence = readPaintSequence(canvas);
          const eventStart = performance.now();
          const event = new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: startX,
            clientY: startY,
            deltaMode: WheelEvent.DOM_DELTA_PIXEL,
            deltaY: index % 2 === 0 ? -72 : 68,
          });
          canvas.dispatchEvent(event);
          if (event.defaultPrevented) {
            defaultPreventedCount += 1;
          }
          const paintResult = await waitForPaintAfter(canvas, previousSequence);
          latencies.push(paintResult.time - eventStart);
          lastSamplePaintTime = paintResult.time;
          if (paintResult.timedOut) {
            timedOutPaints += 1;
          }
        }
        const settleStart = performance.now();
        const settleResult = await waitForViewportInteractionEnd(
          useReactFlow,
          650,
        );
        settleLatencyMs = settleResult.time - settleStart;
        settleTimedOut = settleResult.timedOut;
      }

      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const durationMs = Math.max(1, lastSamplePaintTime - startTime);
      const sortedLatencies = [...latencies].sort(
        (left, right) => left - right,
      );
      const p95Index = Math.max(
        0,
        Math.ceil(sortedLatencies.length * 0.95) - 1,
      );
      return {
        averageInputLatencyMs:
          latencies.reduce((sum, value) => sum + value, 0) /
          Math.max(1, latencies.length),
        defaultPreventedCount,
        durationMs,
        firstInputLatencyMs: latencies[0] ?? 0,
        fps: (latencies.length / durationMs) * 1000,
        frames: latencies.length,
        lastInputLatencyMs: latencies[latencies.length - 1] ?? 0,
        p95InputLatencyMs: sortedLatencies[p95Index] ?? 0,
        settleLatencyMs,
        settleTimedOut,
        timedOutPaints,
      };

      function readPaintSequence(target: HTMLCanvasElement) {
        const sequence = Number.parseInt(
          target.dataset.paintSequence ?? "0",
          10,
        );
        return Number.isFinite(sequence) ? sequence : 0;
      }

      function getLastPaintTime(target: HTMLCanvasElement) {
        const rawValue = target.dataset.lastPaintTime;
        const parsed = Number.parseFloat(rawValue ?? "0");
        return Number.isFinite(parsed) ? parsed : 0;
      }

      async function waitForViewportInteractionEnd(
        reactFlowStore: typeof useReactFlow,
        timeoutMs: number,
      ) {
        const deadline = performance.now() + timeoutMs;
        while (performance.now() < deadline) {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          const state = reactFlowStore.getState();
          if (!state.viewportInteractionActive && !state.paneDragging) {
            return {
              time: performance.now(),
              timedOut: false,
            };
          }
        }
        return {
          time: performance.now(),
          timedOut: true,
        };
      }

      async function waitForPaintAfter(
        target: HTMLCanvasElement,
        previousSequence: number,
        timeoutMs = 2000,
      ) {
        const deadline = performance.now() + timeoutMs;
        while (performance.now() < deadline) {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          if (readPaintSequence(target) > previousSequence) {
            return {
              time: performance.now(),
              timedOut: false,
            };
          }
        }
        return {
          time: performance.now(),
          timedOut: true,
        };
      }
    },
    { kind, selector: CANVAS_SELECTOR, steps },
  );

  const afterPerformance = await readPerformanceSnapshot(cdp);
  await cdp.send("Tracing.end");
  const stream = await traceComplete;
  const traceText = await readProtocolStream(cdp, stream);
  const traceSummary = summarizeTrace(traceText);
  const afterStats = await readCanvasStats(page);

  return {
    ...gesture,
    afterStats,
    beforeStats,
    performanceDelta: subtractPerformanceSnapshots(
      afterPerformance,
      beforePerformance,
    ),
    traceSummary,
  };
}

async function readPerformanceSnapshot(
  cdp: CDPSession,
): Promise<PerformanceSnapshot> {
  const response = await cdp.send("Performance.getMetrics");
  const metrics = new Map(
    (response.metrics as Array<{ name: string; value: number }>).map(
      (metric) => [metric.name, metric.value],
    ),
  );
  return {
    jsHeapUsedMb: (metrics.get("JSHeapUsedSize") ?? 0) / 1024 / 1024,
    layoutDurationMs: (metrics.get("LayoutDuration") ?? 0) * 1000,
    recalcStyleDurationMs: (metrics.get("RecalcStyleDuration") ?? 0) * 1000,
    scriptDurationMs: (metrics.get("ScriptDuration") ?? 0) * 1000,
    taskDurationMs: (metrics.get("TaskDuration") ?? 0) * 1000,
  };
}

function subtractPerformanceSnapshots(
  after: PerformanceSnapshot,
  before: PerformanceSnapshot,
): PerformanceSnapshot {
  return {
    jsHeapUsedMb: after.jsHeapUsedMb,
    layoutDurationMs: after.layoutDurationMs - before.layoutDurationMs,
    recalcStyleDurationMs:
      after.recalcStyleDurationMs - before.recalcStyleDurationMs,
    scriptDurationMs: after.scriptDurationMs - before.scriptDurationMs,
    taskDurationMs: after.taskDurationMs - before.taskDurationMs,
  };
}

async function waitForTraceComplete(cdp: CDPSession): Promise<string> {
  return await new Promise((resolve, reject) => {
    const onComplete = (event: { stream?: string }) => {
      cdp.off("Tracing.tracingComplete", onComplete);
      if (!event.stream) {
        reject(new Error("Tracing completed without a stream handle."));
        return;
      }
      resolve(event.stream);
    };
    cdp.on("Tracing.tracingComplete", onComplete);
  });
}

async function readProtocolStream(cdp: CDPSession, stream: string) {
  const chunks: string[] = [];
  let eof = false;
  while (!eof) {
    const response = await cdp.send("IO.read", { handle: stream });
    chunks.push(String(response.data ?? ""));
    eof = Boolean(response.eof);
  }
  await cdp.send("IO.close", { handle: stream });
  return chunks.join("");
}

function summarizeTrace(traceText: string): TraceSummary {
  const parsed = JSON.parse(traceText) as {
    traceEvents?: Array<{ dur?: number; name?: string; ph?: string }>;
  };
  let paintMs = 0;
  let compositeMs = 0;
  for (const event of parsed.traceEvents ?? []) {
    if (event.ph !== "X" || typeof event.dur !== "number") {
      continue;
    }
    const durationMs = event.dur / 1000;
    const name = event.name ?? "";
    if (/Paint|PrePaint|Raster/i.test(name)) {
      paintMs += durationMs;
    }
    if (/Composite|Commit|DrawFrame|Layerize|ActivateLayerTree/i.test(name)) {
      compositeMs += durationMs;
    }
  }
  return { compositeMs, paintMs };
}

async function writeMatrixReport(
  results: MatrixResult[],
  options: {
    counts: number[];
    datasetDescription: string;
    startViewport: CanvasFlowStartViewport;
    steps: number;
    target: CanvasFlowPerfTarget;
    usedSeededProjects: boolean;
    variants: CanvasFlowPerfVariant[];
  },
) {
  const repoRoot = path.resolve(process.cwd(), "..");
  const reportPath =
    process.env.SETTA_CANVASFLOW_PERF_REPORT_PATH ??
    path.join(
      repoRoot,
      "perf/reports/frontend/2026-04-27_html-in-canvas-pan-zoom-matrix.md",
    );
  const artifactPath = path.join(
    repoRoot,
    "perf/artifacts/frontend/html-in-canvas-pan-zoom-matrix.json",
  );
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(
    artifactPath,
    `${JSON.stringify({ options, results }, null, 2)}\n`,
    "utf-8",
  );
  await fs.writeFile(
    reportPath,
    renderMatrixReport(results, {
      artifactPath: path.relative(repoRoot, artifactPath),
      counts: options.counts,
      datasetDescription: options.datasetDescription,
      startViewport: options.startViewport,
      steps: options.steps,
      target: options.target,
      usedSeededProjects: options.usedSeededProjects,
      variants: options.variants,
    }),
    "utf-8",
  );
}

function renderMatrixReport(
  results: MatrixResult[],
  options: {
    artifactPath: string;
    counts: number[];
    datasetDescription: string;
    startViewport: CanvasFlowStartViewport;
    steps: number;
    target: CanvasFlowPerfTarget;
    usedSeededProjects: boolean;
    variants: CanvasFlowPerfVariant[];
  },
) {
  const lines = [
    "# HTML-in-Canvas Pan/Zoom Matrix",
    "",
    "Date: 2026-04-27",
    "Area: frontend",
    "Branch/Commit: go-rewrite-canvas-replace-xyflow working tree",
    "Related PR: n/a",
    "",
    "## Goal",
    "",
    "Record CanvasFlow pan/zoom matrix evidence after the hard HTML-in-Canvas renderer replacement.",
    "",
    "## Method",
    "",
    "- Runner: opt-in Playwright E2E harness `frontend/tests/e2e/canvasflow/html-in-canvas-pan-zoom-perf.spec.ts`.",
    "- Command: `SETTA_CANVASFLOW_PERF=1 ./scripts/run-playwright-e2e.sh tests/e2e/canvasflow/html-in-canvas-pan-zoom-perf.spec.ts`.",
    "- Browser: Chrome launched by Playwright with `--enable-blink-features=CanvasDrawElement`.",
    `- Target: ${options.target}.`,
    `- Matrix counts: ${options.counts.map(formatInteger).join(", ")} ${options.target === "settings-all" ? "registered CanvasFlow nodes" : "top-level TextBlock sections"}.`,
    `- Isolation variants: ${options.variants.join(", ")}.`,
    `- Start viewport: x=${formatNumber(options.startViewport.x)}, y=${formatNumber(options.startViewport.y)}, zoom=${formatNumber(options.startViewport.zoom)}.`,
    `- Gesture sample: ${options.steps} event-to-paint steps for pan and ${options.steps} event-to-paint steps for wheel zoom per graph size.`,
    "- First/last input columns isolate gesture-start and gesture-end event-to-paint latency; settle measures time until CanvasFlow marks viewport interaction inactive after pointer-up or the final wheel event.",
    options.datasetDescription,
    "- Scripting, style, layout, task, and heap numbers come from Chrome `Performance.getMetrics` deltas around each gesture.",
    "- Paint and composite numbers are summed from a short CDP trace around each gesture. These trace buckets are diagnostic event sums, not mutually exclusive frame budget totals.",
    "- Raw JSON artifact, ignored by git: `" + options.artifactPath + "`.",
    "",
    "## Before",
    "",
    "- Historical old-renderer baseline remains `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md`.",
    "- A same-session old xyflow matrix was not rerun here because this branch intentionally hard-deleted the active `.react-flow__viewport` / d3 renderer path before the final performance pass. Restoring that path would be compatibility work outside this branch posture.",
    "",
    "## Current CanvasFlow Matrix",
    "",
    "| Nodes | Variant | Gesture | FPS | First Input | Last Input | Avg Input Latency | P95 Input Latency | Settle | Settle Timeout | Script | Style | Layout | Paint Trace | Composite Trace | JS Heap | Visible | Drawn | Mounted | Edges | Edge Draw | Visibility Scan | drawElementImage | Snapshot Hits | Snapshot Misses | Snapshot Capture | Transform Sync | Finalizes | Durable Syncs | Total Paint | Timeouts |",
    "| ---: | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const result of results) {
    lines.push(renderGestureRow(result, "pan", result.pan));
    lines.push(renderGestureRow(result, "zoom", result.zoom));
  }
  lines.push(
    "",
    "## Initial Culling Snapshot",
    "",
    "| Nodes | Variant | Visible | Drawn | Registered | Mounted | Edges | Edge Draw | Visibility Scan | Total Paint | drawElementImage | Snapshot Hits | Snapshot Misses | Snapshot Capture | Transform Sync |",
    "| ---: | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const result of results) {
    lines.push(
      `| ${formatInteger(result.count)} | ${result.variant} | ${formatInteger(result.initialStats.visibleNodes)} | ${formatInteger(result.initialStats.drawnNodes)} | ${formatInteger(result.initialStats.registeredNodes)} | ${formatInteger(result.initialStats.mountedNodes)} | ${formatInteger(result.initialStats.edgeCount)} | ${formatMs(result.initialStats.edgeDrawMs)} | ${formatMs(result.initialStats.visibilityScanMs)} | ${formatMs(result.initialStats.totalPaintMs)} | ${formatMs(result.initialStats.drawElementImageMs)} | ${formatInteger(result.initialStats.snapshotCacheHits)} | ${formatInteger(result.initialStats.snapshotCacheMisses)} | ${formatMs(result.initialStats.snapshotCaptureMs)} | ${formatMs(result.initialStats.transformAssignmentMs)} |`,
    );
  }
  lines.push(
    "",
    "## Decision",
    "",
    "- Model A remains the active path: real section node bodies draw through `drawElementImage()` and pan/zoom updates stay canvas/ref-owned.",
    "- The matrix exercises culling and canvas pan/zoom at the graph sizes listed above.",
    options.target === "settings-all"
      ? "- This run uses the real Settings project All Settings view rather than synthetic TextBlock sections."
      : options.usedSeededProjects
        ? "- Large graph setup now uses the Go-owned Playwright workspace seed path, so the matrix measures canvas interaction instead of thousands of section-creation route calls."
        : "- If route-based production seeding times out before 1,000/2,500/largest-local graphs, use a pre-seeded project fixture or Go-owned bulk fixture writer so the large matrix measures canvas interaction rather than section-creation route calls.",
    "- The remaining risk is not old renderer parity. It is whether future rich-node mixes need bitmap caching or an active-node overlay if `drawElementImage()` or DOM transform sync dominates on heavier visible sets.",
    "",
    "## Verification",
    "",
    "- This report was generated by the opt-in Playwright perf harness above.",
    "- The harness asserts HTML-in-Canvas support, absence of `.react-flow__viewport`, absence of old SVG edge layers, the expected registered node count for each matrix size, and nonzero canvas draws after each gesture.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

function renderGestureRow(
  result: MatrixResult,
  gestureName: "pan" | "zoom",
  gesture: MeasuredGesture,
) {
  const cells = [
    formatInteger(result.count),
    result.variant,
    gestureName,
    formatNumber(gesture.fps),
    formatMs(gesture.firstInputLatencyMs),
    formatMs(gesture.lastInputLatencyMs),
    formatMs(gesture.averageInputLatencyMs),
    formatMs(gesture.p95InputLatencyMs),
    formatMs(gesture.settleLatencyMs),
    gesture.settleTimedOut ? "yes" : "no",
    formatMs(gesture.performanceDelta.scriptDurationMs),
    formatMs(gesture.performanceDelta.recalcStyleDurationMs),
    formatMs(gesture.performanceDelta.layoutDurationMs),
    formatMs(gesture.traceSummary.paintMs),
    formatMs(gesture.traceSummary.compositeMs),
    `${formatNumber(gesture.performanceDelta.jsHeapUsedMb)} MB`,
    formatInteger(gesture.afterStats.visibleNodes),
    formatInteger(gesture.afterStats.drawnNodes),
    formatInteger(gesture.afterStats.mountedNodes),
    formatInteger(gesture.afterStats.edgeCount),
    formatMs(gesture.afterStats.edgeDrawMs),
    formatMs(gesture.afterStats.visibilityScanMs),
    formatMs(gesture.afterStats.drawElementImageMs),
    formatInteger(gesture.afterStats.snapshotCacheHits),
    formatInteger(gesture.afterStats.snapshotCacheMisses),
    formatMs(gesture.afterStats.snapshotCaptureMs),
    formatMs(gesture.afterStats.transformAssignmentMs),
    formatInteger(
      gesture.afterStats.viewportFinalizes -
        gesture.beforeStats.viewportFinalizes,
    ),
    formatInteger(
      gesture.afterStats.viewportDurableSyncs -
        gesture.beforeStats.viewportDurableSyncs,
    ),
    formatMs(gesture.afterStats.totalPaintMs),
    formatInteger(gesture.timedOutPaints),
  ];
  return `| ${cells.join(" | ")} |`;
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function formatMs(value: number) {
  return `${formatNumber(value)} ms`;
}

function formatNumber(value: number) {
  return value.toFixed(2);
}
