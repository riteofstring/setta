import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  cleanupIsolatedProject,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
} from "../helpers";

type CreateTopLevelSectionResponse = {
  sectionId?: string;
};

type FlowViewportBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type BenchmarkFixtureSummary = {
  createdSectionIds: string[];
  parentSectionIds: string[];
  movedToParentsCount: number;
  expectedTopLevelNodeMin: number;
};

type FrameTimingSummary = {
  sampleCount: number;
  avgFrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  maxFrameMs: number;
  minFrameMs: number;
};

type BaselineMetrics = {
  sectionCount: number;
  parentSectionCount: number;
  movedToParentsCount: number;
  expectedTopLevelNodeMin: number;
  topLevelNodeCount: number;
  canvasDomNodeCount: number;
  totalDomNodeCount: number;
  frameTimings: FrameTimingSummary;
  jsHeapUsedBytes: number | null;
  jsHeapTotalBytes: number | null;
};

type ScenarioConfig = {
  sectionCount: number;
  parentSectionCount: number;
  columns: number;
  frameBudget: {
    avgFrameMsMax: number;
    p95FrameMsMax: number;
  };
};

const PARENT_IMPL_TYPES = ["Group", "ListRoot"] as const;
const LEAF_IMPL_TYPES = [
  "Callable",
  "TextBlock",
  "Code",
  "Dict",
  "Prompt",
  "Chart",
  "Draw",
  "TaskBoard",
  "Spreadsheet",
  "MetaControl",
] as const;

const SCENARIOS: ScenarioConfig[] = [
  {
    sectionCount: 100,
    parentSectionCount: 12,
    columns: 10,
    frameBudget: {
      avgFrameMsMax: 150,
      p95FrameMsMax: 330,
    },
  },
  {
    sectionCount: 300,
    parentSectionCount: 30,
    columns: 15,
    frameBudget: {
      avgFrameMsMax: 240,
      p95FrameMsMax: 600,
    },
  },
];

for (const scenario of SCENARIOS) {
  test(`baseline canvas metrics: ${scenario.sectionCount} mixed sections`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(8 * 60 * 1000);
    const projectContext = await openIsolatedProject(page);

    try {
      const fixture = await createMixedLargeCanvasFixture({
        page,
        projectConfigId: projectContext.projectConfigId,
        sectionCount: scenario.sectionCount,
        parentSectionCount: scenario.parentSectionCount,
        columns: scenario.columns,
      });

      // Wait for top-level nodes to materialize before collecting metrics.
      await expect
        .poll(async () => {
          return await page.locator(".react-flow__node").count();
        })
        .toBeGreaterThanOrEqual(fixture.expectedTopLevelNodeMin);

      const metrics = await collectBaselineMetrics({
        page,
        sectionCount: scenario.sectionCount,
        parentSectionCount: fixture.parentSectionIds.length,
        movedToParentsCount: fixture.movedToParentsCount,
        expectedTopLevelNodeMin: fixture.expectedTopLevelNodeMin,
      });

      await attachScenarioMetrics(testInfo, metrics);

      // Keep this as machine-readable output for perf report copy/paste.
      console.log(
        `[large-canvas-baseline] ${JSON.stringify({
          scenario: `${scenario.sectionCount}-sections`,
          ...metrics,
        })}`,
      );

      // Guardrails: these are intentionally broad baseline thresholds to avoid
      // flaky failures while still catching catastrophic regressions.
      expect(metrics.topLevelNodeCount).toBeGreaterThanOrEqual(
        fixture.expectedTopLevelNodeMin,
      );
      expect(metrics.canvasDomNodeCount).toBeGreaterThan(
        metrics.topLevelNodeCount,
      );
      expect(metrics.frameTimings.sampleCount).toBeGreaterThanOrEqual(160);
      expect(metrics.frameTimings.avgFrameMs).toBeLessThan(
        scenario.frameBudget.avgFrameMsMax,
      );
      expect(metrics.frameTimings.p95FrameMs).toBeLessThan(
        scenario.frameBudget.p95FrameMsMax,
      );
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
}

async function createMixedLargeCanvasFixture({
  page,
  projectConfigId,
  sectionCount,
  parentSectionCount,
  columns,
}: {
  page: Page;
  projectConfigId: string;
  sectionCount: number;
  parentSectionCount: number;
  columns: number;
}): Promise<BenchmarkFixtureSummary> {
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for fixture placement.");
  }

  const createdSectionIds: string[] = [];
  const parentSectionIds: string[] = [];

  // Create container parents first so we can deterministically nest later sections.
  for (let parentIndex = 0; parentIndex < parentSectionCount; parentIndex += 1) {
    const implType = PARENT_IMPL_TYPES[parentIndex % PARENT_IMPL_TYPES.length];
    const sectionId = await createTopLevelSection({
      page,
      projectConfigId,
      implType,
      position: getGridPosition({
        index: parentIndex,
        columns,
        viewportBounds,
      }),
      viewportBounds,
    });
    createdSectionIds.push(sectionId);
    parentSectionIds.push(sectionId);
  }

  const leafCount = sectionCount - parentSectionCount;
  const parentChildCounts: Record<string, number> = {};
  let movedToParentsCount = 0;

  for (let leafIndex = 0; leafIndex < leafCount; leafIndex += 1) {
    const implType = LEAF_IMPL_TYPES[leafIndex % LEAF_IMPL_TYPES.length];
    const absoluteIndex = leafIndex + parentSectionCount;
    const sectionId = await createTopLevelSection({
      page,
      projectConfigId,
      implType,
      position: getGridPosition({
        index: absoluteIndex,
        columns,
        viewportBounds,
      }),
      viewportBounds,
    });
    createdSectionIds.push(sectionId);

    // Move every 3rd leaf into a parent, alternating Group/ListRoot parents.
    // This gives deterministic nested content while leaving many top-level nodes.
    if (leafIndex % 3 === 0) {
      const parentId = parentSectionIds[leafIndex % parentSectionIds.length];
      const nextIndex = parentChildCounts[parentId] ?? 0;
      await postBackend(page, "/moveSections", {
        projectConfigId,
        sectionIds: [sectionId],
        newParentId: parentId,
        newIndex: nextIndex,
        positionsById: null,
      });
      parentChildCounts[parentId] = nextIndex + 1;
      movedToParentsCount += 1;
    }
  }

  const expectedTopLevelNodeMin = Math.floor(
    parentSectionCount + (leafCount - movedToParentsCount) * 0.95,
  );

  return {
    createdSectionIds,
    parentSectionIds,
    movedToParentsCount,
    expectedTopLevelNodeMin,
  };
}

async function createTopLevelSection({
  page,
  projectConfigId,
  implType,
  position,
  viewportBounds,
}: {
  page: Page;
  projectConfigId: string;
  implType: string;
  position: { x: number; y: number };
  viewportBounds: FlowViewportBounds;
}): Promise<string> {
  const created = await postBackend<CreateTopLevelSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType,
      position,
      viewportBounds,
    },
  );
  const sectionId = created?.sectionId;
  if (!sectionId) {
    throw new Error(`Missing sectionId for implType=${implType}.`);
  }
  return sectionId;
}

function getGridPosition({
  index,
  columns,
  viewportBounds,
}: {
  index: number;
  columns: number;
  viewportBounds: FlowViewportBounds;
}): { x: number; y: number } {
  const column = index % columns;
  const row = Math.floor(index / columns);
  const cellWidth = 360;
  const cellHeight = 260;
  return {
    x: viewportBounds.x + 60 + column * cellWidth,
    y: viewportBounds.y + 60 + row * cellHeight,
  };
}

async function collectBaselineMetrics({
  page,
  sectionCount,
  parentSectionCount,
  movedToParentsCount,
  expectedTopLevelNodeMin,
}: {
  page: Page;
  sectionCount: number;
  parentSectionCount: number;
  movedToParentsCount: number;
  expectedTopLevelNodeMin: number;
}): Promise<BaselineMetrics> {
  const topLevelNodeCount = await page.locator(".react-flow__node").count();

  const domCounts = await page.evaluate(() => {
    const canvasRoot = document.querySelector(".react-flow");
    return {
      canvasDomNodeCount: canvasRoot
        ? canvasRoot.querySelectorAll("*").length
        : 0,
      totalDomNodeCount: document.querySelectorAll("*").length,
    };
  });

  const frameTimings = await page.evaluate(async (): Promise<FrameTimingSummary> => {
    const { useReactFlow } = await import("/src/forks/xyflow/core/store");
    const initial = [...useReactFlow.getState().transform] as [number, number, number];
    const frameDeltas: number[] = [];
    const animationFrameCount = 180;
    let lastTs = performance.now();

    for (let i = 0; i < animationFrameCount; i += 1) {
      const ts = await new Promise<number>((resolve) => {
        requestAnimationFrame((rafTs) => resolve(rafTs));
      });
      frameDeltas.push(ts - lastTs);
      lastTs = ts;

      const phase = (i / animationFrameCount) * Math.PI * 2;
      const nextX = initial[0] + Math.sin(phase) * 900;
      const nextY = initial[1] + Math.cos(phase * 1.15) * 620;
      const nextZoom = Math.max(
        0.2,
        Math.min(3, initial[2] * (1 + 0.24 * Math.sin(phase * 0.65))),
      );
      useReactFlow.setState({ transform: [nextX, nextY, nextZoom] });
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    useReactFlow.setState({ transform: initial });

    // Drop startup samples to reduce cold-start noise.
    const samples = frameDeltas.slice(5);
    const sorted = [...samples].sort((a, b) => a - b);
    const sum = samples.reduce((acc, value) => acc + value, 0);
    const sampleCount = samples.length;

    const getPercentile = (p: number): number => {
      if (sampleCount === 0) {
        return 0;
      }
      const index = Math.min(
        sampleCount - 1,
        Math.floor(sampleCount * p),
      );
      return sorted[index] ?? 0;
    };

    return {
      sampleCount,
      avgFrameMs: sampleCount > 0 ? sum / sampleCount : 0,
      p95FrameMs: getPercentile(0.95),
      p99FrameMs: getPercentile(0.99),
      maxFrameMs: sorted[sampleCount - 1] ?? 0,
      minFrameMs: sorted[0] ?? 0,
    };
  });

  const memory = await page.evaluate(() => {
    const perf = performance as Performance & {
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
      };
    };
    if (!perf.memory) {
      return null;
    }
    return {
      used: perf.memory.usedJSHeapSize,
      total: perf.memory.totalJSHeapSize,
    };
  });

  return {
    sectionCount,
    parentSectionCount,
    movedToParentsCount,
    expectedTopLevelNodeMin,
    topLevelNodeCount,
    canvasDomNodeCount: domCounts.canvasDomNodeCount,
    totalDomNodeCount: domCounts.totalDomNodeCount,
    frameTimings,
    jsHeapUsedBytes: memory?.used ?? null,
    jsHeapTotalBytes: memory?.total ?? null,
  };
}

async function attachScenarioMetrics(
  testInfo: TestInfo,
  metrics: BaselineMetrics,
): Promise<void> {
  await testInfo.attach("large-canvas-baseline-metrics", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
}
