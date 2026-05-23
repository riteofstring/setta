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
  createGpuFlowVisibleFramePublicationTransactionProofFactory,
  createGpuFlowVisiblePublicationCommitProofFactory,
  type GpuFlowVisibleFramePublicationCandidateSet,
  type GpuFlowVisibleFramePublicationContentCandidate,
  type GpuFlowVisibleFramePublicationMotionCandidate,
} from "./visibleFrameTransactionProofs";

const KERNEL_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameKernel.ts", import.meta.url),
);
const PROOF_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameTransactionProofs.ts", import.meta.url),
);
const createGpuFlowVisibleFramePublicationTransactionProofFromFactory =
  createGpuFlowVisibleFramePublicationTransactionProofFactory();
const createGpuFlowVisiblePublicationCommitProofFromFactory =
  createGpuFlowVisiblePublicationCommitProofFactory();
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

function createGpuFlowVisiblePublicationCommitProof({
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
  return createGpuFlowVisiblePublicationCommitProofFromFactory({
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
  ...proofInput
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> & {
  readonly previousVisibleProjectionState?: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}) {
  const transactionProof =
    createGpuFlowVisibleFramePublicationTransactionProof({
      contentPublicationFrame:
        withTestGpuFlowVisiblePublicationPresentationEvidence(
          contentPublicationFrame,
        ),
      motionProjectionFrame:
        withTestGpuFlowVisiblePublicationPresentationEvidence(
          motionProjectionFrame,
        ),
      ...proofInput,
    });
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

describe("GPU Flow visible frame transaction proofs", () => {
  it("keeps candidate-set proof assembly out of the kernel wrapper", () => {
    const kernelSource = readFileSync(KERNEL_MODULE_PATH, "utf8");
    const proofSource = readFileSync(PROOF_MODULE_PATH, "utf8");

    expect(kernelSource).not.toContain(
      "createGpuFlowVisibleFramePublicationProofBlockedSource",
    );
    expect(kernelSource).not.toContain(
      "selectGpuFlowVisibleFramePublicationProjectionSource",
    );
    expect(kernelSource).not.toContain(
      "function createGpuFlowMotionProjectionBlockedPublicationCandidate",
    );
    expect(proofSource).not.toContain(
      "function createGpuFlowMotionProjectionBlockedPublicationCandidate",
    );
    expect(proofSource).toContain(
      "createGpuFlowVisibleFramePublicationCandidateBlockedProof",
    );
    expect(proofSource).toContain(
      "selectGpuFlowVisibleFramePublicationProjectionSource",
    );
    expect(proofSource).toContain(
      "motionProjectionFrame.blockedPublicationCandidate",
    );
    expect(proofSource).toContain(
      "type GpuFlowVisiblePublicationBlockedProof",
    );
    expect(proofSource).toContain(
      "function createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame",
    );
    expect(proofSource).not.toContain(
      "export function createGpuFlowVisiblePublicationCommitProof(",
    );
    expect(proofSource).not.toContain(
      "export function createGpuFlowVisiblePublicationCommitDebtProof(",
    );
    expect(proofSource).not.toContain(
      "export function selectGpuFlowVisibleFramePublicationPreparedFrame(",
    );
    expect(proofSource).not.toContain(
      "export function createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame(",
    );
    expect(kernelSource).not.toContain(
      "function createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame",
    );
  });

  it("records blocked proof sources", () => {
    const contentVisibleState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 43, timestamp: 430 }),
    });
    const contentBlockedCandidate =
      createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: "content-publication-blocked",
        heldPreviousProjectionState: null,
      });
    const proof = createGpuFlowVisibleFramePublicationTransactionProof({
      contentPublicationFrame: {
        blockedPublicationCandidate: contentBlockedCandidate,
        visibleProjectionState: null,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      publicationDecision: publicationDecision(contentVisibleState.sample),
    });

    expect(proof.blockedPublicationCandidate).toBe(contentBlockedCandidate);
    expect(proof.blockedProof).toEqual({
      blockedReasons: contentBlockedCandidate.blockedReasons,
      candidate: contentBlockedCandidate,
      frozenFrameId: contentBlockedCandidate.frozenFrameId,
      source: "content-publication",
    });
    expect(proof.blockedSource).toBe("content-publication");
    expect(proof.commitProof).toBeNull();
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
    const proof = createGpuFlowVisiblePublicationCommitProof({
      committedFrame: committedSurfaceFrame({ actorGenerations: [actor] }),
      publicationDecision: publicationDecision(sample),
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
        previousCommittedFrameId: 6,
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

  it("keeps exact content debt queued for compatible-previous committed coverage", () => {
    const sample = liveProjectionSample({ id: 46, timestamp: 460 });
    const publicationDecisionWithContentDebt = publicationDecision(sample);

    expect(
      createGpuFlowVisiblePublicationCommitProof({
        committedFrame: committedSurfaceFrame({
          compatiblePreviousActorIds: ["actor-a"],
        }),
        publicationDecision: publicationDecisionWithContentDebt,
      }).debtProof,
    ).toEqual({
      content: false,
      maintenance: false,
      motion: false,
    });
    expect(
      createGpuFlowVisiblePublicationCommitProof({
        committedFrame: committedSurfaceFrame({
          compatiblePreviousActorIds: [],
        }),
        publicationDecision: publicationDecisionWithContentDebt,
      }).debtProof,
    ).toEqual({
      content: true,
      maintenance: false,
      motion: false,
    });
  });

  it("rejects blocked actor proofs as commit candidates", () => {
    const sample = liveProjectionSample({ id: 50, timestamp: 500 });
    const actor = retainedDomControlActor();

    expect(() =>
      createGpuFlowVisiblePublicationCommitProof({
        committedFrame: committedSurfaceFrame({ actorGenerations: [actor] }),
        publicationDecision: publicationDecision(sample),
      }),
    ).toThrow(
      "GPU Flow visible publication proof cannot commit blocked actor proofs: control-a:compatible-previous:blocked.",
    );
  });

  it("rejects active-editor proof on compatible-previous visual coverage", () => {
    const sample = liveProjectionSample({ id: 51, timestamp: 510 });
    const actor = retainedDomControlActor({
      actualInteractionProof: "active-editor-live",
    });

    expect(() =>
      createGpuFlowVisiblePublicationCommitProof({
        committedFrame: committedSurfaceFrame({ actorGenerations: [actor] }),
        publicationDecision: publicationDecision(sample),
      }),
    ).toThrow(
      "GPU Flow visible publication proof cannot commit blocked actor proofs: control-a:compatible-previous:active-editor-live.",
    );
  });

  it("rejects over-budget compatible previous proofs as commit candidates", () => {
    const sample = liveProjectionSample({ id: 52, timestamp: 520 });
    const actor = retainedDomControlActor({
      actualInteractionProof: "inactive-visual-only",
      compatiblePreviousBudgetState: "over-budget",
    });

    expect(() =>
      createGpuFlowVisiblePublicationCommitProof({
        committedFrame: committedSurfaceFrame({ actorGenerations: [actor] }),
        publicationDecision: publicationDecision(sample),
      }),
    ).toThrow(
      "GPU Flow visible publication proof cannot commit blocked actor proofs: control-a:compatible-previous:inactive-visual-only.",
    );
  });

  it("converts over-budget compatible previous proof into a blocked transaction proof", () => {
    const sample = liveProjectionSample({ id: 53, timestamp: 530 });
    const actor = retainedDomControlActor({
      actualInteractionProof: "inactive-visual-only",
      compatiblePreviousBudgetState: "over-budget",
    });
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 52, timestamp: 514 }),
    });
    const overBudgetVisibleProjectionState = visibleProjectionState({
      committedFrame: committedSurfaceFrame({ actorGenerations: [actor] }),
      kind: "content-publication",
      sample,
    });

    const proof = createGpuFlowVisibleFramePublicationTransactionProof({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: overBudgetVisibleProjectionState,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      previousVisibleProjectionState,
      publicationDecision: publicationDecision(sample),
    });

    expect(proof.blockedSource).toBe("compatible-previous-proof");
    expect(proof.commitProof).toBeNull();
    expect(proof.renderedVisibleFrame).toBe(false);
    expect(proof.visibleProjectionState).toBeNull();
    expect(proof.blockedPublicationCandidate).toEqual({
      blockedReasons: [
        {
          actorId: "control-a",
          family: "compatible-previous",
          reason: "compatible-previous-budget-exceeded",
        },
      ],
      frozenFrameId:
        previousVisibleProjectionState.committedFrame.displayFrameId,
    });
  });

  it("converts active-editor compatible previous proof into a blocked transaction proof", () => {
    const sample = liveProjectionSample({ id: 54, timestamp: 540 });
    const actor = retainedDomControlActor({
      actualInteractionProof: "active-editor-live",
    });
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 53, timestamp: 524 }),
    });
    const activeEditorVisibleProjectionState = visibleProjectionState({
      committedFrame: committedSurfaceFrame({ actorGenerations: [actor] }),
      kind: "motion-projection",
      sample,
    });

    const proof = createGpuFlowVisibleFramePublicationTransactionProof({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: activeEditorVisibleProjectionState,
      },
      previousVisibleProjectionState,
      publicationDecision: publicationDecision(sample),
    });

    expect(proof.blockedSource).toBe("actor-proof");
    expect(proof.commitProof).toBeNull();
    expect(proof.renderedVisibleFrame).toBe(false);
    expect(proof.blockedPublicationCandidate).toEqual({
      blockedReasons: [
        {
          actorId: "control-a",
          family: "active-editor",
          reason: "active-editor-live-proof-required",
        },
      ],
      frozenFrameId:
        previousVisibleProjectionState.committedFrame.displayFrameId,
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
      const proof = createGpuFlowVisiblePublicationCommitProof({
        committedFrame: committedSurfaceFrame({ actorGenerations: [actor] }),
        publicationDecision: publicationDecision(sample),
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
      createGpuFlowVisiblePublicationCommitProof({
        committedFrame: committedSurfaceFrame({ actorGenerations: [actor] }),
        publicationDecision: publicationDecision(sample),
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
      createGpuFlowVisiblePublicationCommitProof({
        committedFrame: committedSurfaceFrame({ actorGenerations: [actor] }),
        publicationDecision: publicationDecision(sample),
      }),
    ).toThrow(/exact-live-host:active-editor-host-identity-required/);
  });

  it("rejects commit proof proof when actor resources are unprotected", () => {
    const sample = liveProjectionSample({ id: 57, timestamp: 570 });
    const actor = actorWithBrowserVisualResourceHandles(
      retainedDomControlActor({
        actualInteractionProof: "active-editor-live",
        actualVisualProof: "exact-live-host",
      }),
      [{ id: "source-a", kind: "source" }],
    );

    expect(() =>
      createGpuFlowVisiblePublicationCommitProof({
        committedFrame: committedSurfaceFrame({ actorGenerations: [actor] }),
        publicationDecision: publicationDecision(sample),
      }),
    ).toThrow(/requires protected resources.*source:source-a/);
  });

  it("converts missing protected resources into a blocked transaction proof", () => {
    const sample = liveProjectionSample({ id: 58, timestamp: 580 });
    const actor = actorWithBrowserVisualResourceHandles(
      retainedDomControlActor({
        actualInteractionProof: "active-editor-live",
        actualVisualProof: "exact-live-host",
      }),
      [{ id: "source-a", kind: "source" }],
    );
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 57, timestamp: 564 }),
    });
    const visibleProjectionStateWithMissingResource = visibleProjectionState({
      committedFrame: committedSurfaceFrame({ actorGenerations: [actor] }),
      kind: "content-publication",
      sample,
    });

    const proof = createGpuFlowVisibleFramePublicationTransactionProof({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: visibleProjectionStateWithMissingResource,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      previousVisibleProjectionState,
      publicationDecision: publicationDecision(sample),
    });

    expect(proof.blockedSource).toBe("resource-protection");
    expect(proof.commitProof).toBeNull();
    expect(proof.blockedPublicationCandidate).toEqual({
      blockedReasons: [
        {
          actorId: null,
          family: "resource-protection",
          reason: "missing-protected-resource:source:source-a",
        },
      ],
      frozenFrameId:
        previousVisibleProjectionState.committedFrame.displayFrameId,
    });
  });

  it.each([
    {
      actor: actorWithBrowserVisualRepresentation(
        retainedDomControlActor({
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
        kind: "content-publication",
        sample: liveProjectionSample({ id: 56, timestamp: 554 }),
      });
      const visibleProjectionStateWithMismatch = visibleProjectionState({
        committedFrame: committedSurfaceFrame({ actorGenerations: [actor] }),
        kind: "content-publication",
        sample,
      });

      const proof = createGpuFlowVisibleFramePublicationTransactionProof({
        contentPublicationFrame: {
          blockedPublicationCandidate: null,
          visibleProjectionState: visibleProjectionStateWithMismatch,
        },
        motionProjectionFrame: {
          blockedPublicationCandidate: null,
          visibleProjectionState: null,
        },
        previousVisibleProjectionState,
        publicationDecision: publicationDecision(sample),
      });

      expect(proof.blockedSource).toBe("actor-proof");
      expect(proof.commitProof).toBeNull();
      expect(proof.renderedVisibleFrame).toBe(false);
      expect(proof.visibleProjectionState).toBeNull();
      expect(proof.blockedPublicationCandidate).toEqual({
        blockedReasons: [{ actorId: "control-a", family, reason }],
        frozenFrameId:
          previousVisibleProjectionState.committedFrame.displayFrameId,
      });
    },
  );

  it("rejects competing content and motion visible projection states", () => {
    const contentVisibleState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 40, timestamp: 400 }),
    });
    const motionVisibleState = visibleProjectionState({
      kind: "motion-projection",
      sample: liveProjectionSample({ id: 41, timestamp: 416 }),
    });

    expect(() =>
      selectGpuFlowVisibleFramePublicationPreparedFrame({
        contentPublicationFrame: {
          blockedPublicationCandidate: null,
          visibleProjectionState: contentVisibleState,
        },
        motionProjectionFrame: {
          blockedPublicationCandidate: null,
          visibleProjectionState: motionVisibleState,
        },
        publicationDecision: publicationDecision(contentVisibleState.sample),
      }),
    ).toThrow(
      "GPU Flow visible publication proof received competing content and motion visible projection states for one transaction.",
    );
  });

  it("ignores blocked candidates from the unselected projection lane", () => {
    const contentVisibleState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 44, timestamp: 440 }),
    });
    const motionBlockedCandidate =
      createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: "motion-projection-blocked",
        heldPreviousProjectionState: null,
      });

    const proof = createGpuFlowVisibleFramePublicationTransactionProof({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: contentVisibleState,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: motionBlockedCandidate,
        visibleProjectionState: null,
      },
      publicationDecision: publicationDecision(contentVisibleState.sample),
    });

    expect(proof.blockedPublicationCandidate).toBeNull();
    expect(proof.blockedSource).toBeNull();
    expect(proof.commitProof).not.toBeNull();
    expect(proof.renderedVisibleFrame).toBe(true);
    expect(proof.visibleProjectionSource).toBe("content-publication");
    expect(proof.visibleProjectionState).toBe(contentVisibleState);
  });

  it("records motion projection as the visible source when content does not publish", () => {
    const motionVisibleState = visibleProjectionState({
      kind: "motion-projection",
      sample: liveProjectionSample({ id: 41, timestamp: 416 }),
    });

    const prepared = selectGpuFlowVisibleFramePublicationPreparedFrame({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: motionVisibleState,
      },
      publicationDecision: publicationDecision(motionVisibleState.sample),
    });

    expect(prepared.renderedVisibleFrame).toBe(true);
    expect(prepared.commitProof?.presentationProof).toEqual(
      expect.objectContaining({
        projectionSampleId: motionVisibleState.sample.id,
      }),
    );
    expect(prepared.visibleProjectionState).toBe(motionVisibleState);
    expect(
      createGpuFlowVisibleFramePublicationTransactionProof({
        contentPublicationFrame: {
          blockedPublicationCandidate: null,
          visibleProjectionState: null,
        },
        motionProjectionFrame: {
          blockedPublicationCandidate: null,
          visibleProjectionState: motionVisibleState,
        },
        publicationDecision: publicationDecision(motionVisibleState.sample),
      }).visibleProjectionSource,
    ).toBe("motion-projection");
    expect(prepared.commitProof?.debtProof.content).toBe(true);
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
