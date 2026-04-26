import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addKwargFromFrontend,
  applyProjectMutationsFromFrontend,
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  getViewportBoundsForPlacement,
  loadProjectConfig,
  openIsolatedProject,
} from "../helpers";

const CANVAS_SELECTOR = ".canvas-flow__canvas";
const DATA_HANDLE_SELECTOR = ".canvas-flow__handle.arg-edge-handle";

type CanvasPoint = { x: number; y: number };
type CanvasDataEdgeGeometry = {
  midpoint: CanvasPoint;
  pathHit: boolean;
  reconnectStart: CanvasPoint;
  targetEndpointHit: boolean;
};
type EdgeSummary = {
  selected?: boolean;
  sourceSectionId?: string;
  targetSectionId?: string;
};

test("CanvasFlow data edges select and reconnect through canvas gestures", async ({
  page,
}) => {
  test.setTimeout(120000);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const viewportBounds = await getViewportBoundsForPlacement(page);
    if (!viewportBounds) {
      throw new Error("Unable to resolve CanvasFlow viewport bounds.");
    }

    const sourceSectionId = await createDictSection(page, {
      projectConfigId: projectContext.projectConfigId,
      position: { x: viewportBounds.x + 80, y: viewportBounds.y + 120 },
      viewportBounds,
    });
    const originalTargetSectionId = await createDictSection(page, {
      projectConfigId: projectContext.projectConfigId,
      position: { x: viewportBounds.x + 520, y: viewportBounds.y + 80 },
      viewportBounds,
    });
    const nextTargetSectionId = await createDictSection(page, {
      projectConfigId: projectContext.projectConfigId,
      position: { x: viewportBounds.x + 520, y: viewportBounds.y + 360 },
      viewportBounds,
    });

    const [originalTargetParamId, nextTargetParamId] = await Promise.all([
      addSingleKwargAndReturnId(
        page,
        projectContext.projectConfigId,
        originalTargetSectionId,
      ),
      addSingleKwargAndReturnId(
        page,
        projectContext.projectConfigId,
        nextTargetSectionId,
      ),
    ]);
    const sourcePortId = "canvas-flow-out";

    const config = await loadProjectConfig(page);
    const sourceVariantId =
      config.projectConfig.sectionVariantMap[sourceSectionId] ?? null;
    const originalTargetVariantId =
      config.projectConfig.sectionVariantMap[originalTargetSectionId] ?? null;
    if (!sourceVariantId || !originalTargetVariantId) {
      throw new Error("Missing section variant ids for data edge creation.");
    }

    await applyProjectMutationsFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      operations: [
        {
          operationName: "setSectionEdgeOutputs",
          body: {
            sectionId: sourceSectionId,
            edgeOutputPorts: [{ id: sourcePortId, accessor: "out" }],
            frontendOpId: null,
          },
        },
        {
          operationName: "setSectionEdgeInputs",
          body: {
            sectionId: originalTargetSectionId,
            edgeInputParams: [originalTargetParamId],
            frontendOpId: null,
          },
        },
        {
          operationName: "setSectionEdgeInputs",
          body: {
            sectionId: nextTargetSectionId,
            edgeInputParams: [nextTargetParamId],
            frontendOpId: null,
          },
        },
        {
          operationName: "createEdge",
          body: {
            sourceSectionId,
            sourceVariantId,
            sourcePortId,
            targetSectionId: originalTargetSectionId,
            targetVariantId: originalTargetVariantId,
            targetPortId: originalTargetParamId,
            type: "default",
          },
        },
      ],
    });

    await expect(page.locator(CANVAS_SELECTOR)).toBeVisible();
    await expect(page.locator(".react-flow__viewport")).toHaveCount(0);
    await expect(page.locator("svg.react-flow__edges")).toHaveCount(0);

    const sourceHandle = dataHandle(page, sourceSectionId, sourcePortId);
    const originalTargetHandle = dataHandle(
      page,
      originalTargetSectionId,
      originalTargetParamId,
    );
    const nextTargetHandle = dataHandle(
      page,
      nextTargetSectionId,
      nextTargetParamId,
    );
    await expect(sourceHandle).toBeVisible();
    await expect(originalTargetHandle).toBeVisible();
    await expect(nextTargetHandle).toBeVisible();

    const edgeGeometry = await getOnlyDataEdgeGeometry(page);
    expect(edgeGeometry.pathHit).toBe(true);
    expect(edgeGeometry.targetEndpointHit).toBe(true);

    await expectPointTargetsCanvas(page, edgeGeometry.midpoint);
    await page.mouse.click(edgeGeometry.midpoint.x, edgeGeometry.midpoint.y);
    await expect
      .poll(async () => {
        const edge = await loadOnlyDataEdge(page);
        return Boolean(edge.selected);
      })
      .toBe(true);

    const reconnectStart = edgeGeometry.reconnectStart;
    await expectPointTargetsCanvas(page, reconnectStart);

    const reconnectResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/reconnectEdge") &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 20000 },
    );
    const nextTargetCenter = await locatorCenter(nextTargetHandle);
    await page.mouse.move(reconnectStart.x, reconnectStart.y);
    await page.mouse.down();
    await page.mouse.move(nextTargetCenter.x, nextTargetCenter.y, {
      steps: 18,
    });
    await page.mouse.up();
    await reconnectResponse;

    await expect
      .poll(async () => {
        const edge = await loadOnlyDataEdge(page);
        return {
          sourceSectionId: edge.sourceSectionId,
          targetSectionId: edge.targetSectionId,
        };
      })
      .toEqual({
        sourceSectionId,
        targetSectionId: nextTargetSectionId,
      });
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

async function createDictSection(
  page: Page,
  payload: {
    projectConfigId: string;
    position: { x: number; y: number };
    viewportBounds: { x: number; y: number; w: number; h: number };
  },
): Promise<string> {
  const response = await createTopLevelSectionFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    implType: "Dict",
    position: payload.position,
    viewportBounds: payload.viewportBounds,
  });
  const sectionId = response?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating Dict section.");
  }
  return sectionId;
}

async function addSingleKwargAndReturnId(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<string> {
  await addKwargFromFrontend(page, { projectConfigId, sectionId });

  const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
  const idPrefix = `ParamContainer-${sectionId}-`;
  const firstParam = sectionNode.locator(`[id^="${idPrefix}"]`).first();
  await expect(firstParam).toBeVisible({ timeout: 20000 });
  const id = await firstParam.getAttribute("id");
  const paramId = id?.startsWith(idPrefix) ? id.slice(idPrefix.length) : null;
  if (!paramId) {
    throw new Error(`Unable to parse param id from "${id ?? ""}".`);
  }
  return paramId;
}

function dataHandle(page: Page, sectionId: string, handleId: string): Locator {
  return page.locator(
    `${DATA_HANDLE_SELECTOR}[data-nodeid="${sectionId}"][data-handleid="${handleId}"]`,
  );
}

async function locatorCenter(locator: Locator): Promise<CanvasPoint> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Missing locator bounding box.");
  }
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

async function expectPointTargetsCanvas(
  page: Page,
  point: CanvasPoint,
): Promise<void> {
  await expect
    .poll(async () => {
      return page.evaluate(({ x, y }) => {
        return document
          .elementFromPoint(x, y)
          ?.classList.contains("canvas-flow__canvas");
      }, point);
    })
    .toBe(true);
}

async function getOnlyDataEdgeGeometry(
  page: Page,
): Promise<CanvasDataEdgeGeometry> {
  return page.evaluate(async (canvasSelector) => {
    const { useEdgeHandleRegistry, useProjectState } = await import(
      "/src/state/definitions.ts"
    );
    const { buildDataEdges, getCanvasFlowEdgeHit } = await import(
      "/src/canvasflow/canvasFlowEdges.ts"
    );
    const { screenToWorldPoint, worldToScreenPoint } = await import(
      "/src/canvasflow/canvasFlowViewport.ts"
    );

    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    if (!canvas) {
      throw new Error("Missing CanvasFlow canvas.");
    }
    const rect = canvas.getBoundingClientRect();
    const viewport = {
      x: Number.parseFloat(canvas.dataset.viewportX ?? "0"),
      y: Number.parseFloat(canvas.dataset.viewportY ?? "0"),
      zoom: Number.parseFloat(canvas.dataset.viewportZoom ?? "1"),
    };
    const state = useProjectState.getState();
    const edges = buildDataEdges({
      edges: state.projectConfig.edges,
      positions: useEdgeHandleRegistry.getState().positions,
      sectionVariantMap: state.projectConfig.sectionVariantMap,
      showArgEdges: true,
    });
    const [edge] = edges;
    if (!edge || edges.length !== 1) {
      throw new Error(
        `Expected exactly one canvas data edge. Found ${edges.length}.`,
      );
    }

    const toPagePoint = (worldPoint: CanvasPoint) => {
      const screenPoint = worldToScreenPoint(worldPoint, viewport);
      return {
        x: rect.left + screenPoint.x,
        y: rect.top + screenPoint.y,
      };
    };
    const toWorldPoint = (pagePoint: CanvasPoint) => {
      return screenToWorldPoint(
        {
          x: pagePoint.x - rect.left,
          y: pagePoint.y - rect.top,
        },
        viewport,
      );
    };
    const source = toPagePoint(edge.source);
    const target = toPagePoint(edge.target);
    const midpoint = {
      x: (source.x + target.x) / 2,
      y: (source.y + target.y) / 2,
    };
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.hypot(dx, dy) || 1;
    const reconnectStart = {
      x: target.x - (dx / length) * 9,
      y: target.y - (dy / length) * 9,
    };
    const midpointHit = getCanvasFlowEdgeHit({
      edges,
      point: toWorldPoint(midpoint),
      viewport,
    });
    const endpointHit = getCanvasFlowEdgeHit({
      edges,
      point: toWorldPoint(reconnectStart),
      viewport,
    });

    return {
      midpoint,
      pathHit: Boolean(midpointHit),
      reconnectStart,
      targetEndpointHit: endpointHit?.endpoint === "target",
    };
  }, CANVAS_SELECTOR);
}

async function loadOnlyDataEdge(page: Page): Promise<EdgeSummary> {
  const config = await loadProjectConfig(page);
  const [edge] = config.projectConfig.edges;
  if (!edge || config.projectConfig.edges.length !== 1) {
    throw new Error(
      `Expected exactly one data edge. Found ${config.projectConfig.edges.length}.`,
    );
  }
  return edge;
}
