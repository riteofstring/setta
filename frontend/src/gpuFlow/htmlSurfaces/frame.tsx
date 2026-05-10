import type { ReactNode } from "react";

import type { GpuEdgeBufferInput } from "../edges/edgeGpuBuffers";

import type { GpuEdgePaletteInput, GpuGridInput } from "../gpuPipelines";

import type { GpuCanvasSize } from "../gpuRenderer";

import type {
  RenderHtmlSurfacesInput,
  RenderHtmlSurfacesResult,
} from "./renderer";

import type {
  CommittedHtmlSurfaceTextureSnapshot,
  HtmlSurfaceTextureLifecycleDiagnostic,
  HtmlSurfaceTextureManager,
  HtmlSurfaceTextureMemorySnapshot,
  HtmlSurfaceTextureUploadDiagnostic,
  HtmlSurfaceTextureUploadWorkSummary,
  UploadDirtyHtmlSurfaceTexturesOptions,
} from "./textures";

import {
  createHtmlSurfaceVisualScene,
  type HtmlSurfaceSolidRoundedRectVisual,
  type HtmlSurfaceVisualScene,
} from "./visualScene";

import {
  buildHtmlSurfaceVisuals,
  type HtmlSurfaceVisualBuildResult,
} from "./surfaceVisuals";

export { buildHtmlSurfaceVisuals } from "./surfaceVisuals";

import { resolveGpuNodeCssZIndex, resolveGpuNodeZIndex } from "../nodeZIndex";

import { GPU_FLOW_CLASS_NAMES } from "../gpuFlowDomClasses";

import { resolveHtmlSurfacePaintInvalidation } from "./paintInvalidation";

import {
  HTML_SURFACE_SOURCE_CLASS_NAME,
  HTML_SURFACE_SOURCE_ID_ATTRIBUTE,
  HTML_SURFACE_SOURCE_SELECTOR,
  HtmlSurfaceSourceLayer,
  type HtmlSurfaceSourceElementConfig,
} from "./sourceLayer";

import {
  getVisibleFlowRect,
  normalizeGpuViewport,
  rectsIntersect,
  type GpuRect,
  type GpuViewportInput,
} from "../viewportMath";

import {
  applyCulledNodeDomTransform,
  applyNodeDomTransformState,
  applyVisibleNodeDomTransform,
  createVisibleNodeDomTransformStateForQuad,
  isCachedNodeDomTransformState,
  mergeNodeIdSets,
  normalizeNodeIdSet,
  resolveElement,
  resolveVisibleNodeTexturePriority,
  setGpuNodeBaseStyle,
  setStyleValue,
  toNodeQuad,
  toRect,
} from "./sourceTransforms";

export type GpuNodeLayout = {
  readonly height: number | null;
  readonly nodeId: string;
  readonly textureCssHeight?: number | undefined;
  readonly textureCssWidth?: number | undefined;
  readonly textureSourceRect?: GpuRect | undefined;
  readonly tempZIndex?: number | undefined;
  readonly width: number | null;
  readonly x: number;
  readonly y: number;
  readonly zIndex?: number | undefined;
};

export type GpuVisibleNodeQuad = {
  readonly height: number;
  readonly nodeId: string;
  readonly textureCssHeight?: number | undefined;
  readonly textureCssWidth?: number | undefined;
  readonly textureSourceRect?: GpuRect | undefined;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

export type GpuHtmlSurfaceOverlayLayout = {
  readonly height: number;
  readonly ownerNodeId?: string | undefined;
  readonly surfaceId: string;
  readonly textureCssHeight?: number | undefined;
  readonly textureCssWidth?: number | undefined;
  readonly textureSourceRect?: GpuRect | undefined;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex?: number | undefined;
};

type GpuTexturedNodeQuad = GpuVisibleNodeQuad & {
  readonly texture: CommittedHtmlSurfaceTextureSnapshot;
};

type HtmlSurfaceNodeLayerProps = {
  readonly className?: string | undefined;
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
  readonly visibleNodeIds: ReadonlySet<string>;
  readonly viewport: GpuViewportInput;
};

type SyncGpuNodeDomTransformsFromQuadsInput = {
  readonly activeNodeIds?: ReadonlySet<string> | readonly string[] | undefined;
  readonly cache: GpuNodeDomTransformSyncCache;
  readonly elementByNodeId:
    | ReadonlyMap<string, HTMLElement>
    | ((nodeId: string) => HTMLElement | null | undefined);
  readonly retainNodeIds?: ReadonlySet<string> | readonly string[] | undefined;
  readonly visibleQuads: readonly GpuVisibleNodeQuad[];
  readonly viewport: GpuViewportInput;
};

export type GpuNodeDomTransformState = {
  readonly element: HTMLElement;
  readonly height: string;
  readonly interactive: "false" | "true";
  readonly pointerEvents: "auto" | "none";
  readonly transform: string;
  readonly visible: "false" | "true";
  readonly width: string;
  readonly zIndex: string;
};

export type GpuNodeDomTransformSyncCache = {
  readonly previousVisibleNodeIds: Set<string>;
  readonly stateByNodeId: Map<string, GpuNodeDomTransformState>;
};

type GpuNodeDomTransformSyncResult = {
  readonly parkedNodeIds: readonly string[];
  readonly skippedNodeIds: readonly string[];
  readonly updatedNodeIds: readonly string[];
  readonly visibleNodeIds: readonly string[];
};

export type GpuNodeUploadBudget = Pick<
  UploadDirtyHtmlSurfaceTexturesOptions,
  "maxBytes" | "maxDurationMs" | "maxUploads" | "now"
>;

type GpuNodeTextureController = Pick<
  HtmlSurfaceTextureManager,
  | "getCommittedSurfaceTexture"
  | "getSurfaceTextureLifecycleDiagnostics"
  | "evictSurfaceTextures"
  | "markSurfaceTextureDirty"
  | "registerSurfaceTexture"
  | "uploadDirtySurfaceTextures"
>;

type GpuNodeSurfaceRenderTarget = {
  render(input: RenderHtmlSurfacesInput): RenderHtmlSurfacesResult;
};

type RenderHtmlSurfaceFrameInput = {
  readonly activeNodeId?: string | null | undefined;
  readonly canvasSize: GpuCanvasSize;
  readonly clearColor?: GPUColorDict | undefined;
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
  readonly htmlSurfaceOverlays?:
    | readonly GpuHtmlSurfaceOverlayLayout[]
    | undefined;
  readonly htmlSurfaceNativeVisuals?:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly marginCssPx?: number | undefined;
  readonly nodes: readonly GpuNodeLayout[];
  readonly nodeTextureMemoryBudgetBytes?: number | undefined;
  readonly renderer: GpuNodeSurfaceRenderTarget;
  readonly domTransformCache?: GpuNodeDomTransformSyncCache | undefined;
  readonly textureManager: GpuNodeTextureController;
  readonly uploadBudget?: GpuNodeUploadBudget | undefined;
  readonly viewport: GpuViewportInput;
};

export type RenderHtmlSurfaceFrameResult = {
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
  readonly textureMemory: HtmlSurfaceTextureMemorySnapshot;
  readonly textureMemoryBeforeEviction: HtmlSurfaceTextureMemorySnapshot;
  readonly textureLifecycleDiagnostics: readonly HtmlSurfaceTextureLifecycleDiagnostic[];
  readonly uploadDiagnostics: readonly HtmlSurfaceTextureUploadDiagnostic[];
  readonly uploadWorkSummary: HtmlSurfaceTextureUploadWorkSummary;
  readonly uploadedNodeIds: readonly string[];
  readonly visibleNodeIds: readonly string[];
  readonly visualScene: HtmlSurfaceVisualScene;
};

type MarkHtmlSurfaceFramePaintDirtyInput = {
  readonly changedElements?: readonly Element[] | undefined;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly frame: number;
  readonly ignoreDirectNodeIds?: ReadonlySet<string> | readonly string[];
  readonly textureManager: Pick<
    HtmlSurfaceTextureManager,
    "markSurfaceTextureDirty" | "markSurfacesPainted"
  >;
};

const DEFAULT_NODE_CLASS_NAME = GPU_FLOW_CLASS_NAMES.node;

const GPU_FLOW_SURFACE_SELECTOR = '[data-gpu-flow-surface="true"]';

const GPU_FLOW_NODE_SOURCE_SELECTOR = HTML_SURFACE_SOURCE_SELECTOR;

export const GPU_FLOW_NODE_INTERACTIVE_CLASS =
  "setta-gpu-flow__node--interactive";

const PRESERVED_GPU_NODE_STATE_CLASSES = [
  GPU_FLOW_NODE_INTERACTIVE_CLASS,
] as const;

const EMPTY_DOM_TRANSFORM_SYNC_RESULT: GpuNodeDomTransformSyncResult = {
  parkedNodeIds: [],
  skippedNodeIds: [],
  updatedNodeIds: [],
  visibleNodeIds: [],
};

export function HtmlSurfaceNodeLayer({
  className = DEFAULT_NODE_CLASS_NAME,
  nodes,
  onNodeElementChange,
  renderNode,
}: HtmlSurfaceNodeLayerProps) {
  return (
    <HtmlSurfaceSourceLayer
      configureSourceElement={configureGpuNodeSourceElement}
      getSourceId={getGpuNodeSurfaceSourceId}
      onSourceElementChange={onNodeElementChange}
      preservedClassNames={PRESERVED_GPU_NODE_STATE_CLASSES}
      renderSource={renderNode}
      sourceClassName={`${HTML_SURFACE_SOURCE_CLASS_NAME} ${className}`}
      sources={nodes}
    />
  );
}

function getGpuNodeSurfaceSourceId(node: GpuNodeLayout): string {
  return node.nodeId;
}

function configureGpuNodeSourceElement({
  className,
  host,
  source,
}: HtmlSurfaceSourceElementConfig<GpuNodeLayout>) {
  configureGpuNodeHostElement({
    className,
    host,
    node: source,
  });
}

export function configureGpuNodeHostElement({
  className,
  host,
  node,
}: {
  readonly className: string;
  readonly host: HTMLElement;
  readonly node: GpuNodeLayout;
}) {
  host.className = mergeGpuNodeHostClassName(className, host.classList);
  host.dataset.gpuFlowNode = "true";
  host.dataset.id = node.nodeId;
  host.setAttribute("data-testid", `rf__node-${node.nodeId}`);
  setGpuNodeBaseStyle(host);
  setStyleValue(host, "height", node.height === null ? "" : `${node.height}px`);
  setStyleValue(host, "width", node.width === null ? "" : `${node.width}px`);
  if (host.style.visibility) {
    host.style.removeProperty("visibility");
  }
  const zIndex = resolveGpuNodeCssZIndex(node);
  host.style.zIndex = zIndex === undefined ? "" : String(zIndex);
}

function mergeGpuNodeHostClassName(
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

export function renderHtmlSurfaceFrame({
  activeNodeId,
  canvasSize,
  clearColor,
  deferResolutionUpdates,
  domTransformCache,
  edgePalette,
  edges,
  elementByNodeId,
  forceVisibleNodeIds,
  frame,
  grid,
  htmlSurfaceNativeVisuals,
  htmlSurfaceOverlays,
  marginCssPx,
  nodes,
  nodeTextureMemoryBudgetBytes,
  renderer,
  textureManager,
  uploadBudget,
  viewport,
}: RenderHtmlSurfaceFrameInput): RenderHtmlSurfaceFrameResult {
  const activeNodeIds = normalizeNodeIdSet(
    activeNodeId ? [activeNodeId] : undefined,
  );
  const activeSurfaceIds = getActiveHtmlSurfaceIds(
    activeNodeIds,
    htmlSurfaceOverlays,
  );
  const retainedNodeIds = mergeNodeIdSets(forceVisibleNodeIds, activeNodeIds);
  const nodeSurfaceIds = new Set(nodes.map((node) => node.nodeId));
  const visibleQuads = collectVisibleGpuNodeQuads({
    canvasHeight: canvasSize.cssHeight,
    canvasWidth: canvasSize.cssWidth,
    forceVisibleNodeIds: retainedNodeIds,
    marginCssPx,
    nodes,
    viewport,
  });
  const visibleOverlayQuads = collectVisibleGpuHtmlSurfaceOverlayQuads({
    canvasHeight: canvasSize.cssHeight,
    canvasWidth: canvasSize.cssWidth,
    marginCssPx,
    overlays: htmlSurfaceOverlays,
    viewport,
  });
  const visibleSurfaceQuads = [...visibleQuads, ...visibleOverlayQuads];
  const visibleNodeIds = new Set(visibleQuads.map((quad) => quad.nodeId));
  const visibleSurfaceIds = new Set(
    visibleSurfaceQuads.map((quad) => quad.nodeId),
  );

  const domTransformResult = domTransformCache
    ? syncGpuNodeDomTransformsFromQuads({
        activeNodeIds,
        cache: domTransformCache,
        elementByNodeId,
        retainNodeIds: retainedNodeIds,
        visibleQuads: visibleSurfaceQuads,
        viewport,
      })
    : syncGpuNodeDomTransforms({
        activeNodeIds,
        elementByNodeId,
        nodes: [
          ...nodes,
          ...toGpuHtmlSurfaceOverlayNodeLayouts(htmlSurfaceOverlays),
        ],
        visibleNodeIds: visibleSurfaceIds,
        viewport,
      });

  const missingElementNodeIds = registerVisibleGpuNodeTextures({
    activeSurfaceIds,
    deferResolutionUpdates,
    devicePixelRatio: canvasSize.devicePixelRatio,
    elementByNodeId,
    frame,
    quads: visibleSurfaceQuads,
    textureManager,
    viewport,
  }).filter((nodeId) => nodeSurfaceIds.has(nodeId));
  const uploadResult = uploadGpuNodeTextures({
    deferResolutionUpdates,
    frame,
    textureManager,
    uploadBudget,
  });
  const textureResult = buildTexturedGpuNodeQuads(visibleQuads, textureManager);
  const overlayTextureResult = buildTexturedGpuNodeQuads(
    visibleOverlayQuads,
    textureManager,
  );
  const uploadedTexturedQuads = textureResult.texturedQuads.filter(
    (quad) => quad.texture.lastUploadFrame >= 0,
  );
  const uploadedOverlayTexturedQuads =
    overlayTextureResult.texturedQuads.filter(
      (quad) => quad.texture.lastUploadFrame >= 0,
    );
  const visualSurfaces = mergeHtmlSurfaceVisuals(
    buildHtmlSurfaceVisuals(uploadedTexturedQuads),
    buildHtmlSurfaceVisuals(uploadedOverlayTexturedQuads),
  );
  const visualScene = createHtmlSurfaceVisualScene({
    ...visualSurfaces,
    solidRoundedRectSurfaces: htmlSurfaceNativeVisuals ?? [],
  });
  const renderResult = renderer.render({
    canvasSize,
    clearColor,
    ...(edgePalette === undefined ? {} : { edgePalette }),
    ...(edges === undefined ? {} : { edges }),
    ...(grid === undefined ? {} : { grid }),
    scene: visualScene,
    viewport,
  });
  const evictionResult = textureManager.evictSurfaceTextures({
    ...(nodeTextureMemoryBudgetBytes === undefined
      ? {}
      : { budgetBytes: nodeTextureMemoryBudgetBytes }),
    protectedSurfaceIds: retainedNodeIds,
    reason: "html-surface-frame",
    visibleSurfaceIds,
  });
  const uploadedSurfaceIds = uploadResult.uploaded.map(
    (record) => record.surfaceId,
  );
  const textureLifecycleDiagnostics =
    textureManager.getSurfaceTextureLifecycleDiagnostics(visibleSurfaceIds);

  return {
    activeNodeId: activeNodeId ?? null,
    budgetExhausted: uploadResult.budgetExhausted,
    domTransformParkedNodeIds: domTransformResult.parkedNodeIds,
    domTransformUpdatedNodeIds: domTransformResult.updatedNodeIds,
    drawnEdgeIds: renderResult.drawnEdgeIds,
    drawnNodeIds: renderResult.drawnSurfaceIds.filter((surfaceId) =>
      nodeSurfaceIds.has(surfaceId),
    ),
    edgeVertexCount: renderResult.edgeVertexCount,
    evictedTextureBytes: evictionResult.evictedBytes,
    evictedTextureNodeIds: evictionResult.evictedSurfaceIds,
    missingElementNodeIds,
    missingTextureNodeIds: textureResult.missingTextureNodeIds,
    remainingDirtyNodeIds: uploadResult.remainingDirtySurfaceIds.filter(
      (surfaceId) => nodeSurfaceIds.has(surfaceId),
    ),
    skippedNodeIds: uploadResult.skippedSurfaceIds.filter((surfaceId) =>
      nodeSurfaceIds.has(surfaceId),
    ),
    textureMemory: evictionResult.memory,
    textureMemoryBeforeEviction: evictionResult.memoryBefore,
    textureLifecycleDiagnostics,
    uploadDiagnostics: uploadResult.diagnostics,
    uploadWorkSummary: uploadResult.workSummary,
    uploadedNodeIds: uploadedSurfaceIds.filter((surfaceId) =>
      nodeSurfaceIds.has(surfaceId),
    ),
    visibleNodeIds: [...visibleNodeIds],
    visualScene,
  };
}

function registerVisibleGpuNodeTextures({
  activeSurfaceIds,
  deferResolutionUpdates,
  devicePixelRatio,
  elementByNodeId,
  frame,
  quads,
  textureManager,
  viewport,
}: {
  readonly activeSurfaceIds: ReadonlySet<string>;
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
    textureManager.registerSurfaceTexture({
      cssHeight: quad.textureCssHeight ?? quad.height,
      cssWidth: quad.textureCssWidth ?? quad.width,
      ...(deferResolutionUpdates && !activeSurfaceIds.has(quad.nodeId)
        ? { deferResolution: true }
        : {}),
      devicePixelRatio,
      element,
      frame,
      priority: resolveVisibleNodeTexturePriority(
        quad.nodeId,
        activeSurfaceIds,
      ),
      surfaceId: quad.nodeId,
      ...(quad.textureSourceRect
        ? { textureSourceRect: quad.textureSourceRect }
        : {}),
      zoom,
    });
  }
  return missingElementNodeIds;
}

function getActiveHtmlSurfaceIds(
  activeNodeIds: ReadonlySet<string>,
  overlays: readonly GpuHtmlSurfaceOverlayLayout[] | undefined,
): ReadonlySet<string> {
  if (activeNodeIds.size === 0) {
    return activeNodeIds;
  }
  const activeSurfaceIds = new Set(activeNodeIds);
  for (const overlay of overlays ?? []) {
    if (overlay.ownerNodeId && activeNodeIds.has(overlay.ownerNodeId)) {
      activeSurfaceIds.add(overlay.surfaceId);
    }
  }
  return activeSurfaceIds;
}

function uploadGpuNodeTextures({
  deferResolutionUpdates,
  frame,
  textureManager,
  uploadBudget,
}: {
  readonly deferResolutionUpdates: boolean | undefined;
  readonly frame: number;
  readonly textureManager: GpuNodeTextureController;
  readonly uploadBudget: GpuNodeUploadBudget | undefined;
}) {
  return textureManager.uploadDirtySurfaceTextures({
    frame,
    ...(deferResolutionUpdates ? { deferPassiveUploads: true } : {}),
    ...uploadBudget,
  });
}

export function markHtmlSurfaceFramePaintDirty({
  changedElements,
  elementByNodeId,
  frame,
  ignoreDirectNodeIds,
  textureManager,
}: MarkHtmlSurfaceFramePaintDirtyInput): string[] {
  const { dirtySurfaceIds, dirtySurfaceInvalidations, paintedSurfaceIds } =
    resolveHtmlSurfacePaintInvalidation({
      changedElements,
      sourceElementBySurfaceId: elementByNodeId,
      sourceIdAttribute: HTML_SURFACE_SOURCE_ID_ATTRIBUTE,
      sourceSelector: GPU_FLOW_NODE_SOURCE_SELECTOR,
      surfaceSelector: GPU_FLOW_SURFACE_SELECTOR,
      transformOnlySourceIds: ignoreDirectNodeIds,
    });

  textureManager.markSurfacesPainted(paintedSurfaceIds);

  for (const invalidation of dirtySurfaceInvalidations) {
    textureManager.markSurfaceTextureDirty({
      content: true,
      frame,
      reason: "paint",
      requestPaint: false,
      ...(invalidation.sourceRect
        ? { sourceRect: invalidation.sourceRect }
        : {}),
      surfaceId: invalidation.surfaceId,
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
      ...(quad.textureCssHeight === undefined
        ? {}
        : { textureCssHeight: quad.textureCssHeight }),
      ...(quad.textureCssWidth === undefined
        ? {}
        : { textureCssWidth: quad.textureCssWidth }),
      ...(quad.textureSourceRect === undefined
        ? {}
        : { textureSourceRect: quad.textureSourceRect }),
      width: quad.width,
      x: quad.x,
      y: quad.y,
      zIndex: quad.zIndex,
    }));
}

export function collectVisibleGpuHtmlSurfaceOverlayQuads({
  canvasHeight,
  canvasWidth,
  marginCssPx,
  overlays,
  viewport,
}: {
  readonly canvasHeight: number;
  readonly canvasWidth: number;
  readonly marginCssPx?: number | undefined;
  readonly overlays?: readonly GpuHtmlSurfaceOverlayLayout[] | undefined;
  readonly viewport: GpuViewportInput;
}): GpuVisibleNodeQuad[] {
  if (!overlays?.length) {
    return [];
  }
  return collectVisibleGpuNodeQuads({
    canvasHeight,
    canvasWidth,
    marginCssPx,
    nodes: toGpuHtmlSurfaceOverlayNodeLayouts(overlays),
    viewport,
  });
}

function toGpuHtmlSurfaceOverlayNodeLayouts(
  overlays: readonly GpuHtmlSurfaceOverlayLayout[] | undefined,
): GpuNodeLayout[] {
  return (overlays ?? []).map((overlay) => ({
    height: overlay.height,
    nodeId: overlay.surfaceId,
    ...(overlay.textureCssHeight === undefined
      ? {}
      : { textureCssHeight: overlay.textureCssHeight }),
    ...(overlay.textureCssWidth === undefined
      ? {}
      : { textureCssWidth: overlay.textureCssWidth }),
    ...(overlay.textureSourceRect === undefined
      ? {}
      : { textureSourceRect: overlay.textureSourceRect }),
    width: overlay.width,
    x: overlay.x,
    y: overlay.y,
    zIndex: overlay.zIndex,
  }));
}

export function buildTexturedGpuNodeQuads(
  quads: readonly GpuVisibleNodeQuad[],
  textureSource:
    | Pick<HtmlSurfaceTextureManager, "getCommittedSurfaceTexture">
    | ((nodeId: string) => CommittedHtmlSurfaceTextureSnapshot | undefined),
): BuildTexturedGpuNodeQuadsResult {
  const getTexture =
    typeof textureSource === "function"
      ? textureSource
      : textureSource.getCommittedSurfaceTexture.bind(textureSource);
  const texturedQuads: GpuTexturedNodeQuad[] = [];
  const missingTextureNodeIds: string[] = [];

  for (const quad of quads) {
    const texture = getTexture(quad.nodeId);
    if (!texture) {
      missingTextureNodeIds.push(quad.nodeId);
      continue;
    }
    texturedQuads.push({
      ...quad,
      texture,
      ...(texture.textureSourceRect
        ? { textureSourceRect: texture.textureSourceRect }
        : {}),
    });
  }

  return { missingTextureNodeIds, texturedQuads };
}

function mergeHtmlSurfaceVisuals(
  base: HtmlSurfaceVisualBuildResult,
  overlays: HtmlSurfaceVisualBuildResult,
): HtmlSurfaceVisualBuildResult {
  return {
    flatSurfaces: [...base.flatSurfaces, ...overlays.flatSurfaces],
    tiledFlatSurfaces: [
      ...base.tiledFlatSurfaces,
      ...overlays.tiledFlatSurfaces,
    ],
  };
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
  retainNodeIds,
  visibleQuads,
}: SyncGpuNodeDomTransformsFromQuadsInput): GpuNodeDomTransformSyncResult {
  const activeIds = normalizeNodeIdSet(activeNodeIds);
  const retainedIds = normalizeNodeIdSet(
    mergeNodeIdSets(activeIds, retainNodeIds),
  );
  const visibleResult = syncVisibleGpuNodeDomTransforms({
    activeIds,
    cache,
    elementByNodeId,
    visibleQuads,
  });
  const parkResult = parkExitedGpuNodeDomTransforms({
    cache,
    elementByNodeId,
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

function syncVisibleGpuNodeDomTransforms({
  activeIds,
  cache,
  elementByNodeId,
  visibleQuads,
}: {
  readonly activeIds: ReadonlySet<string>;
  readonly cache: GpuNodeDomTransformSyncCache;
  readonly elementByNodeId:
    | ReadonlyMap<string, HTMLElement>
    | ((nodeId: string) => HTMLElement | null | undefined);
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

function parkExitedGpuNodeDomTransforms({
  cache,
  elementByNodeId,
  retainedIds,
  visibleNodeIds,
}: {
  readonly cache: GpuNodeDomTransformSyncCache;
  readonly elementByNodeId:
    | ReadonlyMap<string, HTMLElement>
    | ((nodeId: string) => HTMLElement | null | undefined);
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
      const previous = cache.stateByNodeId.get(nodeId);
      const element = resolveElement(elementByNodeId, nodeId);
      if (!previous || !element) {
        continue;
      }
      const retainedState: GpuNodeDomTransformState = {
        ...previous,
        element,
        interactive: "true",
        pointerEvents: "auto",
        transform: element.style.transform || previous.transform,
        visible: "true",
      };
      if (isCachedNodeDomTransformState(cache, nodeId, retainedState)) {
        skippedNodeIds.push(nodeId);
        continue;
      }
      applyNodeDomTransformState(element, retainedState);
      cache.stateByNodeId.set(nodeId, retainedState);
      continue;
    }
  }

  return { parkedNodeIds, skippedNodeIds };
}

export function syncGpuNodeDomTransforms({
  activeNodeIds,
  elementByNodeId,
  nodes,
  visibleNodeIds,
}: SyncGpuNodeDomTransformsInput): GpuNodeDomTransformSyncResult {
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
      applyVisibleNodeDomTransform(element, {
        height: node.height ?? 0,
        interactive: activeIds.has(node.nodeId),
        width: node.width ?? 0,
        zIndex: resolveGpuNodeZIndex(node),
      });
      updatedNodeIds.push(node.nodeId);
      continue;
    }

    applyCulledNodeDomTransform(element);
    parkedNodeIds.push(node.nodeId);
  }
  return {
    parkedNodeIds,
    skippedNodeIds: EMPTY_DOM_TRANSFORM_SYNC_RESULT.skippedNodeIds,
    updatedNodeIds,
    visibleNodeIds: [...visibleNodeIds],
  };
}
