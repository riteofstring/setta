import type { MutableRefObject } from "react";

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
  nodeElementByIdRef,
  nodeId,
  nodeInteractionRef,
  sourceInteractionProjector,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
}: {
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodeId: string;
  readonly nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>;
  readonly sourceInteractionProjector: HtmlSurfaceInteractionProjector;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
}) {
  nodeElementByIdRef.current.delete(nodeId);
  nodeInteractionRef.current?.clearNode(nodeId);
  sourceInteractionProjector.clearSource(nodeId);
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
