import { createCanvasFlow2dRenderer } from "./canvasFlow2dRenderer";
import type {
  CanvasFlowRenderer,
  CanvasFlowRendererMode,
  CanvasFlowRenderInputs,
} from "./canvasFlowTypes";
import { createCanvasFlowWebglRenderer } from "./canvasFlowWebglRenderer";

type CanvasFlowRendererWindow = typeof window & {
  __settaCanvasFlowRenderer?: CanvasFlowRendererMode;
};

type CanvasFlowRendererFactory = (params: {
  canvas: HTMLCanvasElement;
  initialInputs: CanvasFlowRenderInputs;
}) => CanvasFlowRenderer;

type CreateCanvasFlowRendererParams = {
  canvas: HTMLCanvasElement;
  create2dRenderer?: CanvasFlowRendererFactory;
  createWebglRenderer?: CanvasFlowRendererFactory;
  initialInputs: CanvasFlowRenderInputs;
  mode?: CanvasFlowRendererMode;
};

export function createCanvasFlowRenderer({
  canvas,
  create2dRenderer = createCanvasFlow2dRenderer,
  createWebglRenderer = createCanvasFlowWebglRenderer,
  initialInputs,
  mode = getCanvasFlowRendererMode(),
}: CreateCanvasFlowRendererParams): CanvasFlowRenderer {
  if (mode === "webgl-texture-nodes") {
    return createWebglRenderer({ canvas, initialInputs });
  }
  return create2dRenderer({ canvas, initialInputs });
}

export function getCanvasFlowRendererMode(): CanvasFlowRendererMode {
  if (typeof window === "undefined") {
    return "2d";
  }
  return (window as CanvasFlowRendererWindow).__settaCanvasFlowRenderer ===
    "webgl-texture-nodes"
    ? "webgl-texture-nodes"
    : "2d";
}
