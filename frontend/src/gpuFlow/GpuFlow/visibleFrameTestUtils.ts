import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import {
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  runGpuFlowVisibleFrameCoordinator,
  type GpuFlowVisibleFrameBlockedPresentationCandidate,
  type GpuFlowVisibleFramePresentationSample,
} from "./visibleFrameCoordinator";
import {
  createGpuFlowVisibleFramePresentationCanvasPresentationEvidence,
  createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence,
  createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence,
  type GpuFlowVisibleFramePresentationEvidence,
} from "./visibleFramePresentationEvidence";
import type {
  GpuFlowBlockedPresentationToken,
  GpuFlowBlockedVisibleReason,
  GpuFlowHoldPreviousToken,
  GpuFlowVisibleFramePresentationToken,
} from "./visibleFramePresentationProofs";
import { createGpuFlowVisibleFrameReducerRuntime } from "./visibleFrameReducerRuntime";

type GpuFlowVisibleFramePresentationTestCandidate = {
  readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly presentationEvidence: GpuFlowVisibleFramePresentationEvidence | null;
  readonly rendered: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export function createGpuFlowVisibleFramePresentationTokenForTest({
  frame,
  projectionSample,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleFramePresentationToken {
  const visibleProjectionState = {
    preparedContentFrame: frame,
    heldPreviousProjection: null,
    sample: projectionSample,
    transaction: {
      preparedContentFrameId: frame.displayFrameId,
      id: `test-prepared-content:${frame.displayFrameId}:${projectionSample.id}`,
      kind: "prepared-content",
      sample: projectionSample,
    },
  } as unknown as GpuFlowVisibleProjectionState;
  const result = runGpuFlowVisibleFramePresentationTestTokenKernel({
    contentFrame: createGpuFlowVisibleFramePresentationTestCandidate({
      presentationEvidence:
        createGpuFlowVisibleFramePresentationTestPresentationEvidence({
          visibleProjectionState,
        }),
      rendered: true,
      visibleProjectionState,
    }),
    projectionSample,
  });

  if (result.outcome.kind !== "present") {
    throw new Error("Expected GPU Flow test token coordinator to present.");
  }
  return result.outcome.token;
}

export function createGpuFlowVisibleFrameHoldPreviousTokenForTest({
  preparedContentFrameId,
  holdAgeFrames,
  holdAgeMs,
  projectionSample,
}: {
  readonly preparedContentFrameId: number;
  readonly holdAgeFrames: number;
  readonly holdAgeMs: number;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowHoldPreviousToken {
  const visibleProjectionState = {
    preparedContentFrame: {
      actorGenerations: [],
      displayFrameId: preparedContentFrameId,
    },
    heldPreviousProjection: {
      preparedContentFrameId,
      consecutiveFrameCount: holdAgeFrames,
      heldDurationMs: holdAgeMs,
      maxHeldPreviousFramesExceeded: false,
      maxHeldPreviousMsExceeded: false,
      requestedProjectionSampleId: projectionSample.id,
    },
    sample: projectionSample,
    transaction: {
      preparedContentFrameId,
      kind: "held-previous",
      sample: projectionSample,
    },
  } as unknown as GpuFlowVisibleProjectionState;
  const previousVisibleProjectionState = {
    preparedContentFrame: visibleProjectionState.preparedContentFrame,
    heldPreviousProjection: null,
    sample: {
      ...projectionSample,
      id: projectionSample.id - 1,
    },
    transaction: {
      preparedContentFrameId,
      id: `test-prepared-content:${preparedContentFrameId}:${projectionSample.id - 1}`,
      kind: "prepared-content",
      sample: {
        ...projectionSample,
        id: projectionSample.id - 1,
      },
    },
  } as unknown as GpuFlowVisibleProjectionState;
  const result = runGpuFlowVisibleFramePresentationTestTokenKernel({
    contentFrame: createGpuFlowVisibleFramePresentationTestCandidate({
      rendered: true,
      visibleProjectionState,
    }),
    previousVisibleProjectionState,
    projectionSample,
  });

  if (result.outcome.kind !== "hold-previous") {
    throw new Error(
      "Expected GPU Flow test token coordinator to hold previous.",
    );
  }
  return result.outcome.token;
}

export function createGpuFlowVisibleFrameBlockedPresentationTokenForTest({
  blockedReasons,
  frozenFrameId,
  projectionSample,
}: {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrameId: GpuFlowBlockedPresentationToken["frozenFrameId"];
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowBlockedPresentationToken {
  const result = runGpuFlowVisibleFramePresentationTestTokenKernel({
    contentFrame: createGpuFlowVisibleFramePresentationTestCandidate({
      blockedPresentationCandidate: {
        blockedReasons,
        frozenFrameId,
      },
    }),
    projectionSample,
  });

  if (result.outcome.kind !== "blocked") {
    throw new Error("Expected GPU Flow test token coordinator to block.");
  }
  return result.outcome.token;
}

function runGpuFlowVisibleFramePresentationTestTokenKernel({
  contentFrame = createGpuFlowVisibleFramePresentationTestCandidate(),
  previousVisibleProjectionState = null,
  projectionSample,
}: {
  readonly contentFrame?: GpuFlowVisibleFramePresentationTestCandidate;
  readonly previousVisibleProjectionState?:
    | GpuFlowVisibleProjectionState
    | null
    | undefined;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}) {
  return runGpuFlowVisibleFrameCoordinator<
    GpuFlowVisibleFramePresentationTestCandidate,
    GpuFlowVisibleFramePresentationTestCandidate
  >({
    prepareContentPreparationFrame: () => contentFrame,
    prepareMotionProjectionFrame: () => ({
      frame: createGpuFlowVisibleFramePresentationTestCandidate(),
      kind: "not-rendered",
    }),
    onPresentation: () => {},
    sampleVisibleFramePresentation: () =>
      createGpuFlowVisibleFramePresentationTestSample({
        previousVisibleProjectionState,
        projectionSample,
      }),
    reducerRuntime: createGpuFlowVisibleFrameReducerRuntime(),
  });
}

function createGpuFlowVisibleFramePresentationTestCandidate({
  blockedPresentationCandidate = null,
  presentationEvidence = null,
  rendered = false,
  visibleProjectionState = null,
}: Partial<GpuFlowVisibleFramePresentationTestCandidate> = {}): GpuFlowVisibleFramePresentationTestCandidate {
  return {
    blockedPresentationCandidate,
    presentationEvidence,
    rendered,
    visibleProjectionState,
  };
}

function createGpuFlowVisibleFramePresentationTestPresentationEvidence({
  visibleProjectionState,
}: {
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuFlowVisibleFramePresentationEvidence {
  return Object.freeze({
    canvasGenerationEvidence:
      createGpuFlowVisibleFramePresentationCanvasPresentationEvidence({
        preparedContentFrame: visibleProjectionState.preparedContentFrame,
        projectionSampleId: visibleProjectionState.sample.id,
        projectionTransactionId: visibleProjectionState.transaction.id,
      }),
    domTransformEvidence:
      createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence({
        preparedContentFrame: visibleProjectionState.preparedContentFrame,
        projectionSampleId: visibleProjectionState.sample.id,
        projectionTransactionId: visibleProjectionState.transaction.id,
      }),
    textureEvictionEvidence:
      createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence({
        preparedContentFrame: visibleProjectionState.preparedContentFrame,
        projectionSampleId: visibleProjectionState.sample.id,
        projectionTransactionId: visibleProjectionState.transaction.id,
      }),
  });
}

function createGpuFlowVisibleFramePresentationTestSample({
  previousVisibleProjectionState,
  projectionSample,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleFramePresentationSample {
  return {
    hasPresentedContentFrame: true,
    previousVisibleProjectionState,
    rawReasons: ["manual"],
    runtimeViewportFrame: false,
    sample: projectionSample,
    timestamp: getGpuFlowTestProjectionSampleTimestamp(projectionSample),
    viewportInteractionActive: false,
  };
}

function getGpuFlowTestProjectionSampleTimestamp(
  projectionSample: GpuFlowLiveProjectionSample,
): number {
  return (
    (projectionSample as GpuFlowLiveProjectionSample & { timestamp?: number })
      .timestamp ?? projectionSample.id
  );
}
