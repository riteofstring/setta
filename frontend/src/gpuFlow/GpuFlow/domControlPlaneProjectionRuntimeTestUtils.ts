import type {
  GpuFlowCommittedSurfaceBrowserVisualReadiness,
  GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import { createGpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
import type { CommittedHtmlSurfaceTextureSnapshot } from "../htmlSurfaces/textures";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import {
  GPU_RETAINED_TEXT_LIKE_INTERACTION_POLICY,
  type GpuRetainedDomControlSourceDescriptor,
} from "../retainedDomControlScene";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import {
  normalizeGpuViewport,
  type GpuViewportInput,
  type GpuViewportTuple,
} from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import { createGpuFlowViewportStore } from "../viewportStore";
import {
  getGpuFlowBrowserVisualActorRuntimeForCommittedSurface,
  type GpuFlowBrowserVisualActorCandidate,
} from "./browserVisualActorRuntime";
import type { GpuFlowRetainedScrollOffsetGetter } from "./domControlPlane";
import {
  GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
  createGpuFlowBlockedPublicationToken,
  createGpuFlowCommitPublicationToken,
  createGpuFlowPresentableCommit,
} from "./visibleFramePublicationAuthority";

export function createMockViewportRuntime(
  initialViewport: GpuViewportTuple,
): GpuFlowViewportRuntime {
  let viewport = initialViewport;
  const overlayManagers: Array<{
    readonly applyViewport: (viewport: GpuViewportTuple) => void;
  }> = [];
  return {
    applyOverlayTransforms(nextViewport: GpuViewportInput = viewport) {
      viewport = normalizeViewportTuple(nextViewport);
      for (const manager of overlayManagers) {
        manager.applyViewport(viewport);
      }
    },
    getViewportTuple() {
      return viewport;
    },
    registerOverlayManager(manager) {
      overlayManagers.push(manager);
      manager.applyViewport(viewport);
      return () => {
        const index = overlayManagers.indexOf(manager);
        if (index >= 0) {
          overlayManagers.splice(index, 1);
        }
      };
    },
  } as unknown as GpuFlowViewportRuntime;
}

export function retainedRuntimeFrame(
  controls: readonly GpuRetainedDomControlSourceDescriptor[],
  frameId = 1,
): GpuRetainedRuntimeFrame {
  return {
    descriptors: {
      domControlSources: controls,
    },
    frameId,
  } as GpuRetainedRuntimeFrame;
}

export function createCommittedSurfaceRuntimeWithBrowserVisuals({
  frame,
  getRetainedScrollOffset,
  viewportRuntime,
  viewportStore,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly getRetainedScrollOffset?:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly viewportStore: ReturnType<typeof createGpuFlowViewportStore>;
}) {
  const committedSurfaceRuntime = createGpuFlowCommittedSurfaceRuntime(frame);
  publishBrowserVisualFrame({
    committedSurfaceRuntime,
    frame,
    getRetainedScrollOffset,
    viewportRuntime,
    viewportStore,
  });
  return committedSurfaceRuntime;
}

export function publishBrowserVisualFrame({
  committedSurfaceRuntime,
  frame,
  getRetainedScrollOffset,
  viewportRuntime,
  viewportStore,
}: {
  readonly committedSurfaceRuntime: ReturnType<
    typeof createGpuFlowCommittedSurfaceRuntime
  >;
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly getRetainedScrollOffset?:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly viewportStore: ReturnType<typeof createGpuFlowViewportStore>;
}): void {
  const browserVisualRuntime =
    getGpuFlowBrowserVisualActorRuntimeForCommittedSurface(
      committedSurfaceRuntime,
    );
  browserVisualRuntime.setDomControlProjectionEnvironment({
    getRetainedScrollOffset,
    viewportRuntime,
    viewportStore,
  });
  const token = publicationToken(frame);
  const candidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
    retainedDisplayFrame: retainedDisplayFrame({
      id: frame.displayFrameId,
      retainedRuntimeFrame: frame.retainedRuntimeFrame,
    }),
  });
  browserVisualRuntime.commitPreparedBrowserVisualActors({ candidate, token });
  committedSurfaceRuntime.publishCommittedContentFrame(token, frame);
}

export function stageBrowserVisualCandidate({
  actorId = null,
  browserVisualRuntime,
  candidate,
  reason = "snapshot-pending",
  sampleId = candidate.snapshot.frameIds.runtimeFrameId,
}: {
  readonly actorId?: string | null | undefined;
  readonly browserVisualRuntime: ReturnType<
    typeof getGpuFlowBrowserVisualActorRuntimeForCommittedSurface
  >;
  readonly candidate: GpuFlowBrowserVisualActorCandidate;
  readonly reason?: string | undefined;
  readonly sampleId?: number | undefined;
}): void {
  browserVisualRuntime.stagePreparedBrowserVisualActors({
    candidate,
    token: createGpuFlowBlockedPublicationToken({
      blockedReasons: [
        {
          actorId,
          family: "dom-control",
          reason,
        },
      ],
      frozenFrameId: GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
      projectionSample: { id: sampleId } as GpuFlowLiveProjectionSample,
    }),
  });
}

export function committedSurfaceFrame({
  displayFrameId,
  retainedRuntimeFrame,
}: {
  readonly displayFrameId: number;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): GpuFlowCommittedSurfaceFrame {
  return {
    actorGenerations: [],
    coherence: {
      canvasRetainedFrameId: displayFrameId,
      clipChainRevision: "clip",
      debugSnapshotFrameId: displayFrameId,
      domControlCommittedFrameId: displayFrameId,
      domIslandCommittedFrameId: displayFrameId,
      gpuNativeVisualCommittedFrameId: displayFrameId,
      hitGenerationId: `hit:${displayFrameId}`,
      htmlTextureOverlayCommittedFrameId: displayFrameId,
      retainedScrollRevision: 0,
    },
    displayFrameId,
    projectionHorizon: {
      textActorCoverage: {
        blockedAwaitingBrowserVisualActorIds: [],
        blockedAwaitingLiveHostActorIds: [],
        compatiblePreviousActorIds: [],
        exactLiveDomActorIds: [],
        exactSnapshotActorIds: [],
        trueHoleActorIds: [],
      },
    },
    publishability: {
      blockingActorIds: [],
      kind: "publishable",
    },
    retainedRuntimeFrame,
    sceneRevision: 1,
    surfaceTransaction: null,
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

export function publicationToken(frame: GpuFlowCommittedSurfaceFrame) {
  return createGpuFlowCommitPublicationToken({
    presentableCommit: createGpuFlowPresentableCommit({
      frame,
      projectionSample: {
        id: frame.displayFrameId,
      } as GpuFlowLiveProjectionSample,
    }),
  });
}

export function retainedDisplayFrame({
  id,
  retainedRuntimeFrame,
}: {
  readonly id: number;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): RetainedDisplayFrame {
  return {
    id,
    retainedRuntimeFrame,
  } as unknown as RetainedDisplayFrame;
}

export function mountedRowIds(): readonly string[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      "[data-gpu-flow-dom-control='true']",
    ),
  ].map((element) => element.dataset.gpuFlowDomControlRowId ?? "");
}

export function preparationRowIds(): readonly string[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      "[data-gpu-flow-dom-control-preparation='true']",
    ),
  ].map((element) => element.dataset.gpuFlowDomControlRowId ?? "");
}

export function domControlCoverageState(
  readiness:
    | GpuFlowBrowserVisualActorCandidate
    | GpuFlowCommittedSurfaceBrowserVisualReadiness,
  control: GpuRetainedDomControlSourceDescriptor,
) {
  return resolveDomControlReadiness(readiness).domControlReadinessByActorId.get(
    control.sourceId,
  )?.coverageState;
}

export function domControlReadinessResourceHandles(
  readiness:
    | GpuFlowBrowserVisualActorCandidate
    | GpuFlowCommittedSurfaceBrowserVisualReadiness,
  control: GpuRetainedDomControlSourceDescriptor,
) {
  return resolveDomControlReadiness(readiness).domControlReadinessByActorId.get(
    control.sourceId,
  )?.resourceHandles;
}

export function committedSnapshotTexture(
  texture: Partial<
    Pick<
      CommittedHtmlSurfaceTextureSnapshot,
      | "cssHeight"
      | "cssWidth"
      | "dirtyContent"
      | "dirtyResolution"
      | "lastUploadFrame"
      | "pixelHeight"
      | "pixelWidth"
      | "textureContentKey"
      | "zoomBucket"
    >
  > = {},
): CommittedHtmlSurfaceTextureSnapshot {
  return {
    cssHeight: 24,
    cssWidth: 273,
    dirtyContent: false,
    dirtyResolution: false,
    lastUploadFrame: 1,
    pixelHeight: 24,
    pixelWidth: 273,
    textureContentKey: "cache-key",
    zoomBucket: 1,
    ...texture,
  } as CommittedHtmlSurfaceTextureSnapshot;
}

export function domControl({
  active = false,
  index,
  snapshotSurfaceId = null,
  value = "",
  visualPolicy = "live-dom",
}: {
  readonly active?: boolean | undefined;
  readonly index: number;
  readonly snapshotSurfaceId?: string | null | undefined;
  readonly value?: string | undefined;
  readonly visualPolicy?:
    | GpuRetainedDomControlSourceDescriptor["visualPolicy"]
    | undefined;
}): GpuRetainedDomControlSourceDescriptor {
  const rect = { height: 24, width: 273, x: 0, y: index * 28 };
  const snapshotCacheKey = {
    appThemeRevision: "theme",
    caretVisibility: active ? "visible" : "hidden",
    codeMirrorThemeRevision: "codemirror-theme",
    compositionState: "inactive",
    cssStyleRevision: "value-style",
    defaultValue: "",
    devicePixelRatioBucket: 1,
    disabled: false,
    editorExtensionGeneration: "text|single-line|nowrap",
    editorKind: "text" as const,
    error: false,
    fontGeneration: "fonts",
    language: null,
    linePolicy: "single-line" as const,
    measuredLayoutMode: "single-line" as const,
    placeholder: "",
    rendererFamily: "text-like",
    selectionState: active ? "collapsed" : "none",
    sourceHeight: rect.height,
    sourceWidth: rect.width,
    syntaxGeneration: "plain-text",
    value,
    wrapLines: false,
    zoomBucket: 1,
  } as const;
  const textCoverageState = createTestTextCoverageState(active);
  const textCoverageRevision = JSON.stringify(textCoverageState);
  return {
    active,
    clipChainRevision: "clip",
    clipRectSurfaceCssPx: rect,
    controlId: `control-${index}`,
    controlRectSurfaceCssPx: rect,
    defaultValue: "",
    disabled: false,
    editorKind: "text",
    error: false,
    geometryRevision: "geometry",
    interactionPolicy: GPU_RETAINED_TEXT_LIKE_INTERACTION_POLICY,
    language: null,
    layerSlot: "dom-control-plane",
    lifecycleState: active ? "active-projected" : "passive-projected",
    linePolicy: "single-line",
    maxVisibleLines: 1,
    minVisibleLines: 1,
    projectionVisibility: "viewport-visible",
    rendererFamily: "text-like",
    role: "text-like",
    rowId: `row-${index}`,
    sectionClipRectFlowPx: { height: 10_000, width: 400, x: 0, y: 0 },
    sectionId: "section",
    sectionScrollOffset: { x: 0, y: 0 },
    sectionScrollRevision: 0,
    snapshotCacheKey,
    snapshotCacheKeyRevision: JSON.stringify(snapshotCacheKey),
    snapshotSurfaceId,
    sourceId: `source-${index}`,
    sourceKey: `source-${index}`,
    sourceRectCssPx: rect,
    surfaceId: "surface",
    textCoverageRevision,
    textCoverageState,
    value,
    valueStyleKey: "value-style",
    valueStyleRevision: "value-style",
    viewportRectCssPx: rect,
    viewportSampleRevision: "viewport",
    visualPolicy,
    visualSemantics: {
      accessibility: "visual-only-aria-hidden",
      focusable: false,
      pointer: "retained-activation-model",
      selectable: "none",
    },
    worldRectFlowPx: rect,
    wrapLines: false,
    zOrder: index,
  };
}

function normalizeViewportTuple(viewport: GpuViewportInput): GpuViewportTuple {
  const normalized = normalizeGpuViewport(viewport);
  return [normalized.x, normalized.y, normalized.zoom];
}

function resolveDomControlReadiness(
  readiness:
    | GpuFlowBrowserVisualActorCandidate
    | GpuFlowCommittedSurfaceBrowserVisualReadiness,
): GpuFlowCommittedSurfaceBrowserVisualReadiness {
  return "readiness" in readiness ? readiness.readiness : readiness;
}

function createTestTextCoverageState(active: boolean) {
  return {
    caret: active ? "visible" : "hidden",
    composition: "inactive",
    selection: active ? "collapsed" : "none",
  } as const;
}
