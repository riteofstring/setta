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
  pathHit: boolean;
  reconnectStart: CanvasPoint;
  selectionPoint: CanvasPoint;
  targetEndpointHit: boolean;
};
type CanvasFlowRendererMode = "2d" | "webgl-texture-nodes";
type EdgeSummary = {
  selected?: boolean;
  sourceSectionId?: string;
  targetSectionId?: string;
};

for (const rendererMode of ["2d", "webgl-texture-nodes"] as const) {
  test(`CanvasFlow data edges select and reconnect through canvas gestures with ${rendererMode}`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    await installCanvasFlowRendererInitScript(page, rendererMode);
    await page.setViewportSize({ width: 1900, height: 1000 });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await expectCanvasFlowRendererMode(page, rendererMode);

      const viewportBounds = await getViewportBoundsForPlacement(page);
      if (!viewportBounds) {
        throw new Error("Unable to resolve CanvasFlow viewport bounds.");
      }

      const targetX = viewportBounds.x + 1000;
      const sourceSectionId = await createDictSection(page, {
        projectConfigId: projectContext.projectConfigId,
        position: { x: viewportBounds.x + 80, y: viewportBounds.y + 120 },
        viewportBounds,
      });
      const originalTargetSectionId = await createDictSection(page, {
        projectConfigId: projectContext.projectConfigId,
        position: { x: targetX, y: viewportBounds.y + 80 },
        viewportBounds,
      });
      const nextTargetSectionId = await createDictSection(page, {
        projectConfigId: projectContext.projectConfigId,
        position: { x: targetX, y: viewportBounds.y + 360 },
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
        ],
      });
      await forceCanvasFlowZoomOnWheel(page);
      await zoomCanvasFlowOutForEdgeGesture(page);

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

      const sourceCenter = await locatorCenter(sourceHandle);
      const originalTargetCenter = await locatorCenter(originalTargetHandle);
      await createDataEdgeThroughHandles(page, {
        sourceCenter,
        targetCenter: originalTargetCenter,
      });

      await expect
        .poll(async () => readCanvasDatasetNumber(page, "edgeCount"))
        .toBe(1);
      if (rendererMode === "webgl-texture-nodes") {
        await expect
          .poll(async () => readCanvasDatasetNumber(page, "webglDrawnEdges"))
          .toBeGreaterThanOrEqual(1);
      }
      await setCanvasFlowNodePointerEvents(page, "none");

      const edgeGeometry = await getOnlyDataEdgeGeometry(page);
      expect(edgeGeometry.pathHit).toBe(true);
      expect(edgeGeometry.targetEndpointHit).toBe(true);

      await expectPointTargetsCanvas(page, edgeGeometry.selectionPoint);
      await page.mouse.click(
        edgeGeometry.selectionPoint.x,
        edgeGeometry.selectionPoint.y,
      );
      try {
        await expect
          .poll(async () => loadOnlyDataEdgeSelectedFromFrontend(page))
          .toBe(true);
      } catch (error) {
        const diagnostics = await collectCanvasEdgeSelectionDiagnostics(
          page,
          edgeGeometry.selectionPoint,
        );
        throw new Error(
          `${String(error)}\nData edge selection diagnostics: ${JSON.stringify(diagnostics, null, 2)}`,
        );
      }

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

      await selectSectionsWithCanvasBox(page, [
        sourceSectionId,
        nextTargetSectionId,
      ]);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
}

async function installCanvasFlowRendererInitScript(
  page: Page,
  rendererMode: CanvasFlowRendererMode,
) {
  await page.addInitScript((mode) => {
    const windowRef = window as typeof window & {
      __settaCanvasFlowRenderer?: CanvasFlowRendererMode;
    };
    if (mode === "webgl-texture-nodes") {
      windowRef.__settaCanvasFlowRenderer = mode;
      return;
    }
    windowRef.__settaCanvasFlowRenderer = "2d";
  }, rendererMode);
}

async function expectCanvasFlowRendererMode(
  page: Page,
  rendererMode: CanvasFlowRendererMode,
) {
  const canvas = page.locator(CANVAS_SELECTOR);
  await expect(canvas).toHaveAttribute("data-renderer-mode", rendererMode);
  await canvas.evaluate((element) => {
    (element as HTMLCanvasElement).dataset.canvasFlowDiagnostics = "enabled";
  });
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

async function readCanvasFlowRendererZoom(page: Page) {
  return page.locator(CANVAS_SELECTOR).evaluate(async (canvas) => {
    (
      canvas as HTMLCanvasElement & { requestPaint?: () => void }
    ).requestPaint?.();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const parsed = Number.parseFloat(
      (canvas as HTMLCanvasElement).dataset.viewportZoom ?? "",
    );
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

async function readCanvasDatasetNumber(page: Page, key: string) {
  return page.locator(CANVAS_SELECTOR).evaluate((canvas, datasetKey) => {
    const parsed = Number.parseFloat(
      (canvas as HTMLCanvasElement).dataset[datasetKey as string] ?? "",
    );
    return Number.isFinite(parsed) ? parsed : 0;
  }, key);
}

async function zoomCanvasFlowOutForEdgeGesture(page: Page) {
  const canvas = page.locator(CANVAS_SELECTOR);
  for (let index = 0; index < 3; index += 1) {
    await canvas.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + 260,
          clientY: rect.top + 260,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL,
          deltaY: 220,
        }),
      );
    });
    await page.waitForTimeout(120);
  }
  await expect
    .poll(async () => readCanvasFlowRendererZoom(page))
    .toBeLessThan(0.75);
}

async function setCanvasFlowNodePointerEvents(
  page: Page,
  value: "auto" | "none",
) {
  await page
    .locator(".canvas-flow__node, .canvas-flow__node *")
    .evaluateAll((elements, pointerEvents) => {
      for (const element of elements) {
        (element as HTMLElement).style.setProperty(
          "pointer-events",
          pointerEvents as string,
          "important",
        );
      }
    }, value);
}

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

async function createDataEdgeThroughHandles(
  page: Page,
  {
    sourceCenter,
    targetCenter,
  }: { sourceCenter: CanvasPoint; targetCenter: CanvasPoint },
) {
  const createEdgeResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/createEdge") &&
      response.status() >= 200 &&
      response.status() < 300,
    { timeout: 20000 },
  );
  await page.mouse.move(sourceCenter.x, sourceCenter.y);
  await page.mouse.down();
  await page.mouse.move(targetCenter.x, targetCenter.y, { steps: 18 });
  await page.mouse.up();
  try {
    await createEdgeResponse;
  } catch (error) {
    const diagnostics = await collectDataEdgeCreationDiagnostics(page, {
      sourceCenter,
      targetCenter,
    });
    throw new Error(
      `${String(error)}\nData edge creation diagnostics: ${JSON.stringify(diagnostics, null, 2)}`,
    );
  }
}

async function collectDataEdgeCreationDiagnostics(
  page: Page,
  {
    sourceCenter,
    targetCenter,
  }: { sourceCenter: CanvasPoint; targetCenter: CanvasPoint },
) {
  return page.evaluate(
    async ({ sourceCenter, targetCenter }) => {
      const { useEdgeHandleRegistry, useShareSession } = await import(
        "/src/state/definitions.ts"
      );
      const { useReactFlow } = await import(
        "/src/forks/xyflow/core/store/index.ts"
      );
      const describePoint = (point: CanvasPoint) => {
        const element = document.elementFromPoint(point.x, point.y);
        return {
          point,
          tagName: element?.tagName.toLowerCase() ?? null,
          className: element ? String(element.className) : null,
          dataNodeId: element?.getAttribute("data-nodeid") ?? null,
          dataHandleId: element?.getAttribute("data-handleid") ?? null,
        };
      };
      const describeHandles = () => {
        return Array.from(
          document.querySelectorAll<HTMLElement>(
            ".canvas-flow__handle.arg-edge-handle",
          ),
          (element) => {
            const rect = element.getBoundingClientRect();
            return {
              className: element.className,
              dataNodeId: element.dataset.nodeid ?? null,
              dataHandleId: element.dataset.handleid ?? null,
              pointerEvents: getComputedStyle(element).pointerEvents,
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              },
            };
          },
        );
      };
      return {
        source: describePoint(sourceCenter),
        target: describePoint(targetCenter),
        handles: describeHandles(),
        registryPositions: useEdgeHandleRegistry.getState().positions,
        shareSession: useShareSession.getState(),
        connectionState: {
          connectionEndHandle: useReactFlow.getState().connectionEndHandle,
          connectionStartHandle: useReactFlow.getState().connectionStartHandle,
          connectionStatus: useReactFlow.getState().connectionStatus,
        },
      };
    },
    { sourceCenter, targetCenter },
  );
}

async function collectCanvasEdgeSelectionDiagnostics(
  page: Page,
  selectionPoint: CanvasPoint,
) {
  return page.evaluate(
    async ({ selectionPoint, canvasSelector }) => {
      const { useProjectState, useEdgeHandleRegistry } = await import(
        "/src/state/definitions.ts"
      );
      const { useReactFlow } = await import(
        "/src/forks/xyflow/core/store/index.ts"
      );
      const { buildDataEdges, getCanvasFlowEdgeHit } = await import(
        "/src/canvasflow/canvasFlowEdges.ts"
      );
      const { screenToWorldPoint } = await import(
        "/src/canvasflow/canvasFlowViewport.ts"
      );
      const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
      const target = document.elementFromPoint(
        selectionPoint.x,
        selectionPoint.y,
      );
      const viewport = canvas
        ? {
            x: Number.parseFloat(canvas.dataset.viewportX ?? ""),
            y: Number.parseFloat(canvas.dataset.viewportY ?? ""),
            zoom: Number.parseFloat(canvas.dataset.viewportZoom ?? ""),
          }
        : null;
      const state = useProjectState.getState();
      const edges = buildDataEdges({
        edges: state.projectConfig.edges,
        positions: useEdgeHandleRegistry.getState().positions,
        sectionVariantMap: state.projectConfig.sectionVariantMap,
        showArgEdges: true,
      });
      const worldPoint =
        canvas && viewport
          ? screenToWorldPoint(
              {
                x: selectionPoint.x - canvas.getBoundingClientRect().left,
                y: selectionPoint.y - canvas.getBoundingClientRect().top,
              },
              viewport,
            )
          : null;
      const hit =
        worldPoint && viewport
          ? getCanvasFlowEdgeHit({ edges, point: worldPoint, viewport })
          : null;
      return {
        canvasDataset: canvas ? { ...canvas.dataset } : null,
        edgeHit: hit
          ? {
              endpoint: hit.endpoint,
              id: hit.edge.id,
              kind: hit.edge.kind,
            }
          : null,
        edges: state.projectConfig.edges,
        elementFromPoint: target
          ? {
              className: String(target.className),
              dataHandleId: target.getAttribute("data-handleid"),
              dataNodeId: target.getAttribute("data-nodeid"),
              tagName: target.tagName.toLowerCase(),
            }
          : null,
        point: selectionPoint,
        reactFlowState: {
          connectionStartHandle: useReactFlow.getState().connectionStartHandle,
          paneDragging: useReactFlow.getState().paneDragging,
          userSelectionActive: useReactFlow.getState().userSelectionActive,
          viewportInteractionActive:
            useReactFlow.getState().viewportInteractionActive,
        },
        worldPoint,
      };
    },
    { selectionPoint, canvasSelector: CANVAS_SELECTOR },
  );
}

async function expectPointTargetsCanvas(
  page: Page,
  point: CanvasPoint,
): Promise<void> {
  try {
    await expect
      .poll(async () => {
        return page.evaluate(({ x, y }) => {
          const element = document.elementFromPoint(x, y);
          return element?.classList.contains("canvas-flow__canvas") === true;
        }, point);
      })
      .toBe(true);
  } catch (error) {
    const target = await describePointTarget(page, point);
    throw new Error(
      `${String(error)}\nPoint: (${point.x.toFixed(1)}, ${point.y.toFixed(1)})\nPoint target: ${target}`,
    );
  }
}

async function describePointTarget(page: Page, point: CanvasPoint) {
  return page.evaluate(({ x, y }) => {
    const describeElementForError = (element: Element | null) => {
      if (!element) {
        return "<none>";
      }
      return [
        element.tagName.toLowerCase(),
        element.id ? `#${element.id}` : "",
        element.className
          ? `.${String(element.className).replace(/\s+/g, ".")}`
          : "",
        element.getAttribute("data-nodeid")
          ? `[data-nodeid="${element.getAttribute("data-nodeid")}"]`
          : "",
        element.getAttribute("data-handleid")
          ? `[data-handleid="${element.getAttribute("data-handleid")}"]`
          : "",
      ].join("");
    };
    const element = document.elementFromPoint(x, y);
    return describeElementForError(element);
  }, point);
}

async function selectSectionsWithCanvasBox(
  page: Page,
  sectionIds: Array<string>,
) {
  const canvas = page.locator(CANVAS_SELECTOR);
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error("Missing CanvasFlow canvas bounds.");
  }
  const boxes = await Promise.all(
    sectionIds.map(async (sectionId) => {
      const box = await page.getByTestId(`rf__node-${sectionId}`).boundingBox();
      if (!box) {
        throw new Error(`Missing node bounds for ${sectionId}.`);
      }
      return box;
    }),
  );
  const margin = 96;
  const union = {
    bottom: Math.max(...boxes.map((box) => box.y + box.height)),
    left: Math.min(...boxes.map((box) => box.x)),
    right: Math.max(...boxes.map((box) => box.x + box.width)),
    top: Math.min(...boxes.map((box) => box.y)),
  };
  const clampPoint = (point: CanvasPoint): CanvasPoint => ({
    x: Math.min(
      canvasBox.x + canvasBox.width - 4,
      Math.max(canvasBox.x + 4, point.x),
    ),
    y: Math.min(
      canvasBox.y + canvasBox.height - 4,
      Math.max(canvasBox.y + 4, point.y),
    ),
  });
  const dragPair = await resolveCanvasSelectionDragPair(page, [
    {
      end: clampPoint({
        x: union.right + margin,
        y: union.bottom + margin,
      }),
      start: clampPoint({ x: union.left - margin, y: union.top - margin }),
    },
    {
      end: clampPoint({ x: union.right + margin, y: union.top - margin }),
      start: clampPoint({ x: union.left - margin, y: union.bottom + margin }),
    },
    {
      end: clampPoint({ x: union.left - margin, y: union.bottom + margin }),
      start: clampPoint({ x: union.right + margin, y: union.top - margin }),
    },
    {
      end: clampPoint({ x: union.left - margin, y: union.top - margin }),
      start: clampPoint({
        x: union.right + margin,
        y: union.bottom + margin,
      }),
    },
  ]);
  const { end, start } = dragPair;

  await expectPointTargetsCanvas(page, start);
  await page.mouse.click(start.x, start.y);
  await page.keyboard.down("Shift");
  await expect
    .poll(async () => readCanvasFlowSelectionKeyPressed(page))
    .toBe(true);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 16 });
  await page.mouse.up();
  await page.keyboard.up("Shift");

  try {
    await expect
      .poll(async () => readActiveSectionIds(page))
      .toEqual(expect.arrayContaining(sectionIds));
  } catch (error) {
    const diagnostics = await collectCanvasBoxSelectionDiagnostics(page, {
      end,
      sectionIds,
      start,
    });
    throw new Error(
      `${String(error)}\nCanvas box selection diagnostics: ${JSON.stringify(diagnostics, null, 2)}`,
    );
  }
}

async function resolveCanvasSelectionDragPair(
  page: Page,
  pairs: Array<{ end: CanvasPoint; start: CanvasPoint }>,
) {
  const index = await page.evaluate((pairs) => {
    return pairs.findIndex(({ start }) => {
      return (
        document
          .elementFromPoint(start.x, start.y)
          ?.classList.contains("canvas-flow__canvas") === true
      );
    });
  }, pairs);
  if (index < 0) {
    throw new Error(
      `Unable to find a canvas-backed selection start point: ${JSON.stringify(
        pairs,
      )}`,
    );
  }
  const pair = pairs[index];
  if (!pair) {
    throw new Error(`Missing selection drag pair at index ${index}.`);
  }
  return pair;
}

async function readCanvasFlowSelectionKeyPressed(page: Page) {
  return page.evaluate(async () => {
    const { useReactFlow } = await import(
      "/src/forks/xyflow/core/store/index.ts"
    );
    return useReactFlow.getState().selectionKeyPressed;
  });
}

async function readActiveSectionIds(page: Page) {
  return page.evaluate(async () => {
    const { getActiveSectionUIIds } = await import(
      "/src/state/activeSectionUI.ts"
    );
    return getActiveSectionUIIds();
  });
}

async function collectCanvasBoxSelectionDiagnostics(
  page: Page,
  payload: {
    end: CanvasPoint;
    sectionIds: Array<string>;
    start: CanvasPoint;
  },
) {
  return page.evaluate(
    async ({ canvasSelector, end, sectionIds, start }) => {
      const { getActiveSectionUIIds } = await import(
        "/src/state/activeSectionUI.ts"
      );
      const { useNodeInternals } = await import("/src/state/definitions.ts");
      const { useReactFlow } = await import(
        "/src/forks/xyflow/core/store/index.ts"
      );
      const { getNodesInside } = await import(
        "/src/forks/xyflow/core/utils/graph.ts"
      );
      const { canvasFlowViewportToTransform } = await import(
        "/src/canvasflow/canvasFlowViewport.ts"
      );
      const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
      const rect = canvas?.getBoundingClientRect();
      const selectionRect =
        rect === undefined
          ? null
          : {
              height: Math.abs(end.y - start.y),
              startX: start.x - rect.left,
              startY: start.y - rect.top,
              width: Math.abs(end.x - start.x),
              x: Math.min(start.x, end.x) - rect.left,
              y: Math.min(start.y, end.y) - rect.top,
            };
      const viewport = canvas
        ? {
            x: Number.parseFloat(canvas.dataset.viewportX ?? ""),
            y: Number.parseFloat(canvas.dataset.viewportY ?? ""),
            zoom: Number.parseFloat(canvas.dataset.viewportZoom ?? ""),
          }
        : null;
      const expectedNodes =
        selectionRect && viewport
          ? getNodesInside(
              selectionRect,
              canvasFlowViewportToTransform(viewport),
              true,
            )
          : [];
      return {
        activeSectionIds: getActiveSectionUIIds(),
        canvasDataset: canvas ? { ...canvas.dataset } : null,
        end,
        expectedNodes,
        nodeInternals: Array.from(useNodeInternals.getState().x.values()).map(
          (node) => ({
            height: node.measured?.height,
            id: node.id,
            position: node.position,
            width: node.measured?.width,
          }),
        ),
        reactFlowState: {
          selectionKeyPressed: useReactFlow.getState().selectionKeyPressed,
          userSelectionActive: useReactFlow.getState().userSelectionActive,
          userSelectionRect: useReactFlow.getState().userSelectionRect,
        },
        sectionIds,
        selectionRect,
        start,
        startTarget:
          document.elementFromPoint(start.x, start.y)?.className.toString() ??
          null,
        transform: useReactFlow.getState().transform,
      };
    },
    { ...payload, canvasSelector: CANVAS_SELECTOR },
  );
}

async function getOnlyDataEdgeGeometry(
  page: Page,
): Promise<CanvasDataEdgeGeometry> {
  return page.evaluate(async (canvasSelector) => {
    const { useEdgeHandleRegistry, useProjectState } = await import(
      "/src/state/definitions.ts"
    );
    const { buildDataEdges, getCanvasFlowEdgeHit, getCanvasFlowEdgePolyline } =
      await import("/src/canvasflow/canvasFlowEdges.ts");
    const { screenToWorldPoint, worldToScreenPoint } = await import(
      "/src/canvasflow/canvasFlowViewport.ts"
    );

    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    if (!canvas) {
      throw new Error("Missing CanvasFlow canvas.");
    }
    (
      canvas as HTMLCanvasElement & { requestPaint?: () => void }
    ).requestPaint?.();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const rect = canvas.getBoundingClientRect();
    const viewport = {
      x: Number.parseFloat(canvas.dataset.viewportX ?? ""),
      y: Number.parseFloat(canvas.dataset.viewportY ?? ""),
      zoom: Number.parseFloat(canvas.dataset.viewportZoom ?? ""),
    };
    if (
      !Number.isFinite(viewport.x) ||
      !Number.isFinite(viewport.y) ||
      !Number.isFinite(viewport.zoom) ||
      viewport.zoom <= 0
    ) {
      throw new Error("Missing CanvasFlow renderer viewport diagnostics.");
    }
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
    const pointTargetsCanvas = (point: CanvasPoint) => {
      return (
        document
          .elementFromPoint(point.x, point.y)
          ?.classList.contains("canvas-flow__canvas") === true
      );
    };
    const getHandleOutwardVector = (targetPosition: string): CanvasPoint => {
      switch (targetPosition.toLowerCase()) {
        case "bottom":
          return { x: 0, y: 1 };
        case "left":
          return { x: -1, y: 0 };
        case "right":
          return { x: 1, y: 0 };
        case "top":
          return { x: 0, y: -1 };
        default:
          return { x: -1, y: 0 };
      }
    };
    const buildReconnectStartCandidates = ({
      source,
      target,
      targetPosition,
    }: {
      source: CanvasPoint;
      target: CanvasPoint;
      targetPosition: string;
    }) => {
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const length = Math.hypot(dx, dy) || 1;
      const towardSource = {
        x: -dx / length,
        y: -dy / length,
      };
      const normal = {
        x: -towardSource.y,
        y: towardSource.x,
      };
      const handleOutward = getHandleOutwardVector(targetPosition);
      const candidates: CanvasPoint[] = [];
      for (const base of [handleOutward, towardSource]) {
        for (const distance of [11, 9, 7, 5, 3]) {
          candidates.push({
            x: target.x + base.x * distance,
            y: target.y + base.y * distance,
          });
          for (const sideOffset of [-4, 4, -8, 8]) {
            candidates.push({
              x: target.x + base.x * distance + normal.x * sideOffset,
              y: target.y + base.y * distance + normal.y * sideOffset,
            });
          }
        }
      }
      return candidates;
    };
    const resolveCanvasTargetReconnectStart = () => {
      const candidates = buildReconnectStartCandidates({
        source,
        target,
        targetPosition: String(edge.targetPosition ?? ""),
      });
      for (const candidate of candidates) {
        for (const integerCandidate of integerPointVariants(candidate)) {
          if (!pointTargetsCanvas(integerCandidate)) {
            continue;
          }
          const hit = getCanvasFlowEdgeHit({
            edges,
            point: toWorldPoint(integerCandidate),
            viewport,
          });
          if (hit?.endpoint === "target") {
            return integerCandidate;
          }
        }
      }
      return candidates[0] ?? target;
    };
    const resolveCanvasTargetPathPoint = () => {
      const polyline = getCanvasFlowEdgePolyline(edge).map((point) =>
        toPagePoint(point),
      );
      const candidates = buildPathPointCandidates(polyline);
      for (const candidate of candidates) {
        for (const integerCandidate of integerPointVariants(candidate)) {
          if (!pointTargetsCanvas(integerCandidate)) {
            continue;
          }
          const hit = getCanvasFlowEdgeHit({
            edges,
            point: toWorldPoint(integerCandidate),
            viewport,
          });
          if (hit && !hit.endpoint) {
            return integerCandidate;
          }
        }
      }
      return {
        x: (source.x + target.x) / 2,
        y: (source.y + target.y) / 2,
      };
    };
    const buildPathPointCandidates = (points: CanvasPoint[]) => {
      const candidates: CanvasPoint[] = [];
      for (let index = 1; index < points.length; index += 1) {
        const start = points[index - 1];
        const end = points[index];
        if (!start || !end) {
          continue;
        }
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        if (length <= 0) {
          continue;
        }
        const normal = {
          x: -dy / length,
          y: dx / length,
        };
        for (const t of [0.25, 0.5, 0.75]) {
          const base = {
            x: start.x + dx * t,
            y: start.y + dy * t,
          };
          candidates.push(base);
          for (const offset of [-6, 6, -10, 10]) {
            candidates.push({
              x: base.x + normal.x * offset,
              y: base.y + normal.y * offset,
            });
          }
        }
      }
      return candidates;
    };
    const integerPointVariants = (point: CanvasPoint) => {
      const rounded = { x: Math.round(point.x), y: Math.round(point.y) };
      return [
        rounded,
        { x: Math.floor(point.x), y: Math.floor(point.y) },
        { x: Math.ceil(point.x), y: Math.ceil(point.y) },
        { x: rounded.x - 1, y: rounded.y },
        { x: rounded.x + 1, y: rounded.y },
        { x: rounded.x, y: rounded.y - 1 },
        { x: rounded.x, y: rounded.y + 1 },
      ];
    };
    const selectionPoint = resolveCanvasTargetPathPoint();
    const midpoint = selectionPoint;
    const reconnectStart = resolveCanvasTargetReconnectStart();
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
      pathHit: Boolean(midpointHit),
      reconnectStart,
      selectionPoint,
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

async function loadOnlyDataEdgeSelectedFromFrontend(page: Page) {
  return page.evaluate(async () => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const edges = useProjectState.getState().projectConfig.edges;
    const [edge] = edges;
    if (!edge || edges.length !== 1) {
      throw new Error(`Expected exactly one data edge. Found ${edges.length}.`);
    }
    return Boolean(edge.selected);
  });
}
