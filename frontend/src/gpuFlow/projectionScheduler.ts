import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowCommitPublicationToken,
  GpuFlowHoldPreviousToken,
} from "./GpuFlow/visibleFramePresentationProofs";
import {
  assertGpuFlowBlockedPublicationTokenForProjectionSample,
  assertGpuFlowCommitPublicationTokenForProjectionSample,
  assertGpuFlowHoldPreviousTokenForProjectionSample,
} from "./GpuFlow/visibleFramePresentationProofs";
import {
  createGpuFlowVisibleFrameStarvationPolicy,
  DEFAULT_GPU_FLOW_VISIBLE_FRAME_STARVATION_POLICY,
  type GpuFlowVisibleFrameStarvationPolicy,
} from "./GpuFlow/visibleFrameStateMachine";
import type { GpuFrameReason } from "./gpuRenderer";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionLane,
} from "./projectionRuntime";
import {
  GPU_FLOW_CONTENT_BLOCKED_RETRY_DELAY_MULTIPLIER,
  GPU_FLOW_MOTION_BLOCKED_RETRY_DELAY_MULTIPLIER,
  GPU_FLOW_RETAINED_SCROLL_CONTENT_SETTLE_DELAY_MULTIPLIER,
  hasGpuFlowCriticalContentFrameRequest,
  isGpuFlowContentFrameReason,
  isGpuFlowMaintenanceFrameReason,
  isGpuFlowMotionFrameReason,
  isGpuFlowRetainedMotionFrameReason,
  isGpuFlowRetainedScrollPublicationDecision,
  isGpuFlowRetainedScrollSampleInteractionActive,
  resolveGpuFlowProjectionContentRetryBlock,
  resolveGpuFlowProjectionMotionRetryBlock,
  shouldDeferGpuFlowProjectionMaintenanceOnlyFrame,
  shouldDeferGpuFlowProjectionNonCriticalContentCatchupFrame,
  shouldPrioritizeGpuFlowProjectionMotionDebt,
  shouldSelectGpuFlowContentPriorityPublicationLane,
  shouldSelectGpuFlowMaintenancePriorityPublicationLane,
  shouldSelectGpuFlowMotionPriorityPublicationLane,
  shouldSelectGpuFlowSettledExplicitContentRepairLane,
  shouldThrottleGpuFlowContentRetryAfterUncommittedFrame,
  shouldThrottleGpuFlowMotionRetryAfterUncommittedFrame,
  shouldYieldGpuFlowCriticalContentDebtForCoverage,
  type GpuFlowProjectionSchedulerState,
} from "./projectionSchedulerPolicy";

export {
  shouldDeferGpuFlowMaintenanceContentCatchup,
} from "./projectionSchedulerPolicy";

export type GpuFlowProjectionSchedulerKnobs =
  GpuFlowVisibleFrameStarvationPolicy;

export const DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS: GpuFlowProjectionSchedulerKnobs =
  DEFAULT_GPU_FLOW_VISIBLE_FRAME_STARVATION_POLICY;

export type GpuFlowVisiblePublicationDecision = {
  readonly debt: GpuFlowVisiblePublicationDebt;
  readonly lane: GpuFlowProjectionLane | "idle";
  readonly rawReasons: readonly GpuFrameReason[];
  readonly sample: GpuFlowLiveProjectionSample;
  readonly schedulerState: GpuFlowProjectionSchedulerState;
};

type GpuFlowVisiblePublicationDebt = {
  readonly content: boolean;
  readonly maintenance: boolean;
  readonly motion: boolean;
};

export type GpuFlowVisiblePublicationDebtProof = GpuFlowVisiblePublicationDebt;

type GpuFlowVisiblePublicationCompletion = {
  readonly debt: GpuFlowVisiblePublicationDebt;
  readonly outcome: GpuFlowVisiblePublicationCompletionOutcome["kind"];
};

type GpuFlowVisiblePublicationCommitCompletionOutcome = {
  readonly debtProof: GpuFlowVisiblePublicationDebtProof;
  readonly kind: "commit";
  readonly token: GpuFlowCommitPublicationToken;
};

type GpuFlowVisiblePublicationUncommittedCompletionOutcome =
  | {
      readonly kind: "hold-previous";
      readonly token: GpuFlowHoldPreviousToken;
    }
  | {
      readonly kind: "blocked";
      readonly token: GpuFlowBlockedPublicationToken;
    };

export type GpuFlowVisiblePublicationCompletionOutcome =
  | GpuFlowVisiblePublicationCommitCompletionOutcome
  | GpuFlowVisiblePublicationUncommittedCompletionOutcome;

type GpuFlowVisiblePublicationScheduler = {
  completeFrame(
    decision: GpuFlowVisiblePublicationDecision,
    outcome: GpuFlowVisiblePublicationCommitCompletionOutcome,
  ): GpuFlowVisiblePublicationCompletion;
  getKnobs(): GpuFlowProjectionSchedulerKnobs;
  recordUncommittedFrame(
    decision: GpuFlowVisiblePublicationDecision,
    outcome: GpuFlowVisiblePublicationUncommittedCompletionOutcome,
  ): GpuFlowVisiblePublicationCompletion;
  selectFrame(input: {
    readonly hasCommittedContentFrame: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly sample: GpuFlowLiveProjectionSample;
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): GpuFlowVisiblePublicationDecision;
};

export function createGpuFlowVisiblePublicationScheduler({
  knobs = DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
}: {
  readonly knobs?: GpuFlowProjectionSchedulerKnobs | undefined;
} = {}): GpuFlowVisiblePublicationScheduler {
  const schedulerKnobs = createGpuFlowVisibleFrameStarvationPolicy(knobs);
  let contentDebt = false;
  let maintenanceDebt = false;
  let motionDebt = false;
  let lastContentAtMs: number | null = null;
  let lastMotionAtMs: number | null = null;
  let contentRetryBlockedUntilMs: number | null = null;
  let criticalContentDebt = false;
  let criticalContentOriginDebt = false;
  let motionRetryBlockedUntilMs: number | null = null;
  let retainedScrollContentBlockedUntilMs: number | null = null;
  let consecutiveMotionFrames = 0;

  function currentState({
    contentRetryDeferred,
    motionRetryDeferred,
    rawReasons,
    timestamp,
    viewportInteractionActive,
  }: {
    readonly contentRetryDeferred: boolean;
    readonly motionRetryDeferred: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): GpuFlowProjectionSchedulerState {
    const motionSettling = isGpuFlowProjectionMotionSettling(timestamp);
    const priorityState = selectGpuFlowProjectionPrioritySchedulerState({
      contentRetryDeferred,
      criticalContentDebt,
      motionSettling,
      motionRetryDeferred,
      rawReasons,
      timestamp,
      viewportInteractionActive,
    });
    if (priorityState !== null) {
      return priorityState;
    }
    return selectGpuFlowProjectionDebtSchedulerState({
      contentRetryDeferred,
      motionSettling,
      motionRetryDeferred,
    });
  }

  function selectGpuFlowProjectionPrioritySchedulerState({
    contentRetryDeferred,
    criticalContentDebt,
    motionSettling,
    motionRetryDeferred,
    rawReasons,
    timestamp,
    viewportInteractionActive,
  }: {
    readonly contentRetryDeferred: boolean;
    readonly criticalContentDebt: boolean;
    readonly motionSettling: boolean;
    readonly motionRetryDeferred: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): GpuFlowProjectionSchedulerState | null {
    if (
      shouldProbeGpuFlowProjectionContentDebt({
        contentRetryDeferred,
        rawReasons,
        viewportInteractionActive,
      })
    ) {
      return "content-catchup";
    }
    if (
      hasCurrentGpuFlowProjectionMotion({
        motionRetryDeferred,
        rawReasons,
        viewportInteractionActive,
      })
    ) {
      return "motion-active";
    }
    if (
      shouldPrioritizeGpuFlowProjectionMotionDebt({
        contentDebt,
        contentRetryDeferred,
        motionDebt,
        motionRetryDeferred,
      })
    ) {
      return "motion-active";
    }
    if (
      shouldDeferGpuFlowProjectionMaintenanceOnlyFrame({
        contentDebt,
        maintenanceDebt,
        motionDebt,
        motionSettling,
        postContentMaintenanceSettling:
          isGpuFlowProjectionPostContentMaintenanceSettling(timestamp),
        rawReasons,
      })
    ) {
      return "maintenance-deferred";
    }
    if (
      shouldDeferGpuFlowProjectionNonCriticalContentCatchupFrame({
        contentDebt,
        criticalContentDebt,
        motionDebt,
        postContentMaintenanceSettling:
          isGpuFlowProjectionPostContentMaintenanceSettling(timestamp),
        rawReasons,
      })
    ) {
      return "maintenance-deferred";
    }
    if (motionSettling && !contentDebt) {
      return "motion-settling";
    }
    if (
      shouldPublishGpuFlowProjectionContentDebtNow({
        contentRetryDeferred,
        rawReasons,
        viewportInteractionActive,
      })
    ) {
      return "content-catchup";
    }
    return null;
  }

  function selectGpuFlowProjectionDebtSchedulerState({
    contentRetryDeferred,
    motionSettling,
    motionRetryDeferred,
  }: {
    readonly contentRetryDeferred: boolean;
    readonly motionSettling: boolean;
    readonly motionRetryDeferred: boolean;
  }): GpuFlowProjectionSchedulerState {
    if (motionDebt && !motionRetryDeferred) {
      return "motion-active";
    }
    if (motionSettling) {
      return "motion-settling";
    }
    return selectGpuFlowProjectionNonMotionSchedulerState({
      contentDebt,
      contentRetryDeferred,
      maintenanceDebt,
    });
  }

  function shouldProbeGpuFlowProjectionContentDebt({
    contentRetryDeferred,
    rawReasons,
    viewportInteractionActive,
  }: {
    readonly contentRetryDeferred: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly viewportInteractionActive: boolean;
  }): boolean {
    return (
      contentDebt &&
      !contentRetryDeferred &&
      !viewportInteractionActive &&
      rawReasons.some(isGpuFlowContentFrameReason) &&
      !rawReasons.some(isGpuFlowRetainedMotionFrameReason) &&
      schedulerKnobs.maxContentInterleaveMs > 0 &&
      consecutiveMotionFrames >=
        schedulerKnobs.maxConsecutiveMotionFramesBeforeContentProbe
    );
  }

  function shouldPublishGpuFlowProjectionContentDebtNow({
    contentRetryDeferred,
    rawReasons,
    viewportInteractionActive,
  }: {
    readonly contentRetryDeferred: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly viewportInteractionActive: boolean;
  }): boolean {
    return (
      contentDebt &&
      !contentRetryDeferred &&
      !viewportInteractionActive &&
      schedulerKnobs.maxContentInterleaveMs > 0 &&
      rawReasons.some(isGpuFlowContentFrameReason)
    );
  }

  function hasCurrentGpuFlowProjectionMotion({
    motionRetryDeferred,
    rawReasons,
    viewportInteractionActive,
  }: {
    readonly motionRetryDeferred: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly viewportInteractionActive: boolean;
  }): boolean {
    return (
      !motionRetryDeferred &&
      (viewportInteractionActive || rawReasons.some(isGpuFlowMotionFrameReason))
    );
  }

  function isGpuFlowProjectionMotionSettling(
    timestamp: DOMHighResTimeStamp,
  ): boolean {
    return (
      lastMotionAtMs !== null &&
      timestamp - lastMotionAtMs <= schedulerKnobs.motionSettleWindowMs
    );
  }

  function isGpuFlowProjectionPostContentMaintenanceSettling(
    timestamp: DOMHighResTimeStamp,
  ): boolean {
    return (
      lastContentAtMs !== null &&
      timestamp - lastContentAtMs < schedulerKnobs.motionSettleWindowMs * 2
    );
  }

  return {
    completeFrame(decision, outcome) {
      assertGpuFlowVisiblePublicationCommitTokenMatchesDecision({
        decision,
        token: outcome.token,
      });
      assertGpuFlowVisiblePublicationCommitDebtProofMatchesDecision({
        debtProof: outcome.debtProof,
        decision,
      });
      if (outcome.debtProof.motion) {
        motionDebt = false;
        motionRetryBlockedUntilMs = null;
        lastMotionAtMs = decision.sample.timestamp;
        consecutiveMotionFrames += 1;
        if (
          isGpuFlowRetainedScrollPublicationDecision(decision) &&
          !criticalContentOriginDebt
        ) {
          retainedScrollContentBlockedUntilMs = Math.max(
            retainedScrollContentBlockedUntilMs ?? 0,
            decision.sample.timestamp +
              schedulerKnobs.motionSettleWindowMs *
                GPU_FLOW_RETAINED_SCROLL_CONTENT_SETTLE_DELAY_MULTIPLIER,
          );
        }
      }
      if (outcome.debtProof.content) {
        contentDebt = false;
        criticalContentDebt = false;
        criticalContentOriginDebt = false;
        contentRetryBlockedUntilMs = null;
        retainedScrollContentBlockedUntilMs = null;
        lastContentAtMs = decision.sample.timestamp;
        consecutiveMotionFrames = 0;
      } else if (decision.lane === "content") {
        criticalContentDebt = false;
      }
      if (outcome.debtProof.maintenance) {
        maintenanceDebt = false;
        consecutiveMotionFrames = 0;
      }
      return createGpuFlowVisiblePublicationCompletion({
        contentDebt,
        maintenanceDebt,
        motionDebt,
        outcome: outcome.kind,
      });
    },
    getKnobs() {
      return schedulerKnobs;
    },
    recordUncommittedFrame(decision, outcome) {
      if (outcome.kind === "hold-previous") {
        assertGpuFlowHoldPreviousTokenForProjectionSample({
          projectionSampleId: decision.sample.id,
          token: outcome.token,
        });
      } else if (outcome.kind === "blocked") {
        assertGpuFlowBlockedPublicationTokenForProjectionSample({
          projectionSampleId: decision.sample.id,
          token: outcome.token,
        });
      }
      if (
        shouldThrottleGpuFlowContentRetryAfterUncommittedFrame(
          decision,
          outcome,
        )
      ) {
        contentRetryBlockedUntilMs = Math.max(
          contentRetryBlockedUntilMs ?? 0,
          decision.sample.timestamp +
            schedulerKnobs.motionSettleWindowMs *
              GPU_FLOW_CONTENT_BLOCKED_RETRY_DELAY_MULTIPLIER,
        );
      }
      if (
        shouldThrottleGpuFlowMotionRetryAfterUncommittedFrame(decision, outcome)
      ) {
        motionRetryBlockedUntilMs = Math.max(
          motionRetryBlockedUntilMs ?? 0,
          decision.sample.timestamp +
            schedulerKnobs.motionSettleWindowMs *
              GPU_FLOW_MOTION_BLOCKED_RETRY_DELAY_MULTIPLIER,
        );
      }
      if (shouldYieldGpuFlowCriticalContentDebtForCoverage(decision, outcome)) {
        criticalContentDebt = false;
      }
      return createGpuFlowVisiblePublicationCompletion({
        contentDebt,
        maintenanceDebt,
        motionDebt,
        outcome: outcome.kind,
      });
    },
    selectFrame({
      hasCommittedContentFrame,
      rawReasons,
      sample,
      timestamp,
      viewportInteractionActive,
    }) {
      const projectionInteractionActive =
        viewportInteractionActive ||
        isGpuFlowRetainedScrollSampleInteractionActive(sample);
      if (rawReasons.some(isGpuFlowMotionFrameReason)) {
        motionDebt = true;
      }
      if (rawReasons.some(isGpuFlowContentFrameReason)) {
        contentDebt = true;
      }
      if (hasGpuFlowCriticalContentFrameRequest(rawReasons)) {
        criticalContentDebt = true;
        criticalContentOriginDebt = true;
      }
      if (rawReasons.some(isGpuFlowMaintenanceFrameReason)) {
        maintenanceDebt = true;
      }
      const contentRetryBlock = resolveGpuFlowProjectionContentRetryBlock({
        contentRetryBlockedUntilMs,
        hasCommittedContentFrame,
        rawReasons,
        retainedScrollContentBlockedUntilMs,
        timestamp,
      });
      contentRetryBlockedUntilMs = contentRetryBlock.blockedUntilMs;
      retainedScrollContentBlockedUntilMs =
        contentRetryBlock.retainedScrollBlockedUntilMs;
      const { contentRetryDeferred } = contentRetryBlock;
      const motionRetryBlock = resolveGpuFlowProjectionMotionRetryBlock({
        hasCommittedContentFrame,
        motionRetryBlockedUntilMs,
        timestamp,
      });
      motionRetryBlockedUntilMs = motionRetryBlock.blockedUntilMs;
      const { motionRetryDeferred } = motionRetryBlock;
      const schedulerState = currentState({
        contentRetryDeferred,
        motionRetryDeferred,
        rawReasons,
        timestamp,
        viewportInteractionActive: projectionInteractionActive,
      });
      const lane = selectVisiblePublicationLane({
        contentDebt,
        contentRetryDeferred,
        criticalContentDebt,
        hasCommittedContentFrame,
        maintenanceDebt,
        motionDebt,
        motionRetryDeferred,
        rawReasons,
        schedulerKnobs,
        schedulerState,
        viewportInteractionActive: projectionInteractionActive,
      });
      return Object.freeze({
        debt: createGpuFlowVisiblePublicationDebt({
          content: lane === "content" ? false : contentDebt,
          maintenance: lane === "maintenance" ? false : maintenanceDebt,
          motion: lane === "motion" ? false : motionDebt,
        }),
        lane,
        rawReasons: Object.freeze([...rawReasons]),
        sample,
        schedulerState,
      });
    },
  };
}

function createGpuFlowVisiblePublicationCompletion({
  contentDebt,
  maintenanceDebt,
  motionDebt,
  outcome,
}: {
  readonly contentDebt: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
  readonly outcome: GpuFlowVisiblePublicationCompletion["outcome"];
}): GpuFlowVisiblePublicationCompletion {
  return Object.freeze({
    debt: createGpuFlowVisiblePublicationDebt({
      content: contentDebt,
      maintenance: maintenanceDebt,
      motion: motionDebt,
    }),
    outcome,
  });
}

function createGpuFlowVisiblePublicationDebt({
  content,
  maintenance,
  motion,
}: GpuFlowVisiblePublicationDebt): GpuFlowVisiblePublicationDebt {
  return Object.freeze({
    content,
    maintenance,
    motion,
  });
}

function selectVisiblePublicationLane({
  contentDebt,
  contentRetryDeferred,
  criticalContentDebt,
  hasCommittedContentFrame,
  maintenanceDebt,
  motionDebt,
  motionRetryDeferred,
  rawReasons,
  schedulerKnobs,
  schedulerState,
  viewportInteractionActive,
}: {
  readonly contentDebt: boolean;
  readonly contentRetryDeferred: boolean;
  readonly criticalContentDebt: boolean;
  readonly hasCommittedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
  readonly motionRetryDeferred: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
  readonly schedulerState: GpuFlowProjectionSchedulerState;
  readonly viewportInteractionActive: boolean;
}): GpuFlowVisiblePublicationDecision["lane"] {
  if (
    shouldPublishGpuFlowBootstrapContentFrame({
      hasCommittedContentFrame,
      motionDebt,
    })
  ) {
    return "content";
  }
  switch (schedulerState) {
    case "motion-active":
    case "motion-settling":
      return selectMotionPriorityVisiblePublicationLane({
        contentDebt,
        contentRetryDeferred,
        criticalContentDebt,
        hasCommittedContentFrame,
        maintenanceDebt,
        motionDebt,
        motionRetryDeferred,
        rawReasons,
        schedulerKnobs,
        schedulerState,
        viewportInteractionActive,
      });
    case "content-catchup":
      return selectContentCatchupVisiblePublicationLane({
        contentDebt,
        hasCommittedContentFrame,
        maintenanceDebt,
        motionDebt,
      });
    case "maintenance-drain":
      return selectMaintenanceDrainVisiblePublicationLane({ maintenanceDebt });
    case "maintenance-deferred":
    case "idle":
      return "idle";
  }
}

function selectGpuFlowProjectionNonMotionSchedulerState({
  contentDebt,
  contentRetryDeferred,
  maintenanceDebt,
}: {
  readonly contentDebt: boolean;
  readonly contentRetryDeferred: boolean;
  readonly maintenanceDebt: boolean;
}): GpuFlowProjectionSchedulerState {
  if (contentDebt) {
    if (!contentRetryDeferred) {
      return "content-catchup";
    }
    return maintenanceDebt ? "maintenance-drain" : "idle";
  }
  return maintenanceDebt ? "maintenance-drain" : "idle";
}

function shouldPublishGpuFlowBootstrapContentFrame({
  hasCommittedContentFrame,
  motionDebt,
}: {
  readonly hasCommittedContentFrame: boolean;
  readonly motionDebt: boolean;
}): boolean {
  return motionDebt && !hasCommittedContentFrame;
}

function selectMotionPriorityVisiblePublicationLane({
  contentDebt,
  contentRetryDeferred,
  criticalContentDebt,
  hasCommittedContentFrame,
  maintenanceDebt,
  motionDebt,
  motionRetryDeferred,
  rawReasons,
  schedulerState,
  schedulerKnobs,
  viewportInteractionActive,
}: {
  readonly contentDebt: boolean;
  readonly contentRetryDeferred: boolean;
  readonly criticalContentDebt: boolean;
  readonly hasCommittedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
  readonly motionRetryDeferred: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly schedulerState: GpuFlowProjectionSchedulerState;
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
  readonly viewportInteractionActive: boolean;
}): GpuFlowVisiblePublicationDecision["lane"] {
  if (
    shouldSelectGpuFlowSettledExplicitContentRepairLane({
      contentDebt,
      contentRetryDeferred,
      criticalContentDebt,
      rawReasons,
      viewportInteractionActive,
    })
  ) {
    return schedulerKnobs.maxContentInterleaveMs > 0 ? "content" : "idle";
  }
  if (
    shouldSelectGpuFlowMotionPriorityPublicationLane({
      hasCommittedContentFrame,
      motionDebt,
      motionRetryDeferred,
      schedulerState,
    })
  ) {
    return "motion";
  }
  if (
    shouldSelectGpuFlowContentPriorityPublicationLane({
      contentDebt,
      contentRetryDeferred,
    })
  ) {
    return schedulerKnobs.maxContentInterleaveMs > 0 ? "content" : "idle";
  }
  if (
    shouldSelectGpuFlowMaintenancePriorityPublicationLane({
      contentRetryDeferred,
      maintenanceDebt,
    })
  ) {
    return schedulerKnobs.maxMaintenanceInterleaveMs > 0
      ? "maintenance"
      : "idle";
  }
  return "idle";
}

function selectContentCatchupVisiblePublicationLane({
  contentDebt,
  hasCommittedContentFrame,
  maintenanceDebt,
  motionDebt,
}: {
  readonly contentDebt: boolean;
  readonly hasCommittedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
}): GpuFlowVisiblePublicationDecision["lane"] {
  if (contentDebt) {
    return "content";
  }
  if (motionDebt && hasCommittedContentFrame) {
    return "motion";
  }
  return selectMaintenanceDrainVisiblePublicationLane({ maintenanceDebt });
}

function selectMaintenanceDrainVisiblePublicationLane({
  maintenanceDebt,
}: {
  readonly maintenanceDebt: boolean;
}): GpuFlowVisiblePublicationDecision["lane"] {
  return maintenanceDebt ? "maintenance" : "idle";
}

export function hasGpuFlowVisiblePublicationDebt(
  debtOrDecision:
    | GpuFlowVisiblePublicationDebt
    | GpuFlowVisiblePublicationDecision,
): boolean {
  const debt = getGpuFlowVisiblePublicationDebt(debtOrDecision);
  return debt.content || debt.maintenance || debt.motion;
}

export function getGpuFlowVisiblePublicationDebtReason(
  debtOrDecision:
    | GpuFlowVisiblePublicationDebt
    | GpuFlowVisiblePublicationDecision,
): GpuFrameReason {
  const debt = getGpuFlowVisiblePublicationDebt(debtOrDecision);
  if (debt.motion) {
    return "retained-scroll";
  }
  if (debt.content) {
    return "manual";
  }
  return "texture-upload";
}

function getGpuFlowVisiblePublicationDebt(
  debtOrDecision:
    | GpuFlowVisiblePublicationDebt
    | GpuFlowVisiblePublicationDecision,
): GpuFlowVisiblePublicationDebt {
  return "debt" in debtOrDecision ? debtOrDecision.debt : debtOrDecision;
}

function assertGpuFlowVisiblePublicationCommitTokenMatchesDecision({
  decision,
  token,
}: {
  readonly decision: GpuFlowVisiblePublicationDecision;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  assertGpuFlowCommitPublicationTokenForProjectionSample({
    projectionSampleId: decision.sample.id,
    token,
  });
}

function assertGpuFlowVisiblePublicationCommitDebtProofMatchesDecision({
  debtProof,
  decision,
}: {
  readonly debtProof: GpuFlowVisiblePublicationDebtProof;
  readonly decision: GpuFlowVisiblePublicationDecision;
}): void {
  const illegalDebtKinds = [
    debtProof.content && decision.lane !== "content" ? "content" : null,
    debtProof.maintenance && decision.lane !== "maintenance"
      ? "maintenance"
      : null,
    debtProof.motion && decision.lane !== "motion" ? "motion" : null,
  ].filter((kind): kind is string => kind !== null);

  if (illegalDebtKinds.length > 0) {
    throw new Error(
      `GPU Flow visible publication debt completion can only clear debt for the selected publication lane (${decision.lane}); illegal debt proof: ${illegalDebtKinds.join(
        ", ",
      )}.`,
    );
  }
}
