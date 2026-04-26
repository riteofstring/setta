import { paintCanvasFlow } from "./canvasFlowPaint";
import { getCanvasFlowChangedNodeIds } from "./canvasFlowPaintEvents";
import {
  assertHtmlInCanvasSupport,
  requestCanvasFlowPaint,
} from "./canvasFlowSupport";
import type {
  CanvasFlowRenderer,
  CanvasFlowRenderingContext,
  CanvasFlowRenderInputs,
} from "./canvasFlowTypes";

type CreateCanvasFlow2dRendererParams = {
  canvas: HTMLCanvasElement;
  initialInputs: CanvasFlowRenderInputs;
};

export function createCanvasFlow2dRenderer({
  canvas,
  initialInputs,
}: CreateCanvasFlow2dRendererParams): CanvasFlowRenderer {
  const ctx = assertHtmlInCanvasSupport(canvas);
  const previousInteractiveNodeIds = new Set<string>();
  let inputs = initialInputs;

  canvas.dataset.rendererMode = "2d";
  canvas.dataset.webglContextCreated = "false";

  return {
    destroy() {
      clear2dRendererDiagnostics(canvas);
    },
    handleCanvasPaint(event) {
      renderCanvasFlow2d({
        canvas,
        changedNodeIds: getCanvasFlowChangedNodeIds(event),
        ctx,
        inputs,
        previousInteractiveNodeIds,
      });
    },
    markNodesDirty() {
      requestCanvasFlowPaint(canvas);
    },
    requestFrame() {
      requestCanvasFlowPaint(canvas);
    },
    resize() {
      requestCanvasFlowPaint(canvas);
    },
    updateInputs(nextInputs) {
      inputs = nextInputs;
    },
  };
}

function renderCanvasFlow2d({
  canvas,
  changedNodeIds,
  ctx,
  inputs,
  previousInteractiveNodeIds,
}: {
  canvas: HTMLCanvasElement;
  changedNodeIds?: ReadonlySet<string> | undefined;
  ctx: CanvasFlowRenderingContext;
  inputs: CanvasFlowRenderInputs;
  previousInteractiveNodeIds: Set<string>;
}) {
  paintCanvasFlow({
    canvas,
    changedNodeIds,
    connectionState: inputs.connectionState,
    ctx,
    darkMode: inputs.darkMode,
    edges: inputs.edges,
    edgeHandlePositions: inputs.edgeHandlePositions,
    gridSize: inputs.gridSize,
    nodeElements: inputs.nodeElements,
    nodes: inputs.nodes,
    previousInteractiveNodeIds,
    showGridLines: inputs.showGridLines,
    size: inputs.size,
    viewport: inputs.viewport,
    wireColor: inputs.wireColor,
  });
}

function clear2dRendererDiagnostics(canvas: HTMLCanvasElement) {
  delete canvas.dataset.rendererMode;
  delete canvas.dataset.webglContextCreated;
}
