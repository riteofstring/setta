import { describe, expect, it } from "vitest";

import { freezeActor } from "../committedSurfaceActorFreeze";
import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceActorGeneration,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionTransactionKind,
  GpuFlowVisibleProjectionState,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import { createGpuFlowRetainedProjectionBlockedPublicationCandidate } from "./visibleFrameBlockedCandidate";
import {
  createGpuFlowVisiblePublicationCanvasPresentationEvidence,
  type GpuFlowVisiblePublicationPresentationEvidence,
} from "./visibleFramePresentationEvidence";
import {
  createGpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory,
  createGpuFlowVisibleFramePublicationTransactionProofFactory,
  type GpuFlowVisibleFramePublicationCandidateSet,
  type GpuFlowVisibleFramePublicationContentCandidate,
  type GpuFlowVisibleFramePublicationMotionCandidate,
} from "./visibleFrameTransactionProofs";

const createGpuFlowVisibleFramePublicationTransactionProofFromFactory =
  createGpuFlowVisibleFramePublicationTransactionProofFactory();
const createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame =
  createGpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory();

function createGpuFlowVisibleFramePublicationTransactionProof<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>(
  input: GpuFlowVisibleFramePublicationCandidateSet<
    ContentPublicationFrame,
    MotionProjectionFrame
  > & {
    readonly previousVisibleProjectionState?: GpuFlowVisibleProjectionState | null;
    readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  },
) {
  return createGpuFlowVisibleFramePublicationTransactionProofFromFactory({
    ...input,
    contentPublicationFrame:
      withTestGpuFlowVisiblePublicationPresentationEvidence(
        input.contentPublicationFrame,
      ),
    motionProjectionFrame:
      withTestGpuFlowVisiblePublicationPresentationEvidence(
        input.motionProjectionFrame,
      ),
  });
}

function selectGpuFlowVisibleFramePublicationPreparedFrame<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  contentPublicationFrame,
  motionProjectionFrame,
  ...proofInput
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> & {
  readonly previousVisibleProjectionState?: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}) {
  const transactionProof = createGpuFlowVisibleFramePublicationTransactionProof(
    {
      contentPublicationFrame:
        withTestGpuFlowVisiblePublicationPresentationEvidence(
          contentPublicationFrame,
        ),
      motionProjectionFrame:
        withTestGpuFlowVisiblePublicationPresentationEvidence(
          motionProjectionFrame,
        ),
      ...proofInput,
    },
  );
  const preparedFrame =
    createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame({
      contentPublicationFrame,
      motionProjectionFrame,
      transactionProof,
    });
  return {
    blockedPublicationCandidate: preparedFrame.blockedPublicationCandidate,
    blockedProof: preparedFrame.blockedProof,
    commitProof: preparedFrame.transactionProof.commitProof,
    renderedVisibleFrame: preparedFrame.renderedVisibleFrame,
    visibleProjectionState: preparedFrame.visibleProjectionState,
  };
}

function withTestGpuFlowVisiblePublicationPresentationEvidence<
  Candidate extends
    | GpuFlowVisibleFramePublicationContentCandidate
    | GpuFlowVisibleFramePublicationMotionCandidate,
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
    presentationEvidence:
      createTestGpuFlowVisiblePublicationPresentationEvidence({
        committedFrame: candidate.visibleProjectionState.committedFrame,
        publicationDecision: {
          sample: candidate.visibleProjectionState.sample,
        },
        projectionTransactionId:
          candidate.visibleProjectionState.transaction.id,
      }),
  };
}

function createTestGpuFlowVisiblePublicationPresentationEvidence({
  committedFrame,
  drawnNodeIds,
  missingTextureNodeIds,
  publicationDecision,
  projectionTransactionId = `transaction:content-publication:${publicationDecision.sample.id}`,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly drawnNodeIds?: readonly string[] | undefined;
  readonly missingTextureNodeIds?: readonly string[] | undefined;
  readonly publicationDecision: Pick<
    GpuFlowVisiblePublicationDecision,
    "sample"
  >;
  readonly projectionTransactionId?: string | undefined;
}): GpuFlowVisiblePublicationPresentationEvidence {
  return Object.freeze({
    canvasGenerationEvidence:
      createGpuFlowVisiblePublicationCanvasPresentationEvidence({
        committedFrame,
        drawnNodeIds,
        missingTextureNodeIds,
        projectionSampleId: publicationDecision.sample.id,
        projectionTransactionId,
      }),
  });
}

describe("GPU Flow visible frame transaction presentation evidence", () => {
  it("blocks commit authority when the deferred canvas generation is not prepared", () => {
    const contentVisibleState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 52, timestamp: 520 }),
    });

    const proof = createGpuFlowVisibleFramePublicationTransactionProof({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        presentationEvidence: null,
        visibleProjectionState: contentVisibleState,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      publicationDecision: publicationDecision(contentVisibleState.sample),
    });

    expect(proof.blockedSource).toBe("presentation-pair");
    expect(proof.blockedPublicationCandidate?.blockedReasons).toContainEqual({
      actorId: null,
      family: "presentation-pair",
      reason: "canvas-generation-not-prepared",
    });
    expect(proof.commitProof).toBeNull();
    expect(proof.renderedVisibleFrame).toBe(false);
  });

  it("blocks commit authority when DOM runtime evidence is not exposable", () => {
    const committedFrame = committedSurfaceFrame();
    const contentVisibleState = visibleProjectionState({
      committedFrame: {
        ...committedFrame,
        presentationProof: {
          ...committedFrame.presentationProof,
          domGenerationEvidence: {
            ...committedFrame.presentationProof.domGenerationEvidence,
            exposable: false,
          },
        },
      } as GpuFlowCommittedSurfaceFrame,
      kind: "content-publication",
      sample: liveProjectionSample({ id: 53, timestamp: 530 }),
    });

    const proof = createGpuFlowVisibleFramePublicationTransactionProof({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: contentVisibleState,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      publicationDecision: publicationDecision(contentVisibleState.sample),
    });

    expect(proof.blockedSource).toBe("presentation-pair");
    expect(proof.blockedPublicationCandidate?.blockedReasons).toContainEqual({
      actorId: null,
      family: "presentation-pair",
      reason: "dom-generation-not-exposable",
    });
    expect(proof.commitProof).toBeNull();
  });

  it("blocks commit authority when a visible section source node was not drawn", () => {
    const sectionActor = sectionStructureActor();
    const committedFrame = committedSurfaceFrame({
      actorGenerations: [sectionActor],
    });
    const contentVisibleState = visibleProjectionState({
      committedFrame,
      kind: "content-publication",
      sample: liveProjectionSample({ id: 54, timestamp: 540 }),
    });

    const proof = createGpuFlowVisibleFramePublicationTransactionProof({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        presentationEvidence:
          createTestGpuFlowVisiblePublicationPresentationEvidence({
            committedFrame,
            drawnNodeIds: [],
            missingTextureNodeIds: [],
            publicationDecision: publicationDecision(
              contentVisibleState.sample,
            ),
            projectionTransactionId: contentVisibleState.transaction.id,
          }),
        visibleProjectionState: contentVisibleState,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      publicationDecision: publicationDecision(contentVisibleState.sample),
    });

    expect(proof.blockedSource).toBe("presentation-pair");
    expect(proof.blockedPublicationCandidate?.blockedReasons).toContainEqual({
      actorId: "settings:section-shell",
      family: "section-shell",
      reason: "section-surface-not-drawn",
    });
    expect(proof.commitProof).toBeNull();
    expect(proof.renderedVisibleFrame).toBe(false);
    expect(
      proof.visibleFrameStateMachinePreparedFrame.candidate.requiredActors,
    ).toContainEqual({
      actorId: "settings:section-shell",
      family: "section-shell",
    });
  });

  it("allows section actors when the canvas evidence drew their source node", () => {
    const sectionActor = sectionStructureActor();
    const committedFrame = committedSurfaceFrame({
      actorGenerations: [sectionActor],
    });
    const contentVisibleState = visibleProjectionState({
      committedFrame,
      kind: "content-publication",
      sample: liveProjectionSample({ id: 55, timestamp: 550 }),
    });

    const proof = createGpuFlowVisibleFramePublicationTransactionProof({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        presentationEvidence:
          createTestGpuFlowVisiblePublicationPresentationEvidence({
            committedFrame,
            drawnNodeIds: ["settings"],
            missingTextureNodeIds: [],
            publicationDecision: publicationDecision(
              contentVisibleState.sample,
            ),
            projectionTransactionId: contentVisibleState.transaction.id,
          }),
        visibleProjectionState: contentVisibleState,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      publicationDecision: publicationDecision(contentVisibleState.sample),
    });

    expect(proof.blockedSource).toBeNull();
    expect(proof.commitProof).toEqual(
      expect.objectContaining({
        remainingActorDebt: [],
      }),
    );
    expect(proof.renderedVisibleFrame).toBe(true);
  });

  it("assembles prepared candidate-set frames from the transaction proof proof", () => {
    const motionVisibleState = visibleProjectionState({
      kind: "motion-projection",
      sample: liveProjectionSample({ id: 49, timestamp: 490 }),
    });
    const contentPublicationFrame = {
      blockedPublicationCandidate: null,
      visibleProjectionState: null,
    };
    const motionProjectionFrame = {
      blockedPublicationCandidate: null,
      visibleProjectionState: motionVisibleState,
    };
    const transactionProof =
      createGpuFlowVisibleFramePublicationTransactionProof({
        contentPublicationFrame,
        motionProjectionFrame,
        publicationDecision: publicationDecision(motionVisibleState.sample),
      });

    const prepared =
      createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame({
        contentPublicationFrame,
        motionProjectionFrame,
        transactionProof,
      });

    expect(prepared.contentPublicationFrame).toBe(contentPublicationFrame);
    expect(prepared.motionProjectionFrame).toBe(motionProjectionFrame);
    expect(prepared.transactionProof).toBe(transactionProof);
    expect(prepared.blockedPublicationCandidate).toBe(
      transactionProof.blockedPublicationCandidate,
    );
    expect(prepared.blockedProof).toBe(transactionProof.blockedProof);
    expect(prepared.renderedVisibleFrame).toBe(
      transactionProof.renderedVisibleFrame,
    );
    expect(prepared.visibleProjectionState).toBe(
      transactionProof.visibleProjectionState,
    );
  });

  it("rejects competing content and motion blocked candidates", () => {
    const contentBlockedCandidate =
      createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: "content-publication-blocked",
        heldPreviousProjectionState: null,
      });
    const motionBlockedCandidate =
      createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: "motion-projection-blocked",
        heldPreviousProjectionState: null,
      });

    expect(() =>
      selectGpuFlowVisibleFramePublicationPreparedFrame({
        contentPublicationFrame: {
          blockedPublicationCandidate: contentBlockedCandidate,
          visibleProjectionState: null,
        },
        motionProjectionFrame: {
          blockedPublicationCandidate: motionBlockedCandidate,
          visibleProjectionState: null,
        },
        publicationDecision: publicationDecision(
          liveProjectionSample({ id: 46, timestamp: 460 }),
        ),
      }),
    ).toThrow(
      "GPU Flow visible publication proof received competing content and motion blocked publication candidates for one transaction.",
    );
  });

  it("uses prepared motion projection blocked candidates", () => {
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 42, timestamp: 420 }),
    });
    const motionBlockedCandidate =
      createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: "retained-projection-coverage-missing",
        heldPreviousProjectionState: previousVisibleProjectionState,
      });

    const prepared = selectGpuFlowVisibleFramePublicationPreparedFrame({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: motionBlockedCandidate,
        visibleProjectionState: null,
      },
      publicationDecision: publicationDecision(
        liveProjectionSample({ id: 47, timestamp: 470 }),
      ),
    });

    expect(prepared.renderedVisibleFrame).toBe(false);
    expect(prepared.commitProof).toBeNull();
    expect(prepared.blockedPublicationCandidate).toBe(motionBlockedCandidate);
    expect(prepared.blockedProof).toEqual({
      blockedReasons: motionBlockedCandidate.blockedReasons,
      candidate: motionBlockedCandidate,
      frozenFrameId: motionBlockedCandidate.frozenFrameId,
      source: "motion-projection",
    });
    expect(prepared.blockedPublicationCandidate?.frozenFrameId).toBe(
      previousVisibleProjectionState.committedFrame.displayFrameId,
    );
    expect(prepared.blockedPublicationCandidate?.blockedReasons).toEqual([
      {
        actorId: null,
        family: "retained-projection",
        reason: "retained-projection-coverage-missing",
      },
    ]);
  });

  it("reports no rendered visible frame when content and motion do not prepare one", () => {
    const prepared = selectGpuFlowVisibleFramePublicationPreparedFrame({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      publicationDecision: publicationDecision(
        liveProjectionSample({ id: 48, timestamp: 480 }),
      ),
    });

    expect(prepared).toEqual({
      blockedPublicationCandidate: null,
      blockedProof: null,
      commitProof: null,
      renderedVisibleFrame: false,
      visibleProjectionState: null,
    });
  });
});

function visibleProjectionState({
  committedFrame = committedSurfaceFrame(),
  kind,
  sample,
}: {
  readonly committedFrame?: GpuFlowCommittedSurfaceFrame | undefined;
  readonly kind: GpuFlowProjectionTransactionKind;
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleProjectionState {
  return {
    committedFrame,
    debugState: {
      committedFrameId: committedFrame.displayFrameId,
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
      committedFrameId: committedFrame.displayFrameId,
      id: `transaction:${kind}:${sample.id}`,
      kind,
      lane: "content",
      rawReasons: ["manual"],
      sample,
      startedAtMs: sample.timestamp,
    },
  };
}

function committedSurfaceFrame({
  actorGenerations = [],
  compatiblePreviousActorIds = [],
}: {
  readonly actorGenerations?: readonly GpuFlowCommittedSurfaceActorGeneration[];
  readonly compatiblePreviousActorIds?: readonly string[] | undefined;
} = {}): GpuFlowCommittedSurfaceFrame {
  const displayFrameId = 7;
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
    actorGenerations,
    coherence,
    displayFrameId,
    presentationProof: createGpuFlowCommittedSurfacePresentationProof({
      actorGenerations,
      coherence,
      displayFrameId,
    }),
    projectionHorizon: {
      textActorCoverage: {
        blockedAwaitingBrowserVisualActorIds: [],
        blockedAwaitingLiveHostActorIds: [],
        compatiblePreviousActorIds,
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

function sectionStructureActor(): GpuFlowCommittedSurfaceActorGeneration {
  return freezeActor({
    active: false,
    actorFamily: "section-shell",
    actorId: "settings:section-shell",
    clipChainRevision: "section-clip:settings",
    clipRect: rect(),
    contentGenerationId: "section-shell-content:settings",
    controlId: null,
    focusIdentity: null,
    flowRect: rect(),
    generationId: "section-shell-generation:settings",
    islandId: null,
    kind: "html-texture",
    layoutProjectionGenerationId: "section-shell-layout:settings",
    liveMotionSampleId: "not-sampled",
    mountReadiness: "not-required",
    ownerSurfaceId: "settings",
    pointerEvents: "none",
    projectionReadiness: "not-required",
    readinessGenerationId: "section-shell-ready:settings",
    retainedScrollOffset: null,
    retainedScrollRevision: 0,
    rowId: null,
    sourceRect: rect(),
    valueStyleRevision: null,
    visibleNonempty: true,
    wheelPolicy: "none",
    zOrder: 1,
  });
}

function rect() {
  return { height: 20, width: 100, x: 0, y: 0 };
}

function publicationDecision(
  sample: GpuFlowLiveProjectionSample,
): GpuFlowVisiblePublicationDecision {
  return {
    debt: { content: true, maintenance: false, motion: false },
    lane: "content",
    rawReasons: ["manual"],
    sample,
    schedulerState: "idle",
  };
}

function liveProjectionSample({
  id,
  timestamp,
}: {
  readonly id: number;
  readonly timestamp: number;
}): GpuFlowLiveProjectionSample {
  return {
    cssViewport: { height: 600, width: 800 },
    devicePixelRatio: 1,
    gestureOwner: "idle",
    id,
    retainedScrollDelta: new Map(),
    retainedScrollOffsets: new Map(),
    retainedScrollRevision: 0,
    retainedScrollVelocityCssPxPerMs: new Map(),
    timestamp,
    viewport: [0, 0, 1],
    viewportDelta: { x: 0, y: 0, zoom: 0 },
    viewportVelocityCssPxPerMs: { x: 0, y: 0, zoom: 0 },
  };
}
