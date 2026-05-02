import {
  memo,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { NodeTexturePriority } from "./dirtyTracking";
import type { GpuEdgeBufferInput } from "./edges/edgeGpuBuffers";
import type {
  GpuEdgePaletteInput,
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

type SyncGpuNodeDomTransformsFromQuadsInput = {
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

type GpuNodeDomTransformState = {
  readonly element: HTMLElement;
  readonly interactive: "false" | "true";
  readonly pointerEvents: "all" | "none";
  readonly transform: string;
  readonly visible: "false" | "true";
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
const GPU_FLOW_NODE_SELECTOR = '[data-gpu-flow-node="true"]';
const GPU_FLOW_SURFACE_SELECTOR = '[data-gpu-flow-surface="true"]';
const GPU_FLOW_NODE_INTERACTIVE_CLASS = "setta-gpu-flow__node--interactive";
const PRESERVED_GPU_NODE_STATE_CLASSES = [
  GPU_FLOW_NODE_INTERACTIVE_CLASS,
  "setta-gpu-flow__node--teleported",
] as const;

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
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    const host =
      hostRef.current ?? createGpuNodeHostElement(anchor.ownerDocument);
    hostRef.current = host;
    insertGpuNodeHostAfterAnchor(anchor, host);
    setHostElement(host);
    onNodeElementChange?.(node.nodeId, host);
    return () => {
      onNodeElementChange?.(node.nodeId, null);
      host.remove();
      if (hostRef.current === host) {
        hostRef.current = null;
      }
    };
  }, [node.nodeId, onNodeElementChange]);

  useLayoutEffect(() => {
    if (!hostElement) {
      return;
    }
    configureGpuNodeHostElement({
      className,
      host: hostElement,
      node,
      visibility,
    });
  }, [className, hostElement, node, visibility]);

  return (
    <>
      <span
        aria-hidden="true"
        data-gpu-flow-node-anchor="true"
        data-id={node.nodeId}
        ref={anchorRef}
        style={{ display: "none" }}
      />
      {hostElement ? createPortal(renderNode(node), hostElement) : null}
    </>
  );
});

function createGpuNodeHostElement(ownerDocument: Document): HTMLDivElement {
  return ownerDocument.createElement("div");
}

function insertGpuNodeHostAfterAnchor(anchor: HTMLElement, host: HTMLElement) {
  const parent = anchor.parentNode;
  if (!parent || host.parentNode === parent) {
    return;
  }
  parent.insertBefore(host, anchor.nextSibling);
}

function configureGpuNodeHostElement({
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
  host.style.visibility = visibility ?? "";
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

  if (domTransformCache) {
    syncGpuNodeDomTransformsFromQuads({
      activeNodeIds,
      cache: domTransformCache,
      elementByNodeId,
      retainNodeIds: retainedNodeIds,
      visibleQuads,
      viewport,
    });
  } else {
    syncGpuNodeDomTransforms({
      activeNodeIds,
      elementByNodeId,
      nodes,
      visibleNodeIds,
      viewport,
    });
  }

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

function syncVisibleGpuNodeDomTransforms({
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

function parkExitedGpuNodeDomTransforms({
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
  applyNodeDomTransformState(
    element,
    createVisibleNodeDomTransformState({
      element,
      interactive,
      screenX,
      screenY,
      zoom,
    }),
  );
}

function createVisibleNodeDomTransformState({
  element,
  interactive,
  screenX,
  screenY,
  zoom,
}: {
  readonly element: HTMLElement;
  readonly interactive?: boolean | undefined;
  readonly screenX: number;
  readonly screenY: number;
  readonly zoom: number;
}): GpuNodeDomTransformState {
  return {
    element,
    interactive: interactive ? "true" : "false",
    pointerEvents: "all",
    transform: `translate(${screenX}px, ${screenY}px) scale(${zoom})`,
    visible: "true",
  };
}

function createVisibleNodeDomTransformStateForQuad({
  activeIds,
  element,
  normalizedViewport,
  quad,
}: {
  readonly activeIds: ReadonlySet<string>;
  readonly element: HTMLElement;
  readonly normalizedViewport: ReturnType<typeof normalizeGpuViewport>;
  readonly quad: GpuVisibleNodeQuad;
}): GpuNodeDomTransformState {
  const screenPosition = flowToScreenPosition(
    { x: quad.x, y: quad.y },
    normalizedViewport,
  );
  return createVisibleNodeDomTransformState({
    element,
    interactive: activeIds.has(quad.nodeId),
    screenX: screenPosition.x,
    screenY: screenPosition.y,
    zoom: normalizedViewport.zoom,
  });
}

function applyNodeDomTransformState(
  element: HTMLElement,
  state: GpuNodeDomTransformState,
) {
  setGpuNodeBaseStyle(element);
  setStyleValue(element, "transform", state.transform);
  setStyleValue(element, "pointerEvents", state.pointerEvents);
  setDatasetValue(element, "gpuFlowVisible", state.visible);
  setDatasetValue(element, "gpuFlowInteractive", state.interactive);
  setClassPresence(
    element,
    GPU_FLOW_NODE_INTERACTIVE_CLASS,
    state.interactive === "true",
  );
}

function applyCulledNodeDomTransform(
  element: HTMLElement,
  offscreenX = DEFAULT_OFFSCREEN_POSITION,
  offscreenY = DEFAULT_OFFSCREEN_POSITION,
) {
  applyNodeDomTransformState(
    element,
    createCulledNodeDomTransformState({
      element,
      offscreenX,
      offscreenY,
    }),
  );
}

function createCulledNodeDomTransformState({
  element,
  offscreenX = DEFAULT_OFFSCREEN_POSITION,
  offscreenY = DEFAULT_OFFSCREEN_POSITION,
}: {
  readonly element: HTMLElement;
  readonly offscreenX?: number | undefined;
  readonly offscreenY?: number | undefined;
}): GpuNodeDomTransformState {
  return {
    element,
    interactive: "false",
    pointerEvents: "none",
    transform: `translate(${offscreenX}px, ${offscreenY}px) scale(1)`,
    visible: "false",
  };
}

function isCachedNodeDomTransformState(
  cache: GpuNodeDomTransformSyncCache,
  nodeId: string,
  next: GpuNodeDomTransformState,
): boolean {
  const previous = cache.stateByNodeId.get(nodeId);
  return Boolean(
    previous &&
      previous.element === next.element &&
      previous.interactive === next.interactive &&
      previous.pointerEvents === next.pointerEvents &&
      previous.transform === next.transform &&
      previous.visible === next.visible,
  );
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
  return (
    findClosestChangedElementNodeId(changedElement, elementByNodeId) ??
    findSingleContainedChangedElementNodeId(changedElement, elementByNodeId)
  );
}

function findClosestChangedElementNodeId(
  changedElement: Element,
  elementByNodeId: ReadonlyMap<string, HTMLElement>,
): string | null {
  const nearestNodeElement = changedElement.closest<HTMLElement>(
    GPU_FLOW_NODE_SELECTOR,
  );
  const nearestNodeId = nearestNodeElement?.getAttribute("data-id");
  if (
    nearestNodeId &&
    elementByNodeId.get(nearestNodeId) === nearestNodeElement
  ) {
    return nearestNodeId;
  }
  return null;
}

function findSingleContainedChangedElementNodeId(
  changedElement: Element,
  elementByNodeId: ReadonlyMap<string, HTMLElement>,
): string | null {
  if (changedElement.matches(GPU_FLOW_SURFACE_SELECTOR)) {
    return null;
  }

  // html-in-canvas can report an enclosing changed subtree instead of the
  // exact node. Accept that fallback only when the subtree contains exactly one
  // registered GPU node, so a canvas/surface paint cannot dirty every node.
  let containedNodeId: string | null = null;
  for (const nodeElement of changedElement.querySelectorAll<HTMLElement>(
    GPU_FLOW_NODE_SELECTOR,
  )) {
    const nodeId = nodeElement.getAttribute("data-id");
    if (!nodeId || elementByNodeId.get(nodeId) !== nodeElement) {
      continue;
    }
    if (containedNodeId && containedNodeId !== nodeId) {
      return null;
    }
    containedNodeId = nodeId;
  }
  return containedNodeId;
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
