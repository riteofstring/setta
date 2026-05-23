import { describe, expect, it, vi } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import {
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { createGpuFlowVisibleFramePresenter } from "./visibleFramePresenter";
import {
  createGpuFlowVisibleFrameCommitPublicationTokenForTest,
  createGpuFlowVisibleFrameHoldPreviousTokenForTest,
} from "./visibleFrameTestUtils";

type GpuFlowSurfacePublicationTransaction = Parameters<
  ReturnType<typeof createGpuFlowVisibleFramePresenter>
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
    const presenter = createGpuFlowVisibleFramePresenter({
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
      runtimeCanvas: testCanvas(),
      surfaceRef: { current: null },
      viewportRuntime: {
        applyOverlayTransforms: () => {
          throw new Error("Unexpected overlay projection transform.");
        },
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPublicationStateRef,
      visibleProjectionStateRef,
    } as unknown as Parameters<typeof createGpuFlowVisibleFramePresenter>[0]);

    presenter(
      heldPreviousPublicationTransaction({
        heldState,
        previousCommittedFrameId: committedState.committedFrame.displayFrameId,
      }),
    );

    expect(visibleProjectionStateRef.current).toBe(committedState);
    expect(visibleProjectionPublicationStateRef.current).toBe(heldState);
  });

  it("does not complete scheduler debt when committed publication fails before visibility advances", () => {
    const committedFrame = committedSurfaceFrame({ displayFrameId: 12 });
    const selectedState = visibleProjectionState({
      displayFrameId: committedFrame.displayFrameId,
      kind: "content-publication",
      sampleId: 12,
    });
    const token = createGpuFlowVisibleFrameCommitPublicationTokenForTest({
      frame: committedFrame,
      projectionSample: selectedState.sample,
    });
    let schedulerCompletionCount = 0;
    const presenter = createGpuFlowVisibleFramePresenter({
      abortPreparedCommittedSurfaceFrame: () => {
        throw new Error("Unexpected prepared committed surface abort.");
      },
      callbacksRef: { current: null },
      commitPreparedCommittedSurfaceFrame: () => {
        throw new Error("commit failed before visible publication");
      },
      projectCommittedBrowserVisualActors: () => {
        throw new Error("Unexpected browser visual actor projection.");
      },
      publishColdStartShellFrame: () => {
        throw new Error("Unexpected cold-start shell publication.");
      },
      retainedDisplayFrameRef: { current: null },
      retainedRuntimeFrameRenderSignatureRef: { current: null },
      retainedRuntimeFrameSourceRenderSignatureRef: { current: null },
      runtimeCanvas: testCanvas(),
      surfaceRef: { current: null },
      viewportRuntime: {
        applyOverlayTransforms: () => {
          throw new Error("Unexpected overlay projection transform.");
        },
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPublicationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<typeof createGpuFlowVisibleFramePresenter>[0]);

    expect(() =>
      presenter(
        committedPublicationTransaction({
          committedFrame,
          onCompleteSchedulerFrame: () => {
            schedulerCompletionCount += 1;
          },
          selectedState,
          token,
        }),
      ),
    ).toThrow(/commit failed before visible publication/);
    expect(schedulerCompletionCount).toBe(0);
  });

  it("submits prepared canvas work only during committed publication", () => {
    const committedFrame = committedSurfaceFrame({ displayFrameId: 21 });
    const selectedState = visibleProjectionState({
      displayFrameId: committedFrame.displayFrameId,
      kind: "content-publication",
      sampleId: 21,
    });
    const token = createGpuFlowVisibleFrameCommitPublicationTokenForTest({
      frame: committedFrame,
      projectionSample: selectedState.sample,
    });
    const submitCanvas = vi.fn();
    const presenter = createGpuFlowVisibleFramePresenter({
      abortPreparedCommittedSurfaceFrame: () => {
        throw new Error("Unexpected prepared committed surface abort.");
      },
      callbacksRef: {
        current: {
          framePerformanceReporter: undefined,
          onNodeLayerFrame: () => {},
        },
      },
      commitPreparedCommittedSurfaceFrame: () => true,
      projectCommittedBrowserVisualActors: () => {},
      publishColdStartShellFrame: () => {},
      retainedDisplayFrameRef: { current: null },
      retainedRuntimeFrameRenderSignatureRef: { current: null },
      retainedRuntimeFrameSourceRenderSignatureRef: { current: null },
      runtimeCanvas: testCanvas(),
      surfaceRef: { current: null },
      viewportRuntime: {
        applyOverlayTransforms: () => {},
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPublicationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<typeof createGpuFlowVisibleFramePresenter>[0]);

    presenter(
      committedPublicationTransaction({
        committedFrame,
        nodeLayerFrameStatePublication: {
          callbacksRef: {
            current: {
              framePerformanceReporter: undefined,
              onNodeLayerFrame: () => {},
            },
          },
          layerResult: {
            budgetExhausted: false,
            canvasSubmission: { submit: submitCanvas },
            domTransformParkedNodeIds: [],
            domTransformUpdatedNodeIds: [],
            visibleNodeIds: [],
            visualScene: {
              effectSurfaces: [],
              flatSurfaces: [],
              lateFlatSurfaces: [],
              meshSurfaces: [],
              solidRoundedRectSurfaces: [],
              tiledFlatSurfaces: [],
            },
          },
          nodeInteractionRef: { current: null },
          nodeLayerRef: { current: {} },
          retainedRuntimeFrame: {},
          retainedTexturePageFollowUpFrame: false,
          surfaceRef: { current: null },
          switchAnimationFollowUpFrame: false,
          transformOnlyPaintNodeIdsRef: { current: new Set() },
          viewport: [0, 0, 1],
          viewportFrame: false,
          visibleNodeIdsRef: { current: new Set() },
        },
        onCompleteSchedulerFrame: () => {},
        selectedState,
        token,
      }),
    );

    expect(submitCanvas).toHaveBeenCalledOnce();
  });

  it("lets scheduler debt own duplicate retained follow-up frame requests", () => {
    const committedFrame = committedSurfaceFrame({ displayFrameId: 31 });
    const selectedState = visibleProjectionState({
      displayFrameId: committedFrame.displayFrameId,
      kind: "content-publication",
      sampleId: 31,
    });
    const token = createGpuFlowVisibleFrameCommitPublicationTokenForTest({
      frame: committedFrame,
      projectionSample: selectedState.sample,
    });
    const requestFrame = vi.fn();
    const presenter = createGpuFlowVisibleFramePresenter({
      abortPreparedCommittedSurfaceFrame: () => {
        throw new Error("Unexpected prepared committed surface abort.");
      },
      callbacksRef: { current: null },
      commitPreparedCommittedSurfaceFrame: () => true,
      projectCommittedBrowserVisualActors: () => {},
      publishColdStartShellFrame: () => {},
      retainedDisplayFrameRef: { current: null },
      retainedRuntimeFrameRenderSignatureRef: { current: null },
      retainedRuntimeFrameSourceRenderSignatureRef: { current: null },
      runtimeCanvas: testCanvas(),
      surfaceRef: { current: { requestFrame } },
      viewportRuntime: {
        applyOverlayTransforms: () => {},
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPublicationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<typeof createGpuFlowVisibleFramePresenter>[0]);

    presenter(
      committedPublicationTransaction({
        committedFrame,
        debtFrameRequest: {
          delayMs: null,
          frameReason: "texture-upload",
        },
        followUpFrameRequests: ["texture-upload"],
        onCompleteSchedulerFrame: () => {},
        selectedState,
        token,
      }),
    );

    expect(requestFrame).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
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
    completeSchedulerFrame: () => ({
      completion: {
        debt: {
          content: false,
          motion: false,
        },
        outcome: "held-previous",
      },
      debtFrameRequest: null,
    }),
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
        heldPreparedCommittedSurfaceFrame: null,
        nodeLayerFrameStatePublication: null,
        retainedDisplayFrame: null,
        retainedRuntimeFrame: null,
      },
      motionProjectionFrame: {
        nodeLayerFrameStatePublication: null,
      },
      transactionProof: null,
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

function committedPublicationTransaction({
  committedFrame,
  debtFrameRequest = null,
  followUpFrameRequests = [],
  nodeLayerFrameStatePublication = null,
  onCompleteSchedulerFrame,
  selectedState,
  token,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly debtFrameRequest?: unknown;
  readonly followUpFrameRequests?: readonly string[];
  readonly nodeLayerFrameStatePublication?: unknown;
  readonly onCompleteSchedulerFrame: () => void;
  readonly selectedState: GpuFlowVisibleProjectionState;
  readonly token: ReturnType<
    typeof createGpuFlowVisibleFrameCommitPublicationTokenForTest
  >;
}): GpuFlowSurfacePublicationTransaction {
  return {
    coldStartShellPublication: {
      frame: null,
      token,
    },
    completeSchedulerFrame: () => {
      onCompleteSchedulerFrame();
      return {
        completion: {
          debt: {
            content: false,
            maintenance: false,
            motion: false,
          },
          outcome: "commit",
        },
        debtFrameRequest,
      };
    },
    followUpFrameRequests,
    heldPreviousVisibleProjectionState: null,
    outcome: {
      debtProof: {
        content: true,
        maintenance: false,
        motion: false,
      },
      kind: "commit",
      token,
    },
    preparedFrame: {
      contentPublicationFrame: {
        blockedErrorMessage: null,
        blockedPreparedCommittedSurfaceFrame: null,
        blockedPreservePreparationSnapshot: false,
        committedSurfaceFrame: committedFrame,
        heldPreparedCommittedSurfaceFrame: null,
        nodeLayerFrameStatePublication,
        retainedDisplayFrame: null,
        retainedRuntimeFrame: null,
      },
      motionProjectionFrame: {
        nodeLayerFrameStatePublication: null,
      },
      transactionProof: null,
      visibleProjectionState: selectedState,
    },
    previousCommittedFrameId: null,
    publicationDecision: {
      lane: "content",
      rawReasons: ["manual"],
      sample: selectedState.sample,
      schedulerState: "content-catchup",
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
    committedFrame: committedSurfaceFrame({ displayFrameId }),
    debugState: {
      committedFrameId: displayFrameId,
      gestureOwner: "idle",
      heldPreviousDurationMs: 0,
      heldPreviousFrameCount: 0,
      heldPreviousOverBudget: false,
      heldPreviousReason: null,
      heldPreviousRequestedSampleId: null,
      lane: "content",
      projectionSampleId: sampleId,
      projectionTransactionId: `projection:${displayFrameId}:${sampleId}`,
      transactionKind: kind,
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

function committedSurfaceFrame({
  displayFrameId,
}: {
  readonly displayFrameId: number;
}): GpuFlowCommittedSurfaceFrame {
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
    displayFrameId,
    presentationProof: createGpuFlowCommittedSurfacePresentationProof({
      coherence,
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
    },
    surfaceTransaction: null,
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

function testCanvas(): HTMLCanvasElement {
  return {
    closest: () => null,
    dataset: {},
  } as unknown as HTMLCanvasElement;
}

function liveProjectionSample({
  id,
  timestamp,
}: {
  readonly id: number;
  readonly timestamp: number;
}): GpuFlowLiveProjectionSample {
  return {
    id,
    retainedScrollOffsets: new Map(),
    timestamp,
    viewport: [0, 0, 1],
  } as unknown as GpuFlowLiveProjectionSample;
}
