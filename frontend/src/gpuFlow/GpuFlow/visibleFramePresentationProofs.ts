import type { GpuFrameReason } from "../gpuRenderer";
import {
  createGpuFlowHeldPreviousProjection,
  createGpuFlowProjectionTransactionForCommittedFrameId,
  createGpuFlowVisibleProjectionState,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionLane,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { isGpuFlowBrowserTextSnapshotPendingBlockedReason } from "../projectionSchedulerPolicy";
import type {
  GpuFlowColdStartShellPublication,
  GpuFlowVisibleFramePresentationOutcome,
  GpuFlowVisibleFramePresentationReducerFrameCompletion,
  GpuFlowVisibleFramePresentationTransactionCompletion,
  GpuFlowVisibleFrameReducerDebtFrameRequest,
} from "./visibleFrameOutcomeReport";
import {
  createGpuFlowVisibleFrameBlockedPublicationToken,
  createGpuFlowVisibleFrameHoldPreviousToken,
  createGpuFlowVisibleFrameReducerCompletionPresentationToken,
  type GpuFlowBlockedPublicationToken,
} from "./visibleFramePresentationTokens";
import {
  getGpuFlowVisibleFrameReducerDebtReason,
  hasGpuFlowVisibleFrameReducerDebt,
  type GpuFlowVisibleFrameReducerDecision,
  type GpuFlowVisibleFrameReducerPolicy,
} from "./visibleFrameReducerRuntime";
import { getGpuFlowVisibleFrameHeldPreviousBudgetStatus } from "./visibleFrameStateMachine";
import type {
  GpuFlowVisibleFramePresentationBlockedProof,
  GpuFlowVisibleFramePublicationTransactionProof,
} from "./visibleFrameTransactionProofs";
import {
  GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
  type GpuFlowVisibleFramePresentationIdentity,
} from "./visibleFrameTypes";

export {
  createGpuFlowPresentationAuthorityProof,
  type GpuFlowPresentationAuthorityProof,
} from "./visibleFramePresentationAuthorityProofs";
export {
  assertGpuFlowBlockedPublicationTokenBrand,
  assertGpuFlowBlockedPublicationTokenForProjectionSample,
  assertGpuFlowHoldPreviousTokenBrand,
  assertGpuFlowHoldPreviousTokenForProjectionSample,
  assertGpuFlowPreparedCandidateAbortToken,
  assertGpuFlowVisibleFramePresentationToken,
  assertGpuFlowVisibleFramePresentationTokenBrand,
  assertGpuFlowVisibleFramePresentationTokenForFrameId,
  assertGpuFlowVisibleFramePresentationTokenForPresentationProof,
  assertGpuFlowVisibleFramePresentationTokenForProjectionSample,
  type GpuFlowBlockedFrozenFrame,
  type GpuFlowBlockedPublicationToken,
  type GpuFlowBlockedVisibleReason,
  type GpuFlowHoldPreviousToken,
  type GpuFlowVisibleFramePresentationToken,
} from "./visibleFramePresentationTokens";

type GpuFlowVisibleFramePublicationReducerRuntime = {
  readonly completeFrame: (
    reducerDecision: GpuFlowVisibleFrameReducerDecision,
    outcome: Extract<
      GpuFlowVisibleFramePresentationOutcome,
      { readonly kind: "present" }
    >,
  ) => GpuFlowVisibleFramePresentationReducerFrameCompletion["completion"];
  readonly getKnobs: () => GpuFlowVisibleFrameReducerPolicy;
  readonly recordUnpresentedFrame: (
    reducerDecision: GpuFlowVisibleFrameReducerDecision,
    outcome: Extract<
      GpuFlowVisibleFramePresentationOutcome,
      { readonly kind: "blocked" | "hold-previous" }
    >,
  ) => GpuFlowVisibleFramePresentationReducerFrameCompletion["completion"];
};

const GPU_FLOW_MOTION_ACTIVE_DEBT_RETRY_DELAY_MS = 160;

export function proveGpuFlowVisibleFramePublicationPresentation({
  forceImmediateReducerDebtFrame,
  followUpFrameReason,
  reducerDecision,
  previousVisibleProjectionState,
  reducerRuntime,
  transactionProof,
}: {
  readonly forceImmediateReducerDebtFrame: boolean;
  readonly followUpFrameReason: GpuFrameReason | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerRuntime: GpuFlowVisibleFramePublicationReducerRuntime;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof;
}): GpuFlowVisibleFramePresentationTransactionCompletion {
  const reducerPolicy = reducerRuntime.getKnobs();
  const outcome = createGpuFlowVisibleFrameReducerCompletionOutcome({
    blockedPublicationToken:
      createGpuFlowVisibleFrameBlockedPublicationTokenForProof({
        proof: transactionProof.blockedProof,
        reducerDecision,
      }),
    reducerDecision,
    previousVisibleProjectionState,
    reducerPolicy,
    transactionProof,
  });
  return Object.freeze({
    coldStartShellPublication:
      createGpuFlowVisibleFramePresentationColdStartShellPublication({
        outcome,
      }),
    completeReducerFrame:
      createGpuFlowVisibleFramePresentationReducerFrameCompleter({
        forceImmediateReducerDebtFrame,
        outcome,
        reducerDecision,
        reducerPolicy,
        reducerRuntime,
      }),
    followUpFrameRequests:
      createGpuFlowVisibleFramePresentationFollowUpFrameRequests({
        followUpFrameReason,
      }),
    heldPreviousVisibleProjectionState:
      createGpuFlowVisibleFrameReducerCompletionHeldPreviousState({
        outcome,
        previousVisibleProjectionState,
        reducerDecision,
        renderedVisibleFrame: transactionProof.renderedVisibleFrame,
        reducerPolicy,
      }),
    outcome,
    previousContentFrameId:
      previousVisibleProjectionState?.committedFrame.displayFrameId ?? null,
  });
}

function createGpuFlowVisibleFramePresentationReducerFrameCompleter({
  forceImmediateReducerDebtFrame,
  outcome,
  reducerDecision,
  reducerPolicy,
  reducerRuntime,
}: {
  readonly forceImmediateReducerDebtFrame: boolean;
  readonly outcome: GpuFlowVisibleFramePresentationOutcome;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly reducerPolicy: GpuFlowVisibleFrameReducerPolicy;
  readonly reducerRuntime: GpuFlowVisibleFramePublicationReducerRuntime;
}): () => GpuFlowVisibleFramePresentationReducerFrameCompletion {
  let reducerFrameCompletion: GpuFlowVisibleFramePresentationReducerFrameCompletion | null =
    null;
  return () => {
    if (reducerFrameCompletion !== null) {
      return reducerFrameCompletion;
    }
    const completion =
      outcome.kind === "present"
        ? reducerRuntime.completeFrame(reducerDecision, outcome)
        : reducerRuntime.recordUnpresentedFrame(reducerDecision, outcome);
    reducerFrameCompletion = Object.freeze({
      completion,
      debtFrameRequest: createGpuFlowVisibleFrameReducerDebtFrameRequest({
        completion,
        forceImmediateReducerDebtFrame,
        outcome,
        reducerDecision,
        reducerPolicy,
      }),
    });
    return reducerFrameCompletion;
  };
}

function createGpuFlowVisibleFramePresentationColdStartShellPublication({
  outcome,
}: {
  readonly outcome: GpuFlowVisibleFramePresentationOutcome;
}): GpuFlowColdStartShellPublication {
  return Object.freeze({
    frame:
      outcome.kind === "blocked" &&
      outcome.token.frozenFrame.kind === "cold-start-shell"
        ? outcome.token.frozenFrame.frame
        : null,
    token: outcome.token,
  });
}

function createGpuFlowVisibleFramePresentationFollowUpFrameRequests({
  followUpFrameReason,
}: {
  readonly followUpFrameReason: GpuFrameReason | null;
}): readonly GpuFrameReason[] {
  return Object.freeze(
    followUpFrameReason === null ? [] : [followUpFrameReason],
  );
}

function createGpuFlowVisibleFrameReducerDebtFrameRequest({
  completion,
  forceImmediateReducerDebtFrame,
  outcome,
  reducerDecision,
  reducerPolicy,
}: {
  readonly completion: GpuFlowVisibleFramePresentationReducerFrameCompletion["completion"];
  readonly forceImmediateReducerDebtFrame: boolean;
  readonly outcome: GpuFlowVisibleFramePresentationOutcome;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly reducerPolicy: GpuFlowVisibleFrameReducerPolicy;
}): GpuFlowVisibleFrameReducerDebtFrameRequest | null {
  if (!hasGpuFlowVisibleFrameReducerDebt(completion.debt)) {
    return null;
  }
  return Object.freeze({
    delayMs:
      forceImmediateReducerDebtFrame ||
      shouldRequestGpuFlowVisibleFrameReducerDebtFrameImmediately({
        outcome,
        reducerDecision,
      })
        ? null
        : getDelayedGpuFlowVisibleFrameReducerDebtRequestMs({
            reducerDecision,
            reducerMotionSettleWindowMs: reducerPolicy.motionSettleWindowMs,
          }),
    frameReason: getGpuFlowVisibleFrameReducerDebtFrameReason({
      completion,
      outcome,
      reducerDecision,
    }),
  });
}

function getGpuFlowVisibleFrameReducerDebtFrameReason({
  completion,
  outcome,
  reducerDecision,
}: {
  readonly completion: GpuFlowVisibleFramePresentationReducerFrameCompletion["completion"];
  readonly outcome: GpuFlowVisibleFramePresentationOutcome;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): GpuFrameReason {
  if (isGpuFlowBrowserTextSnapshotPendingBlockedOutcome(outcome)) {
    return "texture-upload";
  }
  if (
    completion.debt.content &&
    isGpuFlowSectionSurfaceRepairBlockedOutcome(outcome)
  ) {
    return "texture-upload";
  }
  if (
    shouldRequestGpuFlowManualContentDebtFrame({
      completion,
      reducerDecision,
    })
  ) {
    return "manual";
  }
  if (reducerDecision.lane === "maintenance" && completion.debt.content) {
    return "manual";
  }
  if (isGpuFlowRetainedProjectionBlockedOutcome(outcome)) {
    return "texture-upload";
  }
  return getGpuFlowVisibleFrameReducerDebtReason(completion.debt);
}

function shouldRequestGpuFlowManualContentDebtFrame({
  completion,
  reducerDecision,
}: {
  readonly completion: GpuFlowVisibleFramePresentationReducerFrameCompletion["completion"];
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): boolean {
  return (
    reducerDecision.lane === "content" &&
    completion.debt.content &&
    !completion.debt.motion
  );
}

function shouldRequestGpuFlowVisibleFrameReducerDebtFrameImmediately({
  outcome,
  reducerDecision,
}: {
  readonly outcome: GpuFlowVisibleFramePresentationOutcome;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): boolean {
  return (
    isGpuFlowRetainedProjectionBlockedOutcome(outcome) &&
    reducerDecision.reducerState !== "motion-active"
  );
}

function isGpuFlowRetainedProjectionBlockedOutcome(
  outcome: GpuFlowVisibleFramePresentationOutcome,
): boolean {
  return (
    outcome.kind === "blocked" &&
    outcome.token.blockedReasons.some(
      (reason) => reason.family === "retained-projection",
    )
  );
}

function isGpuFlowSectionSurfaceRepairBlockedOutcome(
  outcome: GpuFlowVisibleFramePresentationOutcome,
): boolean {
  return (
    outcome.kind === "blocked" &&
    outcome.token.blockedReasons.some(
      (reason) =>
        reason.reason === "section-surface-not-drawn" ||
        reason.reason === "section-surface-texture-missing",
    )
  );
}

function isGpuFlowBrowserTextSnapshotPendingBlockedOutcome(
  outcome: GpuFlowVisibleFramePresentationOutcome,
): boolean {
  return (
    outcome.kind === "blocked" &&
    outcome.token.blockedReasons.some(
      isGpuFlowBrowserTextSnapshotPendingBlockedReason,
    )
  );
}

function getDelayedGpuFlowVisibleFrameReducerDebtRequestMs({
  reducerDecision,
  reducerMotionSettleWindowMs,
}: {
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly reducerMotionSettleWindowMs: number;
}): number | null {
  if (reducerDecision.reducerState === "motion-active") {
    return GPU_FLOW_MOTION_ACTIVE_DEBT_RETRY_DELAY_MS;
  }
  if (reducerDecision.lane === "motion") {
    return null;
  }
  if (reducerDecision.reducerState === "motion-settling") {
    return reducerMotionSettleWindowMs * 8;
  }
  return null;
}

function createGpuFlowVisibleFrameReducerCompletionHeldPreviousState({
  outcome,
  previousVisibleProjectionState,
  reducerDecision,
  renderedVisibleFrame,
  reducerPolicy,
}: {
  readonly outcome: GpuFlowVisibleFramePresentationOutcome;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly renderedVisibleFrame: boolean;
  readonly reducerPolicy: GpuFlowVisibleFrameReducerPolicy;
}): GpuFlowVisibleProjectionState | null {
  if (
    outcome.kind !== "hold-previous" ||
    renderedVisibleFrame ||
    !previousVisibleProjectionState
  ) {
    return null;
  }
  const transaction = createGpuFlowProjectionTransactionForCommittedFrameId({
    committedFrameId:
      previousVisibleProjectionState.committedFrame.displayFrameId,
    kind: "held-previous",
    lane: resolveGpuFlowHeldPreviousWorkLane({
      previousVisibleProjectionState,
      reducerDecision,
    }),
    rawReasons: reducerDecision.rawReasons,
    sample: reducerDecision.sample,
  });
  return createGpuFlowVisibleProjectionState({
    committedFrame: previousVisibleProjectionState.committedFrame,
    heldPreviousProjection: createGpuFlowHeldPreviousProjection({
      heldTransaction: transaction,
      knobs: reducerPolicy,
      previousVisibleProjectionState,
      reason: "no-visible-frame",
      requestedSample: reducerDecision.sample,
    }),
    transaction,
  });
}

function resolveGpuFlowHeldPreviousWorkLane({
  previousVisibleProjectionState,
  reducerDecision,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): GpuFlowProjectionLane {
  if (reducerDecision.lane !== "idle") {
    return reducerDecision.lane;
  }
  return previousVisibleProjectionState.transaction.lane;
}

function createGpuFlowVisibleFrameBlockedPublicationTokenForProof({
  proof,
  reducerDecision,
}: {
  readonly proof: GpuFlowVisibleFramePresentationBlockedProof | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): GpuFlowBlockedPublicationToken | null {
  if (!proof) {
    return null;
  }
  return createGpuFlowVisibleFrameBlockedPublicationToken({
    blockedReasons: proof.blockedReasons,
    frozenFrameId: proof.frozenFrameId,
    projectionSample: reducerDecision.sample,
  });
}

function createGpuFlowVisibleFrameReducerCompletionOutcome({
  blockedPublicationToken,
  reducerDecision,
  previousVisibleProjectionState,
  reducerPolicy,
  transactionProof,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerPolicy: GpuFlowVisibleFrameReducerPolicy;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof;
}): GpuFlowVisibleFramePresentationOutcome {
  const visibleFrameStateMachineOutcome =
    transactionProof.visibleFrameStateMachineOutcome;
  if (!visibleFrameStateMachineOutcome) {
    throw new Error(
      "GPU Flow visible frame presentation completion requires a visible frame state machine outcome.",
    );
  }
  switch (visibleFrameStateMachineOutcome.kind) {
    case "presented":
    case "projected":
      return createGpuFlowVisibleFrameReducerCompletionPresentOutcome({
        reducerDecision,
        transactionProof,
      });
    case "held":
      return createGpuFlowVisibleFrameReducerCompletionHeldStateMachineOutcome({
        blockedPublicationToken,
        reducerDecision,
        previousVisibleProjectionState,
        reducerPolicy,
        transactionProof,
      });
    case "blocked-cold-start":
      if (blockedPublicationToken !== null) {
        return {
          kind: "blocked",
          token: blockedPublicationToken,
        };
      }
      return createGpuFlowVisibleFrameReducerCompletionNoFrameOutcome({
        blockedPublicationToken: null,
        previousVisibleProjectionState,
        reducerDecision,
        reducerPolicy,
      });
    case "aborted":
      return createGpuFlowVisibleFrameReducerCompletionAbortedStateMachineOutcome(
        {
          blockedPublicationToken,
          reducerDecision,
          previousVisibleProjectionState,
          reducerPolicy,
          transactionProof,
        },
      );
  }
}

function createGpuFlowVisibleFrameReducerCompletionHeldStateMachineOutcome({
  blockedPublicationToken,
  reducerDecision,
  previousVisibleProjectionState,
  reducerPolicy,
  transactionProof,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerPolicy: GpuFlowVisibleFrameReducerPolicy;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof;
}): Extract<
  GpuFlowVisibleFramePresentationOutcome,
  { readonly kind: "blocked" | "hold-previous" }
> {
  const visibleProjectionState = transactionProof.visibleProjectionState;
  if (visibleProjectionState?.transaction.kind === "held-previous") {
    return createGpuFlowVisibleFrameReducerCompletionHeldPreviousOutcome({
      blockedPublicationToken,
      reducerDecision,
      visibleProjectionState,
    });
  }
  return createGpuFlowVisibleFrameReducerCompletionNoFrameOutcome({
    blockedPublicationToken,
    previousVisibleProjectionState,
    reducerDecision,
    reducerPolicy,
  });
}

function createGpuFlowVisibleFrameReducerCompletionAbortedStateMachineOutcome({
  blockedPublicationToken,
  reducerDecision,
  previousVisibleProjectionState,
  reducerPolicy,
  transactionProof,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerPolicy: GpuFlowVisibleFrameReducerPolicy;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof;
}): Extract<
  GpuFlowVisibleFramePresentationOutcome,
  { readonly kind: "blocked" | "hold-previous" }
> {
  const visibleProjectionState = transactionProof.visibleProjectionState;
  if (visibleProjectionState?.transaction.kind === "held-previous") {
    return createGpuFlowVisibleFrameReducerCompletionHeldPreviousOutcome({
      blockedPublicationToken,
      reducerDecision,
      visibleProjectionState,
    });
  }
  if (blockedPublicationToken !== null) {
    return {
      kind: "blocked",
      token: blockedPublicationToken,
    };
  }
  const stateMachineOutcome = transactionProof.visibleFrameStateMachineOutcome;
  if (stateMachineOutcome?.kind === "aborted") {
    return {
      kind: "blocked",
      token: createGpuFlowVisibleFrameBlockedPublicationToken({
        blockedReasons: [
          {
            actorId: stateMachineOutcome.decidingProof.actorId,
            family: stateMachineOutcome.decidingProof.family,
            reason: stateMachineOutcome.decidingProof.reason,
          },
        ],
        frozenFrameId:
          previousVisibleProjectionState?.committedFrame.displayFrameId ??
          GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
        projectionSample: reducerDecision.sample,
      }),
    };
  }
  return createGpuFlowVisibleFrameReducerCompletionNoFrameOutcome({
    blockedPublicationToken: null,
    previousVisibleProjectionState,
    reducerDecision,
    reducerPolicy,
  });
}

function createGpuFlowVisibleFrameReducerCompletionPresentOutcome({
  reducerDecision,
  transactionProof,
}: {
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof;
}): Extract<
  GpuFlowVisibleFramePresentationOutcome,
  { readonly kind: "present" }
> {
  if (!transactionProof.renderedVisibleFrame) {
    throw new Error(
      "GPU Flow visible frame presentation completion cannot present without a rendered state machine outcome.",
    );
  }
  const visibleProjectionState = transactionProof.visibleProjectionState;
  if (visibleProjectionState === null) {
    throw new Error(
      "GPU Flow visible frame presentation completion cannot present a rendered frame without visible projection state.",
    );
  }
  if (visibleProjectionState.transaction.kind === "held-previous") {
    throw new Error(
      "GPU Flow visible frame presentation completion cannot present a held-previous state machine outcome.",
    );
  }
  const presentableFrameProof = transactionProof.presentableFrameProof;
  if (presentableFrameProof === null) {
    throw new Error(
      "GPU Flow visible presentation completion requires the transaction proof presentable frame proof.",
    );
  }
  return {
    debtProof: presentableFrameProof.debtProof,
    kind: "present",
    token: createGpuFlowVisibleFrameReducerCompletionPresentationToken({
      presentationAuthorityProof:
        presentableFrameProof.presentationAuthorityProof,
      presentationIdentity:
        createGpuFlowVisibleFramePublicationPresentationIdentity({
          transactionProof,
        }),
      reducerDecision,
      visibleProjectionState,
    }),
  };
}

function createGpuFlowVisibleFramePublicationPresentationIdentity({
  transactionProof,
}: {
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof;
}): GpuFlowVisibleFramePresentationIdentity {
  const visibleFrameStateMachineOutcome =
    transactionProof.visibleFrameStateMachineOutcome;
  if (
    visibleFrameStateMachineOutcome?.kind !== "presented" &&
    visibleFrameStateMachineOutcome?.kind !== "projected"
  ) {
    throw new Error(
      "GPU Flow visible presentation completion requires a presented visible frame state machine identity.",
    );
  }
  return Object.freeze({
    contentFrameId: visibleFrameStateMachineOutcome.contentFrameId,
    presentationId: visibleFrameStateMachineOutcome.presentationId,
    projectionSampleId: visibleFrameStateMachineOutcome.projectionSampleId,
  });
}

function createGpuFlowVisibleFrameReducerCompletionHoldOutcome({
  reducerDecision,
  visibleProjectionState,
}: {
  readonly reducerDecision: {
    readonly sample: GpuFlowLiveProjectionSample;
  };
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): Extract<
  GpuFlowVisibleFramePresentationOutcome,
  { readonly kind: "hold-previous" }
> {
  const heldPreviousProjection =
    assertGpuFlowHeldPreviousPublicationCompletionMatchesSample({
      reducerDecision,
      visibleProjectionState,
    });
  return {
    kind: "hold-previous",
    token: createGpuFlowVisibleFrameHoldPreviousToken({
      committedFrameId: visibleProjectionState.committedFrame.displayFrameId,
      holdAgeFrames: heldPreviousProjection.consecutiveFrameCount,
      holdAgeMs: heldPreviousProjection.heldDurationMs,
      projectionSample: reducerDecision.sample,
    }),
  };
}

function createGpuFlowVisibleFrameReducerCompletionHeldPreviousOutcome({
  blockedPublicationToken,
  reducerDecision,
  visibleProjectionState,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): Extract<
  GpuFlowVisibleFramePresentationOutcome,
  { readonly kind: "blocked" | "hold-previous" }
> {
  assertGpuFlowHeldPreviousPublicationCompletionMatchesSample({
    reducerDecision,
    visibleProjectionState,
  });
  if (
    !isGpuFlowVisibleFramePresentationHeldPreviousOverBudget(
      visibleProjectionState,
    )
  ) {
    return createGpuFlowVisibleFrameReducerCompletionHoldOutcome({
      reducerDecision,
      visibleProjectionState,
    });
  }
  if (blockedPublicationToken) {
    return {
      kind: "blocked",
      token: blockedPublicationToken,
    };
  }
  return {
    kind: "blocked",
    token: createGpuFlowVisibleFrameBlockedPublicationToken({
      blockedReasons: [
        createGpuFlowVisibleFramePresentationHeldPreviousOverBudgetBlockedReason(
          visibleProjectionState,
        ),
      ],
      frozenFrameId: visibleProjectionState.committedFrame.displayFrameId,
      projectionSample: reducerDecision.sample,
    }),
  };
}

function assertGpuFlowHeldPreviousPublicationCompletionMatchesSample({
  reducerDecision,
  visibleProjectionState,
}: {
  readonly reducerDecision: {
    readonly sample: GpuFlowLiveProjectionSample;
  };
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): NonNullable<GpuFlowVisibleProjectionState["heldPreviousProjection"]> {
  const heldPreviousProjection = visibleProjectionState.heldPreviousProjection;
  if (
    heldPreviousProjection === null ||
    heldPreviousProjection.requestedProjectionSampleId !==
      reducerDecision.sample.id
  ) {
    throw new Error(
      "GPU Flow held-previous publication completion requires diagnostics for the selected projection sample.",
    );
  }
  return heldPreviousProjection;
}

function isGpuFlowVisibleFramePresentationHeldPreviousOverBudget(
  visibleProjectionState: GpuFlowVisibleProjectionState,
): boolean {
  const heldPreviousProjection = visibleProjectionState.heldPreviousProjection;
  if (heldPreviousProjection === null) {
    return false;
  }
  return Boolean(
    heldPreviousProjection.maxHeldPreviousFramesExceeded ||
      heldPreviousProjection.maxHeldPreviousMsExceeded,
  );
}

function createGpuFlowVisibleFrameReducerCompletionNoFrameOutcome({
  blockedPublicationToken,
  previousVisibleProjectionState,
  reducerDecision,
  reducerPolicy,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly reducerPolicy: GpuFlowVisibleFrameReducerPolicy;
}): Extract<
  GpuFlowVisibleFramePresentationOutcome,
  { readonly kind: "blocked" | "hold-previous" }
> {
  if (!previousVisibleProjectionState) {
    return {
      kind: "blocked",
      token: createGpuFlowVisibleFrameBlockedPublicationToken({
        blockedReasons: [
          {
            actorId: null,
            family: "visible-transaction",
            reason: "no-visible-frame-before-first-commit",
          },
        ],
        frozenFrameId: GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
        projectionSample: reducerDecision.sample,
      }),
    };
  }
  const previousHeld = previousVisibleProjectionState.heldPreviousProjection;
  const firstHeldAtMs =
    previousHeld?.firstHeldAtMs ?? reducerDecision.sample.timestamp;
  const holdAgeFrames = (previousHeld?.consecutiveFrameCount ?? 0) + 1;
  const holdAgeMs = Math.max(
    0,
    reducerDecision.sample.timestamp - firstHeldAtMs,
  );
  if (
    isGpuFlowNoFrameHeldPreviousOverBudget({
      holdAgeFrames,
      holdAgeMs,
      previousHeld,
      reducerPolicy,
    })
  ) {
    if (blockedPublicationToken !== null) {
      return {
        kind: "blocked",
        token: blockedPublicationToken,
      };
    }
    return {
      kind: "blocked",
      token: createGpuFlowVisibleFrameBlockedPublicationToken({
        blockedReasons: [
          {
            actorId: null,
            family: "visible-transaction",
            reason: "no-visible-frame",
          },
        ],
        frozenFrameId:
          previousVisibleProjectionState.committedFrame.displayFrameId,
        projectionSample: reducerDecision.sample,
      }),
    };
  }
  return {
    kind: "hold-previous",
    token: createGpuFlowVisibleFrameHoldPreviousToken({
      committedFrameId:
        previousVisibleProjectionState.committedFrame.displayFrameId,
      holdAgeFrames,
      holdAgeMs,
      projectionSample: reducerDecision.sample,
    }),
  };
}

function isGpuFlowNoFrameHeldPreviousOverBudget({
  holdAgeFrames,
  holdAgeMs,
  previousHeld,
  reducerPolicy,
}: {
  readonly holdAgeFrames: number;
  readonly holdAgeMs: number;
  readonly previousHeld: GpuFlowVisibleProjectionState["heldPreviousProjection"];
  readonly reducerPolicy: GpuFlowVisibleFrameReducerPolicy;
}): boolean {
  const budgetStatus = getGpuFlowVisibleFrameHeldPreviousBudgetStatus({
    consecutiveFrameCount: holdAgeFrames,
    heldDurationMs: holdAgeMs,
    policy: reducerPolicy,
  });
  return Boolean(
    previousHeld?.maxHeldPreviousFramesExceeded ||
      previousHeld?.maxHeldPreviousMsExceeded ||
      budgetStatus.maxHeldPreviousFramesExceeded ||
      budgetStatus.maxHeldPreviousMsExceeded,
  );
}

function createGpuFlowVisibleFramePresentationHeldPreviousOverBudgetBlockedReason(
  visibleProjectionState: GpuFlowVisibleProjectionState,
): {
  readonly actorId: null;
  readonly family:
    | "browser-visual"
    | "retained-projection"
    | "visible-transaction";
  readonly reason:
    | "browser-visual-coverage-missing"
    | "no-visible-frame"
    | "retained-projection-coverage-missing";
} {
  const reason =
    visibleProjectionState.heldPreviousProjection?.reason ?? "no-visible-frame";
  if (reason === "retained-projection-coverage-missing") {
    return {
      actorId: null,
      family: "retained-projection",
      reason,
    };
  }
  if (reason === "browser-visual-coverage-missing") {
    return {
      actorId: null,
      family: "browser-visual",
      reason,
    };
  }
  return {
    actorId: null,
    family: "visible-transaction",
    reason: "no-visible-frame",
  };
}
