import { useEffect, type MutableRefObject, type RefObject } from "react";

import type { HtmlSurfaceVisualScene } from "../htmlSurfaces/visualScene";
import {
  createGpuFlowInteractionDiagnosticsSnapshot,
  type GpuFlowRetainedRowDebugEntry,
  type GpuFlowVisualSurfaceDebugEntry,
  type MutableGpuFlowInteractionDiagnostics,
} from "../interactionDiagnostics";
import type { GpuNodeInteractionDirtyController } from "../nodeInteractionDirty";
import {
  createGpuRetainedContentSampledSceneForSurface,
  isGpuRetainedContentSurfaceWithScene,
} from "../retainedContentRuntimeSampling";
import {
  getGpuRetainedContentRuntimeScrollOffsets,
  type GpuRetainedContentRuntimeState,
} from "../retainedContentRuntimeState";
import type {
  GpuRetainedContentHitRecord,
  GpuRetainedContentRow,
} from "../retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import {
  flowToScreenPosition,
  type GpuPoint,
  type GpuRect,
  type GpuViewportInput,
  type GpuViewportTuple,
} from "../viewportMath";
import { getRegisteredGpuFlowViewportRuntime } from "../viewportRuntimeRegistry";
import type { GpuFlowViewportStoreApi } from "../viewportStore";

type GpuFlowRetainedRowDebugContext = {
  readonly containerRect: DOMRect;
  readonly viewport: GpuViewportInput;
};

type GpuFlowSurfaceClipBounds = {
  readonly bottom: number;
  readonly right: number;
  readonly x: number;
  readonly y: number;
};

type GpuFlowDebugNodeLayer = {
  readonly scene: GpuFlowScene | undefined;
  readonly viewport?: GpuViewportInput | undefined;
  readonly visualScene?: HtmlSurfaceVisualScene | undefined;
  readonly visualSceneViewport?: GpuViewportInput | undefined;
};

export function useGpuFlowDebugGlobals<
  TNodeLayer extends GpuFlowDebugNodeLayer,
>({
  activeResizeNodeIdRef,
  containerRef,
  getViewport,
  interactionDiagnosticsRef,
  nodeInteractionRef,
  nodeLayerRef,
  retainedContentRuntimeState,
  viewportStore,
}: {
  readonly activeResizeNodeIdRef: MutableRefObject<string | null>;
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly getViewport: () => GpuViewportTuple;
  readonly interactionDiagnosticsRef: MutableRefObject<MutableGpuFlowInteractionDiagnostics>;
  readonly nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>;
  readonly nodeLayerRef: MutableRefObject<TNodeLayer>;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly viewportStore: GpuFlowViewportStoreApi;
}) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const getLiveViewport = () =>
      getRegisteredGpuFlowViewportRuntime(viewportStore)?.getViewportTuple() ??
      getViewport();
    const getSnapshot = () =>
      createGpuFlowInteractionDiagnosticsSnapshot({
        activeResizeNodeId: activeResizeNodeIdRef.current,
        diagnostics: interactionDiagnosticsRef.current,
        nodeInteractionActiveNodeId:
          nodeInteractionRef.current?.getActiveNodeId() ?? null,
        ownerDocument: containerRef.current?.ownerDocument ?? window.document,
        viewportState: {
          ...viewportStore.getState(),
          transform: getLiveViewport(),
        },
      });
    const getRetainedRows = () =>
      createGpuFlowRetainedRowsDebugSnapshot({
        container: containerRef.current,
        retainedContentRuntimeState,
        scene: nodeLayerRef.current.scene,
        viewport: getLiveViewport(),
      });
    const getVisualSurfaces = () =>
      createGpuFlowVisualSurfacesDebugSnapshot({
        container: containerRef.current,
        viewport:
          nodeLayerRef.current.visualSceneViewport ??
          nodeLayerRef.current.viewport ??
          getLiveViewport(),
        visualScene: nodeLayerRef.current.visualScene,
      });
    window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__ = getSnapshot;
    window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__ = getRetainedRows;
    window.__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__ = getVisualSurfaces;
    return () => {
      if (window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__ === getSnapshot) {
        delete window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__;
      }
      if (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__ === getRetainedRows) {
        delete window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__;
      }
      if (
        window.__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__ === getVisualSurfaces
      ) {
        delete window.__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__;
      }
    };
  }, [
    activeResizeNodeIdRef,
    containerRef,
    getViewport,
    interactionDiagnosticsRef,
    nodeInteractionRef,
    nodeLayerRef,
    retainedContentRuntimeState,
    viewportStore,
  ]);
}

export function createGpuFlowVisualSurfacesDebugSnapshot({
  container,
  viewport,
  visualScene,
}: {
  readonly container: HTMLElement | null;
  readonly viewport: GpuViewportInput;
  readonly visualScene: HtmlSurfaceVisualScene | undefined;
}): readonly GpuFlowVisualSurfaceDebugEntry[] {
  if (!container || !visualScene) {
    return [];
  }
  const context = {
    containerRect: container.getBoundingClientRect(),
    viewport,
  };
  return [
    ...visualScene.flatSurfaces.map((surface) =>
      toVisualSurfaceDebugEntry({ context, kind: "flat", surface }),
    ),
    ...visualScene.tiledFlatSurfaces.map((surface) =>
      toVisualSurfaceDebugEntry({
        context,
        flowRect: surface.rect,
        kind: "tiled-flat",
        surface,
      }),
    ),
    ...visualScene.meshSurfaces.map((surface) =>
      toVisualSurfaceDebugEntry({
        context,
        flowRect: surface.bounds,
        kind: "mesh",
        surface,
      }),
    ),
    ...visualScene.effectSurfaces.map((surface) =>
      toVisualSurfaceDebugEntry({
        context,
        flowRect: surface.bounds,
        kind: "effect",
        surface,
      }),
    ),
    ...visualScene.solidRoundedRectSurfaces.map((surface) =>
      toVisualSurfaceDebugEntry({
        context,
        flowRect: surface.rect,
        kind: "solid-rounded-rect",
        surface,
      }),
    ),
    ...visualScene.lateFlatSurfaces.map((surface) =>
      toVisualSurfaceDebugEntry({ context, kind: "late-flat", surface }),
    ),
  ];
}

function toVisualSurfaceDebugEntry({
  context,
  flowRect,
  kind,
  surface,
}: {
  readonly context: GpuFlowRetainedRowDebugContext;
  readonly flowRect?: GpuRect | undefined;
  readonly kind: string;
  readonly surface: {
    readonly height?: number | undefined;
    readonly surfaceId: string;
    readonly width?: number | undefined;
    readonly x?: number | undefined;
    readonly y?: number | undefined;
    readonly zIndex: number;
  };
}): GpuFlowVisualSurfaceDebugEntry {
  const rect = flowRect ?? {
    height: surface.height ?? 0,
    width: surface.width ?? 0,
    x: surface.x ?? 0,
    y: surface.y ?? 0,
  };
  const topLeft = flowToClientPosition({
    context,
    point: { x: rect.x, y: rect.y },
  });
  const bottomRight = flowToClientPosition({
    context,
    point: {
      x: rect.x + rect.width,
      y: rect.y + rect.height,
    },
  });
  return {
    clientRect: {
      height: bottomRight.y - topLeft.y,
      width: bottomRight.x - topLeft.x,
      x: topLeft.x,
      y: topLeft.y,
    },
    flowRect: rect,
    kind,
    surfaceId: surface.surfaceId,
    zIndex: surface.zIndex,
  };
}

export function createGpuFlowRetainedRowsDebugSnapshot({
  container,
  retainedContentRuntimeState,
  scene,
  viewport,
}: {
  readonly container: HTMLElement | null;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly scene: GpuFlowScene | undefined;
  readonly viewport: GpuViewportInput;
}): readonly GpuFlowRetainedRowDebugEntry[] {
  if (!container || !scene) {
    return [];
  }
  const context = {
    containerRect: container.getBoundingClientRect(),
    viewport,
  };
  return scene.contentSurfaces.flatMap((surface) =>
    createGpuFlowRetainedSurfaceDebugEntries({
      context,
      retainedContentRuntimeState,
      surface,
    }),
  );
}

function createGpuFlowRetainedSurfaceDebugEntries({
  context,
  retainedContentRuntimeState,
  surface,
}: {
  readonly context: GpuFlowRetainedRowDebugContext;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly surface: GpuContentSurface;
}): readonly GpuFlowRetainedRowDebugEntry[] {
  const retainedScene = surface.retainedScene;
  if (!retainedScene || !isGpuRetainedContentSurfaceWithScene(surface)) {
    return [];
  }
  const sampledRetainedScene = createGpuRetainedContentSampledSceneForSurface({
    scrollOffsets: getGpuRetainedContentRuntimeScrollOffsets(
      retainedContentRuntimeState,
    ),
    surface,
  });
  const clipBounds = getGpuFlowSurfaceClipBounds(surface);
  const sourceClipOffset = getGpuFlowSurfaceSourceClipOffset(
    surface,
    clipBounds,
  );
  return sampledRetainedScene.rows.map((row) =>
    createGpuFlowRetainedRowDebugEntry({
      clipBounds,
      context,
      controlHit: findGpuFlowRetainedRowControlHit(
        sampledRetainedScene.hitRecords,
        row.id,
      ),
      row,
      sampledRetainedScene,
      sourceClipOffset,
      surface,
    }),
  );
}

function createGpuFlowRetainedRowDebugEntry({
  clipBounds,
  context,
  controlHit,
  row,
  sampledRetainedScene,
  sourceClipOffset,
  surface,
}: {
  readonly clipBounds: GpuFlowSurfaceClipBounds;
  readonly context: GpuFlowRetainedRowDebugContext;
  readonly controlHit: GpuRetainedContentHitRecord | null;
  readonly row: GpuRetainedContentRow;
  readonly sampledRetainedScene: NonNullable<
    GpuContentSurface["retainedScene"]
  >;
  readonly sourceClipOffset: GpuPoint;
  readonly surface: GpuContentSurface;
}): GpuFlowRetainedRowDebugEntry {
  const rowTopLeft = flowToClientPosition({
    context,
    point: {
      x: surface.rect.x + row.projectedRect.x,
      y: surface.rect.y + row.projectedRect.y,
    },
  });
  const rowBottomRight = flowToClientPosition({
    context,
    point: {
      x: surface.rect.x + row.projectedRect.x + row.projectedRect.width,
      y: surface.rect.y + row.projectedRect.y + row.projectedRect.height,
    },
  });
  const controlClientTopLeft = controlHit
    ? flowToClientPosition({
        context,
        point: {
          x: surface.rect.x + controlHit.rect.x,
          y: surface.rect.y + controlHit.rect.y,
        },
      })
    : null;
  const controlClientBottomRight = controlHit
    ? flowToClientPosition({
        context,
        point: {
          x: surface.rect.x + controlHit.rect.x + controlHit.rect.width,
          y: surface.rect.y + controlHit.rect.y + controlHit.rect.height,
        },
      })
    : null;
  return {
    canvasCssSize: {
      height: Math.max(1, clipBounds.bottom - clipBounds.y),
      width: Math.max(1, clipBounds.right - clipBounds.x),
    },
    canvasSamplePoint: {
      x: row.projectedRect.x + 5 - sourceClipOffset.x,
      y:
        row.projectedRect.y +
        Math.max(3, Math.min(row.projectedRect.height - 3, 12)) -
        sourceClipOffset.y,
    },
    clientRect: {
      height: rowBottomRight.y - rowTopLeft.y,
      width: rowBottomRight.x - rowTopLeft.x,
      x: rowTopLeft.x,
      y: rowTopLeft.y,
    },
    controlClientRect:
      controlClientTopLeft && controlClientBottomRight
        ? {
            height: controlClientBottomRight.y - controlClientTopLeft.y,
            width: controlClientBottomRight.x - controlClientTopLeft.x,
            x: controlClientTopLeft.x,
            y: controlClientTopLeft.y,
          }
        : null,
    controlClientPoint: controlHit
      ? flowToClientPosition({
          context,
          point: {
            x: surface.rect.x + controlHit.rect.x + controlHit.rect.width / 2,
            y: surface.rect.y + controlHit.rect.y + controlHit.rect.height / 2,
          },
        })
      : null,
    controlKind: row.control?.kind ?? row.controlKind,
    labelClientPoint: flowToClientPosition({
      context,
      point: {
        x:
          surface.rect.x +
          row.projectedRect.x +
          Math.max(0, row.depth) * 14 +
          32,
        y: surface.rect.y + row.projectedRect.y + row.projectedRect.height / 2,
      },
    }),
    ownerSectionId: surface.ownerSectionId,
    rowId: row.id,
    rowLabel: row.label,
    rowState: { ...row.state },
    surfaceContentHeight: sampledRetainedScene.contentRect.height,
    surfaceId: surface.id,
    surfaceLogicalRowCount: sampledRetainedScene.visibleRange.rowCount,
    surfaceScrollOffset: { ...sampledRetainedScene.scrollOffset },
    surfaceViewportHeight: sampledRetainedScene.viewportRect.height,
  };
}

function findGpuFlowRetainedRowControlHit(
  hitRecords: readonly GpuRetainedContentHitRecord[],
  rowId: string,
): GpuRetainedContentHitRecord | null {
  return (
    hitRecords.find(
      (hit) => hit.kind === "control" && hit.ownerRowId === rowId,
    ) ?? null
  );
}

function getGpuFlowSurfaceClipBounds(
  surface: GpuContentSurface,
): GpuFlowSurfaceClipBounds {
  return {
    bottom: Math.min(
      surface.rect.y + surface.rect.height,
      surface.clipRect.y + surface.clipRect.height,
    ),
    right: Math.min(
      surface.rect.x + surface.rect.width,
      surface.clipRect.x + surface.clipRect.width,
    ),
    x: Math.max(surface.rect.x, surface.clipRect.x),
    y: Math.max(surface.rect.y, surface.clipRect.y),
  };
}

function getGpuFlowSurfaceSourceClipOffset(
  surface: GpuContentSurface,
  clipBounds: GpuFlowSurfaceClipBounds,
): GpuPoint {
  return {
    x: clipBounds.x - surface.rect.x,
    y: clipBounds.y - surface.rect.y,
  };
}

function flowToClientPosition({
  context,
  point,
}: {
  readonly context: GpuFlowRetainedRowDebugContext;
  readonly point: GpuPoint;
}): GpuPoint {
  const screenPoint = flowToScreenPosition(point, context.viewport);
  return {
    x: context.containerRect.left + screenPoint.x,
    y: context.containerRect.top + screenPoint.y,
  };
}
