import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
import type {
  ProtectedSurfaceResourceHandle,
  SurfaceResourceHandle,
} from "../surfaceCompositor/surfaceCoverage";
import { createGpuFlowRetainedProjectionBlockedPresentationCandidate } from "./visibleFrameBlockedCandidate";
import {
  createGpuFlowVisibleFramePresentationCanvasPresentationEvidence,
  createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence,
  createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence,
  type GpuFlowVisibleFramePresentationEvidence,
} from "./visibleFramePresentationEvidence";
import {
  createGpuFlowVisibleFramePresentableFrameProofFactory,
  createGpuFlowVisibleFramePresentationPreparedCandidateSetFrameFactory,
  createGpuFlowVisibleFramePresentationTransactionProofFactory,
  type GpuFlowVisibleFramePresentationCandidateSet,
  type GpuFlowVisibleFramePresentationContentCandidate,
  type GpuFlowVisibleFramePresentationMotionCandidate,
} from "./visibleFrameTransactionProofs";

const KERNEL_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameCoordinator.ts", import.meta.url),
);
const PROOF_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameTransactionProofs.ts", import.meta.url),
);
const createGpuFlowVisibleFramePresentationTransactionProofFromFactory =
  createGpuFlowVisibleFramePresentationTransactionProofFactory();
const createGpuFlowVisibleFramePresentableFrameProofFromFactory =
  createGpuFlowVisibleFramePresentableFrameProofFactory();
const createGpuFlowVisibleFramePresentationPreparedCandidateSetFrame =
  createGpuFlowVisibleFramePresentationPreparedCandidateSetFrameFactory();

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

function createGpuFlowVisibleFramePresentableFrameProof({
  preparedContentFrame,
  presentationEvidence,
  reducerDecision,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
  readonly presentationEvidence?:
    | GpuFlowVisibleFramePresentationEvidence
    | undefined;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}) {
  const selectedPresentationEvidence =
    presentationEvidence ??
    createTestGpuFlowVisibleFramePresentationEvidence({
      preparedContentFrame,
      reducerDecision,
    });
  return createGpuFlowVisibleFramePresentableFrameProofFromFactory({
    preparedContentFrame,
    presentationEvidence: selectedPresentationEvidence,
    reducerDecision,
    projectionTransactionKind: "prepared-content",
    projectionTransactionId:
      selectedPresentationEvidence.canvasGenerationEvidence
        .projectionTransactionId,
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
      contentPreparationFrame: withTestGpuFlowVisibleFramePresentationEvidence(
        contentPreparationFrame,
      ),
      motionProjectionFrame: withTestGpuFlowVisibleFramePresentationEvidence(
        motionProjectionFrame,
      ),
      ...proofInput,
    });
  const preparedFrame =
    createGpuFlowVisibleFramePresentationPreparedCandidateSetFrame({
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
describe("GPU Flow visible frame transaction proofs", () => {
  it("keeps candidate-set proof assembly out of the coordinator wrapper", () => {
    const kernelSource = readFileSync(KERNEL_MODULE_PATH, "utf8");
    const proofSource = readFileSync(PROOF_MODULE_PATH, "utf8");

    expect(kernelSource).not.toContain(
      "createGpuFlowVisibleFramePresentationProofBlockedSource",
    );
    expect(kernelSource).not.toContain(
      "selectGpuFlowVisibleFramePresentationProjectionSource",
    );
    expect(kernelSource).not.toContain(
      "function createGpuFlowMotionProjectionBlockedPresentationCandidate",
    );
    expect(proofSource).not.toContain(
      "function createGpuFlowMotionProjectionBlockedPresentationCandidate",
    );
    expect(proofSource).toContain(
      "createGpuFlowVisibleFramePresentationCandidateBlockedProof",
    );
    expect(proofSource).toContain(
      "selectGpuFlowVisibleFramePresentationProjectionSource",
    );
    expect(proofSource).toContain(
      "motionProjectionFrame.blockedPresentationCandidate",
    );
    expect(proofSource).toContain(
      "type GpuFlowVisibleFramePresentationBlockedProof",
    );
    expect(proofSource).toContain(
      "function createGpuFlowVisibleFramePresentationPreparedCandidateSetFrame",
    );
    expect(proofSource).not.toContain(
      "export function createGpuFlowVisibleFramePresentableFrameProof(",
    );
    expect(proofSource).not.toContain(
      "export function createGpuFlowVisibleFramePresentationDebtProof(",
    );
    expect(proofSource).not.toContain(
      "export function selectGpuFlowVisibleFramePresentationPreparedFrame(",
    );
    expect(proofSource).not.toContain(
      "export function createGpuFlowVisibleFramePresentationPreparedCandidateSetFrame(",
    );
    expect(kernelSource).not.toContain(
      "function createGpuFlowVisibleFramePresentationPreparedCandidateSetFrame",
    );
  });

  it("records blocked proof sources", () => {
    const contentVisibleState = visibleProjectionState({
      kind: "prepared-content",
      sample: liveProjectionSample({ id: 43, timestamp: 430 }),
    });
    const contentBlockedCandidate =
      createGpuFlowRetainedProjectionBlockedPresentationCandidate({
        blockedReason: "prepared-content-blocked",
        heldPreviousProjectionState: null,
      });
    const proof = createGpuFlowVisibleFramePresentationTransactionProof({
      contentPreparationFrame: {
        blockedPresentationCandidate: contentBlockedCandidate,
        visibleProjectionState: null,
      },
      motionProjectionFrame: {
        blockedPresentationCandidate: null,
        visibleProjectionState: null,
      },
      reducerDecision: reducerDecision(contentVisibleState.sample),
    });

    expect(proof.blockedPresentationCandidate).toBe(contentBlockedCandidate);
    expect(proof.blockedProof).toEqual({
      blockedReasons: contentBlockedCandidate.blockedReasons,
      candidate: contentBlockedCandidate,
      frozenFrameId: contentBlockedCandidate.frozenFrameId,
      source: "prepared-content",
    });
    expect(proof.blockedSource).toBe("prepared-content");
    expect(proof.presentableFrameProof).toBeNull();
    expect(proof.renderedVisibleFrame).toBe(false);
    expect(proof.visibleProjectionSource).toBeNull();
    expect(proof.visibleProjectionState).toBeNull();
  });

  it("reports authoritative per-actor visual and interaction proof entries", () => {
    const sample = liveProjectionSample({ id: 45, timestamp: 450 });
    const actor = retainedDomControlActor({
      actualInteractionProof: "inactive-visual-only",
      compatiblePreviousBudgetState: "within-budget",
      requiredInteractionProof: "inactive-visual-only",
    });
    const proof = createGpuFlowVisibleFramePresentableFrameProof({
      preparedContentFrame: createPreparedContentFrame({
        actorGenerations: [actor],
      }),
      reducerDecision: reducerDecision(sample),
    });

    expect(proof.actorProofs).toEqual([
      expect.objectContaining({
        actorId: "control-a",
        actualInteractionProof: "inactive-visual-only",
        actualVisualProof: "compatible-previous",
        browserVisualRepresentation: {
          actorId: "control-a",
          kind: "compatible-previous",
          previousTransactionId: "previous-transaction",
        },
        canonicalActorId: actor.canonicalActorId,
        contentGenerationId: "content-a",
        ownerFamily: "text-like-dom-control",
        ownerSurfaceId: "surface-a",
        projectionGenerationId: "layout-a",
        projectionSampleId: sample.id,
        proofState: "compatible-previous",
        remainingDebt: ["exact-browser-visual"],
        requiredInteractionRepresentation: "inactive-visual-only",
        requiredVisualRepresentation: "browser-visual",
        sampledVisualEvidence: "compatible-previous",
      }),
    ]);
    expect(proof.remainingActorDebt).toEqual([
      {
        actorId: "control-a",
        canonicalActorId: actor.canonicalActorId,
        ownerFamily: "text-like-dom-control",
        remainingDebt: ["exact-browser-visual"],
      },
    ]);
    expect(proof.actorProofDigest).toContain("text-like-dom-control");
    expect(proof.browserActorProofs.actualVisual).toEqual({
      "compatible-previous": 1,
    });
    expect(proof.compatiblePreviousProofs.samples).toEqual([
      expect.objectContaining({
        actorId: "control-a",
        clipChainRevision: "clip-a",
        previousActorGenerationId: "previous-generation-a",
        previousContentFrameId: 6,
        previousTransactionId: "previous-transaction",
        previousVisualGenerationId: "previous-visual-a",
        protectedResourceIds: ["source:control-a"],
        requestedActorGenerationId: "generation-a",
        requestedLiveProjectionSampleId: sample.id,
        requestedProjectionSampleRevision: "viewport-current",
        requestedVisualGenerationId: "generation-a",
        resourceHandleIds: [],
        retainedScrollCompatible: true,
      }),
    ]);
    expect(proof.presentationProof).toEqual(
      expect.objectContaining({
        batchId: expect.any(String),
        projectionSampleId: sample.id,
      }),
    );
    expect(proof.presentationProof.domGeneration.staged).toBe(true);
    expect(proof.presentationProof.domGeneration.exposable).toBe(true);
    expect(proof.presentationProof.canvasGeneration.prepared).toBe(true);
    expect(proof.presentationProof.canvasGeneration.exposable).toBe(true);
    expect(proof.presentationProof.domGeneration.presentationBatchId).toBe(
      proof.presentationProof.batchId,
    );
    expect(proof.presentationProof.canvasGeneration.presentationBatchId).toBe(
      proof.presentationProof.batchId,
    );
  });

  it("keeps exact content debt queued for compatible-previous coverage", () => {
    const sample = liveProjectionSample({ id: 46, timestamp: 460 });
    const reducerDecisionWithContentDebt = reducerDecision(sample);

    expect(
      createGpuFlowVisibleFramePresentableFrameProof({
        preparedContentFrame: createPreparedContentFrame({
          compatiblePreviousActorIds: ["actor-a"],
        }),
        reducerDecision: reducerDecisionWithContentDebt,
      }).debtProof,
    ).toEqual({
      content: false,
      maintenance: false,
      motion: false,
    });
    expect(
      createGpuFlowVisibleFramePresentableFrameProof({
        preparedContentFrame: createPreparedContentFrame({
          compatiblePreviousActorIds: [],
        }),
        reducerDecision: reducerDecisionWithContentDebt,
      }).debtProof,
    ).toEqual({
      content: true,
      maintenance: false,
      motion: false,
    });
  });

  it("rejects blocked actor proofs as presentation candidates", () => {
    const sample = liveProjectionSample({ id: 50, timestamp: 500 });
    const actor = retainedDomControlActor();

    expect(() =>
      createGpuFlowVisibleFramePresentableFrameProof({
        preparedContentFrame: createPreparedContentFrame({
          actorGenerations: [actor],
        }),
        reducerDecision: reducerDecision(sample),
      }),
    ).toThrow(
      "GPU Flow visible frame presentation proof cannot present blocked actor proofs: control-a:compatible-previous:blocked.",
    );
  });

  it("rejects active-editor proof on compatible-previous visual coverage", () => {
    const sample = liveProjectionSample({ id: 51, timestamp: 510 });
    const actor = retainedDomControlActor({
      actualInteractionProof: "active-editor-live",
    });

    expect(() =>
      createGpuFlowVisibleFramePresentableFrameProof({
        preparedContentFrame: createPreparedContentFrame({
          actorGenerations: [actor],
        }),
        reducerDecision: reducerDecision(sample),
      }),
    ).toThrow(
      "GPU Flow visible frame presentation proof cannot present blocked actor proofs: control-a:compatible-previous:active-editor-live.",
    );
  });

  it("rejects over-budget compatible previous proofs as presentation candidates", () => {
    const sample = liveProjectionSample({ id: 52, timestamp: 520 });
    const actor = retainedDomControlActor({
      actualInteractionProof: "inactive-visual-only",
      compatiblePreviousBudgetState: "over-budget",
    });

    expect(() =>
      createGpuFlowVisibleFramePresentableFrameProof({
        preparedContentFrame: createPreparedContentFrame({
          actorGenerations: [actor],
        }),
        reducerDecision: reducerDecision(sample),
      }),
    ).toThrow(
      "GPU Flow visible frame presentation proof cannot present blocked actor proofs: control-a:compatible-previous:inactive-visual-only.",
    );
  });

  it("converts over-budget compatible previous proof into a blocked transaction proof", () => {
    const sample = liveProjectionSample({ id: 53, timestamp: 530 });
    const actor = retainedDomControlActor({
      active: false,
      actualInteractionProof: "inactive-visual-only",
      compatiblePreviousBudgetState: "over-budget",
      requiredInteractionProof: "inactive-visual-only",
    });
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "prepared-content",
      sample: liveProjectionSample({ id: 52, timestamp: 514 }),
    });
    const overBudgetVisibleProjectionState = visibleProjectionState({
      preparedContentFrame: createPreparedContentFrame({
        actorGenerations: [actor],
      }),
      kind: "prepared-content",
      sample,
    });

    const proof = createGpuFlowVisibleFramePresentationTransactionProof({
      contentPreparationFrame: {
        blockedPresentationCandidate: null,
        visibleProjectionState: overBudgetVisibleProjectionState,
      },
      motionProjectionFrame: {
        blockedPresentationCandidate: null,
        visibleProjectionState: null,
      },
      previousVisibleProjectionState,
      reducerDecision: reducerDecision(sample),
    });

    expect(proof.blockedSource).toBe("compatible-previous-proof");
    expect(proof.presentableFrameProof).toBeNull();
    expect(proof.renderedVisibleFrame).toBe(false);
    expect(proof.visibleProjectionState).toBeNull();
    expect(proof.blockedPresentationCandidate).toEqual({
      blockedReasons: [
        {
          actorId: "control-a",
          family: "compatible-previous",
          reason: "compatible-previous-budget-exceeded",
        },
      ],
      frozenFrameId:
        previousVisibleProjectionState.preparedContentFrame.displayFrameId,
    });
  });

  it("converts active-editor compatible previous proof into a blocked transaction proof", () => {
    const sample = liveProjectionSample({ id: 54, timestamp: 540 });
    const actor = retainedDomControlActor({
      actualInteractionProof: "active-editor-live",
    });
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "prepared-content",
      sample: liveProjectionSample({ id: 53, timestamp: 524 }),
    });
    const activeEditorVisibleProjectionState = visibleProjectionState({
      preparedContentFrame: createPreparedContentFrame({
        actorGenerations: [actor],
      }),
      kind: "motion-projection",
      sample,
    });

    const proof = createGpuFlowVisibleFramePresentationTransactionProof({
      contentPreparationFrame: {
        blockedPresentationCandidate: null,
        visibleProjectionState: null,
      },
      motionProjectionFrame: {
        blockedPresentationCandidate: null,
        visibleProjectionState: activeEditorVisibleProjectionState,
      },
      previousVisibleProjectionState,
      reducerDecision: reducerDecision(sample),
    });

    expect(proof.blockedSource).toBe("actor-proof");
    expect(proof.presentableFrameProof).toBeNull();
    expect(proof.renderedVisibleFrame).toBe(false);
    expect(proof.blockedPresentationCandidate).toEqual({
      blockedReasons: [
        {
          actorId: "control-a",
          family: "active-editor",
          reason: "active-editor-live-proof-required",
        },
      ],
      frozenFrameId:
        previousVisibleProjectionState.preparedContentFrame.displayFrameId,
    });
  });

  it.each(["exact-live-host", "same-live-host-compatible-projection"] as const)(
    "accepts active-editor motion proof from %s",
    (actualVisualProof) => {
      const sample = liveProjectionSample({ id: 49, timestamp: 490 });
      const actor = retainedDomControlActor({
        actualInteractionProof: "active-editor-live",
        actualVisualProof,
      });
      const proof = createGpuFlowVisibleFramePresentableFrameProof({
        preparedContentFrame: createPreparedContentFrame({
          actorGenerations: [actor],
        }),
        reducerDecision: reducerDecision(sample),
      });

      expect(proof.actorProofs).toEqual([
        expect.objectContaining({
          actualInteractionProof: "active-editor-live",
          actualVisualProof,
          browserVisualRepresentation: {
            actorId: "control-a",
            hostId: "host-a",
            islandId: "island-a",
            kind: "active-editor",
          },
          proofState: "exact",
          remainingDebt: [],
          requiredInteractionRepresentation: "active-editor-live",
          requiredVisualRepresentation: "browser-visual",
          sampledVisualEvidence: actualVisualProof,
        }),
      ]);
      expect(proof.browserActorProofs.actualInteraction).toEqual({
        "active-editor-live": 1,
      });
    },
  );

  it("rejects compatible previous proof without previous transaction representation identity", () => {
    const sample = liveProjectionSample({ id: 55, timestamp: 550 });
    const actor = actorWithBrowserVisualRepresentation(
      retainedDomControlActor({
        actualInteractionProof: "inactive-visual-only",
        compatiblePreviousBudgetState: "within-budget",
        requiredInteractionProof: "inactive-visual-only",
      }),
      null,
    );

    expect(() =>
      createGpuFlowVisibleFramePresentableFrameProof({
        preparedContentFrame: createPreparedContentFrame({
          actorGenerations: [actor],
        }),
        reducerDecision: reducerDecision(sample),
      }),
    ).toThrow(/compatible-previous:previous-transaction-identity-required/);
  });

  it("rejects active-editor live proof without active host representation identity", () => {
    const sample = liveProjectionSample({ id: 56, timestamp: 560 });
    const actor = actorWithBrowserVisualRepresentation(
      retainedDomControlActor({
        actualInteractionProof: "active-editor-live",
        actualVisualProof: "exact-live-host",
      }),
      { actorId: "control-a", hostId: "host-a", kind: "passive-live-display" },
    );

    expect(() =>
      createGpuFlowVisibleFramePresentableFrameProof({
        preparedContentFrame: createPreparedContentFrame({
          actorGenerations: [actor],
        }),
        reducerDecision: reducerDecision(sample),
      }),
    ).toThrow(/exact-live-host:active-editor-host-identity-required/);
  });

  it("rejects presentable frame proof when surface transaction resources are unprotected", () => {
    const sample = liveProjectionSample({ id: 57, timestamp: 570 });

    expect(() =>
      createGpuFlowVisibleFramePresentableFrameProof({
        preparedContentFrame: createPreparedContentFrame({
          exactSurfaceResourceHandles: [{ id: "source-a", kind: "source" }],
        }),
        reducerDecision: reducerDecision(sample),
      }),
    ).toThrow(/requires protected resources.*source:source-a/);
  });

  it("converts missing protected resources into a blocked transaction proof", () => {
    const sample = liveProjectionSample({ id: 58, timestamp: 580 });
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "prepared-content",
      sample: liveProjectionSample({ id: 57, timestamp: 564 }),
    });
    const visibleProjectionStateWithMissingResource = visibleProjectionState({
      preparedContentFrame: createPreparedContentFrame({
        exactSurfaceResourceHandles: [{ id: "source-a", kind: "source" }],
      }),
      kind: "prepared-content",
      sample,
    });

    const proof = createGpuFlowVisibleFramePresentationTransactionProof({
      contentPreparationFrame: {
        blockedPresentationCandidate: null,
        visibleProjectionState: visibleProjectionStateWithMissingResource,
      },
      motionProjectionFrame: {
        blockedPresentationCandidate: null,
        visibleProjectionState: null,
      },
      previousVisibleProjectionState,
      reducerDecision: reducerDecision(sample),
    });

    expect(proof.blockedSource).toBe("resource-protection");
    expect(proof.presentableFrameProof).toBeNull();
    expect(proof.blockedPresentationCandidate).toEqual({
      blockedReasons: [
        {
          actorId: null,
          family: "resource-protection",
          reason: "missing-protected-resource:source:source-a",
        },
      ],
      frozenFrameId:
        previousVisibleProjectionState.preparedContentFrame.displayFrameId,
    });
  });

  it.each([
    {
      actor: actorWithBrowserVisualRepresentation(
        retainedDomControlActor({
          active: false,
          actualInteractionProof: "inactive-visual-only",
          compatiblePreviousBudgetState: "within-budget",
          requiredInteractionProof: "inactive-visual-only",
        }),
        null,
      ),
      family: "browser-visual",
      reason:
        "control-a:compatible-previous:previous-transaction-identity-required",
    },
    {
      actor: actorWithBrowserVisualRepresentation(
        retainedDomControlActor({
          actualInteractionProof: "active-editor-live",
          actualVisualProof: "exact-live-host",
        }),
        {
          actorId: "control-a",
          hostId: "host-a",
          kind: "passive-live-display",
        },
      ),
      family: "active-editor",
      reason: "control-a:exact-live-host:active-editor-host-identity-required",
    },
  ])(
    "converts browser representation mismatch into a blocked transaction proof",
    ({ actor, family, reason }) => {
      const sample = liveProjectionSample({ id: 57, timestamp: 570 });
      const previousVisibleProjectionState = visibleProjectionState({
        kind: "prepared-content",
        sample: liveProjectionSample({ id: 56, timestamp: 554 }),
      });
      const visibleProjectionStateWithMismatch = visibleProjectionState({
        preparedContentFrame: createPreparedContentFrame({
          actorGenerations: [actor],
        }),
        kind: "prepared-content",
        sample,
      });

      const proof = createGpuFlowVisibleFramePresentationTransactionProof({
        contentPreparationFrame: {
          blockedPresentationCandidate: null,
          visibleProjectionState: visibleProjectionStateWithMismatch,
        },
        motionProjectionFrame: {
          blockedPresentationCandidate: null,
          visibleProjectionState: null,
        },
        previousVisibleProjectionState,
        reducerDecision: reducerDecision(sample),
      });

      expect(proof.blockedSource).toBe("actor-proof");
      expect(proof.presentableFrameProof).toBeNull();
      expect(proof.renderedVisibleFrame).toBe(false);
      expect(proof.visibleProjectionState).toBeNull();
      expect(proof.blockedPresentationCandidate).toEqual({
        blockedReasons: [{ actorId: "control-a", family, reason }],
        frozenFrameId:
          previousVisibleProjectionState.preparedContentFrame.displayFrameId,
      });
    },
  );

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
  exactSurfaceResourceHandles = [],
  protectedResourceHandles = [],
}: {
  readonly actorGenerations?: readonly GpuFlowPreparedContentActorGeneration[];
  readonly compatiblePreviousActorIds?: readonly string[] | undefined;
  readonly exactSurfaceResourceHandles?:
    | readonly SurfaceResourceHandle[]
    | undefined;
  readonly protectedResourceHandles?:
    | readonly ProtectedSurfaceResourceHandle[]
    | undefined;
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
  const surfaceTransaction =
    exactSurfaceResourceHandles.length > 0 ||
    protectedResourceHandles.length > 0
      ? {
          activeDomIslandTransaction: {
            islands: [],
            mode: "none",
          },
          coverageProof: {
            blockingGenerationIds: [],
            blockingSurfaceIds: [],
            compatibilityProof: {
              compatibleForActiveDomIsland: true,
              compatibleForClipChain: true,
              compatibleForHitTesting: true,
              compatibleForMotion: true,
              compatibleForSourceWindow: true,
              compatibleForVisuals: true,
              rejectedCandidates: [],
            },
            compatibleCoverage: [],
            exactCoverage: [
              {
                coverageRect: rect(),
                fidelity: "exact",
                generationId: "generation:resource-a",
                rendererBucket: "retained-content",
                resourceHandles: exactSurfaceResourceHandles,
                surfaceId: "surface:resource-a",
                zIndex: 1,
              },
            ],
            protectedResourceHandles,
            rendererBuckets: [],
            trueHoleRects: [],
            visibleRects: [],
            zOrder: [],
          },
          desiredSurfaceGenerations: [],
          diagnostics: {
            hold: null,
            presentedAtMs: 0,
          },
          drawCommands: [],
          followUpWorkRequests: [],
          hitIndex: {
            generationIds: [],
            id: `hit:${displayFrameId}`,
          },
          id: `surface-transaction:${displayFrameId}`,
          motionFrame: {
            activeIslands: [],
            retainedScrollOffset: null,
            viewport: { x: 0, y: 0, zoom: 1 },
          },
          protectedResourceHandles,
          rendererBuckets: [],
          zOrder: [],
        }
      : null;
  return {
    actorGenerations,
    coherence,
    displayFrameId,
    presentationProof: createGpuFlowPreparedContentPresentationProof({
      actorGenerations,
      coherence,
      displayFrameId,
      surfaceTransaction:
        surfaceTransaction as GpuFlowPreparedContentFrame["surfaceTransaction"],
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
    presentability: {
      blockingActorIds: [],
      kind: "presentable",
    },
    surfaceTransaction,
  } as unknown as GpuFlowPreparedContentFrame;
}

function retainedDomControlActor({
  active = true,
  actualInteractionProof = "blocked",
  actualVisualProof = "compatible-previous",
  compatiblePreviousBudgetState = null,
  requiredInteractionProof = "active-editor-live",
}: {
  readonly active?: boolean | undefined;
  readonly actualInteractionProof?: string | undefined;
  readonly actualVisualProof?: string | undefined;
  readonly compatiblePreviousBudgetState?:
    | "over-budget"
    | "within-budget"
    | null
    | undefined;
  readonly requiredInteractionProof?: string | undefined;
} = {}): GpuFlowPreparedContentActorGeneration {
  return freezeActor({
    active,
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
  actor: GpuFlowPreparedContentActorGeneration,
  representation: NonNullable<
    GpuFlowPreparedContentActorGeneration["browserVisual"]
  >["representation"],
): GpuFlowPreparedContentActorGeneration {
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

function retainedDomControlBrowserVisual({
  actualInteractionProof,
  actualVisualProof,
  requiredInteractionProof,
}: {
  readonly actualInteractionProof: string;
  readonly actualVisualProof: string;
  readonly requiredInteractionProof: string;
}): GpuFlowPreparedContentActorGeneration["browserVisual"] {
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
  } as GpuFlowPreparedContentActorGeneration["browserVisual"];
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
}): GpuFlowPreparedContentActorGeneration["textCoverageProof"] {
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
      previousContentFrameId: 6,
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
