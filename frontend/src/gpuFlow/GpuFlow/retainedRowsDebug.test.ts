import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import { createGpuFlowCommittedSurfaceDebugEntry } from "./retainedRowsDebug";
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
});

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
    retainedRuntimeFrame: {
      frameId: displayFrameId,
    } as GpuRetainedRuntimeFrame,
    sceneRevision: 1,
    viewportSample: [0, 0, 1],
  } as unknown as GpuFlowCommittedSurfaceFrame;
}
