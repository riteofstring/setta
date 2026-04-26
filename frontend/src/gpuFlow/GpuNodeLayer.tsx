import { memo, useCallback, type CSSProperties, type ReactNode } from "react";
import type { NodeTexturePriority } from "./dirtyTracking";
import type { GpuEdgeBufferInput } from "./edges/edgeGpuBuffers";
import type {
  RenderNodeTextureQuadsInput,
  RenderNodeTextureQuadsResult,
} from "./gpuPipelines";
import type { GpuCanvasSize } from "./gpuRenderer";
import type {
  NodeTextureManager,
  NodeTextureRecord,
  UploadDirtyNodeTexturesOptions,
} from "./nodeTextures";
import {
  flowToScreenPosition,
  getVisibleFlowRect,
  normalizeGpuViewport,
  rectsIntersect,
  type GpuRect,
  type GpuViewportInput,
} from "./viewportMath";

export type GpuNodeLayout = {
  readonly height: number | null;
  readonly nodeId: string;
  readonly tempZIndex?: number | undefined;
  readonly width: number | null;
  readonly x: number;
  readonly y: number;
  readonly zIndex?: number | undefined;
};

export type GpuVisibleNodeQuad = {
  readonly height: number;
  readonly nodeId: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

export type GpuTexturedNodeQuad = GpuVisibleNodeQuad & {
  readonly texture: NodeTextureRecord;
};

export type GpuNodeLayerProps = {
  readonly className?: string | undefined;
  readonly nodeVisibility?: CSSProperties["visibility"] | undefined;
  readonly nodes: readonly GpuNodeLayout[];
  readonly onNodeElementChange?:
    | ((nodeId: string, element: HTMLElement | null) => void)
    | undefined;
  readonly renderNode: (node: GpuNodeLayout) => ReactNode;
};

export type CollectVisibleGpuNodeQuadsInput = {
  readonly canvasHeight: number;
  readonly canvasWidth: number;
  readonly forceVisibleNodeIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly marginCssPx?: number | undefined;
  readonly nodes: readonly GpuNodeLayout[];
  readonly viewport: GpuViewportInput;
};

export type BuildTexturedGpuNodeQuadsResult = {
  readonly missingTextureNodeIds: readonly string[];
  readonly texturedQuads: readonly GpuTexturedNodeQuad[];
};

export type SyncGpuNodeDomTransformsInput = {
  readonly activeNodeIds?: ReadonlySet<string> | readonly string[] | undefined;
  readonly elementByNodeId:
    | ReadonlyMap<string, HTMLElement>
    | ((nodeId: string) => HTMLElement | null | undefined);
  readonly nodes: readonly GpuNodeLayout[];
  readonly offscreenX?: number | undefined;
  readonly offscreenY?: number | undefined;
  readonly overlayNodeIds?: ReadonlySet<string> | readonly string[] | undefined;
  readonly visibleNodeIds: ReadonlySet<string>;
  readonly viewport: GpuViewportInput;
};

export type GpuNodeUploadBudget = Pick<
  UploadDirtyNodeTexturesOptions,
  "maxDurationMs" | "maxUploads" | "now"
>;

export type GpuNodeTextureController = Pick<
  NodeTextureManager,
  | "getNodeTexture"
  | "markNodeTextureDirty"
  | "registerNodeTexture"
  | "uploadDirtyNodeTextures"
>;

export type GpuNodeQuadRenderTarget = {
  render(input: RenderNodeTextureQuadsInput): RenderNodeTextureQuadsResult;
};

export type RenderGpuNodeLayerFrameInput = {
  readonly activeNodeId?: string | null | undefined;
  readonly canvasSize: GpuCanvasSize;
  readonly clearColor?: GPUColorDict | undefined;
  readonly edges?: readonly GpuEdgeBufferInput[] | undefined;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly forceVisibleNodeIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly frame: number;
  readonly marginCssPx?: number | undefined;
  readonly nodes: readonly GpuNodeLayout[];
  readonly renderer: GpuNodeQuadRenderTarget;
  readonly overlayNodeId?: string | null | undefined;
  readonly textureManager: GpuNodeTextureController;
  readonly uploadBudget?: GpuNodeUploadBudget | undefined;
  readonly viewport: GpuViewportInput;
};

export type RenderGpuNodeLayerFrameResult = {
  readonly activeNodeId: string | null;
  readonly budgetExhausted: boolean;
  readonly drawnEdgeIds: readonly string[];
  readonly drawnNodeIds: readonly string[];
  readonly edgeVertexCount: number;
  readonly missingElementNodeIds: readonly string[];
  readonly missingTextureNodeIds: readonly string[];
  readonly remainingDirtyNodeIds: readonly string[];
  readonly overlayNodeId: string | null;
  readonly skippedNodeIds: readonly string[];
  readonly uploadedNodeIds: readonly string[];
  readonly visibleNodeIds: readonly string[];
};

export type MarkGpuNodeLayerPaintDirtyInput = {
  readonly changedElements?: readonly Element[] | undefined;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly fallbackNodeIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly frame: number;
  readonly textureManager: Pick<NodeTextureManager, "markNodeTextureDirty">;
};

const DEFAULT_OFFSCREEN_POSITION = -100_000;
const DEFAULT_NODE_CLASS_NAME = "setta-gpu-flow__node react-flow__node";

export function GpuNodeLayer({
  className = DEFAULT_NODE_CLASS_NAME,
  nodeVisibility,
  nodes,
  onNodeElementChange,
  renderNode,
}: GpuNodeLayerProps) {
  return (
    <>
      {nodes.map((node) => (
        <GpuNodeChild
          className={className}
          key={node.nodeId}
          node={node}
          onNodeElementChange={onNodeElementChange}
          renderNode={renderNode}
          visibility={nodeVisibility}
        />
      ))}
    </>
  );
}

const GpuNodeChild = memo(function GpuNodeChild({
  className,
  node,
  onNodeElementChange,
  renderNode,
  visibility,
}: {
  readonly className: string;
  readonly node: GpuNodeLayout;
  readonly onNodeElementChange:
    | ((nodeId: string, element: HTMLElement | null) => void)
    | undefined;
  readonly renderNode: (node: GpuNodeLayout) => ReactNode;
  readonly visibility: CSSProperties["visibility"] | undefined;
}) {
  const setNodeElement = useCallback(
    (element: HTMLDivElement | null) => {
      onNodeElementChange?.(node.nodeId, element);
    },
    [node.nodeId, onNodeElementChange],
  );

  return (
    <div
      className={className}
      data-gpu-flow-node="true"
      data-id={node.nodeId}
      data-testid={`rf__node-${node.nodeId}`}
      ref={setNodeElement}
      style={{
        visibility,
        zIndex: node.tempZIndex ?? node.zIndex,
      }}
    >
      {renderNode(node)}
    </div>
  );
});

export function renderGpuNodeLayerFrame({
  activeNodeId,
  canvasSize,
  clearColor,
  edges,
  elementByNodeId,
  forceVisibleNodeIds,
  frame,
  marginCssPx,
  nodes,
  overlayNodeId,
  renderer,
  textureManager,
  uploadBudget,
  viewport,
}: RenderGpuNodeLayerFrameInput): RenderGpuNodeLayerFrameResult {
  const activeNodeIds = normalizeNodeIdSet(
    activeNodeId ? [activeNodeId] : undefined,
  );
  const overlayNodeIds = normalizeNodeIdSet(
    overlayNodeId ? [overlayNodeId] : undefined,
  );
  const visibleQuads = collectVisibleGpuNodeQuads({
    canvasHeight: canvasSize.cssHeight,
    canvasWidth: canvasSize.cssWidth,
    forceVisibleNodeIds: mergeNodeIdSets(forceVisibleNodeIds, activeNodeIds),
    marginCssPx,
    nodes,
    viewport,
  });
  const visibleNodeIds = new Set(visibleQuads.map((quad) => quad.nodeId));

  syncGpuNodeDomTransforms({
    activeNodeIds,
    elementByNodeId,
    nodes,
    overlayNodeIds,
    visibleNodeIds,
    viewport,
  });

  const missingElementNodeIds: string[] = [];
  for (const quad of visibleQuads) {
    const element = elementByNodeId.get(quad.nodeId);
    if (!element) {
      missingElementNodeIds.push(quad.nodeId);
      continue;
    }
    textureManager.registerNodeTexture({
      cssHeight: quad.height,
      cssWidth: quad.width,
      devicePixelRatio: canvasSize.devicePixelRatio,
      element,
      frame,
      nodeId: quad.nodeId,
      priority: resolveVisibleNodeTexturePriority(quad.nodeId, activeNodeIds),
      zoom: normalizeGpuViewport(viewport).zoom,
    });
  }

  const uploadResult = textureManager.uploadDirtyNodeTextures({
    frame,
    ...uploadBudget,
  });
  const textureResult = buildTexturedGpuNodeQuads(visibleQuads, textureManager);
  const uploadedTexturedQuads = textureResult.texturedQuads.filter(
    (quad) => quad.texture.lastUploadFrame >= 0,
  );
  const renderResult = renderer.render({
    canvasSize,
    clearColor,
    ...(edges === undefined ? {} : { edges }),
    quads: uploadedTexturedQuads,
    viewport,
  });

  return {
    activeNodeId: activeNodeId ?? null,
    budgetExhausted: uploadResult.budgetExhausted,
    drawnEdgeIds: renderResult.drawnEdgeIds,
    drawnNodeIds: renderResult.drawnNodeIds,
    edgeVertexCount: renderResult.edgeVertexCount,
    missingElementNodeIds,
    missingTextureNodeIds: textureResult.missingTextureNodeIds,
    overlayNodeId: overlayNodeId ?? null,
    remainingDirtyNodeIds: uploadResult.remainingDirtyNodeIds,
    skippedNodeIds: uploadResult.skippedNodeIds,
    uploadedNodeIds: uploadResult.uploaded.map((record) => record.nodeId),
    visibleNodeIds: [...visibleNodeIds],
  };
}

export function markGpuNodeLayerPaintDirty({
  changedElements,
  elementByNodeId,
  fallbackNodeIds,
  frame,
  textureManager,
}: MarkGpuNodeLayerPaintDirtyInput): string[] {
  const dirtyNodeIds = new Set<string>();
  if (changedElements) {
    for (const changedElement of changedElements) {
      const nodeId = findNodeIdForChangedElement(
        changedElement,
        elementByNodeId,
      );
      if (nodeId) {
        dirtyNodeIds.add(nodeId);
      }
    }
  }

  if (!changedElements) {
    for (const nodeId of normalizeNodeIdSet(fallbackNodeIds)) {
      dirtyNodeIds.add(nodeId);
    }
  }

  for (const nodeId of dirtyNodeIds) {
    textureManager.markNodeTextureDirty({
      content: true,
      frame,
      nodeId,
      reason: "paint",
      requestPaint: false,
    });
  }

  return [...dirtyNodeIds];
}

export function collectVisibleGpuNodeQuads({
  canvasHeight,
  canvasWidth,
  forceVisibleNodeIds,
  marginCssPx = 128,
  nodes,
  viewport,
}: CollectVisibleGpuNodeQuadsInput): GpuVisibleNodeQuad[] {
  const forcedIds = normalizeNodeIdSet(forceVisibleNodeIds);
  const visibleRect = getVisibleFlowRect({
    canvasHeight,
    canvasWidth,
    marginCssPx,
    viewport,
  });
  const visible: Array<GpuVisibleNodeQuad & { readonly sourceIndex: number }> =
    [];

  nodes.forEach((node, sourceIndex) => {
    const quad = toNodeQuad(node);
    if (!quad) {
      return;
    }
    if (
      forcedIds.has(quad.nodeId) ||
      rectsIntersect(toRect(quad), visibleRect)
    ) {
      visible.push({ ...quad, sourceIndex });
    }
  });

  return visible
    .sort(
      (left, right) =>
        left.zIndex - right.zIndex || left.sourceIndex - right.sourceIndex,
    )
    .map((quad) => ({
      height: quad.height,
      nodeId: quad.nodeId,
      width: quad.width,
      x: quad.x,
      y: quad.y,
      zIndex: quad.zIndex,
    }));
}

export function buildTexturedGpuNodeQuads(
  quads: readonly GpuVisibleNodeQuad[],
  textureSource:
    | Pick<NodeTextureManager, "getNodeTexture">
    | ((nodeId: string) => NodeTextureRecord | undefined),
): BuildTexturedGpuNodeQuadsResult {
  const getTexture =
    typeof textureSource === "function"
      ? textureSource
      : textureSource.getNodeTexture.bind(textureSource);
  const texturedQuads: GpuTexturedNodeQuad[] = [];
  const missingTextureNodeIds: string[] = [];

  for (const quad of quads) {
    const texture = getTexture(quad.nodeId);
    if (!texture) {
      missingTextureNodeIds.push(quad.nodeId);
      continue;
    }
    texturedQuads.push({ ...quad, texture });
  }

  return { missingTextureNodeIds, texturedQuads };
}

export function syncGpuNodeDomTransforms({
  activeNodeIds,
  elementByNodeId,
  nodes,
  offscreenX = DEFAULT_OFFSCREEN_POSITION,
  offscreenY = DEFAULT_OFFSCREEN_POSITION,
  overlayNodeIds,
  visibleNodeIds,
  viewport,
}: SyncGpuNodeDomTransformsInput) {
  const normalizedViewport = normalizeGpuViewport(viewport);
  const activeIds = normalizeNodeIdSet(activeNodeIds);
  const overlayIds = normalizeNodeIdSet(overlayNodeIds);
  for (const node of nodes) {
    const element = resolveElement(elementByNodeId, node.nodeId);
    if (!element) {
      continue;
    }
    const visible = visibleNodeIds.has(node.nodeId);
    if (visible) {
      const screenPosition = flowToScreenPosition(
        { x: node.x, y: node.y },
        normalizedViewport,
      );
      applyVisibleNodeDomTransform(element, {
        interactive: activeIds.has(node.nodeId),
        overlayActive: overlayIds.has(node.nodeId),
        screenX: screenPosition.x,
        screenY: screenPosition.y,
        zoom: normalizedViewport.zoom,
      });
      continue;
    }

    applyCulledNodeDomTransform(element, offscreenX, offscreenY);
  }
}

export function applyVisibleNodeDomTransform(
  element: HTMLElement,
  {
    interactive,
    overlayActive,
    screenX,
    screenY,
    zoom,
  }: {
    readonly interactive?: boolean | undefined;
    readonly overlayActive?: boolean | undefined;
    readonly screenX: number;
    readonly screenY: number;
    readonly zoom: number;
  },
) {
  element.style.position = "absolute";
  element.style.left = "0px";
  element.style.top = "0px";
  element.style.transformOrigin = "0 0";
  element.style.transform = `translate(${screenX}px, ${screenY}px) scale(${zoom})`;
  element.style.pointerEvents = "all";
  element.dataset.gpuFlowInteractive = interactive ? "true" : "false";
  element.dataset.gpuFlowOverlay = overlayActive ? "active" : "none";
  element.classList.toggle(
    "setta-gpu-flow__node--interactive",
    Boolean(interactive),
  );
  element.classList.toggle(
    "setta-gpu-flow__node--overlay-active",
    Boolean(overlayActive),
  );
}

export function applyCulledNodeDomTransform(
  element: HTMLElement,
  offscreenX = DEFAULT_OFFSCREEN_POSITION,
  offscreenY = DEFAULT_OFFSCREEN_POSITION,
) {
  element.style.position = "absolute";
  element.style.left = "0px";
  element.style.top = "0px";
  element.style.transformOrigin = "0 0";
  element.style.transform = `translate(${offscreenX}px, ${offscreenY}px) scale(1)`;
  element.style.pointerEvents = "none";
  element.dataset.gpuFlowInteractive = "false";
  element.dataset.gpuFlowOverlay = "none";
  element.classList.remove(
    "setta-gpu-flow__node--interactive",
    "setta-gpu-flow__node--overlay-active",
  );
}

function mergeNodeIdSets(
  left: ReadonlySet<string> | readonly string[] | undefined,
  right: ReadonlySet<string> | readonly string[] | undefined,
): ReadonlySet<string> | undefined {
  const leftIds = normalizeNodeIdSet(left);
  const rightIds = normalizeNodeIdSet(right);
  if (leftIds.size === 0) {
    return rightIds.size === 0 ? undefined : rightIds;
  }
  if (rightIds.size === 0) {
    return leftIds;
  }
  return new Set([...leftIds, ...rightIds]);
}

function resolveVisibleNodeTexturePriority(
  nodeId: string,
  activeNodeIds: ReadonlySet<string>,
): NodeTexturePriority {
  return activeNodeIds.has(nodeId) ? "interactive" : "visible";
}

function normalizeNodeIdSet(
  nodeIds: ReadonlySet<string> | readonly string[] | undefined,
): ReadonlySet<string> {
  if (!nodeIds) {
    return new Set();
  }
  if (nodeIds instanceof Set) {
    return nodeIds;
  }
  return new Set(nodeIds);
}

function findNodeIdForChangedElement(
  changedElement: Element,
  elementByNodeId: ReadonlyMap<string, HTMLElement>,
): string | null {
  for (const [nodeId, nodeElement] of elementByNodeId) {
    if (
      nodeElement === changedElement ||
      nodeElement.contains(changedElement)
    ) {
      return nodeId;
    }
  }
  return null;
}

function resolveElement(
  elementByNodeId:
    | ReadonlyMap<string, HTMLElement>
    | ((nodeId: string) => HTMLElement | null | undefined),
  nodeId: string,
): HTMLElement | null | undefined {
  return typeof elementByNodeId === "function"
    ? elementByNodeId(nodeId)
    : elementByNodeId.get(nodeId);
}

function toNodeQuad(node: GpuNodeLayout): GpuVisibleNodeQuad | null {
  if (
    node.width === null ||
    node.height === null ||
    node.width <= 0 ||
    node.height <= 0
  ) {
    return null;
  }

  return {
    height: node.height,
    nodeId: node.nodeId,
    width: node.width,
    x: node.x,
    y: node.y,
    zIndex: node.tempZIndex ?? node.zIndex ?? 0,
  };
}

function toRect(quad: GpuVisibleNodeQuad): GpuRect {
  return {
    height: quad.height,
    width: quad.width,
    x: quad.x,
    y: quad.y,
  };
}
