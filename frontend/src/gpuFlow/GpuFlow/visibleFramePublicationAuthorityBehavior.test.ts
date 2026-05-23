import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import { assertGpuFlowCommitPublicationToken } from "./visibleFramePublicationAuthority";
import { createGpuFlowVisibleFrameCommitPublicationToken } from "./visibleFramePublicationKernel";

describe("GPU Flow visible publication authority behavior", () => {
  it("rejects commit authority for non-publishable frames", () => {
    expect(() =>
      createGpuFlowVisibleFrameCommitPublicationToken({
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
      createGpuFlowVisibleFrameCommitPublicationToken({
        frame: committedSurfaceFrame({
          coherence: {
            domControlCommittedFrameId: 42,
          },
        }),
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/DOM and canvas generations for the same committed frame/);
  });

  it("rejects commit authority when the DOM generation is not staged and exposable", () => {
    const frame = committedSurfaceFrame();

    expect(() =>
      createGpuFlowVisibleFrameCommitPublicationToken({
        frame: {
          ...frame,
          presentationProof: {
            ...frame.presentationProof,
            domGeneration: {
              ...frame.presentationProof.domGeneration,
              staged: false,
            },
          },
        } as unknown as GpuFlowCommittedSurfaceFrame,
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/DOM generation staged and exposable/);
  });

  it("rejects commit authority when the canvas generation is not prepared and exposable", () => {
    const frame = committedSurfaceFrame();

    expect(() =>
      createGpuFlowVisibleFrameCommitPublicationToken({
        frame: {
          ...frame,
          presentationProof: {
            ...frame.presentationProof,
            canvasGeneration: {
              ...frame.presentationProof.canvasGeneration,
              prepared: false,
            },
          },
        } as unknown as GpuFlowCommittedSurfaceFrame,
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/canvas generation prepared and exposable/);
  });

  it("rejects commit authority when DOM and canvas generations are not in the same presentation batch", () => {
    const frame = committedSurfaceFrame();

    expect(() =>
      createGpuFlowVisibleFrameCommitPublicationToken({
        frame: {
          ...frame,
          presentationProof: {
            ...frame.presentationProof,
            domGeneration: {
              ...frame.presentationProof.domGeneration,
              presentationBatchId: "presentation:other",
            },
          },
        } as unknown as GpuFlowCommittedSurfaceFrame,
        projectionSample: liveProjectionSample(),
      }),
    ).toThrow(/same presentation batch/);
  });

  it("rejects commit tokens when the DOM/canvas presentation proof changes after minting", () => {
    const frame = committedSurfaceFrame();
    const token = createGpuFlowVisibleFrameCommitPublicationToken({
      frame,
      projectionSample: liveProjectionSample(),
    });

    expect(() =>
      assertGpuFlowCommitPublicationToken({
        frame: {
          ...frame,
          presentationProof: {
            ...frame.presentationProof,
            domGeneration: {
              ...frame.presentationProof.domGeneration,
              presentationBatchId: "presentation:stale-dom",
            },
          },
        } as unknown as GpuFlowCommittedSurfaceFrame,
        token,
      }),
    ).toThrow(/commit publication token for the same visible frame/);
  });
});

function committedSurfaceFrame({
  coherence = {},
  publishability = {
    blockingActorIds: [],
    kind: "publishable",
  },
}: {
  readonly coherence?:
    | Partial<GpuFlowCommittedSurfaceFrame["coherence"]>
    | undefined;
  readonly publishability?:
    | Partial<GpuFlowCommittedSurfaceFrame["publishability"]>
    | undefined;
} = {}): GpuFlowCommittedSurfaceFrame {
  const displayFrameId = 7;
  const committedCoherence = {
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
  };
  return {
    actorGenerations: [],
    coherence: committedCoherence,
    displayFrameId,
    presentationProof: createGpuFlowCommittedSurfacePresentationProof({
      coherence: committedCoherence,
      displayFrameId,
    }),
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
