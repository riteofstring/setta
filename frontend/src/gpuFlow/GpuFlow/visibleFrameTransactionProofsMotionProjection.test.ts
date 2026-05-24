import { describe, expect, it } from "vitest";

import {
  createGpuFlowPreparedContentPresentationProof,
  type GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionTransactionKind,
  GpuFlowVisibleFrameReducerDecision,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { createGpuFlowRetainedProjectionBlockedPresentationCandidate } from "./visibleFrameBlockedCandidate";
import {
  createGpuFlowVisibleFramePresentationCanvasPresentationEvidence,
  createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence,
  createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence,
  type GpuFlowVisibleFramePresentationEvidence,
} from "./visibleFramePresentationEvidence";
import {
  createGpuFlowVisibleFramePresentationPreparedCandidateSetFrameFactory,
  createGpuFlowVisibleFramePresentationTransactionProofFactory,
  type GpuFlowVisibleFramePresentationCandidateSet,
  type GpuFlowVisibleFramePresentationContentCandidate,
  type GpuFlowVisibleFramePresentationMotionCandidate,
} from "./visibleFrameTransactionProofs";

const createGpuFlowVisibleFramePresentationTransactionProofFromFactory =
  createGpuFlowVisibleFramePresentationTransactionProofFactory();
const createGpuFlowVisibleFramePresentationPreparedCandidateSetFrameFromFactory =
  createGpuFlowVisibleFramePresentationPreparedCandidateSetFrameFactory();

describe("GPU Flow visible frame motion projection proofs", () => {
  it("keeps motion projection visible while background content preparation produces a candidate", () => {
    const contentVisibleState = visibleProjectionState({
      kind: "prepared-content",
      sample: liveProjectionSample({ id: 40, timestamp: 400 }),
    });
    const motionVisibleState = visibleProjectionState({
      kind: "motion-projection",
      sample: liveProjectionSample({ id: 41, timestamp: 416 }),
    });

    const proof = createGpuFlowVisibleFramePresentationTransactionProof({
      contentPreparationFrame: {
        blockedPresentationCandidate: null,
        presentationEvidence: createTestGpuFlowVisibleFramePresentationEvidence(
          {
            preparedContentFrame: contentVisibleState.preparedContentFrame,
            projectionTransactionKind: "prepared-content",
            projectionTransactionId: contentVisibleState.transaction.id,
            reducerDecision: reducerDecision(contentVisibleState.sample),
          },
        ),
        visibleProjectionState: contentVisibleState,
      },
      motionProjectionFrame: {
        blockedPresentationCandidate: null,
        presentationEvidence: createTestGpuFlowVisibleFramePresentationEvidence(
          {
            preparedContentFrame: motionVisibleState.preparedContentFrame,
            projectionTransactionKind: "motion-projection",
            projectionTransactionId: motionVisibleState.transaction.id,
            reducerDecision: reducerDecision(motionVisibleState.sample),
          },
        ),
        visibleProjectionState: motionVisibleState,
      },
      reducerDecision: reducerDecision(motionVisibleState.sample),
    });

    expect(proof.visibleProjectionSource).toBe("motion-projection");
    expect(proof.visibleProjectionState).toBe(motionVisibleState);
  });

  it("rejects paired visible states when the selected motion candidate is not a motion projection", () => {
    const contentVisibleState = visibleProjectionState({
      kind: "prepared-content",
      sample: liveProjectionSample({ id: 40, timestamp: 400 }),
    });
    const nonMotionVisibleState = visibleProjectionState({
      kind: "prepared-content",
      sample: liveProjectionSample({ id: 41, timestamp: 416 }),
    });

    expect(() =>
      selectGpuFlowVisibleFramePresentationPreparedFrame({
        contentPreparationFrame: {
          blockedPresentationCandidate: null,
          visibleProjectionState: contentVisibleState,
        },
        motionProjectionFrame: {
          blockedPresentationCandidate: null,
          visibleProjectionState: nonMotionVisibleState,
        },
        reducerDecision: reducerDecision(contentVisibleState.sample),
      }),
    ).toThrow(
      "GPU Flow visible frame presentation proof can only pair background content preparation with a motion projection.",
    );
  });

  it("ignores blocked candidates from the unselected projection lane", () => {
    const contentVisibleState = visibleProjectionState({
      kind: "prepared-content",
      sample: liveProjectionSample({ id: 44, timestamp: 440 }),
    });
    const motionBlockedCandidate =
      createGpuFlowRetainedProjectionBlockedPresentationCandidate({
        blockedReason: "motion-projection-blocked",
        heldPreviousProjectionState: null,
      });

    const proof = createGpuFlowVisibleFramePresentationTransactionProof({
      contentPreparationFrame: {
        blockedPresentationCandidate: null,
        visibleProjectionState: contentVisibleState,
      },
      motionProjectionFrame: {
        blockedPresentationCandidate: motionBlockedCandidate,
        visibleProjectionState: null,
      },
      reducerDecision: reducerDecision(contentVisibleState.sample),
    });

    expect(proof.blockedPresentationCandidate).toBeNull();
    expect(proof.blockedSource).toBeNull();
    expect(proof.presentableFrameProof).not.toBeNull();
    expect(proof.renderedVisibleFrame).toBe(true);
    expect(proof.visibleProjectionSource).toBe("prepared-content");
    expect(proof.visibleProjectionState).toBe(contentVisibleState);
  });

  it("records motion projection as the visible source when content does not present", () => {
    const motionVisibleState = visibleProjectionState({
      kind: "motion-projection",
      sample: liveProjectionSample({ id: 41, timestamp: 416 }),
    });

    const prepared = selectGpuFlowVisibleFramePresentationPreparedFrame({
      contentPreparationFrame: {
        blockedPresentationCandidate: null,
        visibleProjectionState: null,
      },
      motionProjectionFrame: {
        blockedPresentationCandidate: null,
        visibleProjectionState: motionVisibleState,
      },
      reducerDecision: reducerDecision(motionVisibleState.sample),
    });

    expect(prepared.renderedVisibleFrame).toBe(true);
    expect(prepared.presentableFrameProof?.presentationProof).toEqual(
      expect.objectContaining({
        projectionSampleId: motionVisibleState.sample.id,
      }),
    );
    expect(prepared.visibleProjectionState).toBe(motionVisibleState);
    expect(
      createGpuFlowVisibleFramePresentationTransactionProof({
        contentPreparationFrame: {
          blockedPresentationCandidate: null,
          visibleProjectionState: null,
        },
        motionProjectionFrame: {
          blockedPresentationCandidate: null,
          visibleProjectionState: motionVisibleState,
        },
        reducerDecision: reducerDecision(motionVisibleState.sample),
      }).visibleProjectionSource,
    ).toBe("motion-projection");
    expect(prepared.presentableFrameProof?.debtProof.content).toBe(true);
  });
});

function createGpuFlowVisibleFramePresentationTransactionProof<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
>(
  input: GpuFlowVisibleFramePresentationCandidateSet<
    ContentPreparationFrame,
    MotionProjectionFrame
  > & {
    readonly previousVisibleProjectionState?: GpuFlowVisibleProjectionState | null;
    readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  },
) {
  return createGpuFlowVisibleFramePresentationTransactionProofFromFactory({
    ...input,
    contentPreparationFrame: withTestGpuFlowVisibleFramePresentationEvidence(
      input.contentPreparationFrame,
    ),
    motionProjectionFrame: withTestGpuFlowVisibleFramePresentationEvidence(
      input.motionProjectionFrame,
    ),
  });
}

function selectGpuFlowVisibleFramePresentationPreparedFrame<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
>({
  contentPreparationFrame,
  motionProjectionFrame,
  ...proofInput
}: GpuFlowVisibleFramePresentationCandidateSet<
  ContentPreparationFrame,
  MotionProjectionFrame
> & {
  readonly previousVisibleProjectionState?: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}) {
  const transactionProof =
    createGpuFlowVisibleFramePresentationTransactionProof({
      contentPreparationFrame,
      motionProjectionFrame,
      ...proofInput,
    });
  const preparedFrame =
    createGpuFlowVisibleFramePresentationPreparedCandidateSetFrameFromFactory({
      contentPreparationFrame,
      motionProjectionFrame,
      transactionProof,
    });
  return {
    blockedPresentationCandidate: preparedFrame.blockedPresentationCandidate,
    blockedProof: preparedFrame.blockedProof,
    presentableFrameProof: preparedFrame.transactionProof.presentableFrameProof,
    renderedVisibleFrame: preparedFrame.renderedVisibleFrame,
    visibleProjectionState: preparedFrame.visibleProjectionState,
  };
}

function withTestGpuFlowVisibleFramePresentationEvidence<
  Candidate extends
    | GpuFlowVisibleFramePresentationContentCandidate
    | GpuFlowVisibleFramePresentationMotionCandidate,
>(candidate: Candidate): Candidate {
  if (
    candidate.presentationEvidence !== undefined ||
    candidate.visibleProjectionState === null ||
    candidate.visibleProjectionState.transaction.kind === "held-previous"
  ) {
    return candidate;
  }
  return {
    ...candidate,
    presentationEvidence: createTestGpuFlowVisibleFramePresentationEvidence({
      preparedContentFrame: candidate.visibleProjectionState.preparedContentFrame,
      reducerDecision: reducerDecision(candidate.visibleProjectionState.sample),
      projectionTransactionKind:
        candidate.visibleProjectionState.transaction.kind,
      projectionTransactionId: candidate.visibleProjectionState.transaction.id,
    }),
  };
}

function createTestGpuFlowVisibleFramePresentationEvidence({
  preparedContentFrame,
  reducerDecision,
  projectionTransactionKind = "prepared-content",
  projectionTransactionId = `transaction:prepared-content:${reducerDecision.sample.id}`,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
  readonly reducerDecision: Pick<GpuFlowVisibleFrameReducerDecision, "sample">;
  readonly projectionTransactionKind?: GpuFlowProjectionTransactionKind;
  readonly projectionTransactionId?: string;
}): GpuFlowVisibleFramePresentationEvidence {
  const projectionSampleId = reducerDecision.sample.id;
  const evidenceInput = {
    preparedContentFrame,
    projectionSampleId,
    projectionTransactionId,
  };
  return Object.freeze({
    canvasGenerationEvidence:
      createGpuFlowVisibleFramePresentationCanvasPresentationEvidence(
        evidenceInput,
      ),
    domTransformEvidence:
      createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence(
        evidenceInput,
      ),
    textureEvictionEvidence:
      projectionTransactionKind === "motion-projection"
        ? null
        : createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence(
            evidenceInput,
          ),
  });
}

function visibleProjectionState({
  preparedContentFrame = createPreparedContentFrame(),
  kind,
  sample,
}: {
  readonly preparedContentFrame?: GpuFlowPreparedContentFrame | undefined;
  readonly kind: GpuFlowProjectionTransactionKind;
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleProjectionState {
  return {
    preparedContentFrame,
    debugState: {
      preparedContentFrameId: preparedContentFrame.displayFrameId,
      gestureOwner: "idle",
      heldPreviousDurationMs: 0,
      heldPreviousFrameCount: 0,
      heldPreviousOverBudget: false,
      heldPreviousReason: null,
      heldPreviousRequestedSampleId: null,
      lane: "content",
      projectionSampleId: sample.id,
      projectionTransactionId: `transaction:${kind}:${sample.id}`,
      transactionKind: kind,
    },
    heldPreviousProjection: null,
    sample,
    transaction: {
      preparedContentFrameId: preparedContentFrame.displayFrameId,
      id: `transaction:${kind}:${sample.id}`,
      kind,
      lane: "content",
      rawReasons: ["manual"],
      sample,
      startedAtMs: sample.timestamp,
    },
  };
}

function createPreparedContentFrame(): GpuFlowPreparedContentFrame {
  const displayFrameId = 7;
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
      actorGenerations: [],
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
    presentability: {
      blockingActorIds: [],
      kind: "presentable",
    },
    surfaceTransaction: null,
  } as unknown as GpuFlowPreparedContentFrame;
}

function reducerDecision(
  sample: GpuFlowLiveProjectionSample,
): GpuFlowVisibleFrameReducerDecision {
  const debt = { content: true, maintenance: false, motion: false };
  return {
    debt,
    lane: "content",
    rawReasons: ["manual"],
    sample,
    reducerState: "idle",
  };
}

function liveProjectionSample(input: {
  readonly id: number;
  readonly timestamp: number;
}): GpuFlowLiveProjectionSample {
  return {
    cssViewport: { height: 600, width: 800 },
    devicePixelRatio: 1,
    gestureOwner: "idle",
    id: input.id,
    retainedScrollDelta: new Map(),
    retainedScrollOffsets: new Map(),
    retainedScrollRevision: 0,
    retainedScrollVelocityCssPxPerMs: new Map(),
    timestamp: input.timestamp,
    viewport: [0, 0, 1],
    viewportDelta: { x: 0, y: 0, zoom: 0 },
    viewportVelocityCssPxPerMs: { x: 0, y: 0, zoom: 0 },
  };
}
