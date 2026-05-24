import { describe, expect, it, vi } from "vitest";

import {
  createGpuFlowPreparedContentPresentationProof,
  type GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import {
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  presentGpuFlowVisibleFramePresentationFrame,
  type GpuFlowVisibleFramePresentationRuntime,
} from "./visibleFramePresentation";
import { createGpuFlowVisibleFramePresentationTokenForTest } from "./visibleFrameTestUtils";

type GpuFlowSurfacePresentationTransaction = Parameters<
  typeof presentGpuFlowVisibleFramePresentationFrame
>[0]["presentationTransaction"];

function createTestVisibleFramePresentationBoundary(
  runtime: GpuFlowVisibleFramePresentationRuntime,
): (presentationTransaction: GpuFlowSurfacePresentationTransaction) => void {
  return (presentationTransaction) =>
    presentGpuFlowVisibleFramePresentationFrame({
      ...runtime,
      presentationTransaction,
    });
}

describe("GPU Flow surface presentation motion projection", () => {
  it("does not promote visible state when prepared canvas submission fails", () => {
    const preparedContentFrame = createPreparedContentFrame({
      displayFrameId: 22,
    });
    const selectedState = visibleProjectionState({
      displayFrameId: preparedContentFrame.displayFrameId,
      kind: "prepared-content",
      sampleId: 22,
    });
    const token = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: preparedContentFrame,
      projectionSample: selectedState.sample,
    });
    const presentPreparedContentFrame = vi.fn(() => true);
    const projectPresentedBrowserVisualActors = vi.fn();
    const validatePreparedContentFrame = vi.fn();
    let reducerCompletionCount = 0;
    const presentationBoundary = createTestVisibleFramePresentationBoundary({
      abortPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame abort.");
      },
      callbacksRef: {
        current: {
          framePerformanceReporter: undefined,
          onNodeLayerFrame: () => {},
        },
      },
      presentPreparedContentFrame,
      projectPresentedBrowserVisualActors,
      presentColdStartShellFrame: () => {},
      retainedDisplayFrameRef: { current: null },
      retainedRuntimeFrameRenderSignatureRef: { current: null },
      retainedRuntimeFrameSourceRenderSignatureRef: { current: null },
      runtimeCanvas: testCanvas(),
      surfaceRef: { current: null },
      validatePreparedContentFrame,
      viewportRuntime: {
        applyOverlayTransforms: () => {
          throw new Error("Unexpected overlay projection transform.");
        },
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPresentationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<
      typeof createTestVisibleFramePresentationBoundary
    >[0]);

    expect(() =>
      presentationBoundary(
        presentOutcomeTransaction({
          preparedContentFrame,
          nodeLayerFrameStatePresentation: nodeLayerFrameStatePresentation({
            submitCanvas: () => {
              throw new Error("canvas submission failed");
            },
          }),
          onCompleteSchedulerFrame: () => {
            reducerCompletionCount += 1;
          },
          selectedState,
          token,
        }),
      ),
    ).toThrow(/canvas submission failed/);
    expect(validatePreparedContentFrame).toHaveBeenCalledOnce();
    expect(presentPreparedContentFrame).not.toHaveBeenCalled();
    expect(projectPresentedBrowserVisualActors).not.toHaveBeenCalled();
    expect(reducerCompletionCount).toBe(0);
  });

  it("does not publish background content preparation during a motion projection", () => {
    const backgroundContentFrame = createPreparedContentFrame({
      displayFrameId: 24,
    });
    const selectedState = visibleProjectionState({
      displayFrameId: 7,
      kind: "motion-projection",
      sampleId: 24,
    });
    const token = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: selectedState.preparedContentFrame,
      projectionSample: selectedState.sample,
    });
    const presentPreparedContentFrame = vi.fn(() => true);
    const projectPresentedBrowserVisualActors = vi.fn();
    const validatePreparedContentFrame = vi.fn();
    const contentSubmit = vi.fn(() => {
      throw new Error("background content must not submit");
    });
    const motionSubmit = vi.fn();
    const presentationBoundary = createTestVisibleFramePresentationBoundary({
      abortPreparedContentFrame: () => {
        throw new Error("Unexpected prepared content frame abort.");
      },
      callbacksRef: {
        current: {
          framePerformanceReporter: undefined,
          onNodeLayerFrame: () => {},
        },
      },
      presentPreparedContentFrame,
      projectPresentedBrowserVisualActors,
      presentColdStartShellFrame: () => {},
      retainedDisplayFrameRef: { current: null },
      retainedRuntimeFrameRenderSignatureRef: { current: null },
      retainedRuntimeFrameSourceRenderSignatureRef: { current: null },
      runtimeCanvas: testCanvas(),
      surfaceRef: { current: null },
      validatePreparedContentFrame,
      viewportRuntime: {
        applyOverlayTransforms: () => {},
      },
      visibleOverlayProjectionKeyRef: { current: null },
      visibleProjectionPresentationStateRef: { current: null },
      visibleProjectionStateRef: { current: null },
    } as unknown as Parameters<
      typeof createTestVisibleFramePresentationBoundary
    >[0]);

    presentationBoundary(
      presentOutcomeTransaction({
        preparedContentFrame: backgroundContentFrame,
        nodeLayerFrameStatePresentation: nodeLayerFrameStatePresentation({
          submitCanvas: contentSubmit,
        }),
        motionNodeLayerFrameStatePresentation: nodeLayerFrameStatePresentation({
          submitCanvas: motionSubmit,
        }),
        onCompleteSchedulerFrame: () => {},
        reducerLane: "motion",
        selectedState,
        token,
      }),
    );

    expect(contentSubmit).not.toHaveBeenCalled();
    expect(motionSubmit).toHaveBeenCalledOnce();
    expect(validatePreparedContentFrame).not.toHaveBeenCalled();
    expect(presentPreparedContentFrame).not.toHaveBeenCalled();
    expect(projectPresentedBrowserVisualActors).toHaveBeenCalledOnce();
  });
});

function presentOutcomeTransaction({
  preparedContentFrame,
  motionNodeLayerFrameStatePresentation = null,
  nodeLayerFrameStatePresentation = null,
  onCompleteSchedulerFrame,
  reducerLane = "content",
  selectedState,
  token,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
  readonly motionNodeLayerFrameStatePresentation?: unknown;
  readonly nodeLayerFrameStatePresentation?: unknown;
  readonly onCompleteSchedulerFrame: () => void;
  readonly reducerLane?: "content" | "maintenance" | "motion";
  readonly selectedState: GpuFlowVisibleProjectionState;
  readonly token: ReturnType<
    typeof createGpuFlowVisibleFramePresentationTokenForTest
  >;
}): GpuFlowSurfacePresentationTransaction {
  return {
    coldStartShellPresentation: {
      frame: null,
      token,
    },
    completeReducerFrame: () => {
      onCompleteSchedulerFrame();
      return {
        completion: {
          debt: {
            content: false,
            maintenance: false,
            motion: false,
          },
          outcome: "present",
        },
        debtFrameRequest: null,
      };
    },
    followUpFrameRequests: [],
    heldPreviousVisibleProjectionState: null,
    outcome: {
      debtProof: {
        content: true,
        maintenance: false,
        motion: false,
      },
      kind: "present",
      token,
    },
    preparedFrame: {
      contentPreparationFrame: {
        blockedErrorMessage: null,
        blockedPreparedContentFrame: null,
        blockedPreservePreparationSnapshot: false,
        preparedContentFrame,
        heldPreparedContentFrame: null,
        nodeLayerFrameStatePresentation,
        retainedDisplayFrame: null,
        retainedRuntimeFrame: null,
      },
      motionProjectionFrame: {
        nodeLayerFrameStatePresentation: motionNodeLayerFrameStatePresentation,
      },
      transactionProof: null,
      visibleProjectionState: selectedState,
    },
    previousContentFrameId: null,
    presentationFrameContext: presentationFrameContextForTest(),
    reducerDecision: {
      lane: reducerLane,
      rawReasons: ["manual"],
      sample: selectedState.sample,
      reducerState: "content-catchup",
    },
  } as unknown as GpuFlowSurfacePresentationTransaction;
}

function presentationFrameContextForTest() {
  return {
    activeEditorPins: [],
    budgetDecision: {
      browserVisualRepair: null,
      preparationBudget: {
        selectedResourceDebtIds: [],
      },
    },
  };
}

function nodeLayerFrameStatePresentation({
  submitCanvas,
}: {
  readonly submitCanvas: () => void;
}) {
  return {
    callbacksRef: {
      current: {
        framePerformanceReporter: undefined,
        onNodeLayerFrame: () => {},
      },
    },
    layerResult: {
      budgetExhausted: false,
      canvasSubmission: { submit: submitCanvas },
      domTransformSubmission: null,
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
    visibleNodeIdsRef: { current: new Set() },
    viewport: [0, 0, 1],
    viewportFrame: false,
  };
}

function visibleProjectionState({
  displayFrameId,
  kind,
  sampleId,
}: {
  readonly displayFrameId: number;
  readonly kind: "prepared-content" | "motion-projection";
  readonly sampleId: number;
}): GpuFlowVisibleProjectionState {
  const lane = kind === "motion-projection" ? "motion" : "content";
  return {
    preparedContentFrame: createPreparedContentFrame({ displayFrameId }),
    debugState: {
      preparedContentFrameId: displayFrameId,
      gestureOwner: "idle",
      heldPreviousDurationMs: 0,
      heldPreviousFrameCount: 0,
      heldPreviousOverBudget: false,
      heldPreviousReason: null,
      heldPreviousRequestedSampleId: null,
      lane,
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
      lane,
    },
  } as GpuFlowVisibleProjectionState;
}

function createPreparedContentFrame({
  displayFrameId,
}: {
  readonly displayFrameId: number;
}): GpuFlowPreparedContentFrame {
  const coherence = {
    canvasRetainedFrameId: displayFrameId,
    clipChainRevision: "clip",
    debugSnapshotFrameId: displayFrameId,
    domControlPreparedFrameId: displayFrameId,
    domIslandPreparedFrameId: displayFrameId,
    gpuNativeVisualPreparedFrameId: displayFrameId,
    hitGenerationId: `hit:${displayFrameId}`,
    htmlTextureOverlayPreparedFrameId: displayFrameId,
    retainedScrollRevision: 0,
  };
  return {
    actorGenerations: [],
    coherence,
    displayFrameId,
    presentationProof: createGpuFlowPreparedContentPresentationProof({
      coherence,
      displayFrameId,
    }),
    projectionHorizon: {
      obligations: {
        visibleActorIds: [],
      },
      textActorCoverage: {
        blockedAwaitingBrowserVisualActorIds: [],
        blockedAwaitingLiveHostActorIds: [],
        compatiblePreviousActorIds: [],
        exactLiveDomActorIds: [],
        exactSnapshotActorIds: [],
        trueHoleActorIds: [],
      },
    },
    presentability: {
      blockingActorIds: [],
      kind: "presentable",
    },
    surfaceTransaction: null,
  } as unknown as GpuFlowPreparedContentFrame;
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
