import type { CSSProperties, ReactNode } from "react";

import type { GpuEdgeBufferInput } from "../edges/edgeGpuBuffers";

import type {
  GpuEdgePaletteInput,
  GpuGridInput,
  RenderNodeTextureQuadsInput,
  RenderNodeTextureQuadsResult,
} from "../gpuPipelines";

import type { GpuCanvasSize } from "../gpuRenderer";

import type {
  NodeTextureManager,
  NodeTextureMemorySnapshot,
  NodeTextureRecord,
  UploadDirtyNodeTexturesOptions,
} from "../nodeTextures";

import { resolveGpuNodeCssZIndex, resolveGpuNodeZIndex } from "../nodeZIndex";

import { GPU_FLOW_CLASS_NAMES } from "../gpuFlowDomClasses";

import { resolveHtmlSurfacePaintInvalidation } from "../htmlSurfaces/paintInvalidation";

import {
  HTML_SURFACE_SOURCE_CLASS_NAME,
  HTML_SURFACE_SOURCE_ID_ATTRIBUTE,
  HTML_SURFACE_SOURCE_SELECTOR,
  HtmlSurfaceSourceLayer,
  type HtmlSurfaceSourceElementConfig,
} from "../htmlSurfaces/sourceLayer";

import {
  flowToScreenPosition,
  getVisibleFlowRect,
  normalizeGpuViewport,
  rectsIntersect,
  type GpuViewportInput,
} from "../viewportMath";

import {
  applyCulledNodeDomTransform,
  applyNodeDomTransformState,
  applyVisibleNodeDomTransform,
  createCulledNodeDomTransformState,
  createVisibleNodeDomTransformStateForQuad,
  isCachedNodeDomTransformState,
  mergeNodeIdSets,
  normalizeNodeIdSet,
  resolveElement,
  resolveVisibleNodeTexturePriority,
  setGpuNodeBaseStyle,
  toNodeQuad,
  toRect,
} from "./nodeDomTransforms";

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
  readonly visibleNodeIds: ReadonlySet<string>;
  readonly viewport: GpuViewportInput;
};

export type SyncGpuNodeDomTransformsFromQuadsInput = {
  readonly activeNodeIds?: ReadonlySet<string> | readonly string[] | undefined;
  readonly cache: GpuNodeDomTransformSyncCache;
  readonly elementByNodeId:
    | ReadonlyMap<string, HTMLElement>
    | ((nodeId: string) => HTMLElement | null | undefined);
  readonly offscreenX?: number | undefined;
  readonly offscreenY?: number | undefined;
  readonly retainNodeIds?: ReadonlySet<string> | readonly string[] | undefined;
  readonly visibleQuads: readonly GpuVisibleNodeQuad[];
  readonly viewport: GpuViewportInput;
};

export type GpuNodeDomTransformState = {
  readonly element: HTMLElement;
  readonly height: string;
  readonly interactive: "false" | "true";
  readonly pointerEvents: "all" | "none";
  readonly transform: string;
  readonly visible: "false" | "true";
  readonly width: string;
  readonly zIndex: string;
};

export type GpuNodeDomTransformSyncCache = {
  readonly previousVisibleNodeIds: Set<string>;
  readonly stateByNodeId: Map<string, GpuNodeDomTransformState>;
};

export type GpuNodeDomTransformSyncResult = {
  readonly parkedNodeIds: readonly string[];
  readonly skippedNodeIds: readonly string[];
  readonly updatedNodeIds: readonly string[];
  readonly visibleNodeIds: readonly string[];
};

export type GpuNodeUploadBudget = Pick<
  UploadDirtyNodeTexturesOptions,
  "maxDurationMs" | "maxUploads" | "now"
>;

export type GpuNodeTextureController = Pick<
  NodeTextureManager,
  | "getNodeTexture"
  | "evictNodeTextures"
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
  readonly deferUploadNodeIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly deferResolutionUpdates?: boolean | undefined;
  readonly edgePalette?: GpuEdgePaletteInput | undefined;
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
  readonly nodeTextureMemoryBudgetBytes?: number | undefined;
  readonly renderer: GpuNodeQuadRenderTarget;
  readonly suppressNodeIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly domTransformCache?: GpuNodeDomTransformSyncCache | undefined;
  readonly textureManager: GpuNodeTextureController;
  readonly uploadBudget?: GpuNodeUploadBudget | undefined;
  readonly viewport: GpuViewportInput;
};

export type RenderGpuNodeLayerFrameResult = {
  readonly activeNodeId: string | null;
  readonly budgetExhausted: boolean;
  readonly domTransformParkedNodeIds: readonly string[];
  readonly domTransformUpdatedNodeIds: readonly string[];
  readonly drawnEdgeIds: readonly string[];
  readonly drawnNodeIds: readonly string[];
  readonly edgeVertexCount: number;
  readonly evictedTextureBytes: number;
  readonly evictedTextureNodeIds: readonly string[];
  readonly missingElementNodeIds: readonly string[];
  readonly missingTextureNodeIds: readonly string[];
  readonly remainingDirtyNodeIds: readonly string[];
  readonly skippedNodeIds: readonly string[];
  readonly textureMemory: NodeTextureMemorySnapshot;
  readonly textureMemoryBeforeEviction: NodeTextureMemorySnapshot;
  readonly uploadedNodeIds: readonly string[];
  readonly visibleNodeIds: readonly string[];
};

export type MarkGpuNodeLayerPaintDirtyInput = {
  readonly changedElements?: readonly Element[] | undefined;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly frame: number;
  readonly ignoreDirectNodeIds?: ReadonlySet<string> | readonly string[];
  readonly textureManager: Pick<NodeTextureManager, "markNodeTextureDirty">;
};

export const DEFAULT_OFFSCREEN_POSITION = -100_000;

export const DEFAULT_NODE_CLASS_NAME = GPU_FLOW_CLASS_NAMES.node;

export const GPU_FLOW_NODE_SELECTOR = '[data-gpu-flow-node="true"]';

export const GPU_FLOW_SURFACE_SELECTOR = '[data-gpu-flow-surface="true"]';

export const GPU_FLOW_NODE_SOURCE_SELECTOR = HTML_SURFACE_SOURCE_SELECTOR;

export const GPU_FLOW_NODE_INTERACTIVE_CLASS =
  "setta-gpu-flow__node--interactive";

export const PRESERVED_GPU_NODE_STATE_CLASSES = [
  GPU_FLOW_NODE_INTERACTIVE_CLASS,
  "setta-gpu-flow__node--teleported",
] as const;

export const EMPTY_DOM_TRANSFORM_SYNC_RESULT: GpuNodeDomTransformSyncResult = {
  parkedNodeIds: [],
  skippedNodeIds: [],
  updatedNodeIds: [],
  visibleNodeIds: [],
};

export function GpuNodeLayer({
  className = DEFAULT_NODE_CLASS_NAME,
  nodeVisibility,
  nodes,
  onNodeElementChange,
  renderNode,
}: GpuNodeLayerProps) {
  return (
    <HtmlSurfaceSourceLayer
      configureSourceElement={configureGpuNodeSourceElement}
      getSourceId={getGpuNodeSurfaceSourceId}
      onSourceElementChange={onNodeElementChange}
      preservedClassNames={PRESERVED_GPU_NODE_STATE_CLASSES}
      renderSource={renderNode}
      sourceClassName={`${HTML_SURFACE_SOURCE_CLASS_NAME} ${className}`}
      sources={nodes}
      sourceVisibility={nodeVisibility}
    />
  );
}

export function getGpuNodeSurfaceSourceId(node: GpuNodeLayout): string {
  return node.nodeId;
}

export function configureGpuNodeSourceElement({
  className,
  host,
  source,
  visibility,
}: HtmlSurfaceSourceElementConfig<GpuNodeLayout>) {
  configureGpuNodeHostElement({
    className,
    host,
    node: source,
    visibility,
  });
}

export function configureGpuNodeHostElement({
  className,
  host,
  node,
  visibility,
}: {
  readonly className: string;
  readonly host: HTMLElement;
  readonly node: GpuNodeLayout;
  readonly visibility: CSSProperties["visibility"] | undefined;
}) {
  host.className = mergeGpuNodeHostClassName(className, host.classList);
  host.dataset.gpuFlowNode = "true";
  host.dataset.id = node.nodeId;
  host.setAttribute("data-testid", `rf__node-${node.nodeId}`);
  setGpuNodeBaseStyle(host);
  host.style.visibility = visibility ?? "";
  const zIndex = resolveGpuNodeCssZIndex(node);
  host.style.zIndex = zIndex === undefined ? "" : String(zIndex);
}

export function mergeGpuNodeHostClassName(
  baseClassName: string,
  currentClassList: DOMTokenList,
): string {
  const classes = new Set(baseClassName.split(/\s+/).filter(Boolean));
  for (const stateClass of PRESERVED_GPU_NODE_STATE_CLASSES) {
    if (currentClassList.contains(stateClass)) {
      classes.add(stateClass);
    }
  }
  return [...classes].join(" ");
}

export function renderGpuNodeLayerFrame({
  activeNodeId,
  canvasSize,
  clearColor,
  deferUploadNodeIds,
  deferResolutionUpdates,
  domTransformCache,
  edgePalette,
  edges,
  elementByNodeId,
  forceVisibleNodeIds,
  frame,
  grid,
  marginCssPx,
  nodes,
  nodeTextureMemoryBudgetBytes,
  renderer,
  suppressNodeIds,
  textureManager,
  uploadBudget,
  viewport,
}: RenderGpuNodeLayerFrameInput): RenderGpuNodeLayerFrameResult {
  const activeNodeIds = normalizeNodeIdSet(
    activeNodeId ? [activeNodeId] : undefined,
  );
  const retainedNodeIds = mergeNodeIdSets(
    mergeNodeIdSets(forceVisibleNodeIds, activeNodeIds),
    mergeNodeIdSets(deferUploadNodeIds, suppressNodeIds),
  );
  const visibleQuads = collectVisibleGpuNodeQuads({
    canvasHeight: canvasSize.cssHeight,
    canvasWidth: canvasSize.cssWidth,
    forceVisibleNodeIds: retainedNodeIds,
    marginCssPx,
    nodes,
    viewport,
  });
  const visibleNodeIds = new Set(visibleQuads.map((quad) => quad.nodeId));

  const domTransformResult = domTransformCache
    ? syncGpuNodeDomTransformsFromQuads({
        activeNodeIds,
        cache: domTransformCache,
        elementByNodeId,
        retainNodeIds: retainedNodeIds,
        visibleQuads,
        viewport,
      })
    : syncGpuNodeDomTransforms({
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
    ...(edgePalette === undefined ? {} : { edgePalette }),
    ...(edges === undefined ? {} : { edges }),
    ...(grid === undefined ? {} : { grid }),
    quads: renderableTexturedQuads,
    viewport,
  });
  const evictionResult = textureManager.evictNodeTextures({
    ...(nodeTextureMemoryBudgetBytes === undefined
      ? {}
      : { budgetBytes: nodeTextureMemoryBudgetBytes }),
    protectedNodeIds: retainedNodeIds,
    reason: "node-layer-frame",
    visibleNodeIds,
  });

  return {
    activeNodeId: activeNodeId ?? null,
    budgetExhausted: uploadResult.budgetExhausted,
    domTransformParkedNodeIds: domTransformResult.parkedNodeIds,
    domTransformUpdatedNodeIds: domTransformResult.updatedNodeIds,
    drawnEdgeIds: renderResult.drawnEdgeIds,
    drawnNodeIds: renderResult.drawnNodeIds,
    edgeVertexCount: renderResult.edgeVertexCount,
    evictedTextureBytes: evictionResult.evictedBytes,
    evictedTextureNodeIds: evictionResult.evictedNodeIds,
    missingElementNodeIds,
    missingTextureNodeIds: textureResult.missingTextureNodeIds,
    remainingDirtyNodeIds: uploadResult.remainingDirtyNodeIds,
    skippedNodeIds: uploadResult.skippedNodeIds,
    textureMemory: evictionResult.memory,
    textureMemoryBeforeEviction: evictionResult.memoryBefore,
    uploadedNodeIds: uploadResult.uploaded.map((record) => record.nodeId),
    visibleNodeIds: [...visibleNodeIds],
  };
}

export function suppressGpuNodeQuads(
  quads: readonly GpuTexturedNodeQuad[],
  suppressNodeIds: ReadonlySet<string> | readonly string[] | undefined,
): readonly GpuTexturedNodeQuad[] {
  const suppressedIds = normalizeNodeIdSet(suppressNodeIds);
  if (suppressedIds.size === 0) {
    return quads;
  }
  return quads.filter((quad) => !suppressedIds.has(quad.nodeId));
}

export function registerVisibleGpuNodeTextures({
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

export function uploadGpuNodeTextures({
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
  ignoreDirectNodeIds,
  textureManager,
}: MarkGpuNodeLayerPaintDirtyInput): string[] {
  const { dirtySurfaceIds } = resolveHtmlSurfacePaintInvalidation({
    changedElements,
    sourceElementBySurfaceId: elementByNodeId,
    sourceIdAttribute: HTML_SURFACE_SOURCE_ID_ATTRIBUTE,
    sourceSelector: GPU_FLOW_NODE_SOURCE_SELECTOR,
    surfaceSelector: GPU_FLOW_SURFACE_SELECTOR,
    transformOnlySourceIds: ignoreDirectNodeIds,
  });

  for (const nodeId of dirtySurfaceIds) {
    textureManager.markNodeTextureDirty({
      content: true,
      frame,
      nodeId,
      reason: "paint",
      requestPaint: false,
    });
  }

  return [...dirtySurfaceIds];
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

export function createGpuNodeDomTransformSyncCache(): GpuNodeDomTransformSyncCache {
  return {
    previousVisibleNodeIds: new Set(),
    stateByNodeId: new Map(),
  };
}

export function clearGpuNodeDomTransformSyncCache(
  cache: GpuNodeDomTransformSyncCache,
) {
  cache.previousVisibleNodeIds.clear();
  cache.stateByNodeId.clear();
}

export function clearGpuNodeDomTransformSyncCacheNode(
  cache: GpuNodeDomTransformSyncCache,
  nodeId: string,
) {
  cache.previousVisibleNodeIds.delete(nodeId);
  cache.stateByNodeId.delete(nodeId);
}

export function syncGpuNodeDomTransformsFromQuads({
  activeNodeIds,
  cache,
  elementByNodeId,
  offscreenX = DEFAULT_OFFSCREEN_POSITION,
  offscreenY = DEFAULT_OFFSCREEN_POSITION,
  retainNodeIds,
  visibleQuads,
  viewport,
}: SyncGpuNodeDomTransformsFromQuadsInput): GpuNodeDomTransformSyncResult {
  const normalizedViewport = normalizeGpuViewport(viewport);
  const activeIds = normalizeNodeIdSet(activeNodeIds);
  const retainedIds = normalizeNodeIdSet(
    mergeNodeIdSets(activeIds, retainNodeIds),
  );
  const visibleResult = syncVisibleGpuNodeDomTransforms({
    activeIds,
    cache,
    elementByNodeId,
    normalizedViewport,
    visibleQuads,
  });
  const parkResult = parkExitedGpuNodeDomTransforms({
    cache,
    elementByNodeId,
    offscreenX,
    offscreenY,
    retainedIds,
    visibleNodeIds: visibleResult.visibleNodeIds,
  });

  cache.previousVisibleNodeIds.clear();
  for (const nodeId of visibleResult.visibleNodeIds) {
    cache.previousVisibleNodeIds.add(nodeId);
  }

  return {
    parkedNodeIds: parkResult.parkedNodeIds,
    skippedNodeIds: [
      ...visibleResult.skippedNodeIds,
      ...parkResult.skippedNodeIds,
    ],
    updatedNodeIds: visibleResult.updatedNodeIds,
    visibleNodeIds: [...visibleResult.visibleNodeIds],
  };
}

export function syncVisibleGpuNodeDomTransforms({
  activeIds,
  cache,
  elementByNodeId,
  normalizedViewport,
  visibleQuads,
}: {
  readonly activeIds: ReadonlySet<string>;
  readonly cache: GpuNodeDomTransformSyncCache;
  readonly elementByNodeId:
    | ReadonlyMap<string, HTMLElement>
    | ((nodeId: string) => HTMLElement | null | undefined);
  readonly normalizedViewport: ReturnType<typeof normalizeGpuViewport>;
  readonly visibleQuads: readonly GpuVisibleNodeQuad[];
}) {
  const visibleNodeIds = new Set<string>();
  const skippedNodeIds: string[] = [];
  const updatedNodeIds: string[] = [];

  for (const quad of visibleQuads) {
    visibleNodeIds.add(quad.nodeId);
    const element = resolveElement(elementByNodeId, quad.nodeId);
    if (!element) {
      cache.stateByNodeId.delete(quad.nodeId);
      continue;
    }
    const state = createVisibleNodeDomTransformStateForQuad({
      activeIds,
      element,
      normalizedViewport,
      quad,
    });
    if (isCachedNodeDomTransformState(cache, quad.nodeId, state)) {
      skippedNodeIds.push(quad.nodeId);
      continue;
    }
    applyNodeDomTransformState(element, state);
    cache.stateByNodeId.set(quad.nodeId, state);
    updatedNodeIds.push(quad.nodeId);
  }

  return { skippedNodeIds, updatedNodeIds, visibleNodeIds };
}

export function parkExitedGpuNodeDomTransforms({
  cache,
  elementByNodeId,
  offscreenX,
  offscreenY,
  retainedIds,
  visibleNodeIds,
}: {
  readonly cache: GpuNodeDomTransformSyncCache;
  readonly elementByNodeId:
    | ReadonlyMap<string, HTMLElement>
    | ((nodeId: string) => HTMLElement | null | undefined);
  readonly offscreenX: number;
  readonly offscreenY: number;
  readonly retainedIds: ReadonlySet<string>;
  readonly visibleNodeIds: Set<string>;
}) {
  const parkedNodeIds: string[] = [];
  const skippedNodeIds: string[] = [];

  for (const nodeId of cache.previousVisibleNodeIds) {
    if (visibleNodeIds.has(nodeId)) {
      continue;
    }
    if (retainedIds.has(nodeId)) {
      visibleNodeIds.add(nodeId);
      continue;
    }
    const element = resolveElement(elementByNodeId, nodeId);
    if (!element) {
      cache.stateByNodeId.delete(nodeId);
      continue;
    }
    const state = createCulledNodeDomTransformState({
      element,
      offscreenX,
      offscreenY,
    });
    if (isCachedNodeDomTransformState(cache, nodeId, state)) {
      skippedNodeIds.push(nodeId);
      continue;
    }
    applyNodeDomTransformState(element, state);
    cache.stateByNodeId.set(nodeId, state);
    parkedNodeIds.push(nodeId);
  }

  return { parkedNodeIds, skippedNodeIds };
}

export function syncGpuNodeDomTransforms({
  activeNodeIds,
  elementByNodeId,
  nodes,
  offscreenX = DEFAULT_OFFSCREEN_POSITION,
  offscreenY = DEFAULT_OFFSCREEN_POSITION,
  visibleNodeIds,
  viewport,
}: SyncGpuNodeDomTransformsInput): GpuNodeDomTransformSyncResult {
  const normalizedViewport = normalizeGpuViewport(viewport);
  const activeIds = normalizeNodeIdSet(activeNodeIds);
  const parkedNodeIds: string[] = [];
  const updatedNodeIds: string[] = [];
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
        height: node.height ?? 0,
        interactive: activeIds.has(node.nodeId),
        screenX: screenPosition.x,
        screenY: screenPosition.y,
        width: node.width ?? 0,
        zIndex: resolveGpuNodeZIndex(node),
        zoom: normalizedViewport.zoom,
      });
      updatedNodeIds.push(node.nodeId);
      continue;
    }

    applyCulledNodeDomTransform(element, offscreenX, offscreenY);
    parkedNodeIds.push(node.nodeId);
  }
  return {
    parkedNodeIds,
    skippedNodeIds: EMPTY_DOM_TRANSFORM_SYNC_RESULT.skippedNodeIds,
    updatedNodeIds,
    visibleNodeIds: [...visibleNodeIds],
  };
}
