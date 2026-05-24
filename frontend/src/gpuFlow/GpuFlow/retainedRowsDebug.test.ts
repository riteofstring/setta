import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import {
  createGpuRetainedContentRuntimeState,
  setGpuRetainedContentRuntimeScrollOffset,
} from "../retainedContentRuntimeState";
import {
  createGpuFlowCommittedSurfaceDebugEntry,
  resolveGpuFlowRetainedRowsDebugScrollOffsets,
} from "./retainedRowsDebug";
import {
  createGpuFlowContentFrameId,
  createGpuFlowPresentationId,
  type GpuFlowVisibleFramePresentationIdentity,
} from "./visibleFrameTypes";

describe("GPU Flow retained rows debug", () => {
  it("reports the current visible presentation identity on debug snapshots", () => {
    const identity: GpuFlowVisibleFramePresentationIdentity = {
      contentFrameId: createGpuFlowContentFrameId("7"),
      presentationId: createGpuFlowPresentationId("7:11:projected"),
      projectionSampleId: 11,
    };
    const debugEntry = createGpuFlowCommittedSurfaceDebugEntry({
      frame: committedFrame(7),
      presentationIdentity: identity,
    });

    expect(debugEntry).toMatchObject({
      contentFrameId: identity.contentFrameId,
      displayFrameId: 7,
      hitGenerationId: "hit:7",
      presentationId: identity.presentationId,
      presentationProjectionSampleId: 11,
    });
  });

  it("uses presented retained scroll offsets for retained row debug snapshots", () => {
    const presentedOffsets = new Map([["surface-a", { x: 0, y: 0 }]]);
    const selectedOffsets = resolveGpuFlowRetainedRowsDebugScrollOffsets({
      retainedContentRuntimeState: runtimeState([
        ["surface-a", { x: 0, y: 0 }],
      ]),
      visibleProjectionState: {
        sample: {
          retainedScrollOffsets: presentedOffsets,
          retainedScrollRevision: 1,
        },
      } as never,
    });

    expect(selectedOffsets.get("surface-a")).toEqual({ x: 0, y: 0 });
  });

  it("uses runtime retained scroll offsets when the visible sample is stale", () => {
    const presentedOffsets = new Map([["surface-b", { x: 0, y: 0 }]]);
    const selectedOffsets = resolveGpuFlowRetainedRowsDebugScrollOffsets({
      retainedContentRuntimeState: runtimeState([
        ["surface-a", { x: 0, y: 48 }],
        ["surface-b", { x: 0, y: 96 }],
      ]),
      visibleProjectionState: {
        sample: {
          retainedScrollOffsets: presentedOffsets,
          retainedScrollRevision: 2,
        },
      } as never,
    });

    expect(selectedOffsets.get("surface-a")).toEqual({ x: 0, y: 48 });
    expect(selectedOffsets.get("surface-b")).toEqual({ x: 0, y: 96 });
  });
});

function runtimeState(
  offsets: readonly [string, { readonly x: number; readonly y: number }][],
) {
  const state = createGpuRetainedContentRuntimeState();
  for (const [surfaceId, scrollOffset] of offsets) {
    setGpuRetainedContentRuntimeScrollOffset({
      scrollOffset,
      state,
      surfaceId,
    });
  }
  return state;
}

function committedFrame(displayFrameId: number): GpuFlowCommittedSurfaceFrame {
  const coherence = {
    canvasRetainedFrameId: displayFrameId,
    clipChainRevision: "clip",
    debugSnapshotFrameId: displayFrameId,
    domControlCommittedFrameId: displayFrameId,
    domIslandCommittedFrameId: displayFrameId,
    gpuNativeVisualCommittedFrameId: displayFrameId,
    hitGenerationId: `hit:${displayFrameId}`,
    htmlTextureOverlayCommittedFrameId: displayFrameId,
    retainedScrollRevision: 0,
  };
  return {
    actorGenerations: [],
    coherence,
    diagnostics: {
      actorCount: 0,
      domControlActorCount: 0,
      domIslandActorCount: 0,
      gpuNativeVisualActorCount: 0,
      htmlTextureActorCount: 0,
      retainedPageActorCount: 0,
    },
    displayCompleteness: {
      blockingActorIds: [],
      projectedVisibleNonemptyDomControlCount: 0,
      status: "complete",
      visibleNonemptyDomControlCount: 0,
    },
    displayFrameId,
    presentationProof: createGpuFlowCommittedSurfacePresentationProof({
      coherence,
      displayFrameId,
    }),
    projectionHorizon: {
      retainedScrollSurfaces: [],
      textActorCoverage: {
        blockedAwaitingBrowserVisualActorIds: [],
        blockedAwaitingLiveHostActorIds: [],
        compatiblePreviousActorIds: [],
        exactLiveDomActorIds: [],
        exactSnapshotActorIds: [],
        trueHoleActorIds: [],
      },
      viewport: {
        overscanCssPx: 0,
      },
    },
    publishability: {
      kind: "publishable",
    },
    retainedRuntimeFrame: null,
    sceneRevision: 1,
    viewportSample: [0, 0, 1],
  } as unknown as GpuFlowCommittedSurfaceFrame;
}
