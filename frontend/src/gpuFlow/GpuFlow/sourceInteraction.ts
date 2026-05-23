import type { MutableRefObject } from "react";

import type { GpuNodeLayout } from "../htmlSurfaces/frame";

import {
  projectHtmlSurfaceInteractionTarget,
  type HtmlSurfaceInteractionProjector,
} from "../htmlSurfaces/interactionProjector";

import type { GpuNodeInteractionDirtyController } from "../nodeInteractionDirty";

import {
  resolveTopmostGpuNodeHitAtClientPoint,
  type GpuNodeSourceProjection,
} from "../activeNodeTargeting";

import type { HtmlSurfaceEffectHitProjector } from "../htmlSurfaces/hitScene";

import type { HtmlSurfaceVisualScene } from "../htmlSurfaces/visualScene";

import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";

import { findGpuNodeIdForEventTarget } from "../nodeInteractionDirty/nodeTargetLookup";
import { resolveGpuNodeZIndex } from "../nodeZIndex";
import { releaseGpuFlowSurfaceTexture } from "../surfaceTextureReleaseAuthority";
import {
  flowToScreenPosition,
  normalizeGpuViewport,
  type GpuViewportInput,
} from "../viewportMath";

type ResolvedGpuFlowNodeSourceProjection = Pick<
  GpuNodeSourceProjection,
  "localX" | "localY" | "surfaceX" | "surfaceY"
>;
type GpuFlowNodeHitProjection = NonNullable<
  ReturnType<typeof resolveTopmostGpuNodeHitAtClientPoint>
>;

const GPU_FLOW_NODE_HOVERED_ATTRIBUTE = "data-gpu-flow-hovered";

export function projectGpuFlowNodeSourceForPointerEvent({
  effectProjectors,
  event,
  nodeElementById,
  nodeId,
  nodes,
  projector,
  requireVisualSceneHitSurfaces,
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
  readonly requireVisualSceneHitSurfaces?: boolean | undefined;
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
  const projection = resolveGpuFlowNodeSourceProjectionForPointerEvent({
    event,
    ...(effectProjectors ? { effectProjectors } : {}),
    node,
    nodeId,
    nodes,
    requireVisualSceneHitSurfaces,
    surfaceElement,
    viewport,
    visualScene,
  });
  if (!projection) {
    return;
  }
  projectHtmlSurfaceInteractionTarget({
    projector,
    target: {
      localX: projection.localX,
      localY: projection.localY,
      sourceElement,
      sourceId: nodeId,
      surfaceX: projection.surfaceX,
      surfaceY: projection.surfaceY,
      zIndex: resolveGpuNodeZIndex(node),
    },
  });
}

export function projectGpuFlowNodeHoverSourceForPointerEvent({
  effectProjectors,
  event,
  nodeElementById,
  nodes,
  previousNodeId,
  projector,
  requireVisualSceneHitSurfaces,
  surfaceElement,
  viewport,
  visualScene,
}: {
  readonly effectProjectors?:
    | ReadonlyMap<string, HtmlSurfaceEffectHitProjector>
    | undefined;
  readonly event: PointerEvent;
  readonly nodeElementById: ReadonlyMap<string, HTMLElement>;
  readonly nodes: readonly GpuNodeLayout[];
  readonly previousNodeId: string | null;
  readonly projector: HtmlSurfaceInteractionProjector | null;
  readonly requireVisualSceneHitSurfaces?: boolean | undefined;
  readonly surfaceElement: HTMLElement;
  readonly viewport: GpuViewportInput;
  readonly visualScene?: HtmlSurfaceVisualScene | undefined;
}): string | null {
  if (!projector) {
    return null;
  }

  const directTargetNodeId = projectGpuFlowDirectHoverTarget({
    event,
    nodeElementById,
    nodes,
  });
  if (directTargetNodeId) {
    return directTargetNodeId;
  }

  const surfaceRect = surfaceElement.getBoundingClientRect();
  const surfaceX = event.clientX - surfaceRect.left;
  const surfaceY = event.clientY - surfaceRect.top;
  const hit = resolveTopmostGpuNodeHitAtClientPoint({
    clientX: event.clientX,
    clientY: event.clientY,
    ...(effectProjectors ? { effectProjectors } : {}),
    nodes,
    requireVisualSceneHitSurfaces,
    surfaceElement,
    viewport,
    visualScene,
  });
  if (!hit) {
    return projectGpuFlowPreviousHoverBridge({
      event,
      nodeElementById,
      previousNodeId,
    });
  }
  return projectGpuFlowHoverHit({
    hit,
    nodeElementById,
    projector,
    surfaceX,
    surfaceY,
  });
}

function projectGpuFlowDirectHoverTarget({
  event,
  nodeElementById,
  nodes,
}: {
  readonly event: PointerEvent;
  readonly nodeElementById: ReadonlyMap<string, HTMLElement>;
  readonly nodes: readonly GpuNodeLayout[];
}): string | null {
  const targetNodeId = findGpuNodeIdForEventTarget(
    event.target,
    nodeElementById,
  );
  if (!targetNodeId) {
    return null;
  }
  const targetElement = nodeElementById.get(targetNodeId);
  const targetNode = nodes.find(
    (candidate) => candidate.nodeId === targetNodeId,
  );
  if (!targetElement || !isProjectableGpuFlowNode(targetNode)) {
    return null;
  }
  setGpuFlowNodeHoverProjectionState(targetElement, targetNodeId, true);
  return targetNodeId;
}

function projectGpuFlowPreviousHoverBridge({
  event,
  nodeElementById,
  previousNodeId,
}: {
  readonly event: PointerEvent;
  readonly nodeElementById: ReadonlyMap<string, HTMLElement>;
  readonly previousNodeId: string | null;
}): string | null {
  if (!previousNodeId) {
    return null;
  }
  const previousElement = nodeElementById.get(previousNodeId);
  if (
    !previousElement ||
    !isPointerWithinProjectedAgenticHandleBridge(
      previousElement,
      previousNodeId,
      event,
    )
  ) {
    return null;
  }
  setGpuFlowNodeHoverProjectionState(previousElement, previousNodeId, true);
  return previousNodeId;
}

function projectGpuFlowHoverHit({
  hit,
  nodeElementById,
  projector,
  surfaceX,
  surfaceY,
}: {
  readonly hit: GpuFlowNodeHitProjection;
  readonly nodeElementById: ReadonlyMap<string, HTMLElement>;
  readonly projector: HtmlSurfaceInteractionProjector;
  readonly surfaceX: number;
  readonly surfaceY: number;
}): string | null {
  const sourceElement = nodeElementById.get(hit.node.nodeId);
  if (!isProjectableGpuFlowNode(hit.node) || !sourceElement) {
    return null;
  }

  projector.alignSourceToClientPoint({
    localX: hit.localX,
    localY: hit.localY,
    sourceElement,
    sourceId: hit.node.nodeId,
    surfaceX,
    surfaceY,
  });
  setGpuFlowNodeHoverProjectionState(sourceElement, hit.node.nodeId, true);
  return hit.node.nodeId;
}

export function clearGpuFlowNodeHoverSourceProjection({
  nodeElementById,
  nodeId,
  projector,
}: {
  readonly nodeElementById: ReadonlyMap<string, HTMLElement>;
  readonly nodeId: string;
  readonly projector: HtmlSurfaceInteractionProjector | null;
}) {
  const sourceElement = nodeElementById.get(nodeId);
  if (sourceElement) {
    setGpuFlowNodeHoverProjectionState(sourceElement, nodeId, false);
  }
  projector?.clearSource(nodeId);
}

function resolveGpuFlowNodeSourceProjectionForPointerEvent({
  effectProjectors,
  event,
  node,
  nodeId,
  nodes,
  requireVisualSceneHitSurfaces = false,
  surfaceElement,
  viewport,
  visualScene,
}: {
  readonly effectProjectors?:
    | ReadonlyMap<string, HtmlSurfaceEffectHitProjector>
    | undefined;
  readonly event: PointerEvent;
  readonly node: GpuNodeLayout & {
    readonly height: number;
    readonly width: number;
  };
  readonly nodeId: string;
  readonly nodes: readonly GpuNodeLayout[];
  readonly requireVisualSceneHitSurfaces?: boolean | undefined;
  readonly surfaceElement: HTMLElement;
  readonly viewport: GpuViewportInput;
  readonly visualScene?: HtmlSurfaceVisualScene | undefined;
}): ResolvedGpuFlowNodeSourceProjection | null {
  const surfaceRect = surfaceElement.getBoundingClientRect();
  const surfaceX = event.clientX - surfaceRect.left;
  const surfaceY = event.clientY - surfaceRect.top;
  const visualProjection = resolveTopmostGpuNodeHitAtClientPoint({
    clientX: event.clientX,
    clientY: event.clientY,
    ...(effectProjectors ? { effectProjectors } : {}),
    nodes,
    requireVisualSceneHitSurfaces,
    surfaceElement,
    viewport,
    visualScene,
  });
  const projection = resolveGpuFlowNodeSourceProjection({
    node,
    nodeId,
    requireVisualSceneHitSurfaces,
    surfaceX,
    surfaceY,
    viewport,
    visualProjection,
    visualScene,
  });
  if (!projection) {
    return null;
  }
  return {
    localX: projection.localX,
    localY: projection.localY,
    surfaceX,
    surfaceY,
  };
}

function resolveGpuFlowNodeSourceProjection({
  node,
  nodeId,
  requireVisualSceneHitSurfaces,
  surfaceX,
  surfaceY,
  viewport,
  visualProjection,
  visualScene,
}: {
  readonly node: GpuNodeLayout & {
    readonly height: number;
    readonly width: number;
  };
  readonly nodeId: string;
  readonly requireVisualSceneHitSurfaces: boolean;
  readonly surfaceX: number;
  readonly surfaceY: number;
  readonly viewport: GpuViewportInput;
  readonly visualProjection: GpuFlowNodeHitProjection | null;
  readonly visualScene?: HtmlSurfaceVisualScene | undefined;
}): Pick<GpuNodeSourceProjection, "localX" | "localY"> | null {
  if (visualProjection) {
    return visualProjection.node.nodeId === nodeId ? visualProjection : null;
  }
  if (requireVisualSceneHitSurfaces) {
    return null;
  }
  if (hasVisualSceneSurfaceForNode(visualScene, nodeId)) {
    return null;
  }
  return resolveFlatGpuNodeSourceProjection({
    node,
    surfaceX,
    surfaceY,
    viewport,
  });
}

function hasVisualSceneSurfaceForNode(
  visualScene: HtmlSurfaceVisualScene | undefined,
  nodeId: string,
): boolean {
  return Boolean(
    visualScene &&
      (visualScene.flatSurfaces.some(
        (surface) => surface.surfaceId === nodeId,
      ) ||
        visualScene.lateFlatSurfaces.some(
          (surface) => surface.surfaceId === nodeId,
        ) ||
        visualScene.tiledFlatSurfaces.some(
          (surface) => surface.surfaceId === nodeId,
        ) ||
        visualScene.meshSurfaces.some(
          (surface) => surface.surfaceId === nodeId,
        ) ||
        visualScene.effectSurfaces.some(
          (surface) => surface.surfaceId === nodeId,
        )),
  );
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
  releaseGpuFlowSurfaceTexture({
    reason: "source-unmounted",
    surfaceId: nodeId,
    textureManager: textureManagerRef.current,
  });
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

function setGpuFlowNodeHoverProjectionState(
  element: HTMLElement,
  nodeId: string,
  hovered: boolean,
) {
  if (hovered) {
    element.setAttribute(GPU_FLOW_NODE_HOVERED_ATTRIBUTE, "true");
    setGpuFlowNodeHandleHoverProjectionState(element, nodeId, true);
    return;
  }
  element.removeAttribute(GPU_FLOW_NODE_HOVERED_ATTRIBUTE);
  setGpuFlowNodeHandleHoverProjectionState(element, nodeId, false);
}

function setGpuFlowNodeHandleHoverProjectionState(
  element: HTMLElement,
  nodeId: string,
  hovered: boolean,
) {
  const handleScope = resolveGpuFlowNodeAgenticHandleScope(element);
  const inheritedHandleTop = hovered
    ? resolveProjectedAgenticHandleTop(handleScope)
    : "";
  const inheritedHandleAccent = hovered
    ? handleScope.ownerDocument.defaultView
        ?.getComputedStyle(handleScope)
        .getPropertyValue("--agentic-handle-accent")
    : "";
  for (const handle of element.ownerDocument.querySelectorAll<HTMLElement>(
    ".setta-gpu-flow__handle.agentic-handle",
  )) {
    if (handle.getAttribute("data-nodeid") !== nodeId) {
      continue;
    }
    if (hovered) {
      handle.setAttribute(GPU_FLOW_NODE_HOVERED_ATTRIBUTE, "true");
      setHandleCustomProperty(
        handle,
        "--agentic-handle-top",
        inheritedHandleTop,
      );
      setHandleCustomProperty(
        handle,
        "--agentic-handle-accent",
        inheritedHandleAccent,
      );
    } else {
      handle.removeAttribute(GPU_FLOW_NODE_HOVERED_ATTRIBUTE);
      handle.style.removeProperty("--agentic-handle-top");
      handle.style.removeProperty("--agentic-handle-accent");
    }
  }
}

function resolveGpuFlowNodeAgenticHandleScope(
  element: HTMLElement,
): HTMLElement {
  if (element.classList.contains("agentic-handle-scope")) {
    return element;
  }
  return element.querySelector<HTMLElement>(".agentic-handle-scope") ?? element;
}

function resolveProjectedAgenticHandleTop(handleScope: HTMLElement): string {
  const computedTop =
    handleScope.ownerDocument.defaultView
      ?.getComputedStyle(handleScope)
      .getPropertyValue("--agentic-handle-top")
      .trim() ?? "";
  if (computedTop && computedTop !== "50%") {
    return computedTop;
  }
  const search = handleScope.querySelector("search.section-search");
  if (!(search instanceof HTMLElement)) {
    return computedTop;
  }
  const scopeRect = handleScope.getBoundingClientRect();
  const searchRect = search.getBoundingClientRect();
  return `${Math.round(searchRect.top - scopeRect.top + searchRect.height / 2)}px`;
}

function isPointerWithinProjectedAgenticHandleBridge(
  element: HTMLElement,
  nodeId: string,
  event: PointerEvent,
): boolean {
  const handleScope = resolveGpuFlowNodeAgenticHandleScope(element);
  const scopeRect = handleScope.getBoundingClientRect();
  for (const handle of element.ownerDocument.querySelectorAll<HTMLElement>(
    ".setta-gpu-flow__handle.agentic-handle",
  )) {
    if (
      handle.getAttribute("data-nodeid") !== nodeId ||
      handle.dataset.reverseStart === "true"
    ) {
      continue;
    }
    const handleRect = handle.getBoundingClientRect();
    const left = Math.min(scopeRect.left, handleRect.left) - 2;
    const right = Math.max(scopeRect.right, handleRect.right) + 2;
    const top = handleRect.top - 12;
    const bottom = handleRect.bottom + 12;
    if (
      event.clientX >= left &&
      event.clientX <= right &&
      event.clientY >= top &&
      event.clientY <= bottom
    ) {
      return true;
    }
  }
  return false;
}

function setHandleCustomProperty(
  handle: HTMLElement,
  property: "--agentic-handle-accent" | "--agentic-handle-top",
  value: string | undefined,
) {
  const nextValue = value?.trim();
  if (nextValue) {
    handle.style.setProperty(property, nextValue);
  }
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
