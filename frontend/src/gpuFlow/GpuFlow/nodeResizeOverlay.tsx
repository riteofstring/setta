import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
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
import type { GpuFlowLayoutNode } from "../layoutStore";
import { resolveGpuNodeZIndex } from "../nodeZIndex";
import {
  getGpuNodeResizeHandleRects,
  type GpuNodeResizeDirection,
} from "../resizeHandles";
import { releaseGpuFlowUnmountedSourceSurfaceTexture } from "../surfaceTextureReleaseAuthority";
import type { GpuRect } from "../viewportMath";

type GpuNodeResizeOverlayHandle = {
  readonly direction: GpuNodeResizeDirection;
  readonly rect: GpuRect;
};

export type GpuNodeResizeOverlaySource = {
  readonly handles: readonly GpuNodeResizeOverlayHandle[];
  readonly height: number;
  readonly kind: "resizing" | "selected";
  readonly nodeId: string;
  readonly surfaceId: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

const EMPTY_RESIZE_OVERLAY_SOURCES: readonly GpuNodeResizeOverlaySource[] = [];

const GPU_NODE_RESIZE_OVERLAY_SOURCE_CLASS_NAME =
  "setta-gpu-flow__resize-source";

const GPU_NODE_RESIZE_OVERLAY_Z_INDEX = 90_002;

export function useGpuFlowNodeResizeOverlaySources({
  nodeDomTransformSyncCacheRef,
  nodeElementByIdRef,
  nodes,
  primaryNodeId,
  surfaceRef,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
}: {
  readonly nodeDomTransformSyncCacheRef: MutableRefObject<GpuNodeDomTransformSyncCache>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodes: readonly GpuFlowLayoutNode[] | undefined;
  readonly primaryNodeId?: string | null | undefined;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
}): {
  readonly nodeResizeOverlaySourceElement: ReactNode;
  readonly nodeResizeOverlaySurfaces: readonly GpuHtmlSurfaceOverlayLayout[];
} {
  const sources = useMemo(
    () =>
      getGpuNodeResizeOverlaySources({
        nodes: nodes ?? [],
        primaryNodeId: primaryNodeId ?? null,
      }),
    [nodes, primaryNodeId],
  );
  const nodeResizeOverlaySurfaces = useMemo(
    () => getGpuNodeResizeOverlaySurfaceLayouts(sources),
    [sources],
  );

  const handleResizeElementChange = useCallback(
    (surfaceId: string, element: HTMLElement | null) => {
      clearGpuNodeDomTransformSyncCacheNode(
        nodeDomTransformSyncCacheRef.current,
        surfaceId,
      );
      if (!element) {
        nodeElementByIdRef.current.delete(surfaceId);
        transformOnlyPaintNodeIdsRef.current.delete(surfaceId);
        releaseGpuFlowUnmountedSourceSurfaceTexture({
          surfaceId,
          textureManager: textureManagerRef.current,
        });
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
  const handleResizeDraw = useCallback(
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
    nodeResizeOverlaySourceElement: (
      <GpuNodeResizeOverlaySurfaceLayer
        onResizeDraw={handleResizeDraw}
        onResizeElementChange={handleResizeElementChange}
        sources={sources}
      />
    ),
    nodeResizeOverlaySurfaces,
  };
}

export function GpuNodeResizeOverlaySurfaceLayer({
  onResizeDraw,
  onResizeElementChange,
  sources,
}: {
  readonly onResizeDraw?: ((surfaceId: string) => void) | undefined;
  readonly onResizeElementChange?:
    | ((surfaceId: string, element: HTMLElement | null) => void)
    | undefined;
  readonly sources: readonly GpuNodeResizeOverlaySource[];
}) {
  if (sources.length === 0) {
    return null;
  }
  return (
    <HtmlSurfaceSourceLayer
      configureSourceElement={configureGpuNodeResizeOverlaySourceElement}
      getSourceId={getGpuNodeResizeOverlaySourceId}
      onSourceElementChange={onResizeElementChange}
      renderSource={(source) => (
        <GpuNodeResizeOverlayCanvas
          onResizeDraw={onResizeDraw}
          source={source}
        />
      )}
      sourceClassName={`${HTML_SURFACE_SOURCE_CLASS_NAME} ${GPU_NODE_RESIZE_OVERLAY_SOURCE_CLASS_NAME}`}
      sources={sources}
    />
  );
}

export function getGpuNodeResizeOverlaySources({
  nodes,
  primaryNodeId,
}: {
  readonly nodes: readonly GpuFlowLayoutNode[];
  readonly primaryNodeId: string | null;
}): readonly GpuNodeResizeOverlaySource[] {
  const sourceNodes = new Map<string, GpuFlowLayoutNode>();
  if (primaryNodeId) {
    const primaryNode = nodes.find((node) => node.nodeId === primaryNodeId);
    if (primaryNode) {
      sourceNodes.set(primaryNode.nodeId, primaryNode);
    }
  }
  for (const node of nodes) {
    if (node.interactionFlags?.resizing) {
      sourceNodes.set(node.nodeId, node);
    }
  }
  if (sourceNodes.size === 0) {
    return EMPTY_RESIZE_OVERLAY_SOURCES;
  }
  return Array.from(sourceNodes.values())
    .map((node) => toGpuNodeResizeOverlaySource(node, primaryNodeId))
    .filter((source): source is GpuNodeResizeOverlaySource => source !== null);
}

export function getGpuNodeResizeOverlaySurfaceLayouts(
  sources: readonly GpuNodeResizeOverlaySource[],
): readonly GpuHtmlSurfaceOverlayLayout[] {
  return sources.map((source) => ({
    actorKind: "resize-overlay",
    height: source.height,
    surfaceId: source.surfaceId,
    width: source.width,
    x: source.x,
    y: source.y,
    zIndex: source.zIndex,
  }));
}

function toGpuNodeResizeOverlaySource(
  node: GpuFlowLayoutNode,
  primaryNodeId: string | null,
): GpuNodeResizeOverlaySource | null {
  const handleRects = getGpuNodeResizeHandleRects(node);
  if (handleRects.length === 0) {
    return null;
  }
  const bounds = getGpuRectsBounds(handleRects.map((handle) => handle.rect));
  if (!bounds) {
    return null;
  }
  return {
    handles: handleRects.map((handle) => ({
      direction: handle.direction,
      rect: {
        height: handle.rect.height,
        width: handle.rect.width,
        x: handle.rect.x - bounds.x,
        y: handle.rect.y - bounds.y,
      },
    })),
    height: bounds.height,
    kind: node.interactionFlags?.resizing ? "resizing" : "selected",
    nodeId: node.nodeId,
    surfaceId: `gpu-node-resize-handles:${node.nodeId}`,
    width: bounds.width,
    x: bounds.x,
    y: bounds.y,
    zIndex:
      GPU_NODE_RESIZE_OVERLAY_Z_INDEX +
      (node.nodeId === primaryNodeId ? 1 : 0) +
      resolveGpuNodeZIndex(node),
  };
}

function getGpuRectsBounds(rects: readonly GpuRect[]): GpuRect | null {
  let bounds: GpuRect | null = null;
  for (const rect of rects) {
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    if (!bounds) {
      bounds = { ...rect };
      continue;
    }
    const x = Math.min(bounds.x, rect.x);
    const y = Math.min(bounds.y, rect.y);
    bounds = {
      height: Math.max(bounds.y + bounds.height, bottom) - y,
      width: Math.max(bounds.x + bounds.width, right) - x,
      x,
      y,
    };
  }
  return bounds;
}

function getGpuNodeResizeOverlaySourceId(
  source: GpuNodeResizeOverlaySource,
): string {
  return source.surfaceId;
}

function configureGpuNodeResizeOverlaySourceElement({
  host,
  source,
}: HtmlSurfaceSourceElementConfig<GpuNodeResizeOverlaySource>) {
  host.dataset.gpuFlowResizeSource = "true";
  host.dataset.gpuFlowResizeKind = source.kind;
  host.dataset.nodeid = source.nodeId;
  host.setAttribute("data-testid", `gpu-node-resize-source-${source.nodeId}`);
  host.style.height = `${source.height}px`;
  host.style.width = `${source.width}px`;
}

function GpuNodeResizeOverlayCanvas({
  onResizeDraw,
  source,
}: {
  readonly onResizeDraw?: ((surfaceId: string) => void) | undefined;
  readonly source: GpuNodeResizeOverlaySource;
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
    prepareGpuNodeResizeOverlayCanvas(canvas, ctx, source);
    drawGpuNodeResizeOverlayCanvas(ctx, source, {
      darkMode: isGpuNodeResizeOverlayDarkMode(canvas),
    });
    onResizeDraw?.(source.surfaceId);
  }, [onResizeDraw, source]);

  return (
    <canvas
      aria-hidden="true"
      data-gpu-flow-resize-canvas="true"
      data-gpu-flow-resize-kind={source.kind}
      data-gpu-flow-resize-source-id={source.surfaceId}
      data-testid={`gpu-node-resize-canvas-${source.nodeId}`}
      height={Math.max(1, Math.ceil(source.height))}
      ref={canvasRef}
      style={getGpuNodeResizeOverlayCanvasStyle(source)}
      width={Math.max(1, Math.ceil(source.width))}
    />
  );
}

export function drawGpuNodeResizeOverlayCanvas(
  ctx: CanvasRenderingContext2D,
  source: GpuNodeResizeOverlaySource,
  { darkMode }: { readonly darkMode: boolean },
) {
  ctx.save();
  ctx.clearRect(0, 0, source.width, source.height);
  const palette = getGpuNodeResizeOverlayPalette(darkMode, source.kind);
  for (const handle of source.handles) {
    drawGpuNodeResizeHandle(ctx, handle, palette);
  }
  ctx.restore();
}

function drawGpuNodeResizeHandle(
  ctx: CanvasRenderingContext2D,
  handle: GpuNodeResizeOverlayHandle,
  palette: ReturnType<typeof getGpuNodeResizeOverlayPalette>,
) {
  ctx.save();
  ctx.shadowBlur = 8;
  ctx.shadowColor = palette.shadow;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = palette.fill;
  if (handle.direction === "right") {
    drawCenteredPill(ctx, {
      height: clampNumber(handle.rect.height * 0.22, 24, 48),
      radius: 2,
      width: 4,
      x: handle.rect.x + handle.rect.width / 2,
      y: handle.rect.y + handle.rect.height / 2,
    });
  } else if (handle.direction === "bottom") {
    drawCenteredPill(ctx, {
      height: 4,
      radius: 2,
      width: clampNumber(handle.rect.width * 0.22, 24, 48),
      x: handle.rect.x + handle.rect.width / 2,
      y: handle.rect.y + handle.rect.height / 2,
    });
  } else {
    drawCenteredPill(ctx, {
      height: 8,
      radius: 3,
      width: 8,
      x: handle.rect.x + handle.rect.width / 2,
      y: handle.rect.y + handle.rect.height / 2,
    });
  }
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = palette.ring;
  ctx.lineWidth = 1;
  if (handle.direction === "bottomRight") {
    ctx.stroke();
  }
  ctx.restore();
}

function drawCenteredPill(
  ctx: CanvasRenderingContext2D,
  rect: {
    readonly height: number;
    readonly radius: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  },
) {
  const x = rect.x - rect.width / 2;
  const y = rect.y - rect.height / 2;
  const radius = Math.min(rect.radius, rect.width / 2, rect.height / 2);
  const right = x + rect.width;
  const bottom = y + rect.height;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(right - radius, y);
  ctx.quadraticCurveTo(right, y, right, y + radius);
  ctx.lineTo(right, bottom - radius);
  ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
  ctx.lineTo(x + radius, bottom);
  ctx.quadraticCurveTo(x, bottom, x, bottom - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function prepareGpuNodeResizeOverlayCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  source: GpuNodeResizeOverlaySource,
) {
  const dpr = getGpuNodeResizeOverlayDevicePixelRatio(canvas);
  canvas.width = Math.max(1, Math.ceil(source.width * dpr));
  canvas.height = Math.max(1, Math.ceil(source.height * dpr));
  canvas.style.width = `${source.width}px`;
  canvas.style.height = `${source.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getGpuNodeResizeOverlayCanvasStyle(
  source: GpuNodeResizeOverlaySource,
): CSSProperties {
  return {
    display: "block",
    height: source.height,
    width: source.width,
  };
}

function getGpuNodeResizeOverlayDevicePixelRatio(
  canvas: HTMLCanvasElement,
): number {
  const ownerWindow = canvas.ownerDocument.defaultView;
  const dpr = ownerWindow?.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1;
  return Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
}

function isGpuNodeResizeOverlayDarkMode(canvas: HTMLCanvasElement): boolean {
  return Boolean(
    canvas.closest(".dark") ??
      canvas.ownerDocument.documentElement.closest(".dark"),
  );
}

function getGpuNodeResizeOverlayPalette(
  darkMode: boolean,
  kind: GpuNodeResizeOverlaySource["kind"],
): {
  readonly fill: string;
  readonly ring: string;
  readonly shadow: string;
} {
  if (darkMode) {
    return {
      fill:
        kind === "resizing"
          ? "rgba(96, 165, 250, 0.96)"
          : "rgba(96, 165, 250, 0.78)",
      ring: "rgba(15, 23, 42, 0.72)",
      shadow: "rgba(96, 165, 250, 0.32)",
    };
  }
  return {
    fill:
      kind === "resizing"
        ? "rgba(37, 99, 235, 0.92)"
        : "rgba(37, 99, 235, 0.74)",
    ring: "rgba(255, 255, 255, 0.82)",
    shadow: "rgba(37, 99, 235, 0.3)",
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
