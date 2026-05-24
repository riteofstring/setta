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
  GpuFlowVisiblePublicationDebtFrameRequest,
  GpuFlowVisiblePublicationOutcome,
  GpuFlowVisiblePublicationReducerFrameCompletion,
  GpuFlowVisiblePublicationTransactionCompletion,
} from "./visibleFrameOutcomeReport";
import {
  createGpuFlowVisibleFrameBlockedPublicationToken,
  createGpuFlowVisibleFrameHoldPreviousToken,
  createGpuFlowVisiblePublicationCompletionPresentationToken,
  type GpuFlowBlockedPublicationToken,
} from "./visibleFramePresentationTokens";
import {
  getGpuFlowVisiblePublicationDebtReason,
  hasGpuFlowVisiblePublicationDebt,
  type GpuFlowVisibleFrameReducerPolicy,
  type GpuFlowVisibleFrameReducerDecision,
} from "./visibleFrameReducerRuntime";
import { getGpuFlowVisibleFrameHeldPreviousBudgetStatus } from "./visibleFrameStateMachine";
import type {
  GpuFlowVisibleFramePublicationTransactionProof,
  GpuFlowVisiblePublicationBlockedProof,
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
      GpuFlowVisiblePublicationOutcome,
      { readonly kind: "present" }
    >,
  ) => GpuFlowVisiblePublicationReducerFrameCompletion["completion"];
  readonly getKnobs: () => GpuFlowVisibleFrameReducerPolicy;
  readonly recordUnpresentedFrame: (
    reducerDecision: GpuFlowVisibleFrameReducerDecision,
    outcome: Extract<
      GpuFlowVisiblePublicationOutcome,
      { readonly kind: "blocked" | "hold-previous" }
    >,
  ) => GpuFlowVisiblePublicationReducerFrameCompletion["completion"];
};

const GPU_FLOW_MOTION_ACTIVE_DEBT_RETRY_DELAY_MS = 160;

export function proveGpuFlowVisibleFramePublicationPresentation({
  forceImmediatePublicationDebtFrame,
  followUpFrameReason,
  reducerDecision,
  previousVisibleProjectionState,
  reducerRuntime,
  transactionProof,
}: {
  readonly forceImmediatePublicationDebtFrame: boolean;
  readonly followUpFrameReason: GpuFrameReason | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerRuntime: GpuFlowVisibleFramePublicationReducerRuntime;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof;
}): GpuFlowVisiblePublicationTransactionCompletion {
  const reducerPolicy = reducerRuntime.getKnobs();
  const outcome = createGpuFlowVisiblePublicationCompletionOutcome({
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
      createGpuFlowVisiblePublicationColdStartShellPublication({ outcome }),
    completeReducerFrame: createGpuFlowVisiblePublicationReducerFrameCompleter({
      forceImmediatePublicationDebtFrame,
      outcome,
      reducerDecision,
      reducerPolicy,
      reducerRuntime,
    }),
    followUpFrameRequests: createGpuFlowVisiblePublicationFollowUpFrameRequests(
      {
        followUpFrameReason,
      },
    ),
    heldPreviousVisibleProjectionState:
      createGpuFlowVisiblePublicationCompletionHeldPreviousState({
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

function createGpuFlowVisiblePublicationReducerFrameCompleter({
  forceImmediatePublicationDebtFrame,
  outcome,
  reducerDecision,
  reducerPolicy,
  reducerRuntime,
}: {
  readonly forceImmediatePublicationDebtFrame: boolean;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly reducerPolicy: GpuFlowVisibleFrameReducerPolicy;
  readonly reducerRuntime: GpuFlowVisibleFramePublicationReducerRuntime;
}): () => GpuFlowVisiblePublicationReducerFrameCompletion {
  let reducerFrameCompletion: GpuFlowVisiblePublicationReducerFrameCompletion | null =
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
      debtFrameRequest: createGpuFlowVisiblePublicationDebtFrameRequest({
        completion,
        forceImmediatePublicationDebtFrame,
        outcome,
        reducerDecision,
        reducerPolicy,
      }),
    });
    return reducerFrameCompletion;
  };
}

function createGpuFlowVisiblePublicationColdStartShellPublication({
  outcome,
}: {
  readonly outcome: GpuFlowVisiblePublicationOutcome;
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

function createGpuFlowVisiblePublicationFollowUpFrameRequests({
  followUpFrameReason,
}: {
  readonly followUpFrameReason: GpuFrameReason | null;
}): readonly GpuFrameReason[] {
  return Object.freeze(
    followUpFrameReason === null ? [] : [followUpFrameReason],
  );
}

function createGpuFlowVisiblePublicationDebtFrameRequest({
  completion,
  forceImmediatePublicationDebtFrame,
  outcome,
  reducerDecision,
  reducerPolicy,
}: {
  readonly completion: GpuFlowVisiblePublicationReducerFrameCompletion["completion"];
  readonly forceImmediatePublicationDebtFrame: boolean;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly reducerPolicy: GpuFlowVisibleFrameReducerPolicy;
}): GpuFlowVisiblePublicationDebtFrameRequest | null {
  if (!hasGpuFlowVisiblePublicationDebt(completion.debt)) {
    return null;
  }
  return Object.freeze({
    delayMs:
      forceImmediatePublicationDebtFrame ||
      shouldRequestGpuFlowVisiblePublicationDebtFrameImmediately({
        outcome,
        reducerDecision,
      })
        ? null
        : getDelayedGpuFlowVisiblePublicationDebtRequestMs({
            reducerDecision,
            reducerMotionSettleWindowMs: reducerPolicy.motionSettleWindowMs,
          }),
    frameReason: getGpuFlowVisiblePublicationDebtFrameReason({
      completion,
      outcome,
      reducerDecision,
    }),
  });
}

function getGpuFlowVisiblePublicationDebtFrameReason({
  completion,
  outcome,
  reducerDecision,
}: {
  readonly completion: GpuFlowVisiblePublicationReducerFrameCompletion["completion"];
  readonly outcome: GpuFlowVisiblePublicationOutcome;
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
  return getGpuFlowVisiblePublicationDebtReason(completion.debt);
}

function shouldRequestGpuFlowManualContentDebtFrame({
  completion,
  reducerDecision,
}: {
  readonly completion: GpuFlowVisiblePublicationReducerFrameCompletion["completion"];
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): boolean {
  return (
    reducerDecision.lane === "content" &&
    completion.debt.content &&
    !completion.debt.motion
  );
}

function shouldRequestGpuFlowVisiblePublicationDebtFrameImmediately({
  outcome,
  reducerDecision,
}: {
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): boolean {
  return (
    isGpuFlowRetainedProjectionBlockedOutcome(outcome) &&
    reducerDecision.schedulerState !== "motion-active"
  );
}

function isGpuFlowRetainedProjectionBlockedOutcome(
  outcome: GpuFlowVisiblePublicationOutcome,
): boolean {
  return (
    outcome.kind === "blocked" &&
    outcome.token.blockedReasons.some(
      (reason) => reason.family === "retained-projection",
    )
  );
}

function isGpuFlowSectionSurfaceRepairBlockedOutcome(
  outcome: GpuFlowVisiblePublicationOutcome,
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
  outcome: GpuFlowVisiblePublicationOutcome,
): boolean {
  return (
    outcome.kind === "blocked" &&
    outcome.token.blockedReasons.some(
      isGpuFlowBrowserTextSnapshotPendingBlockedReason,
    )
  );
}

function getDelayedGpuFlowVisiblePublicationDebtRequestMs({
  reducerDecision,
  reducerMotionSettleWindowMs,
}: {
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly reducerMotionSettleWindowMs: number;
}): number | null {
  if (reducerDecision.schedulerState === "motion-active") {
    return GPU_FLOW_MOTION_ACTIVE_DEBT_RETRY_DELAY_MS;
  }
  if (reducerDecision.lane === "motion") {
    return null;
  }
  if (reducerDecision.schedulerState === "motion-settling") {
    return reducerMotionSettleWindowMs * 8;
  }
  return null;
}

function createGpuFlowVisiblePublicationCompletionHeldPreviousState({
  outcome,
  previousVisibleProjectionState,
  reducerDecision,
  renderedVisibleFrame,
  reducerPolicy,
}: {
  readonly outcome: GpuFlowVisiblePublicationOutcome;
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
  readonly proof: GpuFlowVisiblePublicationBlockedProof | null;
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

function createGpuFlowVisiblePublicationCompletionOutcome({
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
}): GpuFlowVisiblePublicationOutcome {
  const visibleFrameStateMachineOutcome =
    transactionProof.visibleFrameStateMachineOutcome;
  if (!visibleFrameStateMachineOutcome) {
    throw new Error(
      "GPU Flow visible publication completion requires a visible frame state machine outcome.",
    );
  }
  switch (visibleFrameStateMachineOutcome.kind) {
    case "presented":
    case "projected":
      return createGpuFlowVisiblePublicationCompletionPresentOutcome({
        reducerDecision,
        transactionProof,
      });
    case "held":
      return createGpuFlowVisiblePublicationCompletionHeldStateMachineOutcome({
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
      return createGpuFlowVisiblePublicationCompletionNoFrameOutcome({
        blockedPublicationToken: null,
        previousVisibleProjectionState,
        reducerDecision,
        reducerPolicy,
      });
    case "aborted":
      return createGpuFlowVisiblePublicationCompletionAbortedStateMachineOutcome(
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

function createGpuFlowVisiblePublicationCompletionHeldStateMachineOutcome({
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
  GpuFlowVisiblePublicationOutcome,
  { readonly kind: "blocked" | "hold-previous" }
> {
  const visibleProjectionState = transactionProof.visibleProjectionState;
  if (visibleProjectionState?.transaction.kind === "held-previous") {
    return createGpuFlowVisiblePublicationCompletionHeldPreviousOutcome({
      blockedPublicationToken,
      reducerDecision,
      visibleProjectionState,
    });
  }
  return createGpuFlowVisiblePublicationCompletionNoFrameOutcome({
    blockedPublicationToken,
    previousVisibleProjectionState,
    reducerDecision,
    reducerPolicy,
  });
}

function createGpuFlowVisiblePublicationCompletionAbortedStateMachineOutcome({
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
  GpuFlowVisiblePublicationOutcome,
  { readonly kind: "blocked" | "hold-previous" }
> {
  const visibleProjectionState = transactionProof.visibleProjectionState;
  if (visibleProjectionState?.transaction.kind === "held-previous") {
    return createGpuFlowVisiblePublicationCompletionHeldPreviousOutcome({
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
  return createGpuFlowVisiblePublicationCompletionNoFrameOutcome({
    blockedPublicationToken: null,
    previousVisibleProjectionState,
    reducerDecision,
    reducerPolicy,
  });
}

function createGpuFlowVisiblePublicationCompletionPresentOutcome({
  reducerDecision,
  transactionProof,
}: {
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof;
}): Extract<GpuFlowVisiblePublicationOutcome, { readonly kind: "present" }> {
  if (!transactionProof.renderedVisibleFrame) {
    throw new Error(
      "GPU Flow visible publication completion cannot present without a rendered state machine outcome.",
    );
  }
  const visibleProjectionState = transactionProof.visibleProjectionState;
  if (visibleProjectionState === null) {
    throw new Error(
      "GPU Flow visible publication completion cannot present a rendered frame without visible projection state.",
    );
  }
  if (visibleProjectionState.transaction.kind === "held-previous") {
    throw new Error(
      "GPU Flow visible publication completion cannot present a held-previous state machine outcome.",
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
    token: createGpuFlowVisiblePublicationCompletionPresentationToken({
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

function createGpuFlowVisiblePublicationCompletionHoldOutcome({
  reducerDecision,
  visibleProjectionState,
}: {
  readonly reducerDecision: {
    readonly sample: GpuFlowLiveProjectionSample;
  };
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): Extract<
  GpuFlowVisiblePublicationOutcome,
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

function createGpuFlowVisiblePublicationCompletionHeldPreviousOutcome({
  blockedPublicationToken,
  reducerDecision,
  visibleProjectionState,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): Extract<
  GpuFlowVisiblePublicationOutcome,
  { readonly kind: "blocked" | "hold-previous" }
> {
  assertGpuFlowHeldPreviousPublicationCompletionMatchesSample({
    reducerDecision,
    visibleProjectionState,
  });
  if (
    !isGpuFlowVisiblePublicationHeldPreviousOverBudget(visibleProjectionState)
  ) {
    return createGpuFlowVisiblePublicationCompletionHoldOutcome({
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
        createGpuFlowVisiblePublicationHeldPreviousOverBudgetBlockedReason(
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

function isGpuFlowVisiblePublicationHeldPreviousOverBudget(
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

function createGpuFlowVisiblePublicationCompletionNoFrameOutcome({
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
  GpuFlowVisiblePublicationOutcome,
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

function createGpuFlowVisiblePublicationHeldPreviousOverBudgetBlockedReason(
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
