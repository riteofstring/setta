import {
  expect,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test";
import {
  ensureGpuFlowPerformanceQueueWrappers,
  readGpuFlowPerformanceSnapshot,
  resetGpuFlowPerformanceProbe,
  type GpuFlowPerformanceSnapshot,
  type GpuFlowQueueCall,
} from "./gpuFlowPerformanceProbe";
import {
  addKwargFromFrontend,
  applyProjectMutationsFromFrontend,
  createTopLevelSectionFromFrontend,
  getViewportBoundsForPlacement,
  loadProjectConfig,
  moveSectionsFromFrontend,
  setCallableFromFrontend,
  setSectionEdgeInputsFromFrontend,
  setSectionSizesFromFrontend,
} from "./helpers";

export type GpuFlowInteractionBenchmarkScenarioName =
  | "nested-section-resize"
  | "parameter-drag-drop"
  | "section-drag-drop"
  | "slider-input"
  | "text-input"
  | "top-level-section-resize"
  | "viewport-pan-zoom"
  | "wheel-scroll";

export type GpuFlowInteractionStressProject = {
  readonly denseParamSectionId: string;
  readonly dictSectionId: string;
  readonly dragSourceSectionId: string;
  readonly dragTargetSectionId: string;
  readonly nestedResizeSectionId: string;
  readonly sectionIds: readonly string[];
  readonly sliderSectionId: string;
  readonly topLevelResizeSectionId: string;
};

type GpuFlowBenchmarkViewportBounds = {
  readonly h: number;
  readonly w: number;
  readonly x: number;
  readonly y: number;
};

export type GpuFlowInteractionBenchmarkStats = {
  readonly average: number | null;
  readonly count: number;
  readonly p50: number | null;
  readonly p95: number | null;
  readonly p99: number | null;
  readonly worst: number | null;
};

type GpuFlowVisualNodeRect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type GpuFlowInteractionBenchmarkSummary = {
  readonly dirty: {
    readonly remainingDirtyNodeCount: number | null;
    readonly sourceRectCount: number | null;
    readonly sourceRectTotalArea: number | null;
  };
  readonly durationMs: number;
  readonly durableMutationCount: number;
  readonly frameIntervalsMs: GpuFlowInteractionBenchmarkStats;
  readonly longTasks: {
    readonly count: number;
    readonly totalDurationMs: number;
    readonly worstDurationMs: number | null;
  };
  readonly queue: {
    readonly textureUploadBytes: number;
    readonly textureUploads: number;
    readonly textureUploadsByNodeId: Readonly<Record<string, number>>;
    readonly writeBufferCalls: number;
    readonly writeBufferCallsByLabel: Readonly<Record<string, number>>;
  };
  readonly reactCommitCount: number | null;
  readonly requestPaintCalls: number;
  readonly scenario: GpuFlowInteractionBenchmarkScenarioName;
  readonly sourceMutations: {
    readonly total: number;
    readonly transformWrites: number;
  };
};

const DEFAULT_BENCHMARK_DRAG_STEPS = 24;
const DURABLE_MUTATION_ROUTE_PATHS = [
  "/moveParamGroups",
  "/moveParams",
  "/moveSections",
  "/setTopLevelSectionLayout",
  "/setSectionSizes",
] as const;
const DURABLE_MUTATION_PATHS = new Set(
  DURABLE_MUTATION_ROUTE_PATHS.flatMap((path) => [path, `/api${path}`]),
);

export async function createGpuFlowInteractionStressProject(
  page: Page,
  projectConfigId: string,
): Promise<GpuFlowInteractionStressProject> {
  const viewportBounds = await resolveBenchmarkViewportBounds(page);
  if (!viewportBounds) {
    throw new Error(
      "Unable to resolve viewport bounds for GpuFlow interaction benchmark.",
    );
  }

  const createSection = async (
    implType: string,
    position: { x: number; y: number },
    name: string,
  ): Promise<string> => {
    const response = await createTopLevelSectionFromFrontend(page, {
      projectConfigId,
      implType,
      name,
      position,
      viewportBounds,
    });
    if (!response?.sectionId) {
      throw new Error(`Missing section id for benchmark ${implType} section.`);
    }
    return response.sectionId;
  };

  const left = viewportBounds.x + 80;
  const top = viewportBounds.y + 80;
  const topLevelResizeSectionId = await createSection(
    "Chart",
    { x: left, y: top },
    "Benchmark Resize Chart",
  );
  const dictSectionId = await createSection(
    "Dict",
    { x: left + 460, y: top },
    "Benchmark Dense Settings",
  );
  const denseParamSectionId = await createSection(
    "Callable",
    { x: left + 900, y: top },
    "Benchmark Dense Params",
  );
  const sliderSectionId = await createSection(
    "MetaControl",
    { x: left + 900, y: top + 300 },
    "Benchmark Slider",
  );
  const dragTargetSectionId = await createSection(
    "Group",
    { x: left + 520, y: top + 420 },
    "Benchmark Drop Group",
  );
  const dragSourceSectionId = await createSection(
    "Chart",
    { x: left + 80, y: top + 480 },
    "Benchmark Drag Source",
  );
  const nestedResizeSectionId = await createSection(
    "Code",
    { x: left + 120, y: top + 640 },
    "Benchmark Nested Child",
  );

  await moveSectionsFromFrontend(page, {
    projectConfigId,
    sectionIds: [nestedResizeSectionId],
    newParentId: dragTargetSectionId,
    newIndex: 0,
    positionsById: null,
  });

  await setSectionSizesFromFrontend(page, {
    projectConfigId,
    sectionSizes: {
      [denseParamSectionId]: { height: 460, width: 420 },
      [dictSectionId]: { height: 520, width: 420 },
      [dragSourceSectionId]: { height: 300, width: 420 },
      [dragTargetSectionId]: { height: 420, width: 420 },
      [nestedResizeSectionId]: { height: 260, width: 320 },
      [sliderSectionId]: { height: 220, width: 360 },
      [topLevelResizeSectionId]: { height: 300, width: 420 },
    },
  });

  await setCallableFromFrontend(page, {
    callableName: "sorted",
    projectConfigId,
    refetchParams: true,
    sectionId: denseParamSectionId,
  });

  for (let index = 0; index < 36; index += 1) {
    await addKwargFromFrontend(page, {
      projectConfigId,
      sectionId: dictSectionId,
    });
  }

  const paramIds = await readParamIds(page, denseParamSectionId);
  if (paramIds.length > 0) {
    await setSectionEdgeInputsFromFrontend(page, {
      edgeInputParams: paramIds.slice(0, Math.min(6, paramIds.length)),
      projectConfigId,
      sectionId: denseParamSectionId,
    });
  }

  await waitForBenchmarkSection(page, topLevelResizeSectionId);
  await waitForBenchmarkSection(page, dictSectionId);
  await waitForBenchmarkSection(page, denseParamSectionId);
  await waitForBenchmarkSection(page, dragTargetSectionId);

  return {
    denseParamSectionId,
    dictSectionId,
    dragSourceSectionId,
    dragTargetSectionId,
    nestedResizeSectionId,
    sectionIds: [
      topLevelResizeSectionId,
      dictSectionId,
      denseParamSectionId,
      sliderSectionId,
      dragTargetSectionId,
      dragSourceSectionId,
      nestedResizeSectionId,
    ],
    sliderSectionId,
    topLevelResizeSectionId,
  };
}

export async function runGpuFlowInteractionBenchmark(
  page: Page,
  scenario: GpuFlowInteractionBenchmarkScenarioName,
  interaction: () => Promise<void>,
  options: {
    readonly afterSnapshot?: (() => Promise<void>) | undefined;
    readonly waitForFramesAfterInteraction?: boolean | undefined;
  } = {},
): Promise<GpuFlowInteractionBenchmarkSummary> {
  await ensureGpuFlowPerformanceQueueWrappers(page);
  await resetGpuFlowPerformanceProbe(page);
  const counter = createDurableMutationCounter(page);
  const startTimeMs = await page.evaluate(() => performance.now());
  try {
    await interaction();
    if (options.waitForFramesAfterInteraction !== false) {
      await waitForBenchmarkFrames(page);
    }
    const snapshot = await readGpuFlowPerformanceSnapshot(page);
    return summarizeGpuFlowInteractionBenchmark({
      durableMutationCount: counter.count(),
      endTimeMs: snapshot.timestampMs,
      scenario,
      snapshot,
      startTimeMs,
    });
  } finally {
    counter.stop();
    await options.afterSnapshot?.();
    await waitForGpuFlowPerformanceProbeQuiet(page);
  }
}

export function summarizeGpuFlowInteractionBenchmark({
  durableMutationCount = 0,
  endTimeMs,
  scenario,
  snapshot,
  startTimeMs,
}: {
  readonly durableMutationCount?: number | undefined;
  readonly endTimeMs?: number | undefined;
  readonly scenario: GpuFlowInteractionBenchmarkScenarioName;
  readonly snapshot: GpuFlowPerformanceSnapshot;
  readonly startTimeMs: number;
}): GpuFlowInteractionBenchmarkSummary {
  const actualEndTimeMs = endTimeMs ?? snapshot.timestampMs;
  const queueCalls = snapshot.queueCalls.filter((call) =>
    isTimestampInWindow(call.timestampMs, startTimeMs, actualEndTimeMs),
  );
  const textureUploads = queueCalls.filter(isTextureUpload);
  const writeBufferCalls = queueCalls.filter(isWriteBufferCall);
  const longTasks = snapshot.longTasks.filter((task) =>
    isTimestampInWindow(task.startTimeMs, startTimeMs, actualEndTimeMs),
  );
  const requestPaintCalls = snapshot.requestPaintCalls.filter((call) =>
    isTimestampInWindow(call.timestampMs, startTimeMs, actualEndTimeMs),
  );
  const sourceMutations = snapshot.sourceMutations.filter((mutation) =>
    isTimestampInWindow(mutation.timestampMs, startTimeMs, actualEndTimeMs),
  );
  const latestFrame =
    snapshot.nodeLayerFrames[snapshot.nodeLayerFrames.length - 1] ?? null;

  return {
    dirty: {
      remainingDirtyNodeCount: latestFrame?.remainingDirtyNodeCount ?? null,
      sourceRectCount: null,
      sourceRectTotalArea: null,
    },
    durationMs: Math.max(0, actualEndTimeMs - startTimeMs),
    durableMutationCount,
    frameIntervalsMs: summarizeNumberSeries(snapshot.frameIntervalsMs),
    longTasks: {
      count: longTasks.length,
      totalDurationMs: sum(longTasks.map((task) => task.durationMs)),
      worstDurationMs: maxOrNull(longTasks.map((task) => task.durationMs)),
    },
    queue: {
      textureUploadBytes: sum(
        textureUploads.map(
          (call) => (call.width ?? 0) * (call.height ?? 0) * 4,
        ),
      ),
      textureUploads: textureUploads.length,
      textureUploadsByNodeId: countBy(
        textureUploads.flatMap((call) =>
          call.sourceNodeId ? [call.sourceNodeId] : [],
        ),
      ),
      writeBufferCalls: writeBufferCalls.length,
      writeBufferCallsByLabel: countBy(
        writeBufferCalls.map((call) => call.bufferLabel ?? "unlabeled"),
      ),
    },
    reactCommitCount: null,
    requestPaintCalls: requestPaintCalls.length,
    scenario,
    sourceMutations: {
      total: sourceMutations.length,
      transformWrites: sourceMutations.filter(
        (mutation) => mutation.transformChanged,
      ).length,
    },
  };
}

export async function benchmarkTopLevelSectionResize(
  page: Page,
  project: GpuFlowInteractionStressProject,
): Promise<GpuFlowInteractionBenchmarkSummary> {
  const initialSize = await readGpuFlowBenchmarkSectionSize(
    page,
    project.topLevelResizeSectionId,
  );
  await expect(
    sectionNodeById(page, project.topLevelResizeSectionId),
  ).toBeVisible();
  return runGpuFlowInteractionBenchmark(
    page,
    "top-level-section-resize",
    async () => {
      await dragVisualNodeBottomRight(page, project.topLevelResizeSectionId, {
        dx: 140,
        dy: 90,
      });
      await waitForSectionSizeChange(
        page,
        project.topLevelResizeSectionId,
        initialSize,
      );
    },
  );
}

export async function benchmarkNestedSectionResize(
  page: Page,
  project: GpuFlowInteractionStressProject,
): Promise<GpuFlowInteractionBenchmarkSummary> {
  const initialSize = await readGpuFlowBenchmarkSectionSize(
    page,
    project.nestedResizeSectionId,
  );
  await ensureGpuFlowVisualNodeVisible(page, project.dragTargetSectionId);
  const section = page
    .locator(`section[data-section-id="${project.nestedResizeSectionId}"]`)
    .first();
  const handle = section.locator(".section-resize-handle-bottom-right");
  await expect(section).toBeVisible();
  await expect(handle).toBeVisible();
  await moveMouseToNestedResizeHandle(
    page,
    project.dragTargetSectionId,
    project.nestedResizeSectionId,
  );
  return runGpuFlowInteractionBenchmark(
    page,
    "nested-section-resize",
    async () => {
      await ensureGpuFlowVisualNodeVisible(page, project.dragTargetSectionId);
      await dragNestedSectionBottomRight(page, {
        dx: 100,
        dy: 70,
        nestedSectionId: project.nestedResizeSectionId,
        parentNodeId: project.dragTargetSectionId,
      });
      await waitForSectionSizeChange(
        page,
        project.nestedResizeSectionId,
        initialSize,
      );
    },
  );
}

export async function benchmarkSectionDragDrop(
  page: Page,
  project: GpuFlowInteractionStressProject,
): Promise<GpuFlowInteractionBenchmarkSummary> {
  const initialLayout = await readTopLevelSectionLayout(
    page,
    project.dragSourceSectionId,
  );
  await ensureGpuFlowVisualNodeVisible(page, project.dragSourceSectionId);
  await expect(sectionNodeById(page, project.dragSourceSectionId)).toBeVisible();
  await waitForBenchmarkFrames(page);
  return runGpuFlowInteractionBenchmark(page, "section-drag-drop", async () => {
    const layoutResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/setTopLevelSectionLayout",
      { timeout: 5_000 },
    );
    await dragVisualNodeBody(page, project.dragSourceSectionId, {
      dx: 130,
      dy: 70,
      steps: DEFAULT_BENCHMARK_DRAG_STEPS,
    });
    await waitForTopLevelSectionLayoutChange(
      page,
      project.dragSourceSectionId,
      initialLayout,
    );
    await flushTopLevelSectionLayoutPersistence(page);
    const layoutResponse = await layoutResponsePromise;
    if (!layoutResponse.ok()) {
      const requestPayload = layoutResponse.request().postData() ?? "";
      const responseBody = await layoutResponse.text();
      throw new Error(
        `setTopLevelSectionLayout benchmark request failed (${layoutResponse.status()}): ${requestPayload} ${responseBody}`,
      );
    }
  });
}

async function flushTopLevelSectionLayoutPersistence(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { sendTopLevelLayoutToBackend } = await import(
      "/src/state/actions/sectionInfos/viewportUpdates.ts"
    );
    sendTopLevelLayoutToBackend.flush();
  });
}

async function readTopLevelSectionLayout(
  page: Page,
  sectionId: string,
): Promise<{ h: number | null; w: number | null; x: number; y: number }> {
  return page.evaluate(async (inputSectionId) => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const layout =
      useProjectState.getState().projectConfig.topLevelSections[
        inputSectionId
      ];
    if (!layout) {
      throw new Error(`Missing top-level layout for section ${inputSectionId}.`);
    }
    return {
      h: layout.h ?? null,
      w: layout.w ?? null,
      x: layout.x,
      y: layout.y,
    };
  }, sectionId);
}

async function waitForTopLevelSectionLayoutChange(
  page: Page,
  sectionId: string,
  initialLayout: { h: number | null; w: number | null; x: number; y: number },
): Promise<void> {
  const initialSignature = JSON.stringify(initialLayout);
  await expect
    .poll(
      async () => {
        return JSON.stringify(
          await readTopLevelSectionLayout(page, sectionId),
        );
      },
      { timeout: 5_000 },
    )
    .not.toBe(initialSignature);
}

async function activateGpuFlowParamDndMode(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { activateParamSelect } = await import(
      "/src/state/actions/paramSelect.ts"
    );
    activateParamSelect();
  });
  await waitForBenchmarkFrames(page);
}

async function deactivateGpuFlowParamDndMode(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { deactivateParamSelect } = await import(
      "/src/state/actions/paramSelect.ts"
    );
    deactivateParamSelect();
  });
}

async function waitForParamOrderChange(
  page: Page,
  sectionId: string,
  initialParamIds: readonly string[],
): Promise<void> {
  const initialSignature = JSON.stringify(initialParamIds);
  await expect
    .poll(
      async () => JSON.stringify(await readMovableParamIds(page, sectionId)),
      { timeout: 5_000 },
    )
    .not.toBe(initialSignature);
}

async function readMovableParamIds(
  page: Page,
  sectionId: string,
): Promise<string[]> {
  return page.evaluate(async (inputSectionId) => {
    const { getCurrShownParamIds } = await import(
      "/src/state/actions/sectionInfos.ts"
    );
    const { useProjectState } = await import("/src/state/definitions.ts");
    return [
      ...getCurrShownParamIds(
        useProjectState.getState(),
        inputSectionId,
        false,
      ).topLevelParamIds,
    ];
  }, sectionId);
}

type GpuFlowDescendantPointOptions = {
  readonly xRatio?: number | undefined;
  readonly yRatio?: number | undefined;
};

function clampUnitInterval(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeDescendantPointOptions({
  xRatio = 0.5,
  yRatio = 0.5,
}: GpuFlowDescendantPointOptions = {}): {
  readonly xRatio: number;
  readonly yRatio: number;
} {
  return {
    xRatio: clampUnitInterval(xRatio),
    yRatio: clampUnitInterval(yRatio),
  };
}

async function readGpuFlowDescendantVisualPointByIdWithOptions(
  page: Page,
  nodeId: string,
  elementId: string,
  options?: GpuFlowDescendantPointOptions,
): Promise<{ readonly x: number; readonly y: number }> {
  const normalizedOptions = normalizeDescendantPointOptions(options);
  return page.evaluate(
    async ({ inputElementId, inputNodeId, xRatio, yRatio }) => {
      const { gpuFlowLayoutStore } = await import(
        "/src/gpuFlow/layoutStore.ts"
      );
      const { gpuFlowViewportStore } = await import(
        "/src/gpuFlow/viewportStore.ts"
      );
      const layout = gpuFlowLayoutStore.getState().getNode(inputNodeId);
      if (!layout) {
        throw new Error(`Missing GpuFlow layout node ${inputNodeId}.`);
      }
      const viewport = gpuFlowViewportStore.getState().getViewport();
      const container = gpuFlowViewportStore.getState().domNode;
      if (!(container instanceof HTMLElement)) {
        throw new Error("Missing GpuFlow viewport container.");
      }
      const parent = document.querySelector<HTMLElement>(
        `.setta-gpu-flow__node[data-id="${inputNodeId}"]`,
      );
      const descendant = document.getElementById(inputElementId);
      if (
        !parent ||
        !(descendant instanceof HTMLElement) ||
        !parent.contains(descendant)
      ) {
        throw new Error(
          `Missing GpuFlow descendant ${inputElementId} for ${inputNodeId}.`,
        );
      }
      const parentRect = parent.getBoundingClientRect();
      const descendantRect = descendant.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      return {
        x:
          containerRect.left +
          viewport.x +
          (layout.x +
            descendantRect.left -
            parentRect.left +
            descendantRect.width * xRatio) *
            viewport.zoom,
        y:
          containerRect.top +
          viewport.y +
          (layout.y +
            descendantRect.top -
            parentRect.top +
            descendantRect.height * yRatio) *
            viewport.zoom,
      };
    },
    {
      inputElementId: elementId,
      inputNodeId: nodeId,
      xRatio: normalizedOptions.xRatio,
      yRatio: normalizedOptions.yRatio,
    });
}

export async function benchmarkParameterDragDrop(
  page: Page,
  project: GpuFlowInteractionStressProject,
): Promise<GpuFlowInteractionBenchmarkSummary> {
  const initialParamIds = await readMovableParamIds(page, project.dictSectionId);
  const sourceParamId = initialParamIds[0];
  const targetParamId = initialParamIds[3];
  if (!sourceParamId || !targetParamId) {
    throw new Error("Missing parameter rows for parameter drag benchmark.");
  }
  const sectionNode = sectionNodeById(page, project.dictSectionId);
  await expect(sectionNode).toBeVisible();
  const sourceRowId = getParamRowElementId(project.dictSectionId, sourceParamId);
  const targetRowId = getParamRowElementId(project.dictSectionId, targetParamId);
  await expect(page.locator(`#${sourceRowId}`)).toBeVisible();
  await expect(page.locator(`#${targetRowId}`)).toBeVisible();
  await activateGpuFlowParamDndMode(page);
  try {
    return await runGpuFlowInteractionBenchmark(
      page,
      "parameter-drag-drop",
      async () => {
        const moveResponsePromise = page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === "/api/moveParams",
          { timeout: 5_000 },
        );
        const sourcePoint =
          await readGpuFlowDescendantVisualPointByIdWithOptions(
            page,
            project.dictSectionId,
            sourceRowId,
            { xRatio: 0.08 },
          );
        const targetPoint =
          await readGpuFlowDescendantVisualPointByIdWithOptions(
            page,
            project.dictSectionId,
            targetRowId,
            { xRatio: 0.08, yRatio: 0.85 },
          );
        await dragGpuFlowDescendantByIdToPoint(page, {
          elementId: sourceRowId,
          nodeId: project.dictSectionId,
          sourcePoint,
          targetPoint,
        });
        const moveResponse = await moveResponsePromise;
        if (!moveResponse.ok()) {
          const requestPayload = moveResponse.request().postData() ?? "";
          const responseBody = await moveResponse.text();
          throw new Error(
            `moveParams benchmark request failed (${moveResponse.status()}): ${requestPayload} ${responseBody}`,
          );
        }
        await waitForParamOrderChange(
          page,
          project.dictSectionId,
          initialParamIds,
        );
      },
    );
  } finally {
    await deactivateGpuFlowParamDndMode(page);
  }
}

export async function benchmarkWheelScroll(
  page: Page,
  project: GpuFlowInteractionStressProject,
): Promise<GpuFlowInteractionBenchmarkSummary> {
  const sectionNode = sectionNodeById(page, project.dictSectionId);
  await expect(sectionNode).toBeVisible();
  await moveMouseToLocator(page, sectionNode);
  const scroller = sectionNode
    .locator("div.section-args-nested.overflow-y-scroll")
    .first();
  await expect(scroller).toBeVisible();
  await moveMouseToLocator(page, scroller);
  return runGpuFlowInteractionBenchmark(page, "wheel-scroll", async () => {
    const box = await scroller.boundingBox();
    if (!box) {
      throw new Error("Missing wheel scroll benchmark scroller bounds.");
    }
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.wheel(0, 420);
  });
}

export async function benchmarkViewportPanZoom(
  page: Page,
  _project: GpuFlowInteractionStressProject,
): Promise<GpuFlowInteractionBenchmarkSummary> {
  await expect(page.locator(".setta-gpu-flow__canvas").first()).toBeVisible();
  const start = await readGpuFlowBackgroundVisualPoint(page);
  await page.mouse.move(start.x, start.y);
  await waitForBenchmarkFrames(page);
  await waitForGpuFlowInteractiveSourceCount(page, 0);
  await page.waitForTimeout(500);
  await waitForBenchmarkFrames(page);
  const initialViewport = await readGpuFlowViewport(page);
  await clearGpuFlowDocumentFocusForBenchmark(page);
  await settleGpuFlowViewportBeforeBenchmark(page, initialViewport);
  await setGpuFlowPanActivationKeyPressed(page, true);
  await waitForBenchmarkFrames(page);
  await waitForGpuFlowPerformanceProbeQuiet(page);
  return runGpuFlowInteractionBenchmark(
    page,
    "viewport-pan-zoom",
    async () => {
      await page.mouse.down();
      await page.mouse.move(start.x + 100, start.y + 60, {
        steps: DEFAULT_BENCHMARK_DRAG_STEPS,
      });
      await page.mouse.up();
      await page.mouse.wheel(0, -180);
      await waitForGpuFlowViewportChange(page, initialViewport);
    },
    {
      afterSnapshot: async () => {
        await setGpuFlowPanActivationKeyPressed(page, false);
        await setGpuFlowViewport(page, initialViewport);
      },
      waitForFramesAfterInteraction: false,
    },
  );
}

export async function benchmarkSliderInput(
  page: Page,
  project: GpuFlowInteractionStressProject,
): Promise<GpuFlowInteractionBenchmarkSummary> {
  const sectionNode = sectionNodeById(page, project.sliderSectionId);
  await expect(sectionNode).toBeVisible();
  await moveMouseToLocator(page, sectionNode);
  const slider = sectionNode
    .locator("input[type='range'], [role='slider']")
    .first();
  await expect(slider).toBeVisible();
  await moveMouseToLocator(page, slider);
  return runGpuFlowInteractionBenchmark(page, "slider-input", async () => {
    await dragLocator(page, slider, { dx: 80, dy: 0, steps: 12 });
  });
}

export async function benchmarkTextInput(
  page: Page,
  project: GpuFlowInteractionStressProject,
): Promise<GpuFlowInteractionBenchmarkSummary> {
  const sectionNode = sectionNodeById(page, project.dictSectionId);
  await expect(sectionNode).toBeVisible();
  await ensureGpuFlowVisualNodeVisible(page, project.dictSectionId);
  const textbox = sectionNode.locator("input[placeholder='Filter']").first();
  await expect(textbox).toBeVisible();
  return runGpuFlowInteractionBenchmark(page, "text-input", async () => {
    const point = await readGpuFlowDescendantVisualPointBySelector(
      page,
      project.dictSectionId,
      "input[placeholder='Filter']",
    );
    await page.mouse.click(point.x, point.y);
    await expect(textbox).toBeFocused();
    await page.keyboard.type("kwarg 1");
    await expect(textbox).toHaveValue("kwarg 1");
  });
}

export function summarizeNumberSeries(
  values: readonly number[],
): GpuFlowInteractionBenchmarkStats {
  return {
    average: average(values),
    count: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    worst: maxOrNull(values),
  };
}

export function percentile(
  values: readonly number[],
  fraction: number,
): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const clampedFraction = Math.min(1, Math.max(0, fraction));
  const index = Math.ceil(clampedFraction * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? null;
}

async function readParamIds(page: Page, sectionId: string): Promise<string[]> {
  const sectionNode = sectionNodeById(page, sectionId);
  await expect(
    sectionNode.locator(`[id^="ParamContainer-${sectionId}-"]`).first(),
  ).toBeVisible({ timeout: 20_000 });
  return readCurrentParamIds(page, sectionId);
}

async function readCurrentParamIds(
  page: Page,
  sectionId: string,
): Promise<string[]> {
  return sectionNodeById(page, sectionId)
    .locator(`[id^="ParamContainer-${sectionId}-"]`)
    .evaluateAll((nodes, prefix) => {
      return nodes
        .map((node) => node.id)
        .filter((id) => id.startsWith(prefix))
        .map((id) => id.slice(prefix.length));
    }, `ParamContainer-${sectionId}-`);
}

function getParamRowElementId(sectionId: string, paramId: string): string {
  return `ParamContainer-${sectionId}-${paramId}`;
}

async function waitForSectionSizeChange(
  page: Page,
  sectionId: string,
  initialSize: { height: number | "auto"; width: number | "auto" },
): Promise<void> {
  const initialSignature = JSON.stringify(initialSize);
  await expect
    .poll(
      async () =>
        JSON.stringify(await readGpuFlowBenchmarkSectionSize(page, sectionId)),
      { timeout: 5_000 },
    )
    .not.toBe(initialSignature);
}

async function waitForBenchmarkSection(page: Page, sectionId: string) {
  await expect(sectionNodeById(page, sectionId)).toBeVisible({
    timeout: 20_000,
  });
}

function sectionNodeById(page: Page, sectionId: string): Locator {
  return page.locator(`.setta-gpu-flow__node[data-id="${sectionId}"]`).first();
}

async function resolveBenchmarkViewportBounds(
  page: Page,
): Promise<GpuFlowBenchmarkViewportBounds | null> {
  const transformedBounds = await getViewportBoundsForPlacement(page);
  if (transformedBounds) {
    return transformedBounds;
  }
  return page.evaluate(() => {
    const pane = document.querySelector(".setta-gpu-flow__pane");
    if (!(pane instanceof HTMLElement)) {
      return null;
    }
    const paneRect = pane.getBoundingClientRect();
    if (paneRect.width <= 0 || paneRect.height <= 0) {
      return null;
    }
    const gutter = 16;
    const overviewPane = document.getElementById("OverviewPane");
    const uiEditorPane = document.getElementById("UiEditorPane");

    const leftOverlays = [
      overviewPane?.querySelector("aside.single-cell-container"),
      overviewPane?.querySelector('[data-testid="overview-icon-rail"]'),
    ];
    const rightOverlays = [
      uiEditorPane?.querySelector("aside.single-cell-container"),
      uiEditorPane?.querySelector('[data-testid="ui-editor-icon-rail"]'),
    ];
    let leftPx = gutter;
    for (const overlay of leftOverlays) {
      if (!(overlay instanceof HTMLElement)) {
        continue;
      }
      const rect = overlay.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        leftPx = Math.max(leftPx, rect.right - paneRect.left + gutter);
      }
    }
    let rightPx = paneRect.width - gutter;
    for (const overlay of rightOverlays) {
      if (!(overlay instanceof HTMLElement)) {
        continue;
      }
      const rect = overlay.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        rightPx = Math.min(rightPx, rect.left - paneRect.left - gutter);
      }
    }

    return {
      h: Math.max(1, paneRect.height - gutter * 2),
      w: Math.max(1, rightPx - leftPx),
      x: leftPx,
      y: gutter,
    };
  });
}

async function moveMouseToLocator(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Missing locator bounds for GpuFlow benchmark.");
  }
  await page.mouse.move(
    box.x + Math.min(12, box.width * 0.5),
    box.y + Math.min(12, box.height * 0.5),
  );
  await page.waitForTimeout(80);
}

async function moveMouseToNestedResizeHandle(
  page: Page,
  parentNodeId: string,
  nestedSectionId: string,
): Promise<{ readonly x: number; readonly y: number }> {
  const point = await readNestedResizeHandleVisualPoint(
    page,
    parentNodeId,
    nestedSectionId,
  );
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(80);
  return point;
}

async function dragNestedSectionBottomRight(
  page: Page,
  {
    dx,
    dy,
    nestedSectionId,
    parentNodeId,
    steps = DEFAULT_BENCHMARK_DRAG_STEPS,
  }: {
    readonly dx: number;
    readonly dy: number;
    readonly nestedSectionId: string;
    readonly parentNodeId: string;
    readonly steps?: number | undefined;
  },
): Promise<void> {
  const start = await moveMouseToNestedResizeHandle(
    page,
    parentNodeId,
    nestedSectionId,
  );
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps });
  await page.mouse.up();
}

async function dragGpuFlowDescendantByIdToPoint(
  page: Page,
  {
    elementId,
    nodeId,
    sourcePoint,
    targetPoint,
    steps = DEFAULT_BENCHMARK_DRAG_STEPS,
  }: {
    readonly elementId: string;
    readonly nodeId: string;
    readonly sourcePoint?:
      | { readonly x: number; readonly y: number }
      | undefined;
    readonly targetPoint: { readonly x: number; readonly y: number };
    readonly steps?: number | undefined;
  },
): Promise<void> {
  const start =
    sourcePoint ??
    (await readGpuFlowDescendantVisualPointById(page, nodeId, elementId));
  await page.mouse.move(start.x, start.y);
  await page.waitForTimeout(80);
  await page.mouse.down();
  await page.mouse.move(targetPoint.x, targetPoint.y, { steps });
  await page.mouse.up();
}

async function dragVisualNodeBottomRight(
  page: Page,
  nodeId: string,
  {
    dx,
    dy,
    steps = DEFAULT_BENCHMARK_DRAG_STEPS,
  }: {
    readonly dx: number;
    readonly dy: number;
    readonly steps?: number | undefined;
  },
): Promise<void> {
  await ensureGpuFlowVisualNodeVisible(page, nodeId);
  const rect = await readGpuFlowVisualNodeRect(page, nodeId);
  const start = {
    x: rect.x + rect.width - 4,
    y: rect.y + rect.height - 4,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps });
  await page.mouse.up();
}

async function dragVisualNodeBody(
  page: Page,
  nodeId: string,
  {
    dx,
    dy,
    steps = DEFAULT_BENCHMARK_DRAG_STEPS,
  }: {
    readonly dx: number;
    readonly dy: number;
    readonly steps?: number | undefined;
  },
): Promise<void> {
  await ensureGpuFlowVisualNodeVisible(page, nodeId);
  const start = await readGpuFlowVisualNodeUnoccludedPoint(page, nodeId);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps });
  await page.mouse.up();
}

async function ensureGpuFlowVisualNodeVisible(
  page: Page,
  nodeId: string,
): Promise<void> {
  await page.evaluate(async (inputNodeId) => {
    const { gpuFlowLayoutStore } = await import("/src/gpuFlow/layoutStore.ts");
    const { gpuFlowViewportStore } = await import(
      "/src/gpuFlow/viewportStore.ts"
    );
    const layout = gpuFlowLayoutStore.getState().getNode(inputNodeId);
    if (!layout) {
      throw new Error(`Missing GpuFlow layout node ${inputNodeId}.`);
    }
    if (layout.width === null || layout.height === null) {
      throw new Error(`Missing GpuFlow layout dimensions for ${inputNodeId}.`);
    }
    const state = gpuFlowViewportStore.getState();
    const container = state.domNode;
    if (!(container instanceof HTMLElement)) {
      throw new Error("Missing GpuFlow viewport container.");
    }
    const containerRect = container.getBoundingClientRect();
    const viewport = state.getViewport();
    const margin = 32;
    const overviewPane = document.getElementById("OverviewPane");
    const uiEditorPane = document.getElementById("UiEditorPane");
    const leftOverlays = [
      overviewPane?.querySelector("aside.single-cell-container"),
      overviewPane?.querySelector('[data-testid="overview-icon-rail"]'),
    ];
    const rightOverlays = [
      uiEditorPane?.querySelector("aside.single-cell-container"),
      uiEditorPane?.querySelector('[data-testid="ui-editor-icon-rail"]'),
    ];
    let overlayLeft = margin;
    for (const overlay of leftOverlays) {
      if (!(overlay instanceof HTMLElement)) {
        continue;
      }
      const rect = overlay.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        overlayLeft = Math.max(
          overlayLeft,
          rect.right - containerRect.left + margin,
        );
      }
    }
    let overlayRight = containerRect.width - margin;
    for (const overlay of rightOverlays) {
      if (!(overlay instanceof HTMLElement)) {
        continue;
      }
      const rect = overlay.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        overlayRight = Math.min(
          overlayRight,
          rect.left - containerRect.left - margin,
        );
      }
    }
    const usableLeft = Math.max(280, overlayLeft);
    const usableRight = Math.max(usableLeft + 1, overlayRight);
    const usableTop = margin;
    const usableBottom = Math.max(usableTop + 1, containerRect.height - margin);
    let nextX = viewport.x;
    let nextY = viewport.y;
    const nodeLeft = nextX + layout.x * viewport.zoom;
    const nodeTop = nextY + layout.y * viewport.zoom;
    const nodeRight = nodeLeft + layout.width * viewport.zoom;
    const nodeBottom = nodeTop + layout.height * viewport.zoom;
    if (nodeRight > usableRight) {
      nextX -= nodeRight - usableRight;
    }
    if (nodeLeft < usableLeft) {
      nextX += usableLeft - nodeLeft;
    }
    if (nodeBottom > usableBottom) {
      nextY -= nodeBottom - usableBottom;
    }
    if (nodeTop < usableTop) {
      nextY += usableTop - nodeTop;
    }
    if (nextX !== viewport.x || nextY !== viewport.y) {
      state.setTransform({ x: nextX, y: nextY, zoom: viewport.zoom });
    }
  }, nodeId);
  await page.waitForTimeout(80);
}

async function readGpuFlowVisualNodeRect(
  page: Page,
  nodeId: string,
): Promise<GpuFlowVisualNodeRect> {
  return page.evaluate(async (inputNodeId) => {
    const { gpuFlowLayoutStore } = await import("/src/gpuFlow/layoutStore.ts");
    const { gpuFlowViewportStore } = await import(
      "/src/gpuFlow/viewportStore.ts"
    );
    const layout = gpuFlowLayoutStore.getState().getNode(inputNodeId);
    if (!layout) {
      throw new Error(`Missing GpuFlow layout node ${inputNodeId}.`);
    }
    if (layout.width === null || layout.height === null) {
      throw new Error(`Missing GpuFlow layout dimensions for ${inputNodeId}.`);
    }
    const viewport = gpuFlowViewportStore.getState().getViewport();
    const container = gpuFlowViewportStore.getState().domNode;
    if (!(container instanceof HTMLElement)) {
      throw new Error("Missing GpuFlow viewport container.");
    }
    const containerRect = container.getBoundingClientRect();
    return {
      height: layout.height * viewport.zoom,
      width: layout.width * viewport.zoom,
      x: containerRect.left + viewport.x + layout.x * viewport.zoom,
      y: containerRect.top + viewport.y + layout.y * viewport.zoom,
    };
  }, nodeId);
}

async function readGpuFlowViewport(
  page: Page,
): Promise<readonly [number, number, number]> {
  return page.evaluate(async () => {
    const { gpuFlowViewportStore } = await import(
      "/src/gpuFlow/viewportStore.ts"
    );
    return gpuFlowViewportStore.getState().transform;
  });
}

async function waitForGpuFlowViewportChange(
  page: Page,
  initialViewport: readonly [number, number, number],
): Promise<void> {
  const initialSignature = JSON.stringify(initialViewport);
  await expect
    .poll(
      async () => JSON.stringify(await readGpuFlowViewport(page)),
      { timeout: 5_000 },
    )
    .not.toBe(initialSignature);
}

async function waitForGpuFlowPerformanceProbeQuiet(
  page: Page,
): Promise<void> {
  const timeoutMs = 3_000;
  const quietMs = 250;
  const startedAt = Date.now();
  let lastSignature = "";
  let quietStartedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await readGpuFlowPerformanceSnapshot(page);
    const signature = [
      snapshot.queueCalls.length,
      snapshot.requestPaintCalls.length,
      snapshot.sourceMutations.length,
    ].join(":");
    if (signature !== lastSignature) {
      lastSignature = signature;
      quietStartedAt = Date.now();
    } else if (Date.now() - quietStartedAt >= quietMs) {
      return;
    }
    await page.waitForTimeout(50);
  }
}

async function clearGpuFlowDocumentFocusForBenchmark(
  page: Page,
): Promise<void> {
  await page.evaluate(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
    document.getSelection()?.removeAllRanges();
  });
  await waitForBenchmarkFrames(page);
  await waitForGpuFlowPerformanceProbeQuiet(page);
}

async function settleGpuFlowViewportBeforeBenchmark(
  page: Page,
  initialViewport: readonly [number, number, number],
): Promise<void> {
  await setGpuFlowViewport(page, [
    initialViewport[0] + 0.5,
    initialViewport[1],
    initialViewport[2],
  ]);
  await waitForBenchmarkFrames(page);
  await setGpuFlowViewport(page, initialViewport);
  await waitForBenchmarkFrames(page);
  await waitForGpuFlowPerformanceProbeQuiet(page);
}

async function setGpuFlowPanActivationKeyPressed(
  page: Page,
  pressed: boolean,
): Promise<void> {
  await page.evaluate(async (nextPressed) => {
    const { gpuFlowViewportStore } = await import(
      "/src/gpuFlow/viewportStore.ts"
    );
    gpuFlowViewportStore.getState().setPanActivationKeyPressed(nextPressed);
  }, pressed);
}

async function setGpuFlowViewport(
  page: Page,
  viewport: readonly [number, number, number],
): Promise<void> {
  await page.evaluate(async (nextViewport) => {
    const { gpuFlowViewportStore } = await import(
      "/src/gpuFlow/viewportStore.ts"
    );
    gpuFlowViewportStore.getState().setTransform(nextViewport);
  }, viewport);
}

async function waitForGpuFlowInteractiveSourceCount(
  page: Page,
  expectedCount: number,
): Promise<void> {
  await expect
    .poll(
      async () =>
        page
          .locator(
            "[data-gpu-flow-node='true'][data-gpu-flow-interactive='true']",
          )
          .count(),
      { timeout: 5_000 },
    )
    .toBe(expectedCount);
}

async function readGpuFlowBackgroundVisualPoint(
  page: Page,
): Promise<{ readonly x: number; readonly y: number }> {
  return page.evaluate(async () => {
    const {
      resolveGpuNodePointerHandoffTarget,
      resolveGpuNodeWheelHandoffTarget,
    } = await import("/src/gpuFlow/activeNodeTargeting.ts");
    const { gpuFlowLayoutStore } = await import("/src/gpuFlow/layoutStore.ts");
    const { gpuFlowViewportStore } = await import(
      "/src/gpuFlow/viewportStore.ts"
    );
    const state = gpuFlowViewportStore.getState();
    const container = state.domNode;
    if (!(container instanceof HTMLElement)) {
      throw new Error("Missing GpuFlow viewport container.");
    }
    const containerRect = container.getBoundingClientRect();
    const findPoint = () => {
      const viewport = state.getViewport();
      const nodes = gpuFlowLayoutStore.getState().getNodes();
      const measuredNodes = nodes.filter(
        (node) => node.width !== null && node.height !== null,
      );
      const elementByNodeId = new Map<string, HTMLElement>();
      for (const element of document.querySelectorAll(
        "[data-gpu-flow-node='true'][data-id]",
      )) {
        if (element instanceof HTMLElement) {
          const nodeId = element.getAttribute("data-id");
          if (nodeId) {
            elementByNodeId.set(nodeId, element);
          }
        }
      }
      for (let yRatio = 0.14; yRatio <= 0.86; yRatio += 0.08) {
        for (let xRatio = 0.14; xRatio <= 0.86; xRatio += 0.08) {
          const x = containerRect.left + containerRect.width * xRatio;
          const y = containerRect.top + containerRect.height * yRatio;
          const target = document.elementFromPoint(x, y);
          if (
            !(target instanceof HTMLElement) ||
            target.getAttribute("data-gpu-flow-surface") !== "true"
          ) {
            continue;
          }
          const flowPoint = {
            x: (x - containerRect.left - viewport.x) / viewport.zoom,
            y: (y - containerRect.top - viewport.y) / viewport.zoom,
          };
          const nearNode = measuredNodes.some((node) => {
            const margin = 48 / viewport.zoom;
            return (
              flowPoint.x >= node.x - margin &&
              flowPoint.x <= node.x + (node.width ?? 0) + margin &&
              flowPoint.y >= node.y - margin &&
              flowPoint.y <= node.y + (node.height ?? 0) + margin
            );
          });
          const pointerHandoffTarget = resolveGpuNodePointerHandoffTarget({
            clientX: x,
            clientY: y,
            elementByNodeId,
            nodes,
            surfaceElement: container,
            viewport,
          });
          const wheelHandoffTarget = resolveGpuNodeWheelHandoffTarget({
            clientX: x,
            clientY: y,
            elementByNodeId,
            nodes,
            surfaceElement: container,
            viewport,
          });
          if (
            !nearNode &&
            !gpuFlowLayoutStore.getState().getNodeAtPoint(flowPoint) &&
            !pointerHandoffTarget &&
            !wheelHandoffTarget
          ) {
            return { x, y };
          }
        }
      }
      return null;
    };
    const existingPoint = findPoint();
    if (existingPoint) {
      return existingPoint;
    }
    const nodes = gpuFlowLayoutStore.getState().getNodes();
    const measuredNodes = nodes.filter(
      (node) => node.width !== null && node.height !== null,
    );
    if (measuredNodes.length > 0) {
      const viewport = state.getViewport();
      const minX = Math.min(...measuredNodes.map((node) => node.x));
      const minY = Math.min(...measuredNodes.map((node) => node.y));
      state.setTransform({
        x: containerRect.width * 0.55 - minX * viewport.zoom,
        y: containerRect.height * 0.4 - minY * viewport.zoom,
        zoom: viewport.zoom,
      });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const shiftedPoint = findPoint();
      if (shiftedPoint) {
        return shiftedPoint;
      }
    }
    throw new Error("Unable to find a GpuFlow background pan/zoom point.");
  });
}

async function readGpuFlowVisualNodeUnoccludedPoint(
  page: Page,
  nodeId: string,
): Promise<{ readonly x: number; readonly y: number }> {
  return page.evaluate(async (inputNodeId) => {
    const { gpuFlowLayoutStore } = await import("/src/gpuFlow/layoutStore.ts");
    const { gpuFlowViewportStore } = await import(
      "/src/gpuFlow/viewportStore.ts"
    );
    const layout = gpuFlowLayoutStore.getState().getNode(inputNodeId);
    if (!layout) {
      throw new Error(`Missing GpuFlow layout node ${inputNodeId}.`);
    }
    if (layout.width === null || layout.height === null) {
      throw new Error(`Missing GpuFlow layout dimensions for ${inputNodeId}.`);
    }
    const viewport = gpuFlowViewportStore.getState().getViewport();
    const container = gpuFlowViewportStore.getState().domNode;
    if (!(container instanceof HTMLElement)) {
      throw new Error("Missing GpuFlow viewport container.");
    }
    const containerRect = container.getBoundingClientRect();
    const candidates = [
      [0.5, 0.08],
      [0.35, 0.08],
      [0.65, 0.08],
      [0.5, 0.65],
      [0.5, 0.35],
      [0.25, 0.5],
      [0.75, 0.5],
      [0.35, 0.8],
      [0.65, 0.8],
      [0.35, 0.25],
      [0.65, 0.25],
    ] as const;
    for (const [xRatio, yRatio] of candidates) {
      const flowPoint = {
        x: layout.x + layout.width * xRatio,
        y: layout.y + layout.height * yRatio,
      };
      const hitNode = gpuFlowLayoutStore.getState().getNodeAtPoint(flowPoint);
      if (hitNode?.nodeId !== inputNodeId) {
        continue;
      }
      return {
        x: containerRect.left + viewport.x + flowPoint.x * viewport.zoom,
        y: containerRect.top + viewport.y + flowPoint.y * viewport.zoom,
      };
    }
    throw new Error(
      `Unable to find an unoccluded visual drag point for ${inputNodeId}.`,
    );
  }, nodeId);
}

async function readNestedResizeHandleVisualPoint(
  page: Page,
  parentNodeId: string,
  nestedSectionId: string,
): Promise<{ readonly x: number; readonly y: number }> {
  return page.evaluate(
    async ({ inputNestedSectionId, inputParentNodeId }) => {
      const { gpuFlowLayoutStore } = await import(
        "/src/gpuFlow/layoutStore.ts"
      );
      const { gpuFlowViewportStore } = await import(
        "/src/gpuFlow/viewportStore.ts"
      );
      const layout = gpuFlowLayoutStore.getState().getNode(inputParentNodeId);
      if (!layout) {
        throw new Error(`Missing GpuFlow layout node ${inputParentNodeId}.`);
      }
      const viewport = gpuFlowViewportStore.getState().getViewport();
      const container = gpuFlowViewportStore.getState().domNode;
      if (!(container instanceof HTMLElement)) {
        throw new Error("Missing GpuFlow viewport container.");
      }
      const parent = document.querySelector<HTMLElement>(
        `.setta-gpu-flow__node[data-id="${inputParentNodeId}"]`,
      );
      const handle = parent?.querySelector<HTMLElement>(
        `section[data-section-id="${inputNestedSectionId}"] .section-resize-handle-bottom-right`,
      );
      if (!parent || !handle) {
        throw new Error(
          `Missing nested resize handle ${inputNestedSectionId}.`,
        );
      }
      const parentRect = parent.getBoundingClientRect();
      const handleRect = handle.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      return {
        x:
          containerRect.left +
          viewport.x +
          (layout.x + handleRect.left - parentRect.left + handleRect.width / 2) *
            viewport.zoom,
        y:
          containerRect.top +
          viewport.y +
          (layout.y + handleRect.top - parentRect.top + handleRect.height / 2) *
            viewport.zoom,
      };
    },
    { inputNestedSectionId: nestedSectionId, inputParentNodeId: parentNodeId },
  );
}

async function readGpuFlowDescendantVisualPointById(
  page: Page,
  nodeId: string,
  elementId: string,
): Promise<{ readonly x: number; readonly y: number }> {
  return readGpuFlowDescendantVisualPoint(page, {
    nodeId,
    selector: `[id="${escapeCssString(elementId)}"]`,
  });
}

async function readGpuFlowDescendantVisualPointBySelector(
  page: Page,
  nodeId: string,
  selector: string,
): Promise<{ readonly x: number; readonly y: number }> {
  return readGpuFlowDescendantVisualPoint(page, { nodeId, selector });
}

async function readGpuFlowDescendantVisualPoint(
  page: Page,
  {
    nodeId,
    selector,
    xRatio = 0.5,
    yRatio = 0.5,
  }: {
    readonly nodeId: string;
    readonly selector: string;
    readonly xRatio?: number | undefined;
    readonly yRatio?: number | undefined;
  },
): Promise<{ readonly x: number; readonly y: number }> {
  return page.evaluate(
    async ({ inputNodeId, inputSelector, inputXRatio, inputYRatio }) => {
      const { gpuFlowLayoutStore } = await import(
        "/src/gpuFlow/layoutStore.ts"
      );
      const { gpuFlowViewportStore } = await import(
        "/src/gpuFlow/viewportStore.ts"
      );
      const layout = gpuFlowLayoutStore.getState().getNode(inputNodeId);
      if (!layout) {
        throw new Error(`Missing GpuFlow layout node ${inputNodeId}.`);
      }
      const viewport = gpuFlowViewportStore.getState().getViewport();
      const container = gpuFlowViewportStore.getState().domNode;
      if (!(container instanceof HTMLElement)) {
        throw new Error("Missing GpuFlow viewport container.");
      }
      const parent = document.querySelector<HTMLElement>(
        `.setta-gpu-flow__node[data-id="${inputNodeId}"]`,
      );
      const descendant = parent?.querySelector(inputSelector);
      if (
        !parent ||
        !(descendant instanceof HTMLElement) ||
        !parent.contains(descendant)
      ) {
        throw new Error(
          `Missing GpuFlow descendant ${inputSelector} for ${inputNodeId}.`,
        );
      }
      const parentRect = parent.getBoundingClientRect();
      const descendantRect = descendant.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      return {
        x:
          containerRect.left +
          viewport.x +
          (layout.x +
            descendantRect.left -
            parentRect.left +
            descendantRect.width * inputXRatio) *
            viewport.zoom,
        y:
          containerRect.top +
          viewport.y +
          (layout.y +
            descendantRect.top -
            parentRect.top +
            descendantRect.height * inputYRatio) *
            viewport.zoom,
      };
    },
    {
      inputNodeId: nodeId,
      inputSelector: selector,
      inputXRatio: xRatio,
      inputYRatio: yRatio,
    },
  );
}

function escapeCssString(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

async function dragLocator(
  page: Page,
  locator: Locator,
  {
    dx,
    dy,
    steps = DEFAULT_BENCHMARK_DRAG_STEPS,
  }: {
    readonly dx: number;
    readonly dy: number;
    readonly steps?: number | undefined;
  },
) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Missing drag source bounds for GpuFlow benchmark.");
  }
  await dragLocatorToPoint(page, locator, {
    steps,
    x: box.x + box.width * 0.5 + dx,
    y: box.y + box.height * 0.5 + dy,
  });
}

async function dragLocatorToPoint(
  page: Page,
  locator: Locator,
  {
    steps = DEFAULT_BENCHMARK_DRAG_STEPS,
    x,
    y,
  }: {
    readonly steps?: number | undefined;
    readonly x: number;
    readonly y: number;
  },
) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Missing drag source bounds for GpuFlow benchmark.");
  }
  const start = {
    x: box.x + Math.min(12, box.width * 0.5),
    y: box.y + Math.min(12, box.height * 0.5),
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps });
  await page.mouse.up();
}

async function waitForBenchmarkFrames(page: Page): Promise<void> {
  await waitForAnimationFrames(page, 2);
  await page.waitForTimeout(120);
}

async function waitForAnimationFrames(
  page: Page,
  count: number,
): Promise<void> {
  await page.evaluate(async (frameCount) => {
    for (let index = 0; index < frameCount; index += 1) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
  }, count);
}


function createDurableMutationCounter(page: Page): {
  count(): number;
  stop(): void;
} {
  let durableMutationCount = 0;
  const onRequest = (request: Request) => {
    const url = new URL(request.url());
    if (DURABLE_MUTATION_PATHS.has(url.pathname)) {
      durableMutationCount += 1;
    }
  };
  page.on("request", onRequest);
  return {
    count() {
      return durableMutationCount;
    },
    stop() {
      page.off("request", onRequest);
    },
  };
}

function isTimestampInWindow(
  timestampMs: number,
  startTimeMs: number,
  endTimeMs: number,
): boolean {
  return timestampMs >= startTimeMs && timestampMs <= endTimeMs;
}

function isTextureUpload(call: GpuFlowQueueCall): boolean {
  return call.method === "copyElementImageToTexture";
}

function isWriteBufferCall(call: GpuFlowQueueCall): boolean {
  return call.method === "writeBuffer";
}

function countBy(values: readonly string[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return sum(values) / values.length;
}

function maxOrNull(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return Math.max(...values);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export async function readGpuFlowBenchmarkSectionSize(
  page: Page,
  sectionId: string,
): Promise<{ height: number | "auto"; width: number | "auto" }> {
  const state = await loadProjectConfig(page);
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    throw new Error(`Missing section variant for ${sectionId}.`);
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    throw new Error(`Missing section variant ${variantId}.`);
  }
  const impl = state.sectionImpls[variant.impl];
  if (!impl) {
    throw new Error(`Missing section impl ${variant.impl}.`);
  }
  return (
    state.sections[sectionId]?.sharedModifier?.size ??
    variant.modifier?.size ??
    impl.size
  );
}

export async function prepareGpuFlowInteractionBenchmarkFixtures(
  page: Page,
  projectConfigId: string,
): Promise<GpuFlowInteractionStressProject> {
  const project = await createGpuFlowInteractionStressProject(
    page,
    projectConfigId,
  );
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId,
    operations: [],
  });
  return project;
}
