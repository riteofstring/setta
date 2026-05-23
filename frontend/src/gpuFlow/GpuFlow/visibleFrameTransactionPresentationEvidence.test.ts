import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
  createGpuFlowVisibleFramePublicationTransactionOracleFactory,
  createGpuFlowVisiblePublicationCommitOracleFactory,
  type GpuFlowVisibleFramePublicationCandidateSet,
  type GpuFlowVisibleFramePublicationContentCandidate,
  type GpuFlowVisibleFramePublicationMotionCandidate,
} from "./visibleFrameTransactionProofs";

const KERNEL_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameKernel.ts", import.meta.url),
);
const ORACLE_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameTransactionProofs.ts", import.meta.url),
);
const createGpuFlowVisibleFramePublicationTransactionOracleFromFactory =
  createGpuFlowVisibleFramePublicationTransactionOracleFactory();
const createGpuFlowVisiblePublicationCommitOracleFromFactory =
  createGpuFlowVisiblePublicationCommitOracleFactory();
const createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame =
  createGpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory();

function createGpuFlowVisibleFramePublicationTransactionOracle<
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
  return createGpuFlowVisibleFramePublicationTransactionOracleFromFactory({
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

function createGpuFlowVisiblePublicationCommitOracle({
  committedFrame,
  presentationEvidence,
  publicationDecision,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly presentationEvidence?:
    | GpuFlowVisiblePublicationPresentationEvidence
    | undefined;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}) {
  const selectedPresentationEvidence =
    presentationEvidence ??
    createTestGpuFlowVisiblePublicationPresentationEvidence({
      committedFrame,
      publicationDecision,
    });
  return createGpuFlowVisiblePublicationCommitOracleFromFactory({
    committedFrame,
    presentationEvidence: selectedPresentationEvidence,
    publicationDecision,
    projectionTransactionId:
      selectedPresentationEvidence.canvasGenerationEvidence
        .projectionTransactionId,
  });
}

function selectGpuFlowVisibleFramePublicationPreparedFrame<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  contentPublicationFrame,
  motionProjectionFrame,
  ...oracleInput
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> & {
  readonly previousVisibleProjectionState?: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}) {
  const transactionOracle =
    createGpuFlowVisibleFramePublicationTransactionOracle({
      contentPublicationFrame:
        withTestGpuFlowVisiblePublicationPresentationEvidence(
          contentPublicationFrame,
        ),
      motionProjectionFrame:
        withTestGpuFlowVisiblePublicationPresentationEvidence(
          motionProjectionFrame,
        ),
      ...oracleInput,
    });
  const preparedFrame =
    createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame({
      contentPublicationFrame,
      motionProjectionFrame,
      transactionOracle,
    });
  return {
    blockedPublicationCandidate: preparedFrame.blockedPublicationCandidate,
    blockedProof: preparedFrame.blockedProof,
    commitOracle: preparedFrame.transactionOracle.commitOracle,
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
  publicationDecision,
  projectionTransactionId = `transaction:content-publication:${publicationDecision.sample.id}`,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
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

    const oracle = createGpuFlowVisibleFramePublicationTransactionOracle({
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

    expect(oracle.blockedSource).toBe("presentation-pair");
    expect(oracle.blockedPublicationCandidate?.blockedReasons).toContainEqual({
      actorId: null,
      family: "presentation-pair",
      reason: "canvas-generation-not-prepared",
    });
    expect(oracle.commitOracle).toBeNull();
    expect(oracle.renderedVisibleFrame).toBe(false);
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

    const oracle = createGpuFlowVisibleFramePublicationTransactionOracle({
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

    expect(oracle.blockedSource).toBe("presentation-pair");
    expect(oracle.blockedPublicationCandidate?.blockedReasons).toContainEqual({
      actorId: null,
      family: "presentation-pair",
      reason: "dom-generation-not-exposable",
    });
    expect(oracle.commitOracle).toBeNull();
  });

  it("assembles prepared candidate-set frames from the transaction oracle proof", () => {
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
    const transactionOracle =
      createGpuFlowVisibleFramePublicationTransactionOracle({
        contentPublicationFrame,
        motionProjectionFrame,
        publicationDecision: publicationDecision(motionVisibleState.sample),
      });

    const prepared =
      createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame({
        contentPublicationFrame,
        motionProjectionFrame,
        transactionOracle,
      });

    expect(prepared.contentPublicationFrame).toBe(contentPublicationFrame);
    expect(prepared.motionProjectionFrame).toBe(motionProjectionFrame);
    expect(prepared.transactionOracle).toBe(transactionOracle);
    expect(prepared.blockedPublicationCandidate).toBe(
      transactionOracle.blockedPublicationCandidate,
    );
    expect(prepared.blockedProof).toBe(transactionOracle.blockedProof);
    expect(prepared.renderedVisibleFrame).toBe(
      transactionOracle.renderedVisibleFrame,
    );
    expect(prepared.visibleProjectionState).toBe(
      transactionOracle.visibleProjectionState,
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
      "GPU Flow visible publication oracle received competing content and motion blocked publication candidates for one transaction.",
    );
  });

  it("uses prepared motion projection blocked candidates", () => {
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 42, timestamp: 420 }),
    });
    const motionBlockedCandidate =
      createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: "held-previous-budget-exceeded",
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
    expect(prepared.commitOracle).toBeNull();
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
        reason: "held-previous-budget-exceeded",
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
      commitOracle: null,
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

function retainedDomControlActor({
  actualInteractionProof = "blocked",
  actualVisualProof = "compatible-previous",
  compatiblePreviousBudgetState = null,
  requiredInteractionProof = "active-editor-live",
}: {
  readonly actualInteractionProof?: string | undefined;
  readonly actualVisualProof?: string | undefined;
  readonly compatiblePreviousBudgetState?:
    | "over-budget"
    | "within-budget"
    | null
    | undefined;
  readonly requiredInteractionProof?: string | undefined;
} = {}): GpuFlowCommittedSurfaceActorGeneration {
  return freezeActor({
    active: true,
    actorFamily: "text-like-dom-control",
    actorId: "control-a",
    browserVisual: retainedDomControlBrowserVisual({
      actualInteractionProof,
      actualVisualProof,
      requiredInteractionProof,
    }),
    clipChainRevision: "clip-a",
    clipRect: rect(),
    contentGenerationId: "content-a",
    controlId: "control-a",
    focusIdentity: "control-a",
    flowRect: rect(),
    generationId: "generation-a",
    islandId: null,
    kind: "dom-control",
    layoutProjectionGenerationId: "layout-a",
    liveMotionSampleId: "sample-a",
    mountReadiness: "ready",
    ownerSurfaceId: "surface-a",
    pointerEvents: "auto",
    projectionReadiness: "ready",
    readinessGenerationId: "ready-a",
    retainedScrollOffset: null,
    retainedScrollRevision: 1,
    rowId: "row-a",
    sourceRect: rect(),
    textCoverageProof: createRetainedDomControlCompatiblePreviousProof({
      actualVisualProof,
      compatiblePreviousBudgetState,
    }),
    valueStyleRevision: "value-style-a",
    visibleNonempty: true,
    wheelPolicy: "retained-scroll-or-editor-scroll",
    zOrder: 1,
  });
}

function actorWithBrowserVisualRepresentation(
  actor: GpuFlowCommittedSurfaceActorGeneration,
  representation: NonNullable<
    GpuFlowCommittedSurfaceActorGeneration["browserVisual"]
  >["representation"],
): GpuFlowCommittedSurfaceActorGeneration {
  if (!actor.browserVisual) {
    throw new Error("Expected browser visual actor.");
  }
  return freezeActor({
    ...actor,
    browserVisual: {
      ...actor.browserVisual,
      representation,
    },
  });
}

function actorWithBrowserVisualResourceHandles(
  actor: GpuFlowCommittedSurfaceActorGeneration,
  resourceHandles: NonNullable<
    GpuFlowCommittedSurfaceActorGeneration["browserVisual"]
  >["resourceHandles"],
): GpuFlowCommittedSurfaceActorGeneration {
  if (!actor.browserVisual) {
    throw new Error("Expected browser visual actor.");
  }
  return freezeActor({
    ...actor,
    browserVisual: {
      ...actor.browserVisual,
      resourceHandles,
    },
  });
}

function retainedDomControlBrowserVisual({
  actualInteractionProof,
  actualVisualProof,
  requiredInteractionProof,
}: {
  readonly actualInteractionProof: string;
  readonly actualVisualProof: string;
  readonly requiredInteractionProof: string;
}): GpuFlowCommittedSurfaceActorGeneration["browserVisual"] {
  const compatiblePrevious = actualVisualProof === "compatible-previous";
  return {
    coverageExemption: null,
    coverageRequired: {
      reason:
        requiredInteractionProof === "active-editor-live"
          ? "active-editor"
          : "value-text",
      required: requiredInteractionProof === "active-editor-live",
    },
    coverageState: compatiblePrevious
      ? "compatible-previous-ready"
      : "live-host-ready",
    nonemptyReason: "value-text",
    proof: {
      actualInteraction: actualInteractionProof,
      actualVisual: actualVisualProof,
      requiredInteraction: requiredInteractionProof,
      requiredVisual: "browser-visual",
    },
    representation: compatiblePrevious
      ? {
          actorId: "control-a",
          kind: "compatible-previous",
          previousTransactionId: "previous-transaction",
        }
      : {
          actorId: "control-a",
          hostId: "host-a",
          islandId: "island-a",
          kind: "active-editor",
        },
    representationKind: compatiblePrevious
      ? "compatible-previous"
      : "active-editor",
    resourceHandles: [],
    visibilityReason: "visible",
  } as GpuFlowCommittedSurfaceActorGeneration["browserVisual"];
}

function createRetainedDomControlCompatiblePreviousProof({
  actualVisualProof,
  compatiblePreviousBudgetState,
}: {
  readonly actualVisualProof: string;
  readonly compatiblePreviousBudgetState:
    | "over-budget"
    | "within-budget"
    | null;
}): GpuFlowCommittedSurfaceActorGeneration["textCoverageProof"] {
  if (
    actualVisualProof !== "compatible-previous" ||
    compatiblePreviousBudgetState === null
  ) {
    return null;
  }
  const overBudget = compatiblePreviousBudgetState === "over-budget";
  return {
    accessibilityProjection: "browser-dom",
    activationPolicy: "allowed",
    compatiblePreviousProof: {
      activationPolicy: "allowed",
      actorFamily: "text-like-dom-control",
      actorId: "control-a",
      budgetState: compatiblePreviousBudgetState,
      canonicalActorId: "canonical-control-a",
      clipChainRevision: "clip-a",
      controlKind: "input",
      displayRevision: "display-a",
      flowRect: rect(),
      focusState: "inactive",
      hitMappingCompatible: true,
      hitTargetId: "control-a",
      maxProofAgeFrames: 2,
      maxProofAgeMs: 120,
      previousActorGenerationId: "previous-generation-a",
      previousCommittedFrameId: 6,
      previousProjectionSampleRevision: "viewport-previous",
      previousTransactionId: "previous-transaction",
      previousVisualGenerationId: "previous-visual-a",
      proofAgeFrames: overBudget ? 3 : 1,
      proofAgeMs: overBudget ? 121 : 16,
      protectedResourceIds: ["source:control-a"],
      reasonCode: "same-value-and-geometry",
      requestedActorGenerationId: "generation-a",
      requestedProjectionSampleRevision: "viewport-current",
      requestedVisualGenerationId: "generation-a",
      resourceHandles: [],
      retainedScrollCompatible: true,
      retainedSurfaceId: "surface-a",
      semanticGenerationId: "content-a",
    },
    focusable: true,
    pointerSemantics: "active-browser-editor",
    previousVisualGenerationId: "previous-visual-a",
    projectionCoverage: "compatible-previous",
    rendererFamily: "browser-dom",
    rendererSource: "browser-dom",
    role: "text-like",
    selectable: "browser-editor",
    semanticGenerationId: "content-a",
    snapshotCacheKeyRevision: "snapshot-a",
    visualGenerationId: "generation-a",
  };
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
