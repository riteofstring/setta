import { describe, expect, it } from "vitest";

import { freezeActor } from "../preparedContentActorFreeze";
import {
  createGpuFlowPreparedContentPresentationProof,
  type GpuFlowPreparedContentActorGeneration,
  type GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionTransactionKind,
  GpuFlowVisibleFrameReducerDecision,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { createGpuFlowRetainedProjectionBlockedPublicationCandidate } from "./visibleFrameBlockedCandidate";
import {
  createGpuFlowVisibleFramePresentationCanvasPresentationEvidence,
  createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence,
  createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence,
  type GpuFlowVisibleFramePresentationEvidence,
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
    readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  },
) {
  return createGpuFlowVisibleFramePublicationTransactionProofFromFactory({
    ...input,
    contentPublicationFrame: withTestGpuFlowVisibleFramePresentationEvidence(
      input.contentPublicationFrame,
    ),
    motionProjectionFrame: withTestGpuFlowVisibleFramePresentationEvidence(
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
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}) {
  const transactionProof = createGpuFlowVisibleFramePublicationTransactionProof(
    {
      contentPublicationFrame: withTestGpuFlowVisibleFramePresentationEvidence(
        contentPublicationFrame,
      ),
      motionProjectionFrame: withTestGpuFlowVisibleFramePresentationEvidence(
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
    presentableFrameProof: preparedFrame.transactionProof.presentableFrameProof,
    renderedVisibleFrame: preparedFrame.renderedVisibleFrame,
    visibleProjectionState: preparedFrame.visibleProjectionState,
  };
}

function withTestGpuFlowVisibleFramePresentationEvidence<
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
    presentationEvidence: createTestGpuFlowVisibleFramePresentationEvidence({
      preparedContentFrame:
        candidate.visibleProjectionState.preparedContentFrame,
      reducerDecision: {
        sample: candidate.visibleProjectionState.sample,
      },
      projectionTransactionKind:
        candidate.visibleProjectionState.transaction.kind,
      projectionTransactionId: candidate.visibleProjectionState.transaction.id,
    }),
  };
}

function createTestGpuFlowVisibleFramePresentationEvidence({
  preparedContentFrame,
  domTransformPrepared = true,
  drawnNodeIds,
  missingTextureNodeIds,
  reducerDecision,
  projectionTransactionKind = "prepared-content",
  projectionTransactionId = `transaction:prepared-content:${reducerDecision.sample.id}`,
  textureEvictionPrepared = true,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
  readonly domTransformPrepared?: boolean | undefined;
  readonly drawnNodeIds?: readonly string[] | undefined;
  readonly missingTextureNodeIds?: readonly string[] | undefined;
  readonly reducerDecision: Pick<GpuFlowVisibleFrameReducerDecision, "sample">;
  readonly projectionTransactionKind?:
    | GpuFlowProjectionTransactionKind
    | undefined;
  readonly projectionTransactionId?: string | undefined;
  readonly textureEvictionPrepared?: boolean | undefined;
}): GpuFlowVisibleFramePresentationEvidence {
  const evidenceInput = {
    preparedContentFrame,
    projectionSampleId: reducerDecision.sample.id,
    projectionTransactionId,
  };
  return Object.freeze({
    canvasGenerationEvidence:
      createGpuFlowVisibleFramePresentationCanvasPresentationEvidence({
        ...evidenceInput,
        drawnNodeIds,
        missingTextureNodeIds,
      }),
    domTransformEvidence: domTransformPrepared
      ? createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence({
          ...evidenceInput,
        })
      : null,
    textureEvictionEvidence:
      textureEvictionPrepared &&
      projectionTransactionKind !== "motion-projection"
        ? createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence(
            evidenceInput,
          )
        : null,
  });
}

describe("GPU Flow visible frame transaction presentation evidence", () => {
  it("blocks presentation authority when the deferred canvas generation is not prepared", () => {
    const contentVisibleState = visibleProjectionState({
      kind: "prepared-content",
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
      reducerDecision: reducerDecision(contentVisibleState.sample),
    });

    expect(proof.blockedSource).toBe("presentation-pair");
    expect(proof.blockedPublicationCandidate?.blockedReasons).toContainEqual({
      actorId: null,
      family: "presentation-pair",
      reason: "canvas-generation-not-prepared",
    });
    expect(proof.presentableFrameProof).toBeNull();
    expect(proof.renderedVisibleFrame).toBe(false);
  });

  it("blocks presentation authority when deferred DOM transforms are not prepared", () => {
    const contentVisibleState = visibleProjectionState({
      kind: "prepared-content",
      sample: liveProjectionSample({ id: 56, timestamp: 560 }),
    });

    const proof = createGpuFlowVisibleFramePublicationTransactionProof({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        presentationEvidence: createTestGpuFlowVisibleFramePresentationEvidence(
          {
            preparedContentFrame: contentVisibleState.preparedContentFrame,
            domTransformPrepared: false,
            reducerDecision: reducerDecision(contentVisibleState.sample),
            projectionTransactionId: contentVisibleState.transaction.id,
          },
        ),
        visibleProjectionState: contentVisibleState,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      reducerDecision: reducerDecision(contentVisibleState.sample),
    });

    expect(proof.blockedSource).toBe("presentation-pair");
    expect(proof.blockedPublicationCandidate?.blockedReasons).toContainEqual({
      actorId: null,
      family: "presentation-pair",
      reason: "dom-transform-not-prepared",
    });
    expect(proof.presentableFrameProof).toBeNull();
    expect(proof.renderedVisibleFrame).toBe(false);
  });

  it("blocks presentation authority when deferred texture eviction is not prepared", () => {
    const contentVisibleState = visibleProjectionState({
      kind: "prepared-content",
      sample: liveProjectionSample({ id: 57, timestamp: 570 }),
    });

    const proof = createGpuFlowVisibleFramePublicationTransactionProof({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        presentationEvidence: createTestGpuFlowVisibleFramePresentationEvidence(
          {
            preparedContentFrame: contentVisibleState.preparedContentFrame,
            reducerDecision: reducerDecision(contentVisibleState.sample),
            projectionTransactionId: contentVisibleState.transaction.id,
            textureEvictionPrepared: false,
          },
        ),
        visibleProjectionState: contentVisibleState,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      reducerDecision: reducerDecision(contentVisibleState.sample),
    });

    expect(proof.blockedSource).toBe("presentation-pair");
    expect(proof.blockedPublicationCandidate?.blockedReasons).toContainEqual({
      actorId: null,
      family: "presentation-pair",
      reason: "texture-eviction-not-prepared",
    });
    expect(proof.presentableFrameProof).toBeNull();
    expect(proof.renderedVisibleFrame).toBe(false);
  });

  it("blocks presentation authority when DOM runtime evidence is not exposable", () => {
    const preparedContentFrame = createPreparedContentFrame();
    const contentVisibleState = visibleProjectionState({
      preparedContentFrame: {
        ...preparedContentFrame,
        presentationProof: {
          ...preparedContentFrame.presentationProof,
          domGenerationEvidence: {
            ...preparedContentFrame.presentationProof.domGenerationEvidence,
            exposable: false,
          },
        },
      } as GpuFlowPreparedContentFrame,
      kind: "prepared-content",
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
      reducerDecision: reducerDecision(contentVisibleState.sample),
    });

    expect(proof.blockedSource).toBe("presentation-pair");
    expect(proof.blockedPublicationCandidate?.blockedReasons).toContainEqual({
      actorId: null,
      family: "presentation-pair",
      reason: "dom-generation-not-exposable",
    });
    expect(proof.presentableFrameProof).toBeNull();
  });

  it("blocks presentation authority when a visible section source node was not drawn", () => {
    const sectionActor = sectionStructureActor();
    const preparedContentFrame = createPreparedContentFrame({
      actorGenerations: [sectionActor],
    });
    const contentVisibleState = visibleProjectionState({
      preparedContentFrame,
      kind: "prepared-content",
      sample: liveProjectionSample({ id: 54, timestamp: 540 }),
    });

    const proof = createGpuFlowVisibleFramePublicationTransactionProof({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        presentationEvidence: createTestGpuFlowVisibleFramePresentationEvidence(
          {
            preparedContentFrame,
            drawnNodeIds: [],
            missingTextureNodeIds: [],
            reducerDecision: reducerDecision(contentVisibleState.sample),
            projectionTransactionId: contentVisibleState.transaction.id,
          },
        ),
        visibleProjectionState: contentVisibleState,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      reducerDecision: reducerDecision(contentVisibleState.sample),
    });

    expect(proof.blockedSource).toBe("presentation-pair");
    expect(proof.blockedPublicationCandidate?.blockedReasons).toContainEqual({
      actorId: "settings:section-shell",
      family: "section-shell",
      reason: "section-surface-not-drawn",
    });
    expect(proof.presentableFrameProof).toBeNull();
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
    const preparedContentFrame = createPreparedContentFrame({
      actorGenerations: [sectionActor],
    });
    const contentVisibleState = visibleProjectionState({
      preparedContentFrame,
      kind: "prepared-content",
      sample: liveProjectionSample({ id: 55, timestamp: 550 }),
    });

    const proof = createGpuFlowVisibleFramePublicationTransactionProof({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        presentationEvidence: createTestGpuFlowVisibleFramePresentationEvidence(
          {
            preparedContentFrame,
            drawnNodeIds: ["settings"],
            missingTextureNodeIds: [],
            reducerDecision: reducerDecision(contentVisibleState.sample),
            projectionTransactionId: contentVisibleState.transaction.id,
          },
        ),
        visibleProjectionState: contentVisibleState,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      reducerDecision: reducerDecision(contentVisibleState.sample),
    });

    expect(proof.blockedSource).toBeNull();
    expect(proof.presentableFrameProof).toEqual(
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
        reducerDecision: reducerDecision(motionVisibleState.sample),
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
        blockedReason: "prepared-content-blocked",
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
        reducerDecision: reducerDecision(
          liveProjectionSample({ id: 46, timestamp: 460 }),
        ),
      }),
    ).toThrow(
      "GPU Flow visible frame presentation proof received competing content and motion blocked publication candidates for one transaction.",
    );
  });

  it("uses prepared motion projection blocked candidates", () => {
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "prepared-content",
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
      reducerDecision: reducerDecision(
        liveProjectionSample({ id: 47, timestamp: 470 }),
      ),
    });

    expect(prepared.renderedVisibleFrame).toBe(false);
    expect(prepared.presentableFrameProof).toBeNull();
    expect(prepared.blockedPublicationCandidate).toBe(motionBlockedCandidate);
    expect(prepared.blockedProof).toEqual({
      blockedReasons: motionBlockedCandidate.blockedReasons,
      candidate: motionBlockedCandidate,
      frozenFrameId: motionBlockedCandidate.frozenFrameId,
      source: "motion-projection",
    });
    expect(prepared.blockedPublicationCandidate?.frozenFrameId).toBe(
      previousVisibleProjectionState.preparedContentFrame.displayFrameId,
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
      reducerDecision: reducerDecision(
        liveProjectionSample({ id: 48, timestamp: 480 }),
      ),
    });

    expect(prepared).toEqual({
      blockedPublicationCandidate: null,
      blockedProof: null,
      presentableFrameProof: null,
      renderedVisibleFrame: false,
      visibleProjectionState: null,
    });
  });
});

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

function createPreparedContentFrame({
  actorGenerations = [],
  compatiblePreviousActorIds = [],
}: {
  readonly actorGenerations?: readonly GpuFlowPreparedContentActorGeneration[];
  readonly compatiblePreviousActorIds?: readonly string[] | undefined;
} = {}): GpuFlowPreparedContentFrame {
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
    actorGenerations,
    coherence,
    displayFrameId,
    presentationProof: createGpuFlowPreparedContentPresentationProof({
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
  } as unknown as GpuFlowPreparedContentFrame;
}

function sectionStructureActor(): GpuFlowPreparedContentActorGeneration {
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

function reducerDecision(
  sample: GpuFlowLiveProjectionSample,
): GpuFlowVisibleFrameReducerDecision {
  return {
    debt: { content: true, maintenance: false, motion: false },
    lane: "content",
    rawReasons: ["manual"],
    sample,
    reducerState: "idle",
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
