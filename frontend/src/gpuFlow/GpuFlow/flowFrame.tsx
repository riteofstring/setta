import { type MutableRefObject } from "react";

import { resolveGpuActiveNodeSnapshot } from "../GpuActiveNodeSnapshot";

import { type GpuActiveNodeTeleportController } from "../GpuActiveNodeTeleport";

import type { GpuFlowRuntime } from "../gpuDevice";

import {
  type GpuNodeLayout,
  type RenderGpuNodeLayerFrameResult,
} from "../GpuNodeLayer";

import { GpuNodeQuadRenderer } from "../gpuPipelines";

import { measureGpuCanvasClientSize, type GpuCanvasSize } from "../gpuRenderer";

import { type GpuSurfaceHandle } from "../GpuSurface";

import {
  type GpuNodeInteractionDirtyController,
  type GpuNodeInteractionState,
} from "../nodeInteractionDirty";

import {
  createNodeTextureManager,
  type NodeTextureManager,
} from "../nodeTextures";

import {
  EMPTY_GPU_NODE_LAYOUTS,
  EMPTY_NODE_IDS,
  GpuActiveNodeTeleportFrameSync,
  GpuFlowNodeLayerState,
  hasRenderableGpuFlowCanvasSize,
  hasRenderableGpuFlowLayer,
} from "./flowSurface";

export function resolveRenderableGpuFlowLayerFrameInput({
  canvasSizeRef,
  nodeLayerRef,
  nodeQuadRendererRef,
  runtime,
  textureManagerRef,
}: {
  readonly canvasSizeRef: MutableRefObject<GpuCanvasSize | null>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowNodeLayerState>;
  readonly nodeQuadRendererRef: MutableRefObject<GpuNodeQuadRenderer | null>;
  readonly runtime: GpuFlowRuntime;
  readonly textureManagerRef: MutableRefObject<NodeTextureManager | null>;
}): {
  readonly canvasSize: GpuCanvasSize;
  readonly layer: GpuFlowNodeLayerState;
  readonly nodes: readonly GpuNodeLayout[];
  readonly resources: {
    readonly nodeQuadRenderer: GpuNodeQuadRenderer;
    readonly textureManager: NodeTextureManager;
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
      nodeQuadRendererRef,
      runtime,
      textureManagerRef,
    }),
  };
}

export function syncGpuFlowActiveNodeTeleportForFrame({
  activeNodeTeleportRef,
  elementByNodeId,
  frame,
  layer,
  liveNodeId,
  pendingActiveNodePaintRef,
  settlingActiveNodeIdsRef,
  runtime,
}: {
  readonly activeNodeTeleportRef: MutableRefObject<GpuActiveNodeTeleportController | null>;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly frame: number;
  readonly layer: GpuFlowNodeLayerState;
  readonly liveNodeId: string | null;
  readonly pendingActiveNodePaintRef: MutableRefObject<Set<string>>;
  readonly settlingActiveNodeIdsRef: MutableRefObject<Set<string>>;
  readonly runtime: GpuFlowRuntime;
}): GpuActiveNodeTeleportFrameSync {
  const teleportResult = syncGpuFlowActiveNodeTeleport({
    activeNodeTeleportRef,
    elementByNodeId,
    frame,
    layer,
    liveNodeId,
  });
  if (teleportResult.restoredNodeId) {
    pendingActiveNodePaintRef.current.add(teleportResult.restoredNodeId);
    settlingActiveNodeIdsRef.current.add(teleportResult.restoredNodeId);
    runtime.canvas.requestPaint();
  }
  return resolveGpuActiveNodeFrameSync({
    pendingPaintNodeIds: pendingActiveNodePaintRef.current,
    settlingNodeIds: settlingActiveNodeIdsRef.current,
    teleportedNodeId: teleportResult.teleportedNodeId,
  });
}

export function activateGpuFlowPointerHandoffNode({
  activeNodeTeleportRef,
  frameRef,
  nodeElementByIdRef,
  nodeId,
  nodeLayerRef,
  pendingActiveNodePaintRef,
  settlingActiveNodeIdsRef,
  surfaceRef,
}: {
  readonly activeNodeTeleportRef: MutableRefObject<GpuActiveNodeTeleportController | null>;
  readonly frameRef: MutableRefObject<number>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodeId: string;
  readonly nodeLayerRef: MutableRefObject<GpuFlowNodeLayerState>;
  readonly pendingActiveNodePaintRef: MutableRefObject<Set<string>>;
  readonly settlingActiveNodeIdsRef: MutableRefObject<Set<string>>;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
}): HTMLElement | null {
  const nodeElement = nodeElementByIdRef.current.get(nodeId) ?? null;
  const teleport = activeNodeTeleportRef.current;
  if (!nodeElement || !teleport) {
    return nodeElement;
  }
  const teleportResult = syncGpuFlowActiveNodeTeleport({
    activeNodeTeleportRef,
    elementByNodeId: nodeElementByIdRef.current,
    frame: nextFrame(frameRef),
    layer: nodeLayerRef.current,
    liveNodeId: nodeId,
  });
  if (teleportResult.restoredNodeId) {
    pendingActiveNodePaintRef.current.add(teleportResult.restoredNodeId);
    settlingActiveNodeIdsRef.current.add(teleportResult.restoredNodeId);
    surfaceRef.current?.requestPaint();
  }
  if (teleportResult.teleportedNodeId) {
    surfaceRef.current?.requestFrame("texture-upload");
  }
  return nodeElementByIdRef.current.get(nodeId) ?? nodeElement;
}

export function syncGpuFlowActiveNodeTeleport({
  activeNodeTeleportRef,
  elementByNodeId,
  frame,
  layer,
  liveNodeId,
}: {
  readonly activeNodeTeleportRef: MutableRefObject<GpuActiveNodeTeleportController | null>;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly frame: number;
  readonly layer: GpuFlowNodeLayerState;
  readonly liveNodeId: string | null;
}): {
  readonly restoredNodeId: string | null;
  readonly teleportedNodeId: string | null;
} {
  const teleport = activeNodeTeleportRef.current;
  if (!teleport) {
    return { restoredNodeId: null, teleportedNodeId: null };
  }
  const nextSnapshot = resolveGpuActiveNodeSnapshot({
    activeNodeId: liveNodeId,
    elementByNodeId,
    frame,
    nodes: layer.nodes,
    viewport: layer.viewport,
  });
  return teleport.sync(nextSnapshot);
}

export function resolveGpuActiveNodeFrameSync({
  pendingPaintNodeIds,
  settlingNodeIds,
  teleportedNodeId,
}: {
  readonly pendingPaintNodeIds: ReadonlySet<string>;
  readonly settlingNodeIds: ReadonlySet<string>;
  readonly teleportedNodeId: string | null;
}): GpuActiveNodeTeleportFrameSync {
  return {
    deferUploadNodeIds: getDeferredActiveNodeUploadIds({
      pendingPaintNodeIds,
      teleportedNodeId,
    }),
    suppressNodeIds: getSuppressedActiveNodeIds({
      settlingNodeIds,
      teleportedNodeId,
    }),
  };
}

export function resolveGpuActiveNodePaintedIds({
  changedElements,
  elementByNodeId,
  pendingPaintNodeIds,
}: {
  readonly changedElements?: readonly Element[] | undefined;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly pendingPaintNodeIds: ReadonlySet<string>;
}): readonly string[] {
  if (pendingPaintNodeIds.size === 0) {
    return EMPTY_NODE_IDS;
  }
  if (!changedElements) {
    return [...pendingPaintNodeIds];
  }

  const paintedNodeIds = new Set<string>();
  for (const changedElement of changedElements) {
    for (const nodeId of pendingPaintNodeIds) {
      const nodeElement = elementByNodeId.get(nodeId);
      if (
        nodeElement &&
        isGpuActiveNodePaintCoveredByElement(nodeElement, changedElement)
      ) {
        paintedNodeIds.add(nodeId);
      }
    }
  }
  return [...paintedNodeIds];
}

export function isGpuActiveNodePaintCoveredByElement(
  nodeElement: HTMLElement,
  changedElement: Element,
): boolean {
  return (
    nodeElement === changedElement ||
    nodeElement.contains(changedElement) ||
    changedElement.contains(nodeElement)
  );
}

export function getDeferredActiveNodeUploadIds({
  pendingPaintNodeIds,
  teleportedNodeId,
}: {
  readonly pendingPaintNodeIds: ReadonlySet<string>;
  readonly teleportedNodeId: string | null;
}): readonly string[] | undefined {
  return mergeActiveNodeIds(
    teleportedNodeId ? [teleportedNodeId] : EMPTY_NODE_IDS,
    pendingPaintNodeIds,
  );
}

export function getSuppressedActiveNodeIds({
  settlingNodeIds,
  teleportedNodeId,
}: {
  readonly settlingNodeIds: ReadonlySet<string>;
  readonly teleportedNodeId: string | null;
}): readonly string[] | undefined {
  return mergeActiveNodeIds(
    teleportedNodeId ? [teleportedNodeId] : EMPTY_NODE_IDS,
    settlingNodeIds,
  );
}

export function mergeActiveNodeIds(
  ...nodeIdSources: readonly (ReadonlySet<string> | readonly string[])[]
): readonly string[] | undefined {
  const merged = new Set<string>();
  for (const nodeIdSource of nodeIdSources) {
    for (const nodeId of nodeIdSource) {
      merged.add(nodeId);
    }
  }
  return merged.size === 0 ? undefined : [...merged];
}

export function ensureNodeLayerResources({
  nodeQuadRendererRef,
  runtime,
  textureManagerRef,
}: {
  readonly nodeQuadRendererRef: MutableRefObject<GpuNodeQuadRenderer | null>;
  readonly runtime: GpuFlowRuntime;
  readonly textureManagerRef: MutableRefObject<NodeTextureManager | null>;
}) {
  if (!textureManagerRef.current) {
    textureManagerRef.current = createNodeTextureManager(runtime);
  }
  if (!nodeQuadRendererRef.current) {
    nodeQuadRendererRef.current = new GpuNodeQuadRenderer(runtime);
  }

  return {
    nodeQuadRenderer: nodeQuadRendererRef.current,
    textureManager: textureManagerRef.current,
  };
}

export function destroyNodeLayerResources(
  textureManagerRef: MutableRefObject<NodeTextureManager | null>,
  nodeQuadRendererRef: MutableRefObject<GpuNodeQuadRenderer | null>,
) {
  textureManagerRef.current?.destroy();
  textureManagerRef.current = null;
  nodeQuadRendererRef.current?.destroy();
  nodeQuadRendererRef.current = null;
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
  state,
}: {
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly state: GpuNodeInteractionState;
}) {
  for (const [nodeId, element] of nodeElementByIdRef.current) {
    const interactive = state.activeNodeId === nodeId;
    element.dataset.gpuFlowInteractive = interactive ? "true" : "false";
    element.classList.toggle("setta-gpu-flow__node--interactive", interactive);
  }
}

export function completeGpuNodeInteractionFrame(
  nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>,
  layerResult: RenderGpuNodeLayerFrameResult,
) {
  nodeInteractionRef.current?.completeFrame(layerResult);
}

export function completeGpuActiveNodeSettlingClones({
  activeNodeTeleportRef,
  layerResult,
  settlingActiveNodeClearIdsRef,
  settlingActiveNodeIdsRef,
  surfaceRef,
}: {
  readonly activeNodeTeleportRef: MutableRefObject<GpuActiveNodeTeleportController | null>;
  readonly layerResult: RenderGpuNodeLayerFrameResult;
  readonly settlingActiveNodeClearIdsRef: MutableRefObject<Set<string>>;
  readonly settlingActiveNodeIdsRef: MutableRefObject<Set<string>>;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
}) {
  clearDrawnGpuActiveNodeSettlingClones({
    activeNodeTeleportRef,
    settlingActiveNodeClearIdsRef,
  });
  if (
    releaseUploadedGpuActiveNodeSettlingTextures({
      layerResult,
      settlingActiveNodeClearIdsRef,
      settlingActiveNodeIdsRef,
    })
  ) {
    surfaceRef.current?.requestFrame("texture-upload");
  }
}

export function clearDrawnGpuActiveNodeSettlingClones({
  activeNodeTeleportRef,
  settlingActiveNodeClearIdsRef,
}: {
  readonly activeNodeTeleportRef: MutableRefObject<GpuActiveNodeTeleportController | null>;
  readonly settlingActiveNodeClearIdsRef: MutableRefObject<Set<string>>;
}) {
  const teleport = activeNodeTeleportRef.current;
  if (!teleport || settlingActiveNodeClearIdsRef.current.size === 0) {
    return;
  }
  for (const nodeId of settlingActiveNodeClearIdsRef.current) {
    teleport.clearSettlingClone(nodeId);
  }
  settlingActiveNodeClearIdsRef.current.clear();
}

export function releaseUploadedGpuActiveNodeSettlingTextures({
  layerResult,
  settlingActiveNodeClearIdsRef,
  settlingActiveNodeIdsRef,
}: {
  readonly layerResult: RenderGpuNodeLayerFrameResult;
  readonly settlingActiveNodeClearIdsRef: MutableRefObject<Set<string>>;
  readonly settlingActiveNodeIdsRef: MutableRefObject<Set<string>>;
}): boolean {
  if (
    settlingActiveNodeIdsRef.current.size === 0 ||
    layerResult.uploadedNodeIds.length === 0
  ) {
    return false;
  }
  const uploadedNodeIds = new Set(layerResult.uploadedNodeIds);
  let released = false;
  for (const nodeId of settlingActiveNodeIdsRef.current) {
    if (!uploadedNodeIds.has(nodeId)) {
      continue;
    }
    settlingActiveNodeIdsRef.current.delete(nodeId);
    settlingActiveNodeClearIdsRef.current.add(nodeId);
    released = true;
  }
  return released;
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
