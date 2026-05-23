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
import type { GpuFrameReason } from "./gpuRenderer";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionLane,
} from "./projectionRuntime";

type GpuFlowProjectionSchedulerState =
  | "content-catchup"
  | "idle"
  | "maintenance-deferred"
  | "maintenance-drain"
  | "motion-active"
  | "motion-settling";

export type GpuFlowProjectionSchedulerKnobs = {
  readonly maxConsecutiveMotionFramesBeforeContentProbe: number;
  readonly maxContentInterleaveMs: number;
  readonly maxHeldPreviousFrames: number;
  readonly maxHeldPreviousMs: number;
  readonly maxMaintenanceInterleaveMs: number;
  readonly motionSettleWindowMs: number;
};

export const DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS: GpuFlowProjectionSchedulerKnobs =
  Object.freeze({
    maxConsecutiveMotionFramesBeforeContentProbe: 6,
    maxContentInterleaveMs: 2,
    maxHeldPreviousFrames: 6,
    maxHeldPreviousMs: 120,
    maxMaintenanceInterleaveMs: 1,
    motionSettleWindowMs: 120,
  });

const GPU_FLOW_CONTENT_BLOCKED_RETRY_DELAY_MULTIPLIER = 2;
const GPU_FLOW_MOTION_BLOCKED_RETRY_DELAY_MULTIPLIER = 2;

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
  const schedulerKnobs = Object.freeze({ ...knobs });
  let contentDebt = false;
  let maintenanceDebt = false;
  let motionDebt = false;
  let lastContentAtMs: number | null = null;
  let lastMotionAtMs: number | null = null;
  let contentRetryBlockedUntilMs: number | null = null;
  let motionRetryBlockedUntilMs: number | null = null;
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
    motionSettling,
    motionRetryDeferred,
    rawReasons,
    timestamp,
    viewportInteractionActive,
  }: {
    readonly contentRetryDeferred: boolean;
    readonly motionSettling: boolean;
    readonly motionRetryDeferred: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): GpuFlowProjectionSchedulerState | null {
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
    if (
      shouldProbeGpuFlowProjectionContentDebt({
        contentRetryDeferred,
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
    viewportInteractionActive,
  }: {
    readonly contentRetryDeferred: boolean;
    readonly viewportInteractionActive: boolean;
  }): boolean {
    return (
      contentDebt &&
      !contentRetryDeferred &&
      !viewportInteractionActive &&
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
      }
      if (outcome.debtProof.content) {
        contentDebt = false;
        contentRetryBlockedUntilMs = null;
        lastContentAtMs = decision.sample.timestamp;
        consecutiveMotionFrames = 0;
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
      if (rawReasons.some(isGpuFlowMotionFrameReason)) {
        motionDebt = true;
      }
      if (rawReasons.some(isGpuFlowContentFrameReason)) {
        contentDebt = true;
      }
      if (rawReasons.some(isGpuFlowMaintenanceFrameReason)) {
        maintenanceDebt = true;
      }
      const contentRetryBlock = resolveGpuFlowProjectionContentRetryBlock({
        contentRetryBlockedUntilMs,
        hasCommittedContentFrame,
        rawReasons,
        timestamp,
      });
      contentRetryBlockedUntilMs = contentRetryBlock.blockedUntilMs;
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
        viewportInteractionActive,
      });
      const lane = selectVisiblePublicationLane({
        contentDebt,
        contentRetryDeferred,
        hasCommittedContentFrame,
        maintenanceDebt,
        motionDebt,
        motionRetryDeferred,
        schedulerKnobs,
        schedulerState,
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
  hasCommittedContentFrame,
  maintenanceDebt,
  motionDebt,
  motionRetryDeferred,
  schedulerKnobs,
  schedulerState,
}: {
  readonly contentDebt: boolean;
  readonly contentRetryDeferred: boolean;
  readonly hasCommittedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
  readonly motionRetryDeferred: boolean;
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
  readonly schedulerState: GpuFlowProjectionSchedulerState;
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
        hasCommittedContentFrame,
        maintenanceDebt,
        motionDebt,
        motionRetryDeferred,
        schedulerKnobs,
        schedulerState,
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
  hasCommittedContentFrame,
  maintenanceDebt,
  motionDebt,
  motionRetryDeferred,
  schedulerState,
  schedulerKnobs,
}: {
  readonly contentDebt: boolean;
  readonly contentRetryDeferred: boolean;
  readonly hasCommittedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
  readonly motionRetryDeferred: boolean;
  readonly schedulerState: GpuFlowProjectionSchedulerState;
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
}): GpuFlowVisiblePublicationDecision["lane"] {
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

function shouldDeferGpuFlowProjectionMaintenanceOnlyFrame({
  contentDebt,
  motionDebt,
  maintenanceDebt,
  motionSettling,
  postContentMaintenanceSettling,
  rawReasons,
}: {
  readonly contentDebt: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
  readonly motionSettling: boolean;
  readonly postContentMaintenanceSettling: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
}): boolean {
  const maintenanceOnlyFrame =
    rawReasons.length > 0 && rawReasons.every(isGpuFlowMaintenanceFrameReason);
  return (
    !motionDebt &&
    maintenanceOnlyFrame &&
    (contentDebt ||
      motionSettling ||
      (maintenanceDebt && postContentMaintenanceSettling))
  );
}

function isGpuFlowMotionFrameReason(reason: GpuFrameReason): boolean {
  return reason === "retained-scroll" || reason === "viewport";
}

function shouldPrioritizeGpuFlowProjectionMotionDebt({
  contentDebt,
  contentRetryDeferred,
  motionDebt,
  motionRetryDeferred,
}: {
  readonly contentDebt: boolean;
  readonly contentRetryDeferred: boolean;
  readonly motionDebt: boolean;
  readonly motionRetryDeferred: boolean;
}): boolean {
  return (
    motionDebt && !motionRetryDeferred && (!contentDebt || contentRetryDeferred)
  );
}

function isGpuFlowContentFrameReason(reason: GpuFrameReason): boolean {
  return (
    reason === "animation" ||
    reason === "init" ||
    reason === "manual" ||
    reason === "resize"
  );
}

function isGpuFlowMaintenanceFrameReason(reason: GpuFrameReason): boolean {
  return reason === "paint" || reason === "texture-upload";
}

function shouldDeferGpuFlowProjectionContentRetry({
  contentRetryBlockedUntilMs,
  hasCommittedContentFrame,
  rawReasons,
  timestamp,
}: {
  readonly contentRetryBlockedUntilMs: number | null;
  readonly hasCommittedContentFrame: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly timestamp: DOMHighResTimeStamp;
}): boolean {
  return (
    hasCommittedContentFrame &&
    contentRetryBlockedUntilMs !== null &&
    timestamp < contentRetryBlockedUntilMs &&
    !rawReasons.some(isGpuFlowCriticalContentFrameReason)
  );
}

function isGpuFlowCriticalContentFrameReason(reason: GpuFrameReason): boolean {
  return reason === "init" || reason === "resize";
}

function resolveGpuFlowProjectionContentRetryBlock({
  contentRetryBlockedUntilMs,
  hasCommittedContentFrame,
  rawReasons,
  timestamp,
}: {
  readonly contentRetryBlockedUntilMs: number | null;
  readonly hasCommittedContentFrame: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly timestamp: DOMHighResTimeStamp;
}): {
  readonly blockedUntilMs: number | null;
  readonly contentRetryDeferred: boolean;
} {
  const contentRetryDeferred = shouldDeferGpuFlowProjectionContentRetry({
    contentRetryBlockedUntilMs,
    hasCommittedContentFrame,
    rawReasons,
    timestamp,
  });
  return Object.freeze({
    blockedUntilMs:
      contentRetryBlockedUntilMs !== null &&
      !contentRetryDeferred &&
      timestamp >= contentRetryBlockedUntilMs
        ? null
        : contentRetryBlockedUntilMs,
    contentRetryDeferred,
  });
}

function shouldDeferGpuFlowProjectionMotionRetry({
  hasCommittedContentFrame,
  motionRetryBlockedUntilMs,
  timestamp,
}: {
  readonly hasCommittedContentFrame: boolean;
  readonly motionRetryBlockedUntilMs: number | null;
  readonly timestamp: DOMHighResTimeStamp;
}): boolean {
  return (
    hasCommittedContentFrame &&
    motionRetryBlockedUntilMs !== null &&
    timestamp < motionRetryBlockedUntilMs
  );
}

function resolveGpuFlowProjectionMotionRetryBlock({
  hasCommittedContentFrame,
  motionRetryBlockedUntilMs,
  timestamp,
}: {
  readonly hasCommittedContentFrame: boolean;
  readonly motionRetryBlockedUntilMs: number | null;
  readonly timestamp: DOMHighResTimeStamp;
}): {
  readonly blockedUntilMs: number | null;
  readonly motionRetryDeferred: boolean;
} {
  const motionRetryDeferred = shouldDeferGpuFlowProjectionMotionRetry({
    hasCommittedContentFrame,
    motionRetryBlockedUntilMs,
    timestamp,
  });
  return Object.freeze({
    blockedUntilMs:
      motionRetryBlockedUntilMs !== null &&
      !motionRetryDeferred &&
      timestamp >= motionRetryBlockedUntilMs
        ? null
        : motionRetryBlockedUntilMs,
    motionRetryDeferred,
  });
}

function shouldSelectGpuFlowMotionPriorityPublicationLane({
  hasCommittedContentFrame,
  motionDebt,
  motionRetryDeferred,
  schedulerState,
}: {
  readonly hasCommittedContentFrame: boolean;
  readonly motionDebt: boolean;
  readonly motionRetryDeferred: boolean;
  readonly schedulerState: GpuFlowProjectionSchedulerState;
}): boolean {
  return (
    hasCommittedContentFrame &&
    !motionRetryDeferred &&
    (motionDebt || schedulerState === "motion-active")
  );
}

function shouldSelectGpuFlowContentPriorityPublicationLane({
  contentDebt,
  contentRetryDeferred,
}: {
  readonly contentDebt: boolean;
  readonly contentRetryDeferred: boolean;
}): boolean {
  return contentDebt && !contentRetryDeferred;
}

function shouldSelectGpuFlowMaintenancePriorityPublicationLane({
  contentRetryDeferred,
  maintenanceDebt,
}: {
  readonly contentRetryDeferred: boolean;
  readonly maintenanceDebt: boolean;
}): boolean {
  return maintenanceDebt && !contentRetryDeferred;
}

function shouldThrottleGpuFlowContentRetryAfterUncommittedFrame(
  decision: GpuFlowVisiblePublicationDecision,
  outcome: GpuFlowVisiblePublicationUncommittedCompletionOutcome,
): boolean {
  return (
    (decision.lane === "content" && outcome.kind === "hold-previous") ||
    (outcome.kind === "blocked" &&
      decision.lane !== "idle" &&
      decision.lane !== "motion" &&
      outcome.token.blockedReasons.some(
        isGpuFlowHeldPreviousBudgetBlockedReason,
      ))
  );
}

function shouldThrottleGpuFlowMotionRetryAfterUncommittedFrame(
  decision: GpuFlowVisiblePublicationDecision,
  outcome: GpuFlowVisiblePublicationUncommittedCompletionOutcome,
): boolean {
  return (
    decision.lane === "motion" &&
    outcome.kind === "blocked" &&
    outcome.token.blockedReasons.some(isGpuFlowHeldPreviousBudgetBlockedReason)
  );
}

function isGpuFlowHeldPreviousBudgetBlockedReason(reason: {
  readonly reason: string;
}): boolean {
  return reason.reason === "held-previous-budget-exceeded";
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
