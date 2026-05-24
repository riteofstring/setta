import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import {
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  runGpuFlowVisibleFrameCoordinator,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
  type GpuFlowVisibleFramePublicationSample,
} from "./visibleFrameCoordinator";
import {
  createGpuFlowVisiblePublicationCanvasPresentationEvidence,
  type GpuFlowVisiblePublicationPresentationEvidence,
} from "./visibleFramePresentationEvidence";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowBlockedVisibleReason,
  GpuFlowCommitPublicationToken,
  GpuFlowHoldPreviousToken,
} from "./visibleFramePresentationProofs";
import { createGpuFlowVisibleFrameRequestCoordinator } from "./visibleFrameScheduling";

type GpuFlowVisibleFramePublicationTestCandidate = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly presentationEvidence: GpuFlowVisiblePublicationPresentationEvidence | null;
  readonly rendered: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export function createGpuFlowVisibleFrameCommitPublicationTokenForTest({
  frame,
  projectionSample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowCommitPublicationToken {
  const visibleProjectionState = {
    committedFrame: frame,
    heldPreviousProjection: null,
    sample: projectionSample,
    transaction: {
      committedFrameId: frame.displayFrameId,
      id: `test-content-publication:${frame.displayFrameId}:${projectionSample.id}`,
      kind: "content-publication",
      sample: projectionSample,
    },
  } as unknown as GpuFlowVisibleProjectionState;
  const result = runGpuFlowVisibleFramePublicationTestTokenKernel({
    contentFrame: createGpuFlowVisibleFramePublicationTestCandidate({
      presentationEvidence:
        createGpuFlowVisiblePublicationTestPresentationEvidence({
          visibleProjectionState,
        }),
      rendered: true,
      visibleProjectionState,
    }),
    projectionSample,
  });

  if (result.outcome.kind !== "commit") {
    throw new Error("Expected GPU Flow test token coordinator to commit.");
  }
  return result.outcome.token;
}

export function createGpuFlowVisibleFrameHoldPreviousTokenForTest({
  committedFrameId,
  holdAgeFrames,
  holdAgeMs,
  projectionSample,
}: {
  readonly committedFrameId: number;
  readonly holdAgeFrames: number;
  readonly holdAgeMs: number;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowHoldPreviousToken {
  const visibleProjectionState = {
    committedFrame: {
      actorGenerations: [],
      displayFrameId: committedFrameId,
    },
    heldPreviousProjection: {
      committedFrameId,
      consecutiveFrameCount: holdAgeFrames,
      heldDurationMs: holdAgeMs,
      maxHeldPreviousFramesExceeded: false,
      maxHeldPreviousMsExceeded: false,
      requestedProjectionSampleId: projectionSample.id,
    },
    sample: projectionSample,
    transaction: {
      committedFrameId,
      kind: "held-previous",
      sample: projectionSample,
    },
  } as unknown as GpuFlowVisibleProjectionState;
  const previousVisibleProjectionState = {
    committedFrame: visibleProjectionState.committedFrame,
    heldPreviousProjection: null,
    sample: {
      ...projectionSample,
      id: projectionSample.id - 1,
    },
    transaction: {
      committedFrameId,
      id: `test-content-publication:${committedFrameId}:${projectionSample.id - 1}`,
      kind: "content-publication",
      sample: {
        ...projectionSample,
        id: projectionSample.id - 1,
      },
    },
  } as unknown as GpuFlowVisibleProjectionState;
  const result = runGpuFlowVisibleFramePublicationTestTokenKernel({
    contentFrame: createGpuFlowVisibleFramePublicationTestCandidate({
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

export function createGpuFlowVisibleFrameBlockedPublicationTokenForTest({
  blockedReasons,
  frozenFrameId,
  projectionSample,
}: {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrameId: GpuFlowBlockedPublicationToken["frozenFrameId"];
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowBlockedPublicationToken {
  const result = runGpuFlowVisibleFramePublicationTestTokenKernel({
    contentFrame: createGpuFlowVisibleFramePublicationTestCandidate({
      blockedPublicationCandidate: {
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

function runGpuFlowVisibleFramePublicationTestTokenKernel({
  contentFrame = createGpuFlowVisibleFramePublicationTestCandidate(),
  previousVisibleProjectionState = null,
  projectionSample,
}: {
  readonly contentFrame?: GpuFlowVisibleFramePublicationTestCandidate;
  readonly previousVisibleProjectionState?:
    | GpuFlowVisibleProjectionState
    | null
    | undefined;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}) {
  return runGpuFlowVisibleFrameCoordinator<
    GpuFlowVisibleFramePublicationTestCandidate,
    GpuFlowVisibleFramePublicationTestCandidate
  >({
    prepareContentPublicationFrame: () => contentFrame,
    prepareMotionProjectionFrame: () => ({
      frame: createGpuFlowVisibleFramePublicationTestCandidate(),
      kind: "not-rendered",
    }),
    publish: () => {},
    sampleVisibleFramePublication: () =>
      createGpuFlowVisibleFramePublicationTestSample({
        previousVisibleProjectionState,
        projectionSample,
      }),
    scheduler: createGpuFlowVisibleFrameRequestCoordinator(),
  });
}

function createGpuFlowVisibleFramePublicationTestCandidate({
  blockedPublicationCandidate = null,
  presentationEvidence = null,
  rendered = false,
  visibleProjectionState = null,
}: Partial<GpuFlowVisibleFramePublicationTestCandidate> = {}): GpuFlowVisibleFramePublicationTestCandidate {
  return {
    blockedPublicationCandidate,
    presentationEvidence,
    rendered,
    visibleProjectionState,
  };
}

function createGpuFlowVisiblePublicationTestPresentationEvidence({
  visibleProjectionState,
}: {
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuFlowVisiblePublicationPresentationEvidence {
  return Object.freeze({
    canvasGenerationEvidence:
      createGpuFlowVisiblePublicationCanvasPresentationEvidence({
        committedFrame: visibleProjectionState.committedFrame,
        projectionSampleId: visibleProjectionState.sample.id,
        projectionTransactionId: visibleProjectionState.transaction.id,
      }),
  });
}

function createGpuFlowVisibleFramePublicationTestSample({
  previousVisibleProjectionState,
  projectionSample,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleFramePublicationSample {
  return {
    hasCommittedContentFrame: true,
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
