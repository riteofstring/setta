import { createCanvasFlow2dRenderer } from "./canvasFlow2dRenderer";
import type {
  CanvasFlowCanvasElement,
  CanvasFlowRenderer,
  CanvasFlowRendererMode,
  CanvasFlowRenderInputs,
  CanvasFlowWebglRenderingContext,
} from "./canvasFlowTypes";
import { createCanvasFlowWebglRenderer } from "./canvasFlowWebglRenderer";

type CanvasFlowRendererWindow = typeof window & {
  __settaCanvasFlowRenderer?: CanvasFlowRendererMode;
};
type CanvasFlowRendererGlobal = typeof globalThis & {
  HTMLCanvasElement?: {
    prototype?: Partial<CanvasFlowCanvasElement>;
  };
  WebGLRenderingContext?: {
    prototype?: Partial<CanvasFlowWebglRenderingContext>;
  };
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
  const override = (window as CanvasFlowRendererWindow)
    .__settaCanvasFlowRenderer;
  if (override === "2d" || override === "webgl-texture-nodes") {
    return override;
  }
  return canUseCanvasFlowWebglTextureNodesByDefault()
    ? "webgl-texture-nodes"
    : "2d";
}

export function canUseCanvasFlowWebglTextureNodesByDefault(
  globalScope: CanvasFlowRendererGlobal = globalThis as CanvasFlowRendererGlobal,
): boolean {
  const canvasPrototype = globalScope.HTMLCanvasElement?.prototype;
  const webglPrototype = globalScope.WebGLRenderingContext?.prototype;
  return (
    typeof canvasPrototype?.requestPaint === "function" &&
    typeof webglPrototype?.texElementImage2D === "function"
  );
}
