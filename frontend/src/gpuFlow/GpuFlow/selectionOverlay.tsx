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
import {
  screenToFlowPosition,
  type GpuRect,
  type GpuViewportTuple,
} from "../viewportMath";
import type {
  GpuFlowViewportStoreApi,
  GpuUserSelectionRect,
} from "../viewportStore";

type GpuNodesSelectionOverlaySnapshot = {
  readonly bounds: GpuRect;
  readonly transform: GpuViewportTuple;
};

type GpuSelectionOverlaySnapshot = {
  readonly nodesSelectionBounds: GpuRect | null;
  readonly primaryNodeId: string | null;
  readonly transform: GpuViewportTuple;
  readonly userSelectionRect: GpuUserSelectionRect | null;
};

type GpuSelectionOverlaySourceBase = {
  readonly height: number;
  readonly localRect: GpuRect;
  readonly surfaceId: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

type GpuUserSelectionOverlaySource = GpuSelectionOverlaySourceBase & {
  readonly kind: "user-selection";
};

type GpuNodesSelectionOverlaySource = GpuSelectionOverlaySourceBase & {
  readonly kind: "nodes-selection";
  readonly primaryNodeId: string;
};

export type GpuSelectionOverlaySource =
  | GpuNodesSelectionOverlaySource
  | GpuUserSelectionOverlaySource;

const EMPTY_SELECTION_OVERLAY_SOURCES: readonly GpuSelectionOverlaySource[] =
  [];

const GPU_SELECTION_SOURCE_CLASS_NAME = "setta-gpu-flow__selection-source";

const GPU_USER_SELECTION_SURFACE_ID = "gpu-user-selection";
const GPU_NODES_SELECTION_SURFACE_ID = "gpu-nodes-selection";

const GPU_USER_SELECTION_Z_INDEX = 90_000;
const GPU_NODES_SELECTION_Z_INDEX = 90_001;

export function useGpuFlowSelectionOverlaySources({
  nodeDomTransformSyncCacheRef,
  nodeElementByIdRef,
  primaryNodeId,
  surfaceRef,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
  viewportStore,
}: {
  readonly nodeDomTransformSyncCacheRef: MutableRefObject<GpuNodeDomTransformSyncCache>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly primaryNodeId?: string | null | undefined;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
  readonly viewportStore: GpuFlowViewportStoreApi;
}): {
  readonly selectionOverlaySourceElement: ReactNode;
  readonly selectionOverlaySurfaces: readonly GpuHtmlSurfaceOverlayLayout[];
} {
  const [snapshot, setSnapshot] = useState<GpuSelectionOverlaySnapshot>(() =>
    getGpuSelectionOverlaySnapshot(viewportStore, primaryNodeId ?? null),
  );

  useEffect(() => {
    const syncSnapshot = () => {
      setSnapshot(
        getGpuSelectionOverlaySnapshot(viewportStore, primaryNodeId ?? null),
      );
    };
    syncSnapshot();
    return viewportStore.subscribe((state, previousState) => {
      if (
        state.nodesSelectionBounds === previousState.nodesSelectionBounds &&
        state.transform === previousState.transform &&
        state.userSelectionActive === previousState.userSelectionActive &&
        state.userSelectionRect === previousState.userSelectionRect
      ) {
        return;
      }
      syncSnapshot();
    });
  }, [primaryNodeId, viewportStore]);

  const sources = useMemo(
    () => getGpuSelectionOverlaySources(snapshot),
    [snapshot],
  );
  const selectionOverlaySurfaces = useMemo(
    () => getGpuSelectionOverlaySurfaceLayouts(sources),
    [sources],
  );

  const handleSelectionElementChange = useCallback(
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
  const handleSelectionDraw = useCallback(
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
    selectionOverlaySourceElement: (
      <GpuSelectionOverlaySurfaceLayer
        onSelectionDraw={handleSelectionDraw}
        onSelectionElementChange={handleSelectionElementChange}
        sources={sources}
      />
    ),
    selectionOverlaySurfaces,
  };
}

export function GpuSelectionOverlaySurfaceLayer({
  onSelectionDraw,
  onSelectionElementChange,
  sources,
}: {
  readonly onSelectionDraw?: ((surfaceId: string) => void) | undefined;
  readonly onSelectionElementChange?:
    | ((surfaceId: string, element: HTMLElement | null) => void)
    | undefined;
  readonly sources: readonly GpuSelectionOverlaySource[];
}) {
  if (sources.length === 0) {
    return null;
  }
  return (
    <HtmlSurfaceSourceLayer
      configureSourceElement={configureGpuSelectionOverlaySourceElement}
      getSourceId={getGpuSelectionOverlaySourceId}
      onSourceElementChange={onSelectionElementChange}
      renderSource={(source) => (
        <GpuSelectionOverlayCanvas
          onSelectionDraw={onSelectionDraw}
          source={source}
        />
      )}
      sourceClassName={`${HTML_SURFACE_SOURCE_CLASS_NAME} ${GPU_SELECTION_SOURCE_CLASS_NAME}`}
      sources={sources}
    />
  );
}

export function getGpuSelectionOverlaySources(
  snapshot: GpuSelectionOverlaySnapshot | null,
): readonly GpuSelectionOverlaySource[] {
  if (!snapshot) {
    return EMPTY_SELECTION_OVERLAY_SOURCES;
  }
  const sources: GpuSelectionOverlaySource[] = [];
  if (snapshot.userSelectionRect) {
    sources.push(
      toGpuUserSelectionOverlaySource(
        snapshot.userSelectionRect,
        snapshot.transform,
      ),
    );
  }
  if (snapshot.nodesSelectionBounds && snapshot.primaryNodeId) {
    sources.push(
      toGpuNodesSelectionOverlaySource(
        snapshot.nodesSelectionBounds,
        snapshot.primaryNodeId,
      ),
    );
  }
  return sources;
}

export function getGpuSelectionOverlaySurfaceLayouts(
  sources: readonly GpuSelectionOverlaySource[],
): readonly GpuHtmlSurfaceOverlayLayout[] {
  return sources.map((source) => ({
    height: source.height,
    surfaceId: source.surfaceId,
    width: source.width,
    x: source.x,
    y: source.y,
    zIndex: source.zIndex,
  }));
}

function getVisibleGpuUserSelectionRect(
  state: ReturnType<GpuFlowViewportStoreApi["getState"]>,
): GpuUserSelectionRect | null {
  return state.userSelectionActive ? state.userSelectionRect : null;
}

export function getVisibleGpuNodesSelectionOverlaySnapshot(
  state: ReturnType<GpuFlowViewportStoreApi["getState"]>,
): GpuNodesSelectionOverlaySnapshot | null {
  return state.nodesSelectionBounds
    ? {
        bounds: state.nodesSelectionBounds,
        transform: state.transform,
      }
    : null;
}

function getGpuSelectionOverlaySnapshot(
  viewportStore: GpuFlowViewportStoreApi,
  primaryNodeId: string | null,
): GpuSelectionOverlaySnapshot {
  const state = viewportStore.getState();
  return {
    nodesSelectionBounds: state.nodesSelectionBounds,
    primaryNodeId,
    transform: state.transform,
    userSelectionRect: getVisibleGpuUserSelectionRect(state),
  };
}

function toGpuUserSelectionOverlaySource(
  rect: GpuUserSelectionRect,
  transform: GpuViewportTuple,
): GpuUserSelectionOverlaySource {
  const flowRect = userSelectionRectToFlowRect(rect, transform);
  return {
    height: toPositiveSurfaceLength(flowRect.height),
    kind: "user-selection",
    localRect: {
      height: toPositiveSurfaceLength(flowRect.height),
      width: toPositiveSurfaceLength(flowRect.width),
      x: 0,
      y: 0,
    },
    surfaceId: GPU_USER_SELECTION_SURFACE_ID,
    width: toPositiveSurfaceLength(flowRect.width),
    x: flowRect.x,
    y: flowRect.y,
    zIndex: GPU_USER_SELECTION_Z_INDEX,
  };
}

function toGpuNodesSelectionOverlaySource(
  bounds: GpuRect,
  primaryNodeId: string,
): GpuNodesSelectionOverlaySource {
  return {
    height: toPositiveSurfaceLength(bounds.height),
    kind: "nodes-selection",
    localRect: {
      height: toPositiveSurfaceLength(bounds.height),
      width: toPositiveSurfaceLength(bounds.width),
      x: 0,
      y: 0,
    },
    primaryNodeId,
    surfaceId: GPU_NODES_SELECTION_SURFACE_ID,
    width: toPositiveSurfaceLength(bounds.width),
    x: bounds.x,
    y: bounds.y,
    zIndex: GPU_NODES_SELECTION_Z_INDEX,
  };
}

function userSelectionRectToFlowRect(
  rect: GpuUserSelectionRect,
  transform: GpuViewportTuple,
): GpuRect {
  const topLeft = screenToFlowPosition({ x: rect.x, y: rect.y }, transform);
  const bottomRight = screenToFlowPosition(
    {
      x: rect.x + rect.width,
      y: rect.y + rect.height,
    },
    transform,
  );
  return {
    height: bottomRight.y - topLeft.y,
    width: bottomRight.x - topLeft.x,
    x: topLeft.x,
    y: topLeft.y,
  };
}

function toPositiveSurfaceLength(value: number): number {
  return Math.max(1, Math.abs(value));
}

function getGpuSelectionOverlaySourceId(
  source: GpuSelectionOverlaySource,
): string {
  return source.surfaceId;
}

function configureGpuSelectionOverlaySourceElement({
  host,
  source,
}: HtmlSurfaceSourceElementConfig<GpuSelectionOverlaySource>) {
  host.dataset.gpuFlowSelectionSource = "true";
  host.dataset.gpuFlowSelectionKind = source.kind;
  if (source.kind === "nodes-selection") {
    host.dataset.id = source.primaryNodeId;
    host.setAttribute("data-testid", "gpu-nodes-selection-source");
  } else {
    host.setAttribute("data-testid", "gpu-user-selection-source");
  }
  host.style.height = `${source.height}px`;
  host.style.width = `${source.width}px`;
}

function GpuSelectionOverlayCanvas({
  onSelectionDraw,
  source,
}: {
  readonly onSelectionDraw?: ((surfaceId: string) => void) | undefined;
  readonly source: GpuSelectionOverlaySource;
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
    prepareGpuSelectionOverlayCanvas(canvas, ctx, source);
    drawGpuSelectionOverlayCanvas(ctx, source, {
      darkMode: isGpuSelectionOverlayDarkMode(canvas),
    });
    onSelectionDraw?.(source.surfaceId);
  }, [onSelectionDraw, source]);

  return (
    <canvas
      aria-hidden="true"
      data-gpu-flow-selection-canvas="true"
      data-gpu-flow-selection-kind={source.kind}
      data-gpu-flow-selection-source-id={source.surfaceId}
      data-testid={`gpu-selection-canvas-${source.surfaceId}`}
      height={Math.max(1, Math.ceil(source.height))}
      ref={canvasRef}
      style={getGpuSelectionOverlayCanvasStyle(source)}
      width={Math.max(1, Math.ceil(source.width))}
    />
  );
}

export function drawGpuSelectionOverlayCanvas(
  ctx: CanvasRenderingContext2D,
  source: GpuSelectionOverlaySource,
  { darkMode }: { readonly darkMode: boolean },
) {
  ctx.save();
  ctx.clearRect(0, 0, source.width, source.height);
  if (source.kind === "user-selection") {
    drawGpuUserSelectionOverlay(ctx, source, darkMode);
  } else {
    drawGpuNodesSelectionOverlay(ctx, source, darkMode);
  }
  ctx.restore();
}

function drawGpuUserSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  source: GpuUserSelectionOverlaySource,
  darkMode: boolean,
) {
  const palette = getGpuSelectionOverlayPalette(darkMode);
  drawGpuSelectionRect(ctx, source.localRect, {
    border: palette.userBorder,
    fill: palette.userFill,
    lineDash: [],
  });
}

function drawGpuNodesSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  source: GpuNodesSelectionOverlaySource,
  darkMode: boolean,
) {
  const palette = getGpuSelectionOverlayPalette(darkMode);
  drawGpuSelectionRect(ctx, source.localRect, {
    border: palette.nodesBorder,
    fill: palette.nodesFill,
    lineDash: [4, 3],
  });
}

function drawGpuSelectionRect(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
  {
    border,
    fill,
    lineDash,
  }: {
    readonly border: string;
    readonly fill: string;
    readonly lineDash: readonly number[];
  },
) {
  ctx.fillStyle = fill;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.setLineDash([...lineDash]);
  ctx.strokeRect(
    rect.x + 0.5,
    rect.y + 0.5,
    Math.max(0, rect.width - 1),
    Math.max(0, rect.height - 1),
  );
  ctx.setLineDash([]);
}

function prepareGpuSelectionOverlayCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  source: GpuSelectionOverlaySource,
) {
  const dpr = getGpuSelectionOverlayDevicePixelRatio(canvas);
  canvas.width = Math.max(1, Math.ceil(source.width * dpr));
  canvas.height = Math.max(1, Math.ceil(source.height * dpr));
  canvas.style.width = `${source.width}px`;
  canvas.style.height = `${source.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getGpuSelectionOverlayCanvasStyle(
  source: GpuSelectionOverlaySource,
): CSSProperties {
  return {
    display: "block",
    height: source.height,
    width: source.width,
  };
}

function getGpuSelectionOverlayDevicePixelRatio(
  canvas: HTMLCanvasElement,
): number {
  const ownerWindow = canvas.ownerDocument.defaultView;
  const dpr = ownerWindow?.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1;
  return Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
}

function isGpuSelectionOverlayDarkMode(canvas: HTMLCanvasElement): boolean {
  return Boolean(
    canvas.closest(".dark") ??
      canvas.ownerDocument.documentElement.closest(".dark"),
  );
}

function getGpuSelectionOverlayPalette(darkMode: boolean): {
  readonly nodesBorder: string;
  readonly nodesFill: string;
  readonly userBorder: string;
  readonly userFill: string;
} {
  return darkMode
    ? {
        nodesBorder: "rgba(96, 165, 250, 0.86)",
        nodesFill: "rgba(96, 165, 250, 0.1)",
        userBorder: "rgba(96, 165, 250, 0.78)",
        userFill: "rgba(96, 165, 250, 0.14)",
      }
    : {
        nodesBorder: "rgba(0, 89, 220, 0.8)",
        nodesFill: "rgba(0, 89, 220, 0.08)",
        userBorder: "rgba(37, 99, 235, 0.75)",
        userFill: "rgba(59, 130, 246, 0.12)",
      };
}
