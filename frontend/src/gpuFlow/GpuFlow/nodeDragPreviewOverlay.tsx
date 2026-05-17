import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from "react";

import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  clearGpuNodeDomTransformSyncCacheNode,
  type GpuHtmlSurfaceOverlayLayout,
  type GpuNodeDomTransformSyncCache,
} from "../htmlSurfaces/frame";
import {
  HTML_SURFACE_SOURCE_CLASS_NAME,
  HtmlSurfaceSourceLayer,
  type HtmlSurfaceSourceElementConfig,
} from "../htmlSurfaces/sourceLayer";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import type {
  GpuFlowLayoutDropMarker,
  GpuFlowLayoutNode,
  GpuFlowLayoutStore,
  GpuFlowLayoutStoreApi,
} from "../layoutStore";
import type { GpuRect } from "../viewportMath";

type GpuNodeDragPreviewSnapshot = {
  readonly dropMarker: GpuFlowLayoutDropMarker | null;
  readonly draggingNodes: readonly GpuNodeDragPreviewNode[];
};

type GpuNodeDragPreviewNode = {
  readonly nodeId: string;
  readonly rect: GpuRect;
};

type GpuNodeDragPreviewSourceBase = {
  readonly height: number;
  readonly localRect: GpuRect;
  readonly surfaceId: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

type GpuNodeDragPreviewNodeSource = GpuNodeDragPreviewSourceBase & {
  readonly kind: "node-bounds";
  readonly nodeId: string;
};

type GpuNodeDragPreviewDropMarkerSource = GpuNodeDragPreviewSourceBase & {
  readonly axis: GpuFlowLayoutDropMarker["axis"];
  readonly childNodeId: string;
  readonly index: number;
  readonly kind: "drop-marker";
  readonly parentNodeId: string;
};

export type GpuNodeDragPreviewSource =
  | GpuNodeDragPreviewDropMarkerSource
  | GpuNodeDragPreviewNodeSource;

const EMPTY_DRAG_PREVIEW_SOURCES: readonly GpuNodeDragPreviewSource[] = [];

const GPU_NODE_DRAG_PREVIEW_SOURCE_CLASS_NAME =
  "setta-gpu-flow__drag-preview-source";

const DRAG_PREVIEW_NODE_PADDING = 18;

const DROP_MARKER_PADDING = 14;

const DRAG_PREVIEW_NODE_Z_INDEX = 100_000;

const DROP_MARKER_Z_INDEX = 100_001;

export function useGpuFlowNodeDragPreviewSources({
  layoutStore,
  nodeDomTransformSyncCacheRef,
  nodeElementByIdRef,
  surfaceRef,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
}: {
  readonly layoutStore: GpuFlowLayoutStoreApi | undefined;
  readonly nodeDomTransformSyncCacheRef: MutableRefObject<GpuNodeDomTransformSyncCache>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
}): {
  readonly nodeDragPreviewSourceElement: ReactNode;
  readonly nodeDragPreviewSurfaces: readonly GpuHtmlSurfaceOverlayLayout[];
} {
  const [snapshot, setSnapshot] = useState<GpuNodeDragPreviewSnapshot | null>(
    () => getVisibleGpuNodeDragPreviewSnapshot(layoutStore),
  );

  useEffect(() => {
    const syncSnapshot = () => {
      setSnapshot(getVisibleGpuNodeDragPreviewSnapshot(layoutStore));
    };
    syncSnapshot();
    return layoutStore?.subscribe((state, previousState) => {
      if (
        state.dragPreview === previousState.dragPreview &&
        state.nodeOrder === previousState.nodeOrder &&
        state.nodesById === previousState.nodesById
      ) {
        return;
      }
      syncSnapshot();
    });
  }, [layoutStore]);

  const sources = useMemo(
    () => getGpuNodeDragPreviewSources(snapshot),
    [snapshot],
  );
  const nodeDragPreviewSurfaces = useMemo(
    () => getGpuNodeDragPreviewSurfaceLayouts(sources),
    [sources],
  );

  const handlePreviewElementChange = useCallback(
    (surfaceId: string, element: HTMLElement | null) => {
      clearGpuNodeDomTransformSyncCacheNode(
        nodeDomTransformSyncCacheRef.current,
        surfaceId,
      );
      if (!element) {
        nodeElementByIdRef.current.delete(surfaceId);
        transformOnlyPaintNodeIdsRef.current.delete(surfaceId);
        textureManagerRef.current?.destroySurfaceTexture(surfaceId);
        return;
      }
      nodeElementByIdRef.current.set(surfaceId, element);
      surfaceRef.current?.requestPaint();
      surfaceRef.current?.requestFrame("manual");
    },
    [
      nodeDomTransformSyncCacheRef,
      nodeElementByIdRef,
      surfaceRef,
      textureManagerRef,
      transformOnlyPaintNodeIdsRef,
    ],
  );
  const handlePreviewDraw = useCallback(
    (surfaceId: string) => {
      textureManagerRef.current?.markSurfaceTextureDirty({
        content: true,
        reason: "content",
        requestPaint: false,
        surfaceId,
      });
      surfaceRef.current?.requestPaint();
      surfaceRef.current?.requestFrame("manual");
    },
    [surfaceRef, textureManagerRef],
  );

  return {
    nodeDragPreviewSourceElement: (
      <GpuNodeDragPreviewSurfaceLayer
        onPreviewDraw={handlePreviewDraw}
        onPreviewElementChange={handlePreviewElementChange}
        sources={sources}
      />
    ),
    nodeDragPreviewSurfaces,
  };
}

export function GpuNodeDragPreviewSurfaceLayer({
  onPreviewDraw,
  onPreviewElementChange,
  sources,
}: {
  readonly onPreviewDraw?: ((surfaceId: string) => void) | undefined;
  readonly onPreviewElementChange?:
    | ((surfaceId: string, element: HTMLElement | null) => void)
    | undefined;
  readonly sources: readonly GpuNodeDragPreviewSource[];
}) {
  if (sources.length === 0) {
    return null;
  }
  return (
    <HtmlSurfaceSourceLayer
      configureSourceElement={configureGpuNodeDragPreviewSourceElement}
      getSourceId={getGpuNodeDragPreviewSourceId}
      onSourceElementChange={onPreviewElementChange}
      renderSource={(source) => (
        <GpuNodeDragPreviewCanvas
          onPreviewDraw={onPreviewDraw}
          source={source}
        />
      )}
      sourceClassName={`${HTML_SURFACE_SOURCE_CLASS_NAME} ${GPU_NODE_DRAG_PREVIEW_SOURCE_CLASS_NAME}`}
      sources={sources}
    />
  );
}

export function getGpuNodeDragPreviewSources(
  snapshot: GpuNodeDragPreviewSnapshot | null,
): readonly GpuNodeDragPreviewSource[] {
  if (!snapshot) {
    return EMPTY_DRAG_PREVIEW_SOURCES;
  }
  const sources: GpuNodeDragPreviewSource[] = [];
  for (const node of snapshot.draggingNodes) {
    sources.push(toGpuNodeDragPreviewNodeSource(node));
  }
  if (snapshot.dropMarker) {
    sources.push(toGpuNodeDragPreviewDropMarkerSource(snapshot.dropMarker));
  }
  return sources;
}

export function getGpuNodeDragPreviewSurfaceLayouts(
  sources: readonly GpuNodeDragPreviewSource[],
): readonly GpuHtmlSurfaceOverlayLayout[] {
  return sources.map((source) => ({
    actorKind: "drag-overlay",
    height: source.height,
    surfaceId: source.surfaceId,
    width: source.width,
    x: source.x,
    y: source.y,
    zIndex: source.zIndex,
  }));
}

function getVisibleGpuNodeDragPreviewSnapshot(
  layoutStore: GpuFlowLayoutStoreApi | undefined,
): GpuNodeDragPreviewSnapshot | null {
  if (!layoutStore) {
    return null;
  }
  const layoutState = layoutStore.getState();
  const draggingNodes = getGpuNodeDragPreviewNodes(layoutState);
  const dropMarker = layoutState.dragPreview?.dropMarker ?? null;
  if (!dropMarker && draggingNodes.length === 0) {
    return null;
  }
  return {
    draggingNodes,
    dropMarker,
  };
}

function getGpuNodeDragPreviewNodes(
  layoutState: GpuFlowLayoutStore,
): readonly GpuNodeDragPreviewNode[] {
  return layoutState
    .getNodes()
    .filter(isDraggingMeasuredGpuFlowLayoutNode)
    .map((node) => ({
      nodeId: node.nodeId,
      rect: {
        height: node.height,
        width: node.width,
        x: node.x,
        y: node.y,
      },
    }));
}

function isDraggingMeasuredGpuFlowLayoutNode(
  node: GpuFlowLayoutNode,
): node is GpuFlowLayoutNode & {
  readonly height: number;
  readonly width: number;
} {
  return (
    node.interactionFlags?.dragging === true &&
    typeof node.height === "number" &&
    typeof node.width === "number" &&
    node.height > 0 &&
    node.width > 0
  );
}

function toGpuNodeDragPreviewNodeSource(
  node: GpuNodeDragPreviewNode,
): GpuNodeDragPreviewNodeSource {
  return {
    height: node.rect.height + DRAG_PREVIEW_NODE_PADDING * 2,
    kind: "node-bounds",
    localRect: {
      height: node.rect.height,
      width: node.rect.width,
      x: DRAG_PREVIEW_NODE_PADDING,
      y: DRAG_PREVIEW_NODE_PADDING,
    },
    nodeId: node.nodeId,
    surfaceId: `gpu-drag-preview-node:${node.nodeId}`,
    width: node.rect.width + DRAG_PREVIEW_NODE_PADDING * 2,
    x: node.rect.x - DRAG_PREVIEW_NODE_PADDING,
    y: node.rect.y - DRAG_PREVIEW_NODE_PADDING,
    zIndex: DRAG_PREVIEW_NODE_Z_INDEX,
  };
}

function toGpuNodeDragPreviewDropMarkerSource(
  marker: GpuFlowLayoutDropMarker,
): GpuNodeDragPreviewDropMarkerSource {
  return {
    axis: marker.axis,
    childNodeId: marker.childNodeId,
    height: marker.rect.height + DROP_MARKER_PADDING * 2,
    index: marker.index,
    kind: "drop-marker",
    localRect: {
      height: marker.rect.height,
      width: marker.rect.width,
      x: DROP_MARKER_PADDING,
      y: DROP_MARKER_PADDING,
    },
    parentNodeId: marker.parentNodeId,
    surfaceId: "gpu-drop-marker",
    width: marker.rect.width + DROP_MARKER_PADDING * 2,
    x: marker.rect.x - DROP_MARKER_PADDING,
    y: marker.rect.y - DROP_MARKER_PADDING,
    zIndex: DROP_MARKER_Z_INDEX,
  };
}

function getGpuNodeDragPreviewSourceId(
  source: GpuNodeDragPreviewSource,
): string {
  return source.surfaceId;
}

function configureGpuNodeDragPreviewSourceElement({
  host,
  source,
}: HtmlSurfaceSourceElementConfig<GpuNodeDragPreviewSource>) {
  host.dataset.gpuFlowDragPreviewSource = "true";
  host.dataset.gpuFlowDragPreviewKind = source.kind;
  if (source.kind === "node-bounds") {
    host.dataset.nodeid = source.nodeId;
    host.setAttribute(
      "data-testid",
      `gpu-drag-preview-node-source-${source.nodeId}`,
    );
  } else {
    host.dataset.gpuFlowDropMarkerAxis = source.axis;
    host.dataset.gpuFlowDropMarkerChild = source.childNodeId;
    host.dataset.gpuFlowDropMarkerIndex = String(source.index);
    host.dataset.gpuFlowDropMarkerParent = source.parentNodeId;
    host.setAttribute("data-testid", "gpu-drop-marker-source");
  }
  host.style.height = `${source.height}px`;
  host.style.width = `${source.width}px`;
}

function GpuNodeDragPreviewCanvas({
  onPreviewDraw,
  source,
}: {
  readonly onPreviewDraw?: ((surfaceId: string) => void) | undefined;
  readonly source: GpuNodeDragPreviewSource;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    prepareGpuNodeDragPreviewCanvas(canvas, ctx, source);
    drawGpuNodeDragPreviewCanvas(ctx, source, {
      darkMode: isGpuNodeDragPreviewDarkMode(canvas),
    });
    onPreviewDraw?.(source.surfaceId);
  }, [onPreviewDraw, source]);

  return (
    <canvas
      aria-hidden="true"
      data-gpu-flow-drag-preview-canvas="true"
      data-gpu-flow-drag-preview-kind={source.kind}
      data-gpu-flow-drag-preview-source-id={source.surfaceId}
      data-testid={`gpu-drag-preview-canvas-${source.surfaceId}`}
      height={Math.max(1, Math.ceil(source.height))}
      ref={canvasRef}
      style={getGpuNodeDragPreviewCanvasStyle(source)}
      width={Math.max(1, Math.ceil(source.width))}
    />
  );
}

export function drawGpuNodeDragPreviewCanvas(
  ctx: CanvasRenderingContext2D,
  source: GpuNodeDragPreviewSource,
  { darkMode }: { readonly darkMode: boolean },
) {
  ctx.save();
  ctx.clearRect(0, 0, source.width, source.height);
  if (source.kind === "node-bounds") {
    drawGpuNodeDragPreviewBounds(ctx, source, darkMode);
  } else {
    drawGpuNodeDropMarker(ctx, source, darkMode);
  }
  ctx.restore();
}

function drawGpuNodeDragPreviewBounds(
  ctx: CanvasRenderingContext2D,
  source: GpuNodeDragPreviewNodeSource,
  darkMode: boolean,
) {
  const palette = getGpuNodeDragPreviewPalette(darkMode);
  const rect = source.localRect;
  ctx.save();
  ctx.shadowBlur = darkMode ? 18 : 16;
  ctx.shadowColor = palette.nodeShadow;
  ctx.shadowOffsetY = darkMode ? 8 : 7;
  ctx.fillStyle = palette.nodeFill;
  drawRoundRect(ctx, {
    height: rect.height,
    radius: 8,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  });
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = palette.nodeStroke;
  ctx.lineWidth = 2;
  drawRoundRect(ctx, {
    height: Math.max(0, rect.height - 2),
    radius: 7,
    width: Math.max(0, rect.width - 2),
    x: rect.x + 1,
    y: rect.y + 1,
  });
  ctx.stroke();
  ctx.restore();
}

function drawGpuNodeDropMarker(
  ctx: CanvasRenderingContext2D,
  source: GpuNodeDragPreviewDropMarkerSource,
  darkMode: boolean,
) {
  const palette = getGpuNodeDragPreviewPalette(darkMode);
  const rect = source.localRect;
  const radius = Math.min(rect.width, rect.height) / 2;
  ctx.save();
  ctx.shadowBlur = 12;
  ctx.shadowColor = palette.markerShadow;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = palette.markerFill;
  drawRoundRect(ctx, {
    height: rect.height,
    radius,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  });
  ctx.fill();
  drawGpuNodeDropMarkerCaps(ctx, source, radius);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = palette.markerRing;
  ctx.lineWidth = 1;
  drawRoundRect(ctx, {
    height: Math.max(0, rect.height - 1),
    radius: Math.max(0, radius - 0.5),
    width: Math.max(0, rect.width - 1),
    x: rect.x + 0.5,
    y: rect.y + 0.5,
  });
  ctx.stroke();
  ctx.restore();
}

function drawGpuNodeDropMarkerCaps(
  ctx: CanvasRenderingContext2D,
  source: GpuNodeDragPreviewDropMarkerSource,
  radius: number,
) {
  const rect = source.localRect;
  const capRadius = Math.max(5, radius);
  const centers =
    source.axis === "x"
      ? [
          { x: rect.x + rect.width / 2, y: rect.y },
          { x: rect.x + rect.width / 2, y: rect.y + rect.height },
        ]
      : [
          { x: rect.x, y: rect.y + rect.height / 2 },
          { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
        ];
  for (const center of centers) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, capRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
}

function prepareGpuNodeDragPreviewCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  source: GpuNodeDragPreviewSource,
) {
  const dpr = getGpuNodeDragPreviewDevicePixelRatio(canvas);
  canvas.width = Math.max(1, Math.ceil(source.width * dpr));
  canvas.height = Math.max(1, Math.ceil(source.height * dpr));
  canvas.style.width = `${source.width}px`;
  canvas.style.height = `${source.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getGpuNodeDragPreviewCanvasStyle(
  source: GpuNodeDragPreviewSource,
): CSSProperties {
  return {
    display: "block",
    height: source.height,
    width: source.width,
  };
}

function getGpuNodeDragPreviewDevicePixelRatio(
  canvas: HTMLCanvasElement,
): number {
  const ownerWindow = canvas.ownerDocument.defaultView;
  const dpr = ownerWindow?.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1;
  return Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
}

function isGpuNodeDragPreviewDarkMode(canvas: HTMLCanvasElement): boolean {
  return Boolean(
    canvas.closest(".dark") ??
      canvas.ownerDocument.documentElement.closest(".dark"),
  );
}

function getGpuNodeDragPreviewPalette(darkMode: boolean): {
  readonly markerFill: string;
  readonly markerRing: string;
  readonly markerShadow: string;
  readonly nodeFill: string;
  readonly nodeShadow: string;
  readonly nodeStroke: string;
} {
  return darkMode
    ? {
        markerFill: "rgba(96, 165, 250, 0.95)",
        markerRing: "rgba(15, 23, 42, 0.8)",
        markerShadow: "rgba(96, 165, 250, 0.3)",
        nodeFill: "rgba(96, 165, 250, 0.09)",
        nodeShadow: "rgba(0, 0, 0, 0.28)",
        nodeStroke: "rgba(96, 165, 250, 0.82)",
      }
    : {
        markerFill: "rgba(37, 99, 235, 0.9)",
        markerRing: "rgba(255, 255, 255, 0.8)",
        markerShadow: "rgba(37, 99, 235, 0.35)",
        nodeFill: "rgba(37, 99, 235, 0.06)",
        nodeShadow: "rgba(15, 23, 42, 0.16)",
        nodeStroke: "rgba(37, 99, 235, 0.75)",
      };
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  rect: {
    readonly height: number;
    readonly radius: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  },
) {
  const radius = Math.min(rect.radius, rect.width / 2, rect.height / 2);
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  ctx.beginPath();
  ctx.moveTo(rect.x + radius, rect.y);
  ctx.lineTo(right - radius, rect.y);
  ctx.quadraticCurveTo(right, rect.y, right, rect.y + radius);
  ctx.lineTo(right, bottom - radius);
  ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
  ctx.lineTo(rect.x + radius, bottom);
  ctx.quadraticCurveTo(rect.x, bottom, rect.x, bottom - radius);
  ctx.lineTo(rect.x, rect.y + radius);
  ctx.quadraticCurveTo(rect.x, rect.y, rect.x + radius, rect.y);
  ctx.closePath();
}
