import type { ReactNode } from "react";

import type { GpuEdgeBufferInput } from "../edges/edgeGpuBuffers";

import type { GpuEdgePaletteInput, GpuGridInput } from "../gpuPipelines";

import type { GpuCanvasSize } from "../gpuRenderer";

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
  createHtmlSurfaceActorCoverageSnapshot,
  type HtmlSurfaceActorLayout,
  type HtmlSurfaceCompositorTextureSnapshot,
} from "../surfaceCompositor/htmlSurfaceActorAdapter";
import type { SurfaceActorKind } from "../surfaceCompositor/surfaceActor";
import {
  getActiveGpuHtmlSurfaceOverlayIds,
  partitionGpuHtmlSurfaceOverlayQuads,
  toGpuHtmlSurfaceOverlayNodeLayouts,
} from "./frameOverlayLayers";
import { createGpuNodeVisualScene } from "./frameVisualScene";
import {
  type HtmlSurfaceFlatVisual,
  type HtmlSurfaceSolidRoundedRectVisual,
  type HtmlSurfaceVisualScene,
} from "./visualScene";

import {
  buildHtmlSurfaceVisuals,
  type HtmlSurfaceVisualBuildResult,
} from "./surfaceVisuals";

import { resolveGpuNodeCssZIndex } from "../nodeZIndex";

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
  rectsIntersect,
  type GpuRect,
  type GpuViewportInput,
} from "../viewportMath";

import {
  evictHtmlSurfaceFrameTextures,
  renderHtmlSurfaceVisualScene,
  resolveHtmlSurfaceFrameTextureWork,
  syncHtmlSurfaceFrameDomTransforms,
  type GpuNodeSurfaceRenderTarget,
  type GpuNodeTextureController,
} from "./frameRenderWork";
import {
  mergeNodeIdSets,
  normalizeNodeIdSet,
  setGpuNodeBaseStyle,
  setStyleValue,
  toNodeQuad,
  toRect,
} from "./sourceTransforms";

export {
  clearGpuNodeDomTransformSyncCache,
  clearGpuNodeDomTransformSyncCacheNode,
  createGpuNodeDomTransformSyncCache,
  syncGpuNodeDomTransforms,
  syncGpuNodeDomTransformsFromQuads,
} from "./frameDomTransformSync";

export type GpuNodeLayout = {
  readonly actorKind?: SurfaceActorKind | undefined;
  readonly height: number | null;
  readonly nodeId: string;
  readonly textureContentKey?: string | undefined;
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
  readonly actorKind?: SurfaceActorKind | undefined;
  readonly height: number;
  readonly nodeId: string;
  readonly textureContentKey?: string | undefined;
  readonly textureCssHeight?: number | undefined;
  readonly textureCssWidth?: number | undefined;
  readonly textureSourceRect?: GpuRect | undefined;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

export type GpuHtmlSurfaceOverlayLayout = {
  readonly actorKind: Extract<
    SurfaceActorKind,
    | "dom-control"
    | "drag-overlay"
    | "edge-label"
    | "resize-overlay"
    | "selection-overlay"
  >;
  readonly height: number;
  readonly layer?: "late" | "normal" | "page" | undefined;
  readonly ownerNodeId?: string | undefined;
  readonly surfaceId: string;
  readonly textureContentKey?: string | undefined;
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
  readonly priorityNodeIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly progressiveBatchSize?: number | undefined;
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

export type GpuNodeUploadBudget = Pick<
  UploadDirtyHtmlSurfaceTexturesOptions,
  "maxBytes" | "maxDurationMs" | "maxUploads" | "now"
>;

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
  readonly htmlSurfacePageVisuals?:
    | readonly HtmlSurfaceFlatVisual[]
    | undefined;
  readonly marginCssPx?: number | undefined;
  readonly nodes: readonly GpuNodeLayout[];
  readonly nodeTextureMemoryBudgetBytes?: number | undefined;
  readonly protectedTextureSurfaceIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly renderer: GpuNodeSurfaceRenderTarget;
  readonly domTransformCache?: GpuNodeDomTransformSyncCache | undefined;
  readonly textureManager: GpuNodeTextureController;
  readonly textureWorkMode?: "content" | "projection" | undefined;
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
  readonly deferredNodeIds: readonly string[];
  readonly missingElementNodeIds: readonly string[];
  readonly missingTextureNodeIds: readonly string[];
  readonly remainingDirtyNodeIds: readonly string[];
  readonly skippedNodeIds: readonly string[];
  readonly surfaceActorGenerationCount: number;
  readonly surfaceCoverageProtectedResourceCount: number;
  readonly surfaceCoverageTrueHoleCount: number;
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

export function HtmlSurfaceNodeLayer({
  className = DEFAULT_NODE_CLASS_NAME,
  nodes,
  onNodeElementChange,
  priorityNodeIds,
  progressiveBatchSize,
  renderNode,
}: HtmlSurfaceNodeLayerProps) {
  return (
    <HtmlSurfaceSourceLayer
      configureSourceElement={configureGpuNodeSourceElement}
      getSourceId={getGpuNodeSurfaceSourceId}
      onSourceElementChange={onNodeElementChange}
      preservedClassNames={PRESERVED_GPU_NODE_STATE_CLASSES}
      prioritySourceIds={priorityNodeIds}
      progressiveBatchSize={progressiveBatchSize}
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
  htmlSurfacePageVisuals,
  htmlSurfaceOverlays,
  marginCssPx,
  nodes,
  nodeTextureMemoryBudgetBytes,
  protectedTextureSurfaceIds,
  renderer,
  textureManager,
  textureWorkMode = "content",
  uploadBudget,
  viewport,
}: RenderHtmlSurfaceFrameInput): RenderHtmlSurfaceFrameResult {
  const activeNodeIds = normalizeNodeIdSet(
    activeNodeId ? [activeNodeId] : undefined,
  );
  const activeSurfaceIds = getActiveGpuHtmlSurfaceOverlayIds(
    activeNodeIds,
    htmlSurfaceOverlays,
  );
  const retainedNodeIds =
    mergeNodeIdSets(forceVisibleNodeIds, activeNodeIds) ?? new Set<string>();
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
  const overlayQuads = partitionGpuHtmlSurfaceOverlayQuads({
    overlays: htmlSurfaceOverlays,
    quads: visibleOverlayQuads,
  });
  const visibleSurfaceQuads = [...visibleQuads, ...visibleOverlayQuads];
  const visibleNodeIds = new Set(visibleQuads.map((quad) => quad.nodeId));
  const visibleSurfaceIds = new Set(
    visibleSurfaceQuads.map((quad) => quad.nodeId),
  );

  const domTransformResult = syncHtmlSurfaceFrameDomTransforms({
    activeNodeIds,
    domTransformCache,
    elementByNodeId,
    htmlSurfaceOverlays,
    nodes,
    retainedNodeIds,
    viewport,
    visibleSurfaceIds,
    visibleSurfaceQuads,
  });
  const { missingElementNodeIds, uploadResult } =
    resolveHtmlSurfaceFrameTextureWork({
      activeSurfaceIds,
      canvasSize,
      deferResolutionUpdates,
      elementByNodeId,
      frame,
      nodeSurfaceIds,
      textureManager,
      textureWorkMode,
      uploadBudget,
      viewport,
      visibleSurfaceQuads,
    });
  const textureResult = buildTexturedGpuNodeQuads(visibleQuads, textureManager);
  const overlayTextureResult = buildTexturedGpuNodeQuads(
    overlayQuads.normalQuads,
    textureManager,
  );
  const pageOverlayTextureResult = buildTexturedGpuNodeQuads(
    overlayQuads.pageQuads,
    textureManager,
  );
  const lateOverlayTextureResult = buildTexturedGpuNodeQuads(
    overlayQuads.lateQuads,
    textureManager,
  );
  const uploadedTexturedQuads = textureResult.texturedQuads.filter(
    (quad) => quad.texture.lastUploadFrame >= 0,
  );
  const uploadedOverlayTexturedQuads =
    overlayTextureResult.texturedQuads.filter(
      (quad) => quad.texture.lastUploadFrame >= 0,
    );
  const uploadedPageOverlayTexturedQuads =
    pageOverlayTextureResult.texturedQuads.filter(
      (quad) => quad.texture.lastUploadFrame >= 0,
    );
  const uploadedLateOverlayTexturedQuads =
    lateOverlayTextureResult.texturedQuads.filter(
      (quad) => quad.texture.lastUploadFrame >= 0,
    );
  const htmlSurfaceActorCoverage = createHtmlSurfaceActorCoverageSnapshot({
    actorKind: "dom-section",
    layouts: [
      ...toHtmlSurfaceActorLayouts(visibleQuads, {
        rendererBucket: "dom-section",
        sourcePolicy: "layoutsubtree-dom",
      }),
      ...toHtmlSurfaceOverlayActorLayouts(visibleOverlayQuads),
    ],
    textureBySurfaceId: createHtmlSurfaceTextureSnapshotMap({
      quads: visibleSurfaceQuads,
      textureManager,
    }),
  });
  const visualSurfaces = mergeHtmlSurfaceVisuals(
    buildHtmlSurfaceVisuals(uploadedTexturedQuads),
    buildHtmlSurfaceVisuals(uploadedOverlayTexturedQuads),
  );
  const lateOverlayVisualSurfaces = buildHtmlSurfaceVisuals(
    uploadedLateOverlayTexturedQuads,
  );
  const pageOverlayVisualSurfaces = buildHtmlSurfaceVisuals(
    uploadedPageOverlayTexturedQuads,
  );
  const visualScene = createGpuNodeVisualScene({
    htmlSurfaceNativeVisuals,
    htmlSurfacePageVisuals: [
      ...(htmlSurfacePageVisuals ?? []),
      ...pageOverlayVisualSurfaces.flatSurfaces,
    ],
    htmlSurfaceLateVisuals: lateOverlayVisualSurfaces.flatSurfaces,
    visualSurfaces,
  });
  const renderResult = renderHtmlSurfaceVisualScene({
    canvasSize,
    clearColor,
    edgePalette,
    edges,
    grid,
    renderer,
    scene: visualScene,
    viewport,
  });
  const evictionResult = evictHtmlSurfaceFrameTextures({
    nodeTextureMemoryBudgetBytes,
    protectedTextureSurfaceIds,
    retainedNodeIds,
    textureManager,
    textureWorkMode,
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
    deferredNodeIds: uploadResult.deferredSurfaceIds.filter((surfaceId) =>
      nodeSurfaceIds.has(surfaceId),
    ),
    missingElementNodeIds,
    missingTextureNodeIds: [
      ...textureResult.missingTextureNodeIds,
      ...overlayTextureResult.missingTextureNodeIds,
      ...pageOverlayTextureResult.missingTextureNodeIds,
      ...lateOverlayTextureResult.missingTextureNodeIds,
    ],
    remainingDirtyNodeIds: uploadResult.remainingDirtySurfaceIds.filter(
      (surfaceId) => nodeSurfaceIds.has(surfaceId),
    ),
    skippedNodeIds: uploadResult.skippedSurfaceIds.filter((surfaceId) =>
      nodeSurfaceIds.has(surfaceId),
    ),
    surfaceActorGenerationCount: htmlSurfaceActorCoverage.actorSnapshots.length,
    surfaceCoverageProtectedResourceCount:
      htmlSurfaceActorCoverage.coverageProof.protectedResourceHandles.length,
    surfaceCoverageTrueHoleCount:
      htmlSurfaceActorCoverage.coverageProof.trueHoleRects.length,
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

export function prepareHtmlSurfaceOverlayTextures({
  canvasSize,
  deferResolutionUpdates,
  elementByNodeId,
  frame,
  htmlSurfaceOverlays,
  marginCssPx,
  textureManager,
  uploadBudget,
  viewport,
}: Pick<
  RenderHtmlSurfaceFrameInput,
  | "canvasSize"
  | "deferResolutionUpdates"
  | "elementByNodeId"
  | "frame"
  | "htmlSurfaceOverlays"
  | "marginCssPx"
  | "textureManager"
  | "uploadBudget"
  | "viewport"
>) {
  const visibleOverlayQuads = collectVisibleGpuHtmlSurfaceOverlayQuads({
    canvasHeight: canvasSize.cssHeight,
    canvasWidth: canvasSize.cssWidth,
    marginCssPx,
    overlays: htmlSurfaceOverlays,
    viewport,
  });
  const activeSurfaceIds = getActiveGpuHtmlSurfaceOverlayIds(
    new Set(),
    htmlSurfaceOverlays,
  );
  return resolveHtmlSurfaceFrameTextureWork({
    activeSurfaceIds,
    canvasSize,
    deferResolutionUpdates,
    elementByNodeId,
    frame,
    nodeSurfaceIds: new Set(),
    textureManager,
    textureWorkMode: "content",
    uploadBudget,
    viewport,
    visibleSurfaceQuads: visibleOverlayQuads,
  });
}

function toHtmlSurfaceActorLayouts(
  quads: readonly GpuVisibleNodeQuad[],
  {
    rendererBucket,
    sourcePolicy,
  }: Pick<HtmlSurfaceActorLayout, "rendererBucket" | "sourcePolicy">,
): readonly HtmlSurfaceActorLayout[] {
  return quads.map((quad) => ({
    ...(quad.actorKind === undefined ? {} : { actorKind: quad.actorKind }),
    height: quad.height,
    rendererBucket,
    sourcePolicy,
    surfaceId: quad.nodeId,
    ...(quad.textureContentKey === undefined
      ? {}
      : { textureContentKey: quad.textureContentKey }),
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

function toHtmlSurfaceOverlayActorLayouts(
  quads: readonly GpuVisibleNodeQuad[],
): readonly HtmlSurfaceActorLayout[] {
  return quads.map((quad) => ({
    ...(quad.actorKind === undefined ? {} : { actorKind: quad.actorKind }),
    height: quad.height,
    rendererBucket: htmlSurfaceOverlayRendererBucket(quad),
    sourcePolicy: "layoutsubtree-dom",
    surfaceId: quad.nodeId,
    ...(quad.textureContentKey === undefined
      ? {}
      : { textureContentKey: quad.textureContentKey }),
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

function htmlSurfaceOverlayRendererBucket(
  quad: GpuVisibleNodeQuad,
): HtmlSurfaceActorLayout["rendererBucket"] {
  if (!quad.actorKind) {
    throw new Error("HTML surface overlay quad is missing an actor kind.");
  }
  switch (quad.actorKind) {
    case "drag-overlay":
      return "drag-overlay";
    case "dom-control":
      return "native-control";
    case "edge-label":
      return "edge-label";
    case "resize-overlay":
    case "selection-overlay":
      return "selection-overlay";
    default:
      throw new Error(`Unsupported HTML surface overlay actor kind.`);
  }
}

function createHtmlSurfaceTextureSnapshotMap({
  quads,
  textureManager,
}: {
  readonly quads: readonly GpuVisibleNodeQuad[];
  readonly textureManager: GpuNodeTextureController;
}): ReadonlyMap<string, HtmlSurfaceCompositorTextureSnapshot> {
  const textureBySurfaceId = new Map<
    string,
    HtmlSurfaceCompositorTextureSnapshot
  >();
  for (const quad of quads) {
    const texture = textureManager.getCommittedSurfaceTexture(quad.nodeId);
    if (!texture) {
      continue;
    }
    textureBySurfaceId.set(quad.nodeId, texture);
  }
  return textureBySurfaceId;
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
      ...(quad.actorKind === undefined ? {} : { actorKind: quad.actorKind }),
      nodeId: quad.nodeId,
      ...(quad.textureCssHeight === undefined
        ? {}
        : { textureCssHeight: quad.textureCssHeight }),
      ...(quad.textureCssWidth === undefined
        ? {}
        : { textureCssWidth: quad.textureCssWidth }),
      ...(quad.textureContentKey === undefined
        ? {}
        : { textureContentKey: quad.textureContentKey }),
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
