import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import { createGpuFlowPresentableCommit } from "./visibleFramePublicationAuthority";

describe("GPU Flow visible publication authority behavior", () => {
  it("rejects commit authority for non-publishable frames", () => {
    expect(() =>
      createGpuFlowPresentableCommit({
        frame: committedSurfaceFrame({
          publishability: {
            blockingActorIds: ["actor-a"],
            kind: "hold-previous",
            reason: "visible-dom-control-not-projected",
          },
        }),
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/publishable committed surface frame/);
  });

  it("rejects commit authority for incoherent DOM/canvas presentation pairs", () => {
    expect(() =>
      createGpuFlowPresentableCommit({
        frame: committedSurfaceFrame({
          coherence: {
            domControlCommittedFrameId: 42,
          },
        }),
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/coherent DOM\/canvas presentation pair/);
  });
});

function committedSurfaceFrame({
  coherence = {},
  publishability = {
    blockingActorIds: [],
    kind: "publishable",
  },
}: {
  readonly coherence?: Partial<
    GpuFlowCommittedSurfaceFrame["coherence"]
  > | undefined;
  readonly publishability?:
    | Partial<GpuFlowCommittedSurfaceFrame["publishability"]>
    | undefined;
} = {}): GpuFlowCommittedSurfaceFrame {
  const displayFrameId = 7;
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
      ...coherence,
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
      ...publishability,
    },
    surfaceTransaction: null,
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

function liveProjectionSample(): GpuFlowLiveProjectionSample {
  return {
    id: 11,
  } as GpuFlowLiveProjectionSample;
}
