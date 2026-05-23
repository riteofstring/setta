import { describe, expect, it } from "vitest";

import {
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { createGpuFlowSurfacePublicationPublisher } from "./flowSurfacePublicationCompletion";
import { createGpuFlowVisibleFrameHoldPreviousTokenForTest } from "./visibleFramePublicationTestUtils";

type GpuFlowSurfacePublicationTransaction = Parameters<
  ReturnType<typeof createGpuFlowSurfacePublicationPublisher>
>[0];

describe("GPU Flow surface publication completion", () => {
  it("records held-previous diagnostics without advancing committed visible projection state", () => {
    const committedState = visibleProjectionState({
      displayFrameId: 7,
      kind: "content-publication",
      sampleId: 1,
    });
    const heldState = visibleProjectionState({
      displayFrameId: 7,
      kind: "held-previous",
      sampleId: 2,
    });
    const visibleProjectionStateRef = { current: committedState };
    const visibleProjectionPublicationStateRef = { current: committedState };
    const publisher = createGpuFlowSurfacePublicationPublisher({
      abortPreparedCommittedSurfaceFrame: () => {
        throw new Error("Unexpected prepared committed surface abort.");
      },
      callbacksRef: { current: null },
      commitPreparedCommittedSurfaceFrame: () => {
        throw new Error("Unexpected prepared committed surface commit.");
      },
      projectCommittedBrowserVisualActors: () => {
        throw new Error("Unexpected browser visual actor projection.");
      },
      publishColdStartShellFrame: () => {},
      retainedDisplayFrameRef: { current: null },
      retainedRuntimeFrameRenderSignatureRef: { current: null },
      retainedRuntimeFrameSourceRenderSignatureRef: { current: null },
      runtimeCanvas: {} as HTMLCanvasElement,
      surfaceRef: { current: null },
      viewportRuntime: {
        applyOverlayTransforms: () => {
          throw new Error("Unexpected overlay projection transform.");
        },
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPublicationStateRef,
      visibleProjectionStateRef,
    } as unknown as Parameters<
      typeof createGpuFlowSurfacePublicationPublisher
    >[0]);

    publisher(
      heldPreviousPublicationTransaction({
        heldState,
        previousCommittedFrameId: committedState.committedFrame.displayFrameId,
      }),
    );

    expect(visibleProjectionStateRef.current).toBe(committedState);
    expect(visibleProjectionPublicationStateRef.current).toBe(heldState);
  });
});

function heldPreviousPublicationTransaction({
  heldState,
  previousCommittedFrameId,
}: {
  readonly heldState: GpuFlowVisibleProjectionState;
  readonly previousCommittedFrameId: number;
}): GpuFlowSurfacePublicationTransaction {
  return {
    coldStartShellPublication: null,
    completion: {
      debt: {
        content: false,
        motion: false,
      },
      outcome: "held-previous",
    },
    debtFrameRequest: null,
    followUpFrameRequests: [],
    heldPreviousVisibleProjectionState: null,
    outcome: {
      kind: "hold-previous",
      token: createGpuFlowVisibleFrameHoldPreviousTokenForTest({
        committedFrameId: previousCommittedFrameId,
        holdAgeFrames: 1,
        holdAgeMs: 16,
        projectionSample: heldState.sample,
      }),
    },
    preparedFrame: {
      contentPublicationFrame: {
        blockedErrorMessage: null,
        blockedPreparedCommittedSurfaceFrame: null,
        blockedPreservePreparationSnapshot: false,
        committedSurfaceFrame: null,
        committedSurfacePublicationEffect: null,
        heldPreparedCommittedSurfaceFrame: null,
        nodeLayerFrameStatePublication: null,
        retainedDisplayFrame: null,
        retainedRuntimeFrame: null,
      },
      motionProjectionFrame: {
        nodeLayerFrameStatePublication: null,
      },
      transactionOracle: null,
      visibleProjectionState: heldState,
    },
    previousCommittedFrameId,
    publicationDecision: {
      lane: "content",
      rawReasons: ["manual"],
      sample: heldState.sample,
    },
  } as unknown as GpuFlowSurfacePublicationTransaction;
}

function visibleProjectionState({
  displayFrameId,
  kind,
  sampleId,
}: {
  readonly displayFrameId: number;
  readonly kind: "content-publication" | "held-previous";
  readonly sampleId: number;
}): GpuFlowVisibleProjectionState {
  return {
    committedFrame: {
      coherence: {
        hitGenerationId: `hit:${displayFrameId}`,
      },
      displayFrameId,
    },
    debugState: {
      projectionTransactionId: `projection:${displayFrameId}:${sampleId}`,
    },
    sample: liveProjectionSample({
      id: sampleId,
      timestamp: sampleId * 16,
    }),
    transaction: {
      id: `projection:${displayFrameId}:${sampleId}`,
      kind,
      lane: "content",
    },
  } as GpuFlowVisibleProjectionState;
}

function liveProjectionSample({
  id,
  timestamp,
}: {
  readonly id: number;
  readonly timestamp: number;
}): GpuFlowLiveProjectionSample {
  return { id, timestamp } as GpuFlowLiveProjectionSample;
}
