import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
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
  createGpuFlowVisibleFramePresentationCanvasPresentationEvidence,
  createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence,
  createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence,
  type GpuFlowVisibleFramePresentationEvidence,
} from "./visibleFramePresentationEvidence";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowBlockedVisibleReason,
  GpuFlowHoldPreviousToken,
  GpuFlowVisibleFramePresentationToken,
} from "./visibleFramePresentationProofs";
import { createGpuFlowVisibleFrameReducerRuntime } from "./visibleFrameReducerRuntime";

type GpuFlowVisibleFramePublicationTestCandidate = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
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
      id: `test-content-publication:${frame.displayFrameId}:${projectionSample.id}`,
      kind: "content-publication",
      sample: projectionSample,
    },
  } as unknown as GpuFlowVisibleProjectionState;
  const result = runGpuFlowVisibleFramePublicationTestTokenKernel({
    contentFrame: createGpuFlowVisibleFramePublicationTestCandidate({
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
      id: `test-content-publication:${preparedContentFrameId}:${projectionSample.id - 1}`,
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
    reducerRuntime: createGpuFlowVisibleFrameReducerRuntime(),
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

function createGpuFlowVisibleFramePublicationTestSample({
  previousVisibleProjectionState,
  projectionSample,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleFramePublicationSample {
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
