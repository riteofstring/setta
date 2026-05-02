import { type MutableRefObject } from "react";

import type { GpuFlowRuntime } from "../gpuDevice";

import {
  type GpuNodeLayout,
  type RenderGpuNodeLayerFrameResult,
} from "../GpuNodeLayer";

import { HtmlSurfaceRenderer } from "../htmlSurfaces/renderer";

import { measureGpuCanvasClientSize, type GpuCanvasSize } from "../gpuRenderer";

import { type GpuSurfaceHandle } from "../GpuSurface";

import {
  type GpuNodeInteractionDirtyController,
  type GpuNodeInteractionState,
} from "../nodeInteractionDirty";

import {
  createHtmlSurfaceTextureManager,
  type HtmlSurfaceTextureManager,
} from "../htmlSurfaces/textures";

import {
  EMPTY_GPU_NODE_LAYOUTS,
  GpuFlowNodeLayerState,
  hasRenderableGpuFlowCanvasSize,
  hasRenderableGpuFlowLayer,
} from "./flowSurface";

export function resolveRenderableGpuFlowLayerFrameInput({
  canvasSizeRef,
  nodeLayerRef,
  htmlSurfaceRendererRef,
  runtime,
  textureManagerRef,
}: {
  readonly canvasSizeRef: MutableRefObject<GpuCanvasSize | null>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowNodeLayerState>;
  readonly htmlSurfaceRendererRef: MutableRefObject<HtmlSurfaceRenderer | null>;
  readonly runtime: GpuFlowRuntime;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
}): {
  readonly canvasSize: GpuCanvasSize;
  readonly layer: GpuFlowNodeLayerState;
  readonly nodes: readonly GpuNodeLayout[];
  readonly resources: {
    readonly htmlSurfaceRenderer: HtmlSurfaceRenderer;
    readonly textureManager: HtmlSurfaceTextureManager;
  };
} | null {
  const layer = nodeLayerRef.current;
  if (!hasRenderableGpuFlowLayer(layer)) {
    return null;
  }
  const canvasSize =
    canvasSizeRef.current ?? measureGpuCanvasClientSize(runtime.canvas);
  if (!hasRenderableGpuFlowCanvasSize(canvasSize)) {
    return null;
  }
  return {
    canvasSize,
    layer,
    nodes: layer.nodes ?? EMPTY_GPU_NODE_LAYOUTS,
    resources: ensureNodeLayerResources({
      htmlSurfaceRendererRef,
      runtime,
      textureManagerRef,
    }),
  };
}

export function ensureNodeLayerResources({
  htmlSurfaceRendererRef,
  runtime,
  textureManagerRef,
}: {
  readonly htmlSurfaceRendererRef: MutableRefObject<HtmlSurfaceRenderer | null>;
  readonly runtime: GpuFlowRuntime;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
}) {
  if (!textureManagerRef.current) {
    textureManagerRef.current = createHtmlSurfaceTextureManager(runtime);
  }
  if (!htmlSurfaceRendererRef.current) {
    htmlSurfaceRendererRef.current = new HtmlSurfaceRenderer(runtime);
  }

  return {
    htmlSurfaceRenderer: htmlSurfaceRendererRef.current,
    textureManager: textureManagerRef.current,
  };
}

export function destroyNodeLayerResources(
  textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>,
  htmlSurfaceRendererRef: MutableRefObject<HtmlSurfaceRenderer | null>,
) {
  textureManagerRef.current?.destroy();
  textureManagerRef.current = null;
  htmlSurfaceRendererRef.current?.destroy();
  htmlSurfaceRendererRef.current = null;
}

export function destroyNodeInteractionResources(
  nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>,
  nodeInteractionCleanupRef: MutableRefObject<(() => void) | null>,
) {
  nodeInteractionCleanupRef.current?.();
  nodeInteractionCleanupRef.current = null;
  nodeInteractionRef.current = null;
}

export function syncGpuFlowNodeInteractionState({
  nodeElementByIdRef,
  previousActiveNodeIdRef,
  state,
}: {
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly previousActiveNodeIdRef: MutableRefObject<string | null>;
  readonly state: GpuNodeInteractionState;
}) {
  const previousActiveNodeId = previousActiveNodeIdRef.current;
  if (previousActiveNodeId && previousActiveNodeId !== state.activeNodeId) {
    const previousElement =
      nodeElementByIdRef.current.get(previousActiveNodeId);
    if (previousElement) {
      setGpuFlowNodeInteractionElementState(previousElement, false);
    }
  }
  if (state.activeNodeId) {
    const activeElement = nodeElementByIdRef.current.get(state.activeNodeId);
    if (activeElement) {
      setGpuFlowNodeInteractionElementState(activeElement, true);
    }
  }
  previousActiveNodeIdRef.current = state.activeNodeId;
}

function setGpuFlowNodeInteractionElementState(
  element: HTMLElement,
  interactive: boolean,
) {
  element.dataset.gpuFlowInteractive = interactive ? "true" : "false";
  element.classList.toggle("setta-gpu-flow__node--interactive", interactive);
}

export function completeGpuNodeInteractionFrame(
  nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>,
  layerResult: RenderGpuNodeLayerFrameResult,
) {
  nodeInteractionRef.current?.completeFrame(layerResult);
}

export function requestRemainingTextureUploadFrame(
  surfaceRef: MutableRefObject<GpuSurfaceHandle | null>,
  layerResult: RenderGpuNodeLayerFrameResult,
) {
  if (layerResult.budgetExhausted) {
    surfaceRef.current?.requestFrame("texture-upload");
  }
}

export function nextFrame(frameRef: MutableRefObject<number>): number {
  frameRef.current += 1;
  return frameRef.current;
}
