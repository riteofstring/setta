import { useEffect, type MutableRefObject, type RefObject } from "react";

import {
  createGpuFlowInteractionDiagnosticsSnapshot,
  type GpuFlowRetainedRowDebugEntry,
  type MutableGpuFlowInteractionDiagnostics,
} from "../interactionDiagnostics";
import type { GpuNodeInteractionDirtyController } from "../nodeInteractionDirty";
import type {
  GpuRetainedContentHitRecord,
  GpuRetainedContentRow,
} from "../retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import {
  flowToScreenPosition,
  type GpuPoint,
  type GpuViewportInput,
} from "../viewportMath";
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
};

export function useGpuFlowDebugGlobals<
  TNodeLayer extends GpuFlowDebugNodeLayer,
>({
  activeResizeNodeIdRef,
  containerRef,
  interactionDiagnosticsRef,
  nodeInteractionRef,
  nodeLayerRef,
  viewportStore,
}: {
  readonly activeResizeNodeIdRef: MutableRefObject<string | null>;
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly interactionDiagnosticsRef: MutableRefObject<MutableGpuFlowInteractionDiagnostics>;
  readonly nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>;
  readonly nodeLayerRef: MutableRefObject<TNodeLayer>;
  readonly viewportStore: GpuFlowViewportStoreApi;
}) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const getSnapshot = () =>
      createGpuFlowInteractionDiagnosticsSnapshot({
        activeResizeNodeId: activeResizeNodeIdRef.current,
        diagnostics: interactionDiagnosticsRef.current,
        nodeInteractionActiveNodeId:
          nodeInteractionRef.current?.getActiveNodeId() ?? null,
        ownerDocument: containerRef.current?.ownerDocument ?? window.document,
        viewportState: viewportStore.getState(),
      });
    const getRetainedRows = () =>
      createGpuFlowRetainedRowsDebugSnapshot({
        container: containerRef.current,
        scene: nodeLayerRef.current.scene,
        viewport: viewportStore.getState().transform,
      });
    window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__ = getSnapshot;
    window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__ = getRetainedRows;
    return () => {
      if (window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__ === getSnapshot) {
        delete window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__;
      }
      if (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__ === getRetainedRows) {
        delete window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__;
      }
    };
  }, [
    activeResizeNodeIdRef,
    containerRef,
    interactionDiagnosticsRef,
    nodeInteractionRef,
    nodeLayerRef,
    viewportStore,
  ]);
}

export function createGpuFlowRetainedRowsDebugSnapshot({
  container,
  scene,
  viewport,
}: {
  readonly container: HTMLElement | null;
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
    createGpuFlowRetainedSurfaceDebugEntries(surface, context),
  );
}

function createGpuFlowRetainedSurfaceDebugEntries(
  surface: GpuContentSurface,
  context: GpuFlowRetainedRowDebugContext,
): readonly GpuFlowRetainedRowDebugEntry[] {
  const retainedScene = surface.retainedScene;
  if (!retainedScene) {
    return [];
  }
  const clipBounds = getGpuFlowSurfaceClipBounds(surface);
  const sourceClipOffset = getGpuFlowSurfaceSourceClipOffset(
    surface,
    clipBounds,
  );
  return retainedScene.rows.map((row) =>
    createGpuFlowRetainedRowDebugEntry({
      clipBounds,
      context,
      controlHit: findGpuFlowRetainedRowControlHit(surface, row.id),
      row,
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
  sourceClipOffset,
  surface,
}: {
  readonly clipBounds: GpuFlowSurfaceClipBounds;
  readonly context: GpuFlowRetainedRowDebugContext;
  readonly controlHit: GpuRetainedContentHitRecord | null;
  readonly row: GpuRetainedContentRow;
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
    ownerSectionId: surface.ownerSectionId,
    rowId: row.id,
    rowLabel: row.label,
    rowState: { ...row.state },
    surfaceId: surface.id,
  };
}

function findGpuFlowRetainedRowControlHit(
  surface: GpuContentSurface,
  rowId: string,
): GpuRetainedContentHitRecord | null {
  const retainedScene = surface.retainedScene;
  if (!retainedScene) {
    return null;
  }
  return (
    retainedScene.hitRecords.find(
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
