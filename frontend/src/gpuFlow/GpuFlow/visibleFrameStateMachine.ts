import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import {
  createGpuFlowNodeLayerPreparedContentFramePresentationResult,
  type GpuFlowNodeLayerFrameResult,
} from "./flowFrameResult";
import type { GpuFlowRetainedDisplayPresentationResult } from "./flowRetainedDisplayTransaction";
import type {
  GpuFlowPreparedContentFramePresentationActionFrameResult,
  GpuFlowPreparedContentFramePresentationFramePlan,
  GpuFlowPreparedContentFramePresentationFramePlanResult,
  GpuFlowRetainedDisplayOutcomeFrameResult,
  GpuFlowRetainedDisplayPresentationFramePlan,
  GpuFlowRetainedDisplayPresentationOutcomeFrame,
} from "./visibleFrameActorAdapters/contentDecisionKernel";
import type { GpuFlowPreparedContentFrameCandidateAction } from "./visibleFrameActorAdapters/preparedContentFrameCandidateAction";
import {
  createGpuFlowBrowserVisualBlockedPresentationCandidate,
  createGpuFlowBrowserVisualResourceWorkRequests,
  shouldPreservePreparedContentFrameForBrowserVisualRepair,
} from "./visibleFrameBlockedCandidate";
import type {
  GpuFlowPreparedContentFramePresentationCandidate,
  GpuFlowPreparedContentFramePresentationCandidateInput,
  GpuFlowVisibleFrameBlockedPresentationCandidate,
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
  GpuFlowVisibleFrameStarvationPolicy,
  GpuFlowVisibleFrameWorkLane,
} from "./visibleFrameStateMachineReduction";

const GPU_FLOW_VISIBLE_FRAME_STATE_MACHINE_OUTCOME = Symbol(
  "GpuFlowVisibleFrameStateMachineOutcome",
);

type GpuFlowPreparedContentFramePresentationReadiness =
  | {
      readonly kind: "present";
    }
  | {
      readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate;
      readonly errorMessage: string | null;
      readonly kind: "blocked";
    };

type GpuFlowRetainedDisplayPresentationOutcome =
  GpuFlowRetainedDisplayPresentationResult["retainedDisplayOutcome"];

type GpuFlowContentPreparationBlockedCandidateSelector = (input: {
  readonly blockedPreparedContentFramePresentationCandidate?:
    | GpuFlowVisibleFrameBlockedPresentationCandidate
    | null
    | undefined;
  readonly retainedDisplayBlockedPresentationCandidate?:
    | GpuFlowVisibleFrameBlockedPresentationCandidate
    | null
    | undefined;
}) => GpuFlowVisibleFrameBlockedPresentationCandidate | null;

export function reduceGpuFlowPreparedContentFramePresentationCandidate({
  deferBrowserVisualWakeup,
  heldPreviousProjectionState,
  liveProjectionSample,
  preparedContentFrame,
}: GpuFlowPreparedContentFramePresentationCandidateInput): GpuFlowPreparedContentFramePresentationCandidate {
  const presentationReadiness =
    resolveGpuFlowPreparedContentFramePresentationReadiness({
      heldPreviousProjectionState,
      preparedContentFrame,
    });
  if (presentationReadiness.kind === "present") {
    return {
      kind: "present",
    };
  }
  if (!preparedContentFrame) {
    throw new Error(
      "GPU Flow prepared content frame presentation transaction blocked without a candidate frame.",
    );
  }
  return {
    blockedPresentationCandidate:
      presentationReadiness.blockedPresentationCandidate,
    candidateFrame: preparedContentFrame,
    errorMessage: presentationReadiness.errorMessage,
    kind: "blocked",
    preservePreparationSnapshot:
      shouldPreservePreparedContentFrameForBrowserVisualRepair(
        presentationReadiness.blockedPresentationCandidate,
      ),
    resourceWork: {
      deferWakeup: deferBrowserVisualWakeup === true,
      timestamp: liveProjectionSample.timestamp,
      workItems: createGpuFlowBrowserVisualResourceWorkRequests({
        blockedPresentationCandidate:
          presentationReadiness.blockedPresentationCandidate,
        frame: preparedContentFrame,
      }),
    },
  };
}

export function selectGpuFlowPreparedContentFramePresentationFramePlan({
  candidate,
  preparedContentFrame,
}: {
  readonly candidate: GpuFlowPreparedContentFramePresentationCandidate;
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | void;
}): GpuFlowPreparedContentFramePresentationFramePlan {
  const action = resolveGpuFlowPreparedContentFrameCandidateAction({
    candidate,
    preparedContentFrame,
  });
  const result =
    resolveGpuFlowPreparedContentFramePresentationActionFrameResult({
      action,
    });
  if (action.kind !== "present") {
    return {
      blockedPresentationCandidate: result.blockedPresentationCandidate,
      preparedContentFramePresentation: result.preparedContentFramePresentation,
      kind: "candidate" as const,
      visibleProjectionState: result.visibleProjectionState,
    };
  }
  return {
    blockedPresentationCandidate: null,
    preparedContentFramePresentation: result.preparedContentFramePresentation,
    kind: "present" as const,
    visibleProjectionState: null,
  };
}

export function resolveGpuFlowPreparedContentFramePresentationFramePlanResult({
  framePlan,
}: {
  readonly framePlan: GpuFlowPreparedContentFramePresentationFramePlan;
}): GpuFlowPreparedContentFramePresentationFramePlanResult {
  return {
    blockedPresentationCandidate: framePlan.blockedPresentationCandidate,
    preparedContentFramePresentation:
      framePlan.preparedContentFramePresentation,
    visibleProjectionState: framePlan.visibleProjectionState,
  };
}

export function selectGpuFlowRetainedDisplayPresentationFramePlan({
  retainedDisplayOutcome,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayOutcome: GpuFlowRetainedDisplayPresentationOutcome;
}): GpuFlowRetainedDisplayPresentationFramePlan {
  const outcomeFrame = resolveGpuFlowRetainedDisplayPresentationOutcomeFrame(
    retainedDisplayOutcome,
  );
  return {
    kind: "presented" as const,
    presentedOutcomeFrame: outcomeFrame,
  };
}

export function resolveGpuFlowRetainedDisplayPresentationFramePlanResult({
  framePlan,
}: {
  readonly framePlan: GpuFlowRetainedDisplayPresentationFramePlan;
}): GpuFlowRetainedDisplayOutcomeFrameResult {
  return {
    blockedPresentationCandidate: null,
    presentedOutcomeFrame: framePlan.presentedOutcomeFrame,
  };
}

export function selectGpuFlowContentPreparationBlockedCandidateForFrameResult({
  nodeLayerFrameResult,
  previousVisibleProjectionState,
}: {
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameBlockedPresentationCandidate | null {
  const preparedContentFramePresentation =
    nodeLayerFrameResult.preparedContentFramePresentation;
  const selectContentPreparationBlockedCandidate =
    selectGpuFlowContentPreparationBlockedCandidate({
      previousVisibleProjectionState,
    });
  return selectContentPreparationBlockedCandidate({
    blockedPreparedContentFramePresentationCandidate:
      preparedContentFramePresentation.blockedSurfacePresentation
        ?.blockedPresentationCandidate ?? null,
    retainedDisplayBlockedPresentationCandidate:
      nodeLayerFrameResult.blockedPresentationCandidate,
  });
}

function resolveGpuFlowPreparedContentFrameCandidateAction({
  candidate,
  preparedContentFrame,
}: {
  readonly candidate: GpuFlowPreparedContentFramePresentationCandidate;
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | void;
}): GpuFlowPreparedContentFrameCandidateAction {
  switch (candidate.kind) {
    case "blocked":
      return {
        blockedSurfacePresentation: candidate,
        kind: "blocked-candidate",
        visibleProjectionState: null,
      };
    case "present":
      return {
        preparedContentFrame: preparedContentFrame ?? null,
        kind: "present",
      };
  }
}

function resolveGpuFlowPreparedContentFramePresentationActionFrameResult({
  action,
}: {
  readonly action: GpuFlowPreparedContentFrameCandidateAction;
}): GpuFlowPreparedContentFramePresentationActionFrameResult {
  const preparedContentFramePresentation =
    createGpuFlowNodeLayerPreparedContentFramePresentationResult({
      action,
    });
  if (action.kind === "present") {
    return {
      blockedPresentationCandidate: null,
      preparedContentFramePresentation,
      visibleProjectionState: null,
    };
  }
  if (action.kind === "blocked-candidate") {
    return {
      blockedPresentationCandidate:
        action.blockedSurfacePresentation.blockedPresentationCandidate,
      preparedContentFramePresentation,
      visibleProjectionState: null,
    };
  }
  action satisfies never;
  throw new Error(
    "Unknown GPU Flow prepared content frame presentation action.",
  );
}

function selectGpuFlowContentPreparationBlockedCandidate({
  previousVisibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPreparationBlockedCandidateSelector {
  return ({
    blockedPreparedContentFramePresentationCandidate,
    retainedDisplayBlockedPresentationCandidate,
  }) => {
    if (blockedPreparedContentFramePresentationCandidate) {
      return blockedPreparedContentFramePresentationCandidate;
    }
    if (retainedDisplayBlockedPresentationCandidate) {
      return retainedDisplayBlockedPresentationCandidate;
    }
    void previousVisibleProjectionState;
    return null;
  };
}

function resolveGpuFlowRetainedDisplayPresentationOutcomeFrame(
  outcome: GpuFlowRetainedDisplayPresentationOutcome,
): GpuFlowRetainedDisplayPresentationOutcomeFrame {
  return {
    frame: outcome.frame,
    kind: "presented",
    outcome,
    outcomeKind: outcome.kind,
  };
}

function resolveGpuFlowPreparedContentFramePresentationReadiness({
  heldPreviousProjectionState,
  preparedContentFrame,
}: {
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly preparedContentFrame: GpuFlowPreparedContentFramePresentationCandidateInput["preparedContentFrame"];
}): GpuFlowPreparedContentFramePresentationReadiness {
  if (
    !preparedContentFrame ||
    preparedContentFrame.presentability.kind === "presentable"
  ) {
    return {
      kind: "present",
    };
  }
  return {
    blockedPresentationCandidate:
      createGpuFlowBrowserVisualBlockedPresentationCandidate({
        frame: preparedContentFrame,
        heldPreviousProjectionState,
      }),
    errorMessage: null,
    kind: "blocked",
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
