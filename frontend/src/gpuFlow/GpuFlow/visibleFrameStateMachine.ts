import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import {
  createGpuFlowNodeLayerPreparedContentFramePublicationResult,
  type GpuFlowNodeLayerFrameResult,
} from "./flowFrameResult";
import type { GpuFlowRetainedDisplayPublicationResult } from "./flowRetainedDisplayTransaction";
import type {
  GpuFlowPreparedContentFramePublicationActionFrameResult,
  GpuFlowPreparedContentFramePublicationFramePlan,
  GpuFlowPreparedContentFramePublicationFramePlanResult,
  GpuFlowRetainedDisplayOutcomeFrameResult,
  GpuFlowRetainedDisplayPublicationFramePlan,
  GpuFlowRetainedDisplayPublicationOutcomeFrame,
} from "./visibleFrameActorAdapters/contentDecisionKernel";
import type { GpuFlowPreparedContentFrameCandidateAction } from "./visibleFrameActorAdapters/preparedContentFrameCandidateAction";
import {
  createGpuFlowBrowserVisualBlockedPublicationCandidate,
  createGpuFlowBrowserVisualResourceWorkRequests,
  shouldPreservePreparedContentFrameForBrowserVisualRepair,
} from "./visibleFrameBlockedCandidate";
import type {
  GpuFlowPreparedContentFramePublicationCandidate,
  GpuFlowPreparedContentFramePublicationCandidateInput,
  GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "./visibleFrameContentPlan";
import {
  createGpuFlowPresentationId,
  createGpuFlowVisibleFrameActorKey,
  type GpuFlowContentFrameId,
  type GpuFlowPresentationId,
  type GpuFlowProjectionSampleId,
  type GpuFlowVisibleFrameActorFamily,
  type GpuFlowVisibleFrameActorProof,
  type GpuFlowVisibleFrameCandidate,
  type GpuFlowVisibleFrameDebt,
  type GpuFlowVisibleFramePresentedActorCoverage,
  type GpuFlowVisibleFramePresentedFrame,
  type GpuFlowVisibleFrameRect,
} from "./visibleFrameTypes";

export {
  createGpuFlowVisibleFrameStarvationPolicy,
  DEFAULT_GPU_FLOW_VISIBLE_FRAME_STARVATION_POLICY,
  getGpuFlowVisibleFrameHeldPreviousBudgetStatus,
  reduceGpuFlowMotionProjectionFramePreparation,
  reduceGpuFlowVisibleFrameMotionProjectionTransaction,
  reduceGpuFlowVisibleFrameReducerDecision,
  reduceGpuFlowVisibleFrameWorkLane,
} from "./visibleFrameStateMachineReduction";
export type {
  GpuFlowVisibleFrameLaneReductionFacts,
  GpuFlowVisibleFrameWorkLane,
  GpuFlowVisibleFrameStarvationPolicy,
} from "./visibleFrameStateMachineReduction";

const GPU_FLOW_VISIBLE_FRAME_STATE_MACHINE_OUTCOME = Symbol(
  "GpuFlowVisibleFrameStateMachineOutcome",
);

type GpuFlowPreparedContentFramePublicationReadiness =
  | {
      readonly kind: "publish";
    }
  | {
      readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate;
      readonly errorMessage: string | null;
      readonly kind: "nonpublishable";
    };

type GpuFlowRetainedDisplayPublicationOutcome =
  GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];

type GpuFlowContentPublicationBlockedCandidateSelector = (input: {
  readonly blockedPreparedContentFramePublicationCandidate?:
    | GpuFlowVisibleFrameBlockedPublicationCandidate
    | null
    | undefined;
  readonly retainedDisplayBlockedPublicationCandidate?:
    | GpuFlowVisibleFrameBlockedPublicationCandidate
    | null
    | undefined;
}) => GpuFlowVisibleFrameBlockedPublicationCandidate | null;

export function reduceGpuFlowPreparedContentFramePublicationCandidate({
  deferBrowserVisualWakeup,
  heldPreviousProjectionState,
  liveProjectionSample,
  preparedContentFrame,
}: GpuFlowPreparedContentFramePublicationCandidateInput): GpuFlowPreparedContentFramePublicationCandidate {
  const publicationReadiness =
    resolveGpuFlowPreparedContentFramePublicationReadiness({
      heldPreviousProjectionState,
      preparedContentFrame,
    });
  if (publicationReadiness.kind === "publish") {
    return {
      kind: "publish",
    };
  }
  if (!preparedContentFrame) {
    throw new Error(
      "GPU Flow prepared content frame publication transaction blocked without a candidate frame.",
    );
  }
  return {
    blockedPublicationCandidate:
      publicationReadiness.blockedPublicationCandidate,
    candidateFrame: preparedContentFrame,
    errorMessage: publicationReadiness.errorMessage,
    kind: "nonpublishable",
    preservePreparationSnapshot:
      shouldPreservePreparedContentFrameForBrowserVisualRepair(
        publicationReadiness.blockedPublicationCandidate,
      ),
    resourceWork: {
      deferWakeup: deferBrowserVisualWakeup === true,
      timestamp: liveProjectionSample.timestamp,
      workItems: createGpuFlowBrowserVisualResourceWorkRequests({
        blockedPublicationCandidate:
          publicationReadiness.blockedPublicationCandidate,
        frame: preparedContentFrame,
      }),
    },
  };
}

export function selectGpuFlowPreparedContentFramePublicationFramePlan({
  candidate,
  preparedContentFrame,
}: {
  readonly candidate: GpuFlowPreparedContentFramePublicationCandidate;
  readonly preparedContentFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowPreparedContentFramePublicationFramePlan {
  const action = resolveGpuFlowPreparedContentFrameCandidateAction({
    candidate,
    preparedContentFrame,
  });
  const result = resolveGpuFlowPreparedContentFramePublicationActionFrameResult(
    {
      action,
    },
  );
  if (action.kind !== "publish") {
    return {
      blockedPublicationCandidate: result.blockedPublicationCandidate,
      preparedContentFramePublication: result.preparedContentFramePublication,
      kind: "candidate" as const,
      visibleProjectionState: result.visibleProjectionState,
    };
  }
  return {
    blockedPublicationCandidate: null,
    preparedContentFramePublication: result.preparedContentFramePublication,
    kind: "publish" as const,
    visibleProjectionState: null,
  };
}

export function resolveGpuFlowPreparedContentFramePublicationFramePlanResult({
  framePlan,
}: {
  readonly framePlan: GpuFlowPreparedContentFramePublicationFramePlan;
}): GpuFlowPreparedContentFramePublicationFramePlanResult {
  return {
    blockedPublicationCandidate: framePlan.blockedPublicationCandidate,
    preparedContentFramePublication: framePlan.preparedContentFramePublication,
    visibleProjectionState: framePlan.visibleProjectionState,
  };
}

export function selectGpuFlowRetainedDisplayPublicationFramePlan({
  retainedDisplayOutcome,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayOutcome: GpuFlowRetainedDisplayPublicationOutcome;
}): GpuFlowRetainedDisplayPublicationFramePlan {
  const outcomeFrame = resolveGpuFlowRetainedDisplayPublicationOutcomeFrame(
    retainedDisplayOutcome,
  );
  return {
    kind: "published" as const,
    publishedOutcomeFrame: outcomeFrame,
  };
}

export function resolveGpuFlowRetainedDisplayPublicationFramePlanResult({
  framePlan,
}: {
  readonly framePlan: GpuFlowRetainedDisplayPublicationFramePlan;
}): GpuFlowRetainedDisplayOutcomeFrameResult {
  return {
    blockedPublicationCandidate: null,
    publishedOutcomeFrame: framePlan.publishedOutcomeFrame,
  };
}

export function selectGpuFlowContentPublicationBlockedCandidateForFrameResult({
  nodeLayerFrameResult,
  previousVisibleProjectionState,
}: {
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameBlockedPublicationCandidate | null {
  const preparedContentFramePublication =
    nodeLayerFrameResult.preparedContentFramePublication;
  const selectContentPublicationBlockedCandidate =
    selectGpuFlowContentPublicationBlockedCandidate({
      previousVisibleProjectionState,
    });
  return selectContentPublicationBlockedCandidate({
    blockedPreparedContentFramePublicationCandidate:
      preparedContentFramePublication.blockedSurfacePublication
        ?.blockedPublicationCandidate ?? null,
    retainedDisplayBlockedPublicationCandidate:
      nodeLayerFrameResult.blockedPublicationCandidate,
  });
}

function resolveGpuFlowPreparedContentFrameCandidateAction({
  candidate,
  preparedContentFrame,
}: {
  readonly candidate: GpuFlowPreparedContentFramePublicationCandidate;
  readonly preparedContentFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowPreparedContentFrameCandidateAction {
  switch (candidate.kind) {
    case "nonpublishable":
      return {
        blockedSurfacePublication: candidate,
        kind: "blocked-candidate",
        visibleProjectionState: null,
      };
    case "publish":
      return {
        preparedContentFrame: preparedContentFrame ?? null,
        kind: "publish",
      };
  }
}

function resolveGpuFlowPreparedContentFramePublicationActionFrameResult({
  action,
}: {
  readonly action: GpuFlowPreparedContentFrameCandidateAction;
}): GpuFlowPreparedContentFramePublicationActionFrameResult {
  const preparedContentFramePublication =
    createGpuFlowNodeLayerPreparedContentFramePublicationResult({
      action,
    });
  if (action.kind === "publish") {
    return {
      blockedPublicationCandidate: null,
      preparedContentFramePublication,
      visibleProjectionState: null,
    };
  }
  if (action.kind === "blocked-candidate") {
    return {
      blockedPublicationCandidate:
        action.blockedSurfacePublication.blockedPublicationCandidate,
      preparedContentFramePublication,
      visibleProjectionState: null,
    };
  }
  action satisfies never;
  throw new Error(
    "Unknown GPU Flow prepared content frame publication action.",
  );
}

function selectGpuFlowContentPublicationBlockedCandidate({
  previousVisibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPublicationBlockedCandidateSelector {
  return ({
    blockedPreparedContentFramePublicationCandidate,
    retainedDisplayBlockedPublicationCandidate,
  }) => {
    if (blockedPreparedContentFramePublicationCandidate) {
      return blockedPreparedContentFramePublicationCandidate;
    }
    if (retainedDisplayBlockedPublicationCandidate) {
      return retainedDisplayBlockedPublicationCandidate;
    }
    void previousVisibleProjectionState;
    return null;
  };
}

function resolveGpuFlowRetainedDisplayPublicationOutcomeFrame(
  outcome: GpuFlowRetainedDisplayPublicationOutcome,
): GpuFlowRetainedDisplayPublicationOutcomeFrame {
  return {
    frame: outcome.frame,
    kind: "published",
    outcome,
    outcomeKind: outcome.kind,
  };
}

function resolveGpuFlowPreparedContentFramePublicationReadiness({
  heldPreviousProjectionState,
  preparedContentFrame,
}: {
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly preparedContentFrame: GpuFlowPreparedContentFramePublicationCandidateInput["preparedContentFrame"];
}): GpuFlowPreparedContentFramePublicationReadiness {
  if (
    !preparedContentFrame ||
    preparedContentFrame.publishability.kind === "publishable"
  ) {
    return {
      kind: "publish",
    };
  }
  return {
    blockedPublicationCandidate:
      createGpuFlowBrowserVisualBlockedPublicationCandidate({
        frame: preparedContentFrame,
        heldPreviousProjectionState,
      }),
    errorMessage: null,
    kind: "nonpublishable",
  };
}

type GpuFlowVisibleFrameStateMachineOutcomeBrand = {
  readonly [GPU_FLOW_VISIBLE_FRAME_STATE_MACHINE_OUTCOME]: true;
};

type GpuFlowVisibleFrameStateMachineOutcomeReason = {
  readonly actorId: string | null;
  readonly family: GpuFlowVisibleFrameActorFamily | "frame";
  readonly proof: "blocked" | "compatible-previous" | "missing" | "true-hole";
  readonly reason: string;
};

export type GpuFlowVisibleFrameStateMachineOutcome =
  GpuFlowVisibleFrameStateMachineOutcomeBrand &
    (
      | {
          readonly contentFrameId: GpuFlowContentFrameId;
          readonly debt: GpuFlowVisibleFrameDebt;
          readonly decidingProof: null;
          readonly kind: "presented";
          readonly presentationId: GpuFlowPresentationId;
          readonly projectionSampleId: GpuFlowProjectionSampleId;
        }
      | {
          readonly contentFrameId: GpuFlowContentFrameId;
          readonly debt: GpuFlowVisibleFrameDebt;
          readonly decidingProof: null;
          readonly kind: "projected";
          readonly presentationId: GpuFlowPresentationId;
          readonly previousPresentationId: GpuFlowPresentationId;
          readonly projectionSampleId: GpuFlowProjectionSampleId;
        }
      | {
          readonly contentFrameId: GpuFlowContentFrameId;
          readonly debt: GpuFlowVisibleFrameDebt;
          readonly decidingProof: GpuFlowVisibleFrameStateMachineOutcomeReason;
          readonly heldForProjectionSampleId: GpuFlowProjectionSampleId;
          readonly kind: "held";
          readonly presentationId: GpuFlowPresentationId;
        }
      | {
          readonly debt: GpuFlowVisibleFrameDebt;
          readonly decidingProof: GpuFlowVisibleFrameStateMachineOutcomeReason;
          readonly kind: "blocked-cold-start";
          readonly shellFrameId: "cold-start-shell";
        }
      | {
          readonly debt: GpuFlowVisibleFrameDebt;
          readonly decidingProof: GpuFlowVisibleFrameStateMachineOutcomeReason;
          readonly kind: "aborted";
          readonly previousPresentationId: GpuFlowPresentationId;
          readonly releasedResourceIds: readonly string[];
        }
    );

type GpuFlowVisibleFrameBlockingProof = {
  readonly proof: GpuFlowVisibleFrameStateMachineOutcomeReason;
};

export type GpuFlowVisibleFrameStateMachineSample = {
  readonly activeGestureOwner: string | null;
  readonly canvasSize: {
    readonly height: number;
    readonly width: number;
  };
  readonly currentContentFrameId: number | string | null;
  readonly dpr: number;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly queuedDebt: GpuFlowVisibleFrameDebt;
  readonly retainedScrollOffsets: readonly {
    readonly actorId: string;
    readonly scrollLeft: number;
    readonly scrollTop: number;
  }[];
  readonly sceneGeneration: string;
  readonly viewport: GpuFlowVisibleFrameRect;
};

export type GpuFlowVisibleFramePreparedFrame = {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly previousPresentation: GpuFlowVisibleFramePresentedFrame | null;
  readonly sample: GpuFlowVisibleFrameStateMachineSample;
};

type GpuFlowVisibleFrameStateMachinePresentationOutcome = Extract<
  GpuFlowVisibleFrameStateMachineOutcome,
  { readonly kind: "presented" | "projected" }
>;

type GpuFlowVisibleFrameStateMachineAbortedOutcome = Extract<
  GpuFlowVisibleFrameStateMachineOutcome,
  { readonly kind: "aborted" }
>;

type GpuFlowVisibleFrameStateMachineHeldOutcome = Extract<
  GpuFlowVisibleFrameStateMachineOutcome,
  { readonly kind: "held" }
>;

type GpuFlowVisibleFrameStateMachineColdStartOutcome = Extract<
  GpuFlowVisibleFrameStateMachineOutcome,
  { readonly kind: "blocked-cold-start" }
>;

type GpuFlowVisibleFrameStateMachine = {
  readonly abort: (
    preparedFrame: GpuFlowVisibleFramePreparedFrame,
    outcome: GpuFlowVisibleFrameStateMachineOutcome,
  ) => void;
  readonly prepare: (
    sample: GpuFlowVisibleFrameStateMachineSample,
  ) => GpuFlowVisibleFramePreparedFrame;
  readonly present: (
    preparedFrame: GpuFlowVisibleFramePreparedFrame,
    outcome: GpuFlowVisibleFrameStateMachineOutcome,
  ) => void;
  readonly prove: (
    preparedFrame: GpuFlowVisibleFramePreparedFrame,
  ) => GpuFlowVisibleFrameStateMachineOutcome;
  readonly runFrame: () => GpuFlowVisibleFrameStateMachineOutcome;
  readonly sample: () => GpuFlowVisibleFrameStateMachineSample;
};

type GpuFlowVisibleFrameStateMachineInput = {
  readonly abortVisibleFrameCandidate: (input: {
    readonly outcome: GpuFlowVisibleFrameStateMachineAbortedOutcome;
    readonly preparedFrame: GpuFlowVisibleFramePreparedFrame;
  }) => void;
  readonly blockColdStartVisibleFrame?: (input: {
    readonly outcome: GpuFlowVisibleFrameStateMachineColdStartOutcome;
    readonly preparedFrame: GpuFlowVisibleFramePreparedFrame;
  }) => void;
  readonly holdVisibleFrame?: (input: {
    readonly outcome: GpuFlowVisibleFrameStateMachineHeldOutcome;
    readonly preparedFrame: GpuFlowVisibleFramePreparedFrame;
  }) => void;
  readonly prepareVisibleFrameCandidate: (input: {
    readonly sample: GpuFlowVisibleFrameStateMachineSample;
  }) => GpuFlowVisibleFramePreparedFrame;
  readonly presentVisibleFrame: (input: {
    readonly outcome: GpuFlowVisibleFrameStateMachinePresentationOutcome;
    readonly preparedFrame: GpuFlowVisibleFramePreparedFrame;
  }) => void;
  readonly sampleVisibleFrame: () => GpuFlowVisibleFrameStateMachineSample;
};

export function createGpuFlowVisibleFrameStateMachine({
  abortVisibleFrameCandidate,
  blockColdStartVisibleFrame = () => {},
  holdVisibleFrame = () => {},
  prepareVisibleFrameCandidate,
  presentVisibleFrame,
  sampleVisibleFrame,
}: GpuFlowVisibleFrameStateMachineInput): GpuFlowVisibleFrameStateMachine {
  const stateMachine: GpuFlowVisibleFrameStateMachine = Object.freeze({
    abort: (preparedFrame, outcome) => {
      const abortedOutcome = assertGpuFlowVisibleFrameStateMachineOutcomeKind({
        kind: "aborted",
        outcome,
      });
      abortVisibleFrameCandidate({
        outcome: abortedOutcome,
        preparedFrame,
      });
    },
    prepare: (sample) =>
      Object.freeze(
        prepareVisibleFrameCandidate({
          sample,
        }),
      ),
    present: (preparedFrame, outcome) => {
      const presentationOutcome =
        assertGpuFlowVisibleFrameStateMachinePresentationOutcome({ outcome });
      presentVisibleFrame({
        outcome: presentationOutcome,
        preparedFrame,
      });
    },
    prove: (preparedFrame) =>
      proveGpuFlowVisibleFrameStateMachineFrame({
        candidate: preparedFrame.candidate,
        previousPresentation: preparedFrame.previousPresentation,
      }),
    runFrame: () => {
      const sample = stateMachine.sample();
      const preparedFrame = stateMachine.prepare(sample);
      const outcome = stateMachine.prove(preparedFrame);
      switch (outcome.kind) {
        case "presented":
        case "projected":
          stateMachine.present(preparedFrame, outcome);
          break;
        case "aborted":
          stateMachine.abort(preparedFrame, outcome);
          break;
        case "blocked-cold-start":
          blockColdStartVisibleFrame({
            outcome,
            preparedFrame,
          });
          break;
        case "held":
          holdVisibleFrame({
            outcome,
            preparedFrame,
          });
          break;
      }
      return outcome;
    },
    sample: () =>
      freezeGpuFlowVisibleFrameStateMachineSample(sampleVisibleFrame()),
  });
  return stateMachine;
}

export function proveGpuFlowVisibleFrameStateMachineFrame({
  candidate,
  previousPresentation,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly previousPresentation: GpuFlowVisibleFramePresentedFrame | null;
}): GpuFlowVisibleFrameStateMachineOutcome {
  const blockingProof = selectGpuFlowVisibleFrameBlockingProof({
    candidate,
  });
  if (blockingProof !== null) {
    return createGpuFlowVisibleFrameBlockedOutcome({
      candidate,
      previousPresentation,
      reason: blockingProof.proof,
    });
  }
  if (
    previousPresentation !== null &&
    previousPresentation.contentFrameId === candidate.contentFrameId
  ) {
    return brandGpuFlowVisibleFrameStateMachineOutcome({
      contentFrameId: candidate.contentFrameId,
      debt: candidate.queuedDebt,
      decidingProof: null,
      kind: "projected",
      presentationId: createGpuFlowVisibleFramePresentationId({
        candidate,
        kind: "projected",
      }),
      previousPresentationId: previousPresentation.presentationId,
      projectionSampleId: candidate.projectionSampleId,
    });
  }
  return brandGpuFlowVisibleFrameStateMachineOutcome({
    contentFrameId: candidate.contentFrameId,
    debt: candidate.queuedDebt,
    decidingProof: null,
    kind: "presented",
    presentationId: createGpuFlowVisibleFramePresentationId({
      candidate,
      kind: "presented",
    }),
    projectionSampleId: candidate.projectionSampleId,
  });
}

export function assertGpuFlowVisibleFrameStateMachineOutcomeBrand({
  outcome,
}: {
  readonly outcome: GpuFlowVisibleFrameStateMachineOutcome;
}): void {
  if (!hasGpuFlowVisibleFrameStateMachineOutcomeBrand(outcome)) {
    throw new Error("Expected GPU Flow visible frame state machine outcome.");
  }
}

function assertGpuFlowVisibleFrameStateMachinePresentationOutcome({
  outcome,
}: {
  readonly outcome: GpuFlowVisibleFrameStateMachineOutcome;
}): GpuFlowVisibleFrameStateMachinePresentationOutcome {
  assertGpuFlowVisibleFrameStateMachineOutcomeBrand({ outcome });
  if (outcome.kind !== "presented" && outcome.kind !== "projected") {
    throw new Error(
      "GPU Flow visible frame state machine present requires a presented or projected outcome.",
    );
  }
  return outcome;
}

function assertGpuFlowVisibleFrameStateMachineOutcomeKind<
  Kind extends GpuFlowVisibleFrameStateMachineOutcome["kind"],
>({
  kind,
  outcome,
}: {
  readonly kind: Kind;
  readonly outcome: GpuFlowVisibleFrameStateMachineOutcome;
}): Extract<GpuFlowVisibleFrameStateMachineOutcome, { readonly kind: Kind }> {
  assertGpuFlowVisibleFrameStateMachineOutcomeBrand({ outcome });
  if (outcome.kind !== kind) {
    throw new Error(
      `GPU Flow visible frame state machine outcome ${outcome.kind} cannot be used as ${kind}.`,
    );
  }
  return outcome as Extract<
    GpuFlowVisibleFrameStateMachineOutcome,
    { readonly kind: Kind }
  >;
}

function selectGpuFlowVisibleFrameBlockingProof({
  candidate,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
}): GpuFlowVisibleFrameBlockingProof | null {
  const requiredProofs = createGpuFlowVisibleFrameRequiredProofMap(candidate);
  return (
    selectGpuFlowVisibleFrameMissingOrTrueHoleProof({
      candidate,
      requiredProofs,
    }) ??
    selectGpuFlowVisibleFrameIncompatiblePreviousProof({
      candidate,
      requiredProofs,
    }) ??
    selectGpuFlowVisibleFrameBlockedRequiredProof({
      candidate,
      requiredProofs,
    })
  );
}

function selectGpuFlowVisibleFrameMissingOrTrueHoleProof({
  candidate,
  requiredProofs,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly requiredProofs: ReadonlyMap<string, GpuFlowVisibleFrameActorProof>;
}): GpuFlowVisibleFrameBlockingProof | null {
  for (const actor of candidate.requiredActors) {
    const proof = requiredProofs.get(createGpuFlowVisibleFrameActorKey(actor));
    if (!proof) {
      return {
        proof: {
          actorId: actor.actorId,
          family: actor.family,
          proof: "missing",
          reason: "missing-required-proof",
        },
      };
    }
    if (proof.proof === "true-hole") {
      return {
        proof: {
          actorId: proof.actorId,
          family: proof.family,
          proof: proof.proof,
          reason: proof.reason,
        },
      };
    }
  }
  return null;
}

function selectGpuFlowVisibleFrameIncompatiblePreviousProof({
  candidate,
  requiredProofs,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly requiredProofs: ReadonlyMap<string, GpuFlowVisibleFrameActorProof>;
}): GpuFlowVisibleFrameBlockingProof | null {
  for (const actor of candidate.requiredActors) {
    const proof = requiredProofs.get(createGpuFlowVisibleFrameActorKey(actor));
    if (!proof) {
      continue;
    }
    if (
      proof.proof === "compatible-previous" &&
      !isGpuFlowCompatiblePreviousProofForCandidate({
        candidate,
        proof,
      })
    ) {
      return {
        proof: {
          actorId: proof.actorId,
          family: proof.family,
          proof: "compatible-previous",
          reason: "incompatible-candidate-identity",
        },
      };
    }
  }
  return null;
}

function selectGpuFlowVisibleFrameBlockedRequiredProof({
  candidate,
  requiredProofs,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly requiredProofs: ReadonlyMap<string, GpuFlowVisibleFrameActorProof>;
}): GpuFlowVisibleFrameBlockingProof | null {
  for (const actor of candidate.requiredActors) {
    const proof = requiredProofs.get(createGpuFlowVisibleFrameActorKey(actor));
    if (proof?.proof === "blocked") {
      return {
        proof: {
          actorId: proof.actorId,
          family: proof.family,
          proof: proof.proof,
          reason: proof.reason,
        },
      };
    }
  }
  return null;
}

function createGpuFlowVisibleFrameBlockedOutcome({
  candidate,
  previousPresentation,
  reason,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly previousPresentation: GpuFlowVisibleFramePresentedFrame | null;
  readonly reason: GpuFlowVisibleFrameStateMachineOutcomeReason;
}): GpuFlowVisibleFrameStateMachineOutcome {
  if (previousPresentation === null) {
    return brandGpuFlowVisibleFrameStateMachineOutcome({
      debt: candidate.queuedDebt,
      decidingProof: reason,
      kind: "blocked-cold-start",
      shellFrameId: "cold-start-shell",
    });
  }
  if (reason.reason === "held-previous-budget-exceeded") {
    return brandGpuFlowVisibleFrameStateMachineOutcome({
      debt: candidate.queuedDebt,
      decidingProof: reason,
      kind: "aborted",
      previousPresentationId: previousPresentation.presentationId,
      releasedResourceIds: candidate.preparedResourceIds,
    });
  }
  if (
    doesGpuFlowPreviousPresentationCoverRequiredActors({
      candidate,
      previousPresentation,
    })
  ) {
    return brandGpuFlowVisibleFrameStateMachineOutcome({
      contentFrameId: previousPresentation.contentFrameId,
      debt: candidate.queuedDebt,
      decidingProof: reason,
      heldForProjectionSampleId: candidate.projectionSampleId,
      kind: "held",
      presentationId: previousPresentation.presentationId,
    });
  }
  return brandGpuFlowVisibleFrameStateMachineOutcome({
    debt: candidate.queuedDebt,
    decidingProof: reason,
    kind: "aborted",
    previousPresentationId: previousPresentation.presentationId,
    releasedResourceIds: candidate.preparedResourceIds,
  });
}

function createGpuFlowVisibleFrameRequiredProofMap(
  candidate: GpuFlowVisibleFrameCandidate,
): ReadonlyMap<string, GpuFlowVisibleFrameActorProof> {
  const proofByActor = new Map<string, GpuFlowVisibleFrameActorProof>();
  for (const proof of candidate.actorProofs) {
    if (proof.requirement !== "required") {
      continue;
    }
    const key = createGpuFlowVisibleFrameActorKey(proof);
    if (proofByActor.has(key)) {
      throw new Error(
        `GPU Flow visible frame candidate has duplicate required actor proofs for ${key}.`,
      );
    }
    proofByActor.set(key, proof);
  }
  return proofByActor;
}

function isGpuFlowCompatiblePreviousProofForCandidate({
  candidate,
  proof,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly proof: Extract<
    GpuFlowVisibleFrameActorProof,
    { readonly proof: "compatible-previous" }
  >;
}): boolean {
  const compatiblePreviousProof = proof.compatiblePreviousProof.proof;
  return (
    proof.compatiblePreviousProof.family === proof.family &&
    compatiblePreviousProof.candidateContentFrameId ===
      candidate.contentFrameId &&
    compatiblePreviousProof.candidateProjectionSampleId ===
      candidate.projectionSampleId
  );
}

function doesGpuFlowPreviousPresentationCoverRequiredActors({
  candidate,
  previousPresentation,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly previousPresentation: GpuFlowVisibleFramePresentedFrame;
}): boolean {
  const coverageByActor = new Map(
    previousPresentation.actorCoverages.map((coverage) => [
      createGpuFlowVisibleFrameActorKey(coverage),
      coverage,
    ]),
  );
  return candidate.requiredActors.every((actor) =>
    doesGpuFlowPreviousCoverageCoverCandidate({
      candidateContentFrameId: candidate.contentFrameId,
      coverage: coverageByActor.get(createGpuFlowVisibleFrameActorKey(actor)),
    }),
  );
}

function doesGpuFlowPreviousCoverageCoverCandidate({
  candidateContentFrameId,
  coverage,
}: {
  readonly candidateContentFrameId: GpuFlowContentFrameId;
  readonly coverage: GpuFlowVisibleFramePresentedActorCoverage | undefined;
}): boolean {
  if (!coverage?.coversCandidateProjection) {
    return false;
  }
  return (
    coverage.contentFrameId === candidateContentFrameId ||
    coverage.compatibleContentFrameIds.includes(candidateContentFrameId)
  );
}

function createGpuFlowVisibleFramePresentationId({
  candidate,
  kind,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly kind: "presented" | "projected";
}): GpuFlowPresentationId {
  return createGpuFlowPresentationId(
    `${candidate.contentFrameId}:${candidate.projectionSampleId}:${kind}`,
  );
}

function brandGpuFlowVisibleFrameStateMachineOutcome<
  Outcome extends Omit<
    GpuFlowVisibleFrameStateMachineOutcome,
    keyof GpuFlowVisibleFrameStateMachineOutcomeBrand
  >,
>(outcome: Outcome): GpuFlowVisibleFrameStateMachineOutcome {
  return Object.freeze({
    [GPU_FLOW_VISIBLE_FRAME_STATE_MACHINE_OUTCOME]: true as const,
    ...outcome,
  }) as unknown as GpuFlowVisibleFrameStateMachineOutcome;
}

function hasGpuFlowVisibleFrameStateMachineOutcomeBrand(
  outcome: GpuFlowVisibleFrameStateMachineOutcome,
): boolean {
  return (
    typeof outcome === "object" &&
    outcome !== null &&
    GPU_FLOW_VISIBLE_FRAME_STATE_MACHINE_OUTCOME in outcome
  );
}

function freezeGpuFlowVisibleFrameStateMachineSample(
  sample: GpuFlowVisibleFrameStateMachineSample,
): GpuFlowVisibleFrameStateMachineSample {
  return Object.freeze({
    ...sample,
    canvasSize: Object.freeze({ ...sample.canvasSize }),
    queuedDebt: Object.freeze({ ...sample.queuedDebt }),
    retainedScrollOffsets: Object.freeze(
      sample.retainedScrollOffsets.map((offset) =>
        Object.freeze({ ...offset }),
      ),
    ),
    viewport: Object.freeze({ ...sample.viewport }),
  });
}
