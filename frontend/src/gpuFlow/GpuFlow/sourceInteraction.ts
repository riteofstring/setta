import type { MutableRefObject } from "react";

import type { GpuNodeLayout } from "../htmlSurfaces/frame";

import type { HtmlSurfaceInteractionProjector } from "../htmlSurfaces/interactionProjector";

import type { GpuNodeInteractionDirtyController } from "../nodeInteractionDirty";

import {
  resolveTopmostGpuNodeHitAtClientPoint,
  type GpuNodeSourceProjection,
} from "../activeNodeTargeting";

import type { HtmlSurfaceEffectHitProjector } from "../htmlSurfaces/hitScene";

import type { HtmlSurfaceVisualScene } from "../htmlSurfaces/visualScene";

import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";

import {
  flowToScreenPosition,
  normalizeGpuViewport,
  type GpuViewportInput,
} from "../viewportMath";

export function projectGpuFlowNodeSourceForPointerEvent({
  effectProjectors,
  event,
  nodeElementById,
  nodeId,
  nodes,
  projector,
  surfaceElement,
  viewport,
  visualScene,
}: {
  readonly effectProjectors?:
    | ReadonlyMap<string, HtmlSurfaceEffectHitProjector>
    | undefined;
  readonly event: PointerEvent;
  readonly nodeElementById: ReadonlyMap<string, HTMLElement>;
  readonly nodeId: string;
  readonly nodes: readonly GpuNodeLayout[];
  readonly projector: HtmlSurfaceInteractionProjector | null;
  readonly surfaceElement: HTMLElement;
  readonly viewport: GpuViewportInput;
  readonly visualScene?: HtmlSurfaceVisualScene | undefined;
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
  const visualProjection = resolveTopmostGpuNodeHitAtClientPoint({
    clientX: event.clientX,
    clientY: event.clientY,
    ...(effectProjectors ? { effectProjectors } : {}),
    nodes,
    surfaceElement,
    viewport,
    visualScene,
  });
  const projection =
    visualProjection?.node.nodeId === nodeId
      ? visualProjection
      : resolveFlatGpuNodeSourceProjection({
          node,
          surfaceX,
          surfaceY,
          viewport,
        });
  projector.alignSourceToClientPoint({
    localX: projection.localX,
    localY: projection.localY,
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

function resolveFlatGpuNodeSourceProjection({
  node,
  surfaceX,
  surfaceY,
  viewport,
}: {
  readonly node: GpuNodeLayout & {
    readonly height: number;
    readonly width: number;
  };
  readonly surfaceX: number;
  readonly surfaceY: number;
  readonly viewport: GpuViewportInput;
}): Pick<GpuNodeSourceProjection, "localX" | "localY"> {
  const normalizedViewport = normalizeGpuViewport(viewport);
  const nodeScreenPosition = flowToScreenPosition(
    { x: node.x, y: node.y },
    normalizedViewport,
  );
  return {
    localX: (surfaceX - nodeScreenPosition.x) / normalizedViewport.zoom,
    localY: (surfaceY - nodeScreenPosition.y) / normalizedViewport.zoom,
  };
}
