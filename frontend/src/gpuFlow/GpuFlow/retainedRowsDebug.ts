import { useEffect, type MutableRefObject, type RefObject } from "react";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { HtmlSurfaceVisualScene } from "../htmlSurfaces/visualScene";
import {
  createGpuFlowInteractionDiagnosticsSnapshot,
  type GpuFlowCommittedSurfaceDebugEntry,
  type GpuFlowCommittedSurfaceTextActorProofDebugEntry,
  type GpuFlowRetainedRowDebugEntry,
  type GpuFlowRetainedSceneDebugSummary,
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
  normalizeGpuViewport,
  type GpuPoint,
  type GpuRect,
  type GpuViewportInput,
  type GpuViewportTuple,
} from "../viewportMath";
import { getRegisteredGpuFlowViewportRuntime } from "../viewportRuntimeRegistry";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import { createGpuFlowVisibleFrameActorManifestDiagnostics } from "./visibleFrameActorManifestDiagnostics";
import type { GpuFlowVisibleFramePresentationIdentity } from "./visibleFrameTypes";

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
  readonly htmlSurfaceNativeVisuals?:
    | readonly { readonly surfaceId: string }[]
    | undefined;
  readonly retainedContentRowHoverTarget?:
    | { readonly rowId: string; readonly surfaceId: string }
    | null
    | undefined;
  readonly retainedRuntimeFrame?:
    | {
        readonly descriptors: {
          readonly htmlSurfaceNativeVisuals: readonly {
            readonly surfaceId: string;
          }[];
        };
        readonly frameId: number;
      }
    | null
    | undefined;
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
  getCommittedSurfaceFrame,
  getPresentationIdentity,
  interactionDiagnosticsRef,
  nodeInteractionRef,
  nodeLayerRef,
  requestFrame,
  retainedContentRuntimeState,
  viewportStore,
}: {
  readonly activeResizeNodeIdRef: MutableRefObject<string | null>;
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly getViewport: () => GpuViewportTuple;
  readonly getCommittedSurfaceFrame?:
    | (() => GpuFlowCommittedSurfaceFrame | null)
    | undefined;
  readonly getPresentationIdentity?:
    | (() => GpuFlowVisibleFramePresentationIdentity | null)
    | undefined;
  readonly interactionDiagnosticsRef: MutableRefObject<MutableGpuFlowInteractionDiagnostics>;
  readonly nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>;
  readonly nodeLayerRef: MutableRefObject<TNodeLayer>;
  readonly requestFrame?: ((reason: GpuFrameReason) => void) | undefined;
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
    const getVisualSceneViewport = () =>
      nodeLayerRef.current.visualSceneViewport ??
      nodeLayerRef.current.viewport ??
      getLiveViewport();
    const setViewport = (viewport: GpuViewportInput) => {
      viewportStore.getState().setFitViewInitializationState({
        fitViewOnInit: false,
        fitViewOnInitDone: true,
        fitViewOnInitOptions: undefined,
      });
      const viewportRuntime =
        getRegisteredGpuFlowViewportRuntime(viewportStore);
      if (viewportRuntime) {
        viewportRuntime.applyViewportCommand(viewport);
        viewportRuntime.flushObserverSnapshot();
        return;
      }
      viewportStore.getState().setTransform(viewport);
    };
    const getSnapshot = () => {
      const presentationIdentity = getPresentationIdentity?.() ?? null;
      return createGpuFlowInteractionDiagnosticsSnapshot({
        activeResizeNodeId: activeResizeNodeIdRef.current,
        committedSurfaceFrame: createGpuFlowCommittedSurfaceDebugEntry({
          frame: getCommittedSurfaceFrame?.() ?? null,
          presentationIdentity,
        }),
        diagnostics: interactionDiagnosticsRef.current,
        nodeInteractionActiveNodeId:
          nodeInteractionRef.current?.getActiveNodeId() ?? null,
        ownerDocument: containerRef.current?.ownerDocument ?? window.document,
        presentationIdentity,
        viewportState: {
          ...viewportStore.getState(),
          transform: getLiveViewport(),
        },
      });
    };
    const getRetainedRows = () =>
      createGpuFlowRetainedRowsDebugSnapshot({
        container: containerRef.current,
        retainedContentRuntimeState,
        scene: nodeLayerRef.current.scene,
        viewport: getVisualSceneViewport(),
      });
    const getRetainedRowCount = () =>
      countGpuFlowRetainedRowsDebugSnapshot({
        retainedContentRuntimeState,
        scene: nodeLayerRef.current.scene,
      });
    const getRetainedSceneSummary = () =>
      createGpuFlowRetainedSceneDebugSummary(nodeLayerRef.current.scene);
    const requestDebugFrame = (reason: GpuFrameReason = "manual") => {
      requestFrame?.(reason);
    };
    const getVisualSurfaces = () =>
      createGpuFlowVisualSurfacesDebugSnapshot({
        container: containerRef.current,
        viewport: getVisualSceneViewport(),
        visualScene: nodeLayerRef.current.visualScene,
      });
    const getRetainedNativeVisuals = () =>
      createGpuFlowRetainedNativeVisualDebugSnapshot(nodeLayerRef.current);
    window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__ = getSnapshot;
    window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__ = getRetainedRows;
    window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROW_COUNT__ = getRetainedRowCount;
    window.__SETTA_GPU_FLOW_DEBUG_RETAINED_SCENE_SUMMARY__ =
      getRetainedSceneSummary;
    window.__SETTA_GPU_FLOW_DEBUG_REQUEST_FRAME__ = requestDebugFrame;
    window.__SETTA_GPU_FLOW_DEBUG_SET_VIEWPORT__ = setViewport;
    window.__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__ = getVisualSurfaces;
    window.__SETTA_GPU_FLOW_DEBUG_RETAINED_NATIVE_VISUALS__ =
      getRetainedNativeVisuals;
    return () => {
      if (window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__ === getSnapshot) {
        delete window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__;
      }
      if (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__ === getRetainedRows) {
        delete window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__;
      }
      if (
        window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROW_COUNT__ ===
        getRetainedRowCount
      ) {
        delete window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROW_COUNT__;
      }
      if (
        window.__SETTA_GPU_FLOW_DEBUG_RETAINED_SCENE_SUMMARY__ ===
        getRetainedSceneSummary
      ) {
        delete window.__SETTA_GPU_FLOW_DEBUG_RETAINED_SCENE_SUMMARY__;
      }
      if (window.__SETTA_GPU_FLOW_DEBUG_REQUEST_FRAME__ === requestDebugFrame) {
        delete window.__SETTA_GPU_FLOW_DEBUG_REQUEST_FRAME__;
      }
      if (window.__SETTA_GPU_FLOW_DEBUG_SET_VIEWPORT__ === setViewport) {
        delete window.__SETTA_GPU_FLOW_DEBUG_SET_VIEWPORT__;
      }
      if (
        window.__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__ === getVisualSurfaces
      ) {
        delete window.__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__;
      }
      if (
        window.__SETTA_GPU_FLOW_DEBUG_RETAINED_NATIVE_VISUALS__ ===
        getRetainedNativeVisuals
      ) {
        delete window.__SETTA_GPU_FLOW_DEBUG_RETAINED_NATIVE_VISUALS__;
      }
    };
  }, [
    activeResizeNodeIdRef,
    containerRef,
    getViewport,
    getCommittedSurfaceFrame,
    getPresentationIdentity,
    interactionDiagnosticsRef,
    nodeInteractionRef,
    nodeLayerRef,
    requestFrame,
    retainedContentRuntimeState,
    viewportStore,
  ]);
}

function createGpuFlowRetainedNativeVisualDebugSnapshot(
  layer: GpuFlowDebugNodeLayer,
) {
  const layerNativeVisuals = layer.htmlSurfaceNativeVisuals ?? [];
  const retainedRuntimeFrame = layer.retainedRuntimeFrame;
  const retainedRuntimeNativeVisuals =
    retainedRuntimeFrame?.descriptors.htmlSurfaceNativeVisuals ?? [];
  const visualSceneSolidSurfaces =
    layer.visualScene?.solidRoundedRectSurfaces ?? [];
  return {
    layerNativeVisualSurfaceIds: layerNativeVisuals.map(
      (visual) => visual.surfaceId,
    ),
    retainedRuntimeFrameId: retainedRuntimeFrame?.frameId ?? null,
    retainedRuntimeNativeVisualSurfaceIds: retainedRuntimeNativeVisuals.map(
      (visual) => visual.surfaceId,
    ),
    rowHoverTarget: layer.retainedContentRowHoverTarget ?? null,
    visualSceneSolidSurfaceIds: visualSceneSolidSurfaces.map(
      (visual) => visual.surfaceId,
    ),
  };
}

function createGpuFlowRetainedSceneDebugSummary(
  scene: GpuFlowScene | undefined,
): GpuFlowRetainedSceneDebugSummary {
  if (!scene) {
    return {
      controlKinds: [],
      nodeCount: 0,
      retainedRowCount: 0,
      surfaceCount: 0,
    };
  }
  const controlKinds = new Set<string>();
  let retainedRowCount = 0;
  let surfaceCount = 0;
  for (const surface of scene.contentSurfaces) {
    if (!isGpuRetainedContentSurfaceWithScene(surface)) {
      continue;
    }
    surfaceCount += 1;
    const rows = surface.retainedScene.rows;
    retainedRowCount += rows.length;
    for (const row of rows) {
      if (row.controlKind) {
        controlKinds.add(row.controlKind);
      }
    }
  }
  return {
    controlKinds: [...controlKinds].sort((left, right) =>
      left.localeCompare(right),
    ),
    nodeCount: scene.sections.length,
    retainedRowCount,
    surfaceCount,
  };
}

function countGpuFlowRetainedRowsDebugSnapshot({
  retainedContentRuntimeState,
  scene,
}: {
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly scene: GpuFlowScene | undefined;
}): number {
  if (!scene) {
    return 0;
  }
  let count = 0;
  for (const surface of scene.contentSurfaces) {
    count += countGpuFlowRetainedSurfaceDebugEntries({
      retainedContentRuntimeState,
      surface,
    });
  }
  return count;
}

function countGpuFlowRetainedSurfaceDebugEntries({
  retainedContentRuntimeState,
  surface,
}: {
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly surface: GpuContentSurface;
}): number {
  const retainedScene = surface.retainedScene;
  if (!retainedScene || !isGpuRetainedContentSurfaceWithScene(surface)) {
    return 0;
  }
  const sampledRetainedScene = createGpuRetainedContentSampledSceneForSurface({
    scrollOffsets: getGpuRetainedContentRuntimeScrollOffsets(
      retainedContentRuntimeState,
    ),
    surface,
  });
  const clipBounds = getGpuFlowSurfaceClipBounds(surface);
  return sampledRetainedScene.rows.filter((row) =>
    retainedRowLabelPointInsideClipBounds(row, surface, clipBounds),
  ).length;
}

export function createGpuFlowCommittedSurfaceDebugEntry({
  frame,
  presentationIdentity,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame | null;
  readonly presentationIdentity: GpuFlowVisibleFramePresentationIdentity | null;
}): GpuFlowCommittedSurfaceDebugEntry | null {
  if (!frame) {
    return null;
  }
  const presentationDebug =
    createCommittedSurfaceDebugPresentationIdentity(presentationIdentity);
  return {
    actorCount: frame.diagnostics.actorCount,
    actorManifest: createGpuFlowVisibleFrameActorManifestDiagnostics({
      frame,
      presentationId: presentationDebug.presentationId,
    }),
    blockingActorIds: frame.displayCompleteness.blockingActorIds,
    canvasRetainedFrameId: frame.coherence.canvasRetainedFrameId,
    clipChainRevision: frame.coherence.clipChainRevision,
    contentFrameId: presentationDebug.contentFrameId,
    debugSnapshotFrameId: frame.coherence.debugSnapshotFrameId,
    displayFrameId: frame.displayFrameId,
    displayCompletenessStatus: frame.displayCompleteness.status,
    domControlActorCount: frame.diagnostics.domControlActorCount,
    domControlCommittedFrameId: frame.coherence.domControlCommittedFrameId,
    domIslandActorCount: frame.diagnostics.domIslandActorCount,
    domIslandCommittedFrameId: frame.coherence.domIslandCommittedFrameId,
    gpuNativeVisualActorCount: frame.diagnostics.gpuNativeVisualActorCount,
    gpuNativeVisualCommittedFrameId:
      frame.coherence.gpuNativeVisualCommittedFrameId,
    hitGenerationId: frame.coherence.hitGenerationId,
    htmlTextureActorCount: frame.diagnostics.htmlTextureActorCount,
    htmlTextureOverlayCommittedFrameId:
      frame.coherence.htmlTextureOverlayCommittedFrameId,
    presentationId: presentationDebug.presentationId,
    presentationProjectionSampleId: presentationDebug.projectionSampleId,
    projectedVisibleNonemptyDomControlCount:
      frame.displayCompleteness.projectedVisibleNonemptyDomControlCount,
    projectionHorizon: createCommittedSurfaceDebugProjectionHorizon(frame),
    publishabilityKind: frame.publishability.kind,
    publishabilityReason: getCommittedSurfaceDebugPublishabilityReason(
      frame.publishability,
    ),
    retainedScrollRevision: frame.coherence.retainedScrollRevision,
    retainedPageActorCount: frame.diagnostics.retainedPageActorCount,
    sceneRevision: frame.sceneRevision,
    textActorProofs: frame.actorGenerations
      .filter((actor) => actor.textCoverageProof)
      .map(toCommittedSurfaceTextActorProofDebugEntry),
    visibleNonemptyDomControlCount:
      frame.displayCompleteness.visibleNonemptyDomControlCount,
    viewportSample: flowViewportInputToDebugEntry(frame.viewportSample),
  };
}

function createCommittedSurfaceDebugPresentationIdentity(
  presentationIdentity: GpuFlowVisibleFramePresentationIdentity | null,
): {
  readonly contentFrameId:
    | GpuFlowVisibleFramePresentationIdentity["contentFrameId"]
    | null;
  readonly presentationId:
    | GpuFlowVisibleFramePresentationIdentity["presentationId"]
    | null;
  readonly projectionSampleId:
    | GpuFlowVisibleFramePresentationIdentity["projectionSampleId"]
    | null;
} {
  return {
    contentFrameId: presentationIdentity?.contentFrameId ?? null,
    presentationId: presentationIdentity?.presentationId ?? null,
    projectionSampleId: presentationIdentity?.projectionSampleId ?? null,
  };
}

function createCommittedSurfaceDebugProjectionHorizon(
  frame: GpuFlowCommittedSurfaceFrame,
): GpuFlowCommittedSurfaceDebugEntry["projectionHorizon"] {
  const textCoverage = frame.projectionHorizon.textActorCoverage;
  return {
    retainedScrollSurfaceCount:
      frame.projectionHorizon.retainedScrollSurfaces.length,
    textActorBlockedAwaitingBrowserVisualCount:
      textCoverage.blockedAwaitingBrowserVisualActorIds.length,
    textActorCompatiblePreviousCount:
      textCoverage.compatiblePreviousActorIds.length,
    textActorExactCoverageCount:
      textCoverage.exactLiveDomActorIds.length +
      textCoverage.exactSnapshotActorIds.length,
    textActorExactSnapshotCount: textCoverage.exactSnapshotActorIds.length,
    textActorTrueHoleCount: textCoverage.trueHoleActorIds.length,
    viewportOverscanCssPx: frame.projectionHorizon.viewport.overscanCssPx,
  };
}

function getCommittedSurfaceDebugPublishabilityReason(
  publishability: GpuFlowCommittedSurfaceFrame["publishability"],
): string | null {
  return "reason" in publishability ? publishability.reason : null;
}

function flowViewportInputToDebugEntry(viewport: GpuViewportInput): {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
} {
  const normalizedViewport = normalizeGpuViewport(viewport);
  return {
    x: normalizedViewport.x,
    y: normalizedViewport.y,
    zoom: normalizedViewport.zoom,
  };
}

function toCommittedSurfaceTextActorProofDebugEntry(
  actor: GpuFlowCommittedSurfaceFrame["actorGenerations"][number],
): GpuFlowCommittedSurfaceTextActorProofDebugEntry {
  const browserProof = toCommittedSurfaceBrowserVisualProofDebugEntry(actor);
  return {
    active: actor.active,
    actorId: actor.actorId,
    actualInteraction: browserProof.actualInteraction,
    actualVisual: browserProof.actualVisual,
    canonicalActorId: actor.canonicalActorId,
    controlId: actor.controlId,
    focusIdentity: actor.focusIdentity,
    ownerSurfaceId: actor.ownerSurfaceId,
    projectionCoverage: actor.textCoverageProof?.projectionCoverage ?? null,
    requiredInteraction: browserProof.requiredInteraction,
    requiredVisual: browserProof.requiredVisual,
    rowId: actor.rowId,
    visualProof: browserProof.actualVisual,
  };
}

function toCommittedSurfaceBrowserVisualProofDebugEntry(
  actor: GpuFlowCommittedSurfaceFrame["actorGenerations"][number],
): Pick<
  GpuFlowCommittedSurfaceTextActorProofDebugEntry,
  | "actualInteraction"
  | "actualVisual"
  | "requiredInteraction"
  | "requiredVisual"
> {
  const proof = actor.browserVisual?.proof;
  if (!proof) {
    return {
      actualInteraction: null,
      actualVisual: null,
      requiredInteraction: null,
      requiredVisual: null,
    };
  }
  return {
    actualInteraction: proof.actualInteraction,
    actualVisual: proof.actualVisual,
    requiredInteraction: proof.requiredInteraction,
    requiredVisual: proof.requiredVisual,
  };
}

function createGpuFlowVisualSurfacesDebugSnapshot({
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

function createGpuFlowRetainedRowsDebugSnapshot({
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
  return sampledRetainedScene.rows
    .filter((row) =>
      retainedRowLabelPointInsideClipBounds(row, surface, clipBounds),
    )
    .map((row) =>
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

function retainedRowLabelPointInsideClipBounds(
  row: GpuRetainedContentRow,
  surface: GpuContentSurface,
  clipBounds: GpuFlowSurfaceClipBounds,
): boolean {
  const labelPoint = {
    x: surface.rect.x + row.projectedRect.x + Math.max(0, row.depth) * 14 + 32,
    y: surface.rect.y + row.projectedRect.y + row.projectedRect.height / 2,
  };
  return (
    labelPoint.x >= clipBounds.x &&
    labelPoint.x <= clipBounds.right &&
    labelPoint.y >= clipBounds.y &&
    labelPoint.y <= clipBounds.bottom
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
    surfaceViewportFlowRect: {
      height: sampledRetainedScene.viewportRect.height,
      width: sampledRetainedScene.viewportRect.width,
      x: surface.rect.x + sampledRetainedScene.viewportRect.x,
      y: surface.rect.y + sampledRetainedScene.viewportRect.y,
    },
    surfaceViewportHeight: sampledRetainedScene.viewportRect.height,
    surfaceViewportWidth: sampledRetainedScene.viewportRect.width,
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
