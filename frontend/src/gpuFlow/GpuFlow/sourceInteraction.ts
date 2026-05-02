import type { MutableRefObject } from "react";

import type { GpuActiveNodeTeleportController } from "../GpuActiveNodeTeleport";

import type { GpuNodeLayout } from "../GpuNodeLayer";

import type { HtmlSurfaceInteractionProjector } from "../htmlSurfaces/interactionProjector";

import type { GpuNodeInteractionDirtyController } from "../nodeInteractionDirty";

import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";

import {
  flowToScreenPosition,
  normalizeGpuViewport,
  type GpuViewportInput,
} from "../viewportMath";

export function projectGpuFlowNodeSourceForPointerEvent({
  event,
  nodeElementById,
  nodeId,
  nodes,
  projector,
  surfaceElement,
  viewport,
}: {
  readonly event: PointerEvent;
  readonly nodeElementById: ReadonlyMap<string, HTMLElement>;
  readonly nodeId: string;
  readonly nodes: readonly GpuNodeLayout[];
  readonly projector: HtmlSurfaceInteractionProjector | null;
  readonly surfaceElement: HTMLElement;
  readonly viewport: GpuViewportInput;
}) {
  if (!projector) {
    return;
  }
  const node = nodes.find((candidate) => candidate.nodeId === nodeId);
  const sourceElement = nodeElementById.get(nodeId);
  if (!isProjectableGpuFlowNode(node) || !sourceElement) {
    return;
  }
  const surfaceRect = surfaceElement.getBoundingClientRect();
  const surfaceX = event.clientX - surfaceRect.left;
  const surfaceY = event.clientY - surfaceRect.top;
  const normalizedViewport = normalizeGpuViewport(viewport);
  const nodeScreenPosition = flowToScreenPosition(
    { x: node.x, y: node.y },
    normalizedViewport,
  );
  projector.alignSourceToClientPoint({
    localX: (surfaceX - nodeScreenPosition.x) / normalizedViewport.zoom,
    localY: (surfaceY - nodeScreenPosition.y) / normalizedViewport.zoom,
    sourceElement,
    sourceId: nodeId,
    surfaceX,
    surfaceY,
  });
}

export function clearGpuFlowNodeElement({
  activeNodeTeleportRef,
  nodeElementByIdRef,
  nodeId,
  nodeInteractionRef,
  pendingActiveNodePaintRef,
  settlingActiveNodeClearIdsRef,
  settlingActiveNodeIdsRef,
  sourceInteractionProjector,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
}: {
  readonly activeNodeTeleportRef: MutableRefObject<GpuActiveNodeTeleportController | null>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodeId: string;
  readonly nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>;
  readonly pendingActiveNodePaintRef: MutableRefObject<Set<string>>;
  readonly settlingActiveNodeClearIdsRef: MutableRefObject<Set<string>>;
  readonly settlingActiveNodeIdsRef: MutableRefObject<Set<string>>;
  readonly sourceInteractionProjector: HtmlSurfaceInteractionProjector;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
}) {
  nodeElementByIdRef.current.delete(nodeId);
  nodeInteractionRef.current?.clearNode(nodeId);
  activeNodeTeleportRef.current?.clearNode(nodeId);
  activeNodeTeleportRef.current?.clearSettlingClone(nodeId);
  sourceInteractionProjector.clearSource(nodeId);
  pendingActiveNodePaintRef.current.delete(nodeId);
  settlingActiveNodeIdsRef.current.delete(nodeId);
  settlingActiveNodeClearIdsRef.current.delete(nodeId);
  transformOnlyPaintNodeIdsRef.current.delete(nodeId);
  textureManagerRef.current?.destroySurfaceTexture(nodeId);
}

function isProjectableGpuFlowNode(
  node: GpuNodeLayout | undefined,
): node is GpuNodeLayout & {
  readonly height: number;
  readonly width: number;
} {
  return Boolean(
    node &&
      node.width !== null &&
      node.height !== null &&
      node.width > 0 &&
      node.height > 0,
  );
}
