import { memo, useCallback, type CSSProperties, type ReactNode } from "react";
import type { NodeTexturePriority } from "./dirtyTracking";
import type { GpuEdgeBufferInput } from "./edges/edgeGpuBuffers";
import type {
  GpuGridInput,
  RenderNodeTextureQuadsInput,
  RenderNodeTextureQuadsResult,
} from "./gpuPipelines";
import type { GpuCanvasSize } from "./gpuRenderer";
import type {
  NodeTextureManager,
  NodeTextureRecord,
  UploadDirtyNodeTexturesOptions,
} from "./nodeTextures";
import { resolveGpuNodeCssZIndex, resolveGpuNodeZIndex } from "./nodeZIndex";
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

type GpuVisibleNodeQuad = {
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

type CollectVisibleGpuNodeQuadsInput = {
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

type BuildTexturedGpuNodeQuadsResult = {
  readonly missingTextureNodeIds: readonly string[];
  readonly texturedQuads: readonly GpuTexturedNodeQuad[];
};

type SyncGpuNodeDomTransformsInput = {
  readonly activeNodeIds?: ReadonlySet<string> | readonly string[] | undefined;
  readonly elementByNodeId:
    | ReadonlyMap<string, HTMLElement>
    | ((nodeId: string) => HTMLElement | null | undefined);
  readonly nodes: readonly GpuNodeLayout[];
  readonly offscreenX?: number | undefined;
  readonly offscreenY?: number | undefined;
  readonly visibleNodeIds: ReadonlySet<string>;
  readonly viewport: GpuViewportInput;
};

export type GpuNodeUploadBudget = Pick<
  UploadDirtyNodeTexturesOptions,
  "maxDurationMs" | "maxUploads" | "now"
>;

type GpuNodeTextureController = Pick<
  NodeTextureManager,
  | "getNodeTexture"
  | "markNodeTextureDirty"
  | "registerNodeTexture"
  | "uploadDirtyNodeTextures"
>;

type GpuNodeQuadRenderTarget = {
  render(input: RenderNodeTextureQuadsInput): RenderNodeTextureQuadsResult;
};

type RenderGpuNodeLayerFrameInput = {
  readonly activeNodeId?: string | null | undefined;
  readonly canvasSize: GpuCanvasSize;
  readonly clearColor?: GPUColorDict | undefined;
  readonly deferUploadNodeIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly deferResolutionUpdates?: boolean | undefined;
  readonly edges?: readonly GpuEdgeBufferInput[] | undefined;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly forceVisibleNodeIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly frame: number;
  readonly grid?: GpuGridInput | undefined;
  readonly marginCssPx?: number | undefined;
  readonly nodes: readonly GpuNodeLayout[];
  readonly renderer: GpuNodeQuadRenderTarget;
  readonly suppressNodeIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
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
  readonly skippedNodeIds: readonly string[];
  readonly uploadedNodeIds: readonly string[];
  readonly visibleNodeIds: readonly string[];
};

type MarkGpuNodeLayerPaintDirtyInput = {
  readonly changedElements?: readonly Element[] | undefined;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly frame: number;
  readonly textureManager: Pick<NodeTextureManager, "markNodeTextureDirty">;
};

const DEFAULT_OFFSCREEN_POSITION = -100_000;
const DEFAULT_NODE_CLASS_NAME = "setta-gpu-flow__node react-flow__node";
const GPU_FLOW_NODE_INTERACTIVE_CLASS = "setta-gpu-flow__node--interactive";

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
        zIndex: resolveGpuNodeCssZIndex(node),
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
  deferUploadNodeIds,
  deferResolutionUpdates,
  edges,
  elementByNodeId,
  forceVisibleNodeIds,
  frame,
  grid,
  marginCssPx,
  nodes,
  renderer,
  suppressNodeIds,
  textureManager,
  uploadBudget,
  viewport,
}: RenderGpuNodeLayerFrameInput): RenderGpuNodeLayerFrameResult {
  const activeNodeIds = normalizeNodeIdSet(
    activeNodeId ? [activeNodeId] : undefined,
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
    visibleNodeIds,
    viewport,
  });

  const missingElementNodeIds = registerVisibleGpuNodeTextures({
    activeNodeIds,
    deferResolutionUpdates,
    devicePixelRatio: canvasSize.devicePixelRatio,
    elementByNodeId,
    frame,
    quads: visibleQuads,
    textureManager,
    viewport,
  });
  const uploadResult = uploadGpuNodeTextures({
    deferUploadNodeIds,
    deferResolutionUpdates,
    frame,
    textureManager,
    uploadBudget,
  });
  const textureResult = buildTexturedGpuNodeQuads(visibleQuads, textureManager);
  const uploadedTexturedQuads = textureResult.texturedQuads.filter(
    (quad) => quad.texture.lastUploadFrame >= 0,
  );
  const renderableTexturedQuads = suppressGpuNodeQuads(
    uploadedTexturedQuads,
    suppressNodeIds,
  );
  const renderResult = renderer.render({
    canvasSize,
    clearColor,
    ...(edges === undefined ? {} : { edges }),
    ...(grid === undefined ? {} : { grid }),
    quads: renderableTexturedQuads,
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
    remainingDirtyNodeIds: uploadResult.remainingDirtyNodeIds,
    skippedNodeIds: uploadResult.skippedNodeIds,
    uploadedNodeIds: uploadResult.uploaded.map((record) => record.nodeId),
    visibleNodeIds: [...visibleNodeIds],
  };
}

function suppressGpuNodeQuads(
  quads: readonly GpuTexturedNodeQuad[],
  suppressNodeIds: ReadonlySet<string> | readonly string[] | undefined,
): readonly GpuTexturedNodeQuad[] {
  const suppressedIds = normalizeNodeIdSet(suppressNodeIds);
  if (suppressedIds.size === 0) {
    return quads;
  }
  return quads.filter((quad) => !suppressedIds.has(quad.nodeId));
}

function registerVisibleGpuNodeTextures({
  activeNodeIds,
  deferResolutionUpdates,
  devicePixelRatio,
  elementByNodeId,
  frame,
  quads,
  textureManager,
  viewport,
}: {
  readonly activeNodeIds: ReadonlySet<string>;
  readonly deferResolutionUpdates: boolean | undefined;
  readonly devicePixelRatio: number;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly frame: number;
  readonly quads: readonly GpuVisibleNodeQuad[];
  readonly textureManager: GpuNodeTextureController;
  readonly viewport: GpuViewportInput;
}): string[] {
  const missingElementNodeIds: string[] = [];
  const zoom = normalizeGpuViewport(viewport).zoom;
  for (const quad of quads) {
    const element = elementByNodeId.get(quad.nodeId);
    if (!element) {
      missingElementNodeIds.push(quad.nodeId);
      continue;
    }
    textureManager.registerNodeTexture({
      cssHeight: quad.height,
      cssWidth: quad.width,
      ...(deferResolutionUpdates && !activeNodeIds.has(quad.nodeId)
        ? { deferResolution: true }
        : {}),
      devicePixelRatio,
      element,
      frame,
      nodeId: quad.nodeId,
      priority: resolveVisibleNodeTexturePriority(quad.nodeId, activeNodeIds),
      zoom,
    });
  }
  return missingElementNodeIds;
}

function uploadGpuNodeTextures({
  deferUploadNodeIds,
  deferResolutionUpdates,
  frame,
  textureManager,
  uploadBudget,
}: {
  readonly deferUploadNodeIds:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly deferResolutionUpdates: boolean | undefined;
  readonly frame: number;
  readonly textureManager: GpuNodeTextureController;
  readonly uploadBudget: GpuNodeUploadBudget | undefined;
}) {
  return textureManager.uploadDirtyNodeTextures({
    ...(deferUploadNodeIds ? { deferNodeIds: deferUploadNodeIds } : {}),
    frame,
    ...(deferResolutionUpdates ? { deferPassiveUploads: true } : {}),
    ...uploadBudget,
  });
}

export function markGpuNodeLayerPaintDirty({
  changedElements,
  elementByNodeId,
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
  visibleNodeIds,
  viewport,
}: SyncGpuNodeDomTransformsInput) {
  const normalizedViewport = normalizeGpuViewport(viewport);
  const activeIds = normalizeNodeIdSet(activeNodeIds);
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
        screenX: screenPosition.x,
        screenY: screenPosition.y,
        zoom: normalizedViewport.zoom,
      });
      continue;
    }

    applyCulledNodeDomTransform(element, offscreenX, offscreenY);
  }
}

function applyVisibleNodeDomTransform(
  element: HTMLElement,
  {
    interactive,
    screenX,
    screenY,
    zoom,
  }: {
    readonly interactive?: boolean | undefined;
    readonly screenX: number;
    readonly screenY: number;
    readonly zoom: number;
  },
) {
  setGpuNodeBaseStyle(element);
  setStyleValue(
    element,
    "transform",
    `translate(${screenX}px, ${screenY}px) scale(${zoom})`,
  );
  setStyleValue(element, "pointerEvents", "all");
  setDatasetValue(element, "gpuFlowVisible", "true");
  setDatasetValue(
    element,
    "gpuFlowInteractive",
    interactive ? "true" : "false",
  );
  setClassPresence(
    element,
    GPU_FLOW_NODE_INTERACTIVE_CLASS,
    Boolean(interactive),
  );
}

function applyCulledNodeDomTransform(
  element: HTMLElement,
  offscreenX = DEFAULT_OFFSCREEN_POSITION,
  offscreenY = DEFAULT_OFFSCREEN_POSITION,
) {
  setGpuNodeBaseStyle(element);
  setStyleValue(
    element,
    "transform",
    `translate(${offscreenX}px, ${offscreenY}px) scale(1)`,
  );
  setStyleValue(element, "pointerEvents", "none");
  setDatasetValue(element, "gpuFlowVisible", "false");
  setDatasetValue(element, "gpuFlowInteractive", "false");
  setClassPresence(element, GPU_FLOW_NODE_INTERACTIVE_CLASS, false);
}

type GpuNodeStyleKey =
  | "left"
  | "pointerEvents"
  | "position"
  | "top"
  | "transform"
  | "transformOrigin";

function setGpuNodeBaseStyle(element: HTMLElement) {
  setStyleValue(element, "position", "absolute");
  setStyleValue(element, "left", "0px");
  setStyleValue(element, "top", "0px");
  setStyleValue(element, "transformOrigin", "0 0");
}

function setStyleValue(
  element: HTMLElement,
  property: GpuNodeStyleKey,
  value: string,
) {
  if (element.style[property] !== value) {
    element.style[property] = value;
  }
}

function setDatasetValue(
  element: HTMLElement,
  property: string,
  value: string,
) {
  if (element.dataset[property] !== value) {
    element.dataset[property] = value;
  }
}

function setClassPresence(
  element: HTMLElement,
  className: string,
  enabled: boolean,
) {
  if (element.classList.contains(className) !== enabled) {
    element.classList.toggle(className, enabled);
  }
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
      nodeElement.contains(changedElement) &&
      nodeElement !== changedElement
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
    zIndex: resolveGpuNodeZIndex(node),
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
