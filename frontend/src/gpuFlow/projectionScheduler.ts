import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowCommitPublicationToken,
  GpuFlowHoldPreviousToken,
} from "./GpuFlow/visibleFramePublicationTokens";
import {
  assertGpuFlowBlockedPublicationTokenForProjectionSample,
  assertGpuFlowCommitPublicationTokenForProjectionSample,
  assertGpuFlowHoldPreviousTokenForProjectionSample,
} from "./GpuFlow/visibleFramePublicationTokens";
import type { GpuFrameReason } from "./gpuRenderer";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionLane,
} from "./projectionRuntime";

type GpuFlowProjectionSchedulerState =
  | "content-catchup"
  | "idle"
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
  let lastMotionAtMs: number | null = null;
  let consecutiveMotionFrames = 0;

  function currentState({
    rawReasons,
    timestamp,
    viewportInteractionActive,
  }: {
    readonly rawReasons: readonly GpuFrameReason[];
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): GpuFlowProjectionSchedulerState {
    if (
      shouldPublishGpuFlowProjectionContentDebtNow({
        rawReasons,
        viewportInteractionActive,
      })
    ) {
      return "content-catchup";
    }
    if (shouldProbeGpuFlowProjectionContentDebt(viewportInteractionActive)) {
      return "content-catchup";
    }
    if (hasActiveGpuFlowProjectionMotion(viewportInteractionActive)) {
      return "motion-active";
    }
    if (isGpuFlowProjectionMotionSettling(timestamp)) {
      return "motion-settling";
    }
    return selectGpuFlowProjectionNonMotionSchedulerState({
      contentDebt,
      maintenanceDebt,
    });
  }

  function shouldProbeGpuFlowProjectionContentDebt(
    viewportInteractionActive: boolean,
  ): boolean {
    return (
      contentDebt &&
      !viewportInteractionActive &&
      schedulerKnobs.maxContentInterleaveMs > 0 &&
      consecutiveMotionFrames >=
        schedulerKnobs.maxConsecutiveMotionFramesBeforeContentProbe
    );
  }

  function shouldPublishGpuFlowProjectionContentDebtNow({
    rawReasons,
    viewportInteractionActive,
  }: {
    readonly rawReasons: readonly GpuFrameReason[];
    readonly viewportInteractionActive: boolean;
  }): boolean {
    return (
      contentDebt &&
      !viewportInteractionActive &&
      schedulerKnobs.maxContentInterleaveMs > 0 &&
      rawReasons.some(isGpuFlowContentFrameReason)
    );
  }

  function hasActiveGpuFlowProjectionMotion(
    viewportInteractionActive: boolean,
  ): boolean {
    return motionDebt || viewportInteractionActive;
  }

  function isGpuFlowProjectionMotionSettling(
    timestamp: DOMHighResTimeStamp,
  ): boolean {
    return (
      lastMotionAtMs !== null &&
      timestamp - lastMotionAtMs <= schedulerKnobs.motionSettleWindowMs
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
        lastMotionAtMs = decision.sample.timestamp;
        consecutiveMotionFrames += 1;
      }
      if (outcome.debtProof.content) {
        contentDebt = false;
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
      const schedulerState = currentState({
        rawReasons,
        timestamp,
        viewportInteractionActive,
      });
      const lane = selectVisiblePublicationLane({
        contentDebt,
        hasCommittedContentFrame,
        maintenanceDebt,
        motionDebt,
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
  hasCommittedContentFrame,
  maintenanceDebt,
  motionDebt,
  schedulerKnobs,
  schedulerState,
}: {
  readonly contentDebt: boolean;
  readonly hasCommittedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
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
        hasCommittedContentFrame,
        maintenanceDebt,
        motionDebt,
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
    case "idle":
      return "idle";
  }
}

function selectGpuFlowProjectionNonMotionSchedulerState({
  contentDebt,
  maintenanceDebt,
}: {
  readonly contentDebt: boolean;
  readonly maintenanceDebt: boolean;
}): GpuFlowProjectionSchedulerState {
  if (contentDebt) {
    return "content-catchup";
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
  hasCommittedContentFrame,
  maintenanceDebt,
  motionDebt,
  schedulerState,
  schedulerKnobs,
}: {
  readonly contentDebt: boolean;
  readonly hasCommittedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
  readonly schedulerState: GpuFlowProjectionSchedulerState;
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
}): GpuFlowVisiblePublicationDecision["lane"] {
  if (
    hasCommittedContentFrame &&
    (motionDebt || schedulerState === "motion-active")
  ) {
    return "motion";
  }
  if (contentDebt) {
    return schedulerKnobs.maxContentInterleaveMs > 0 ? "content" : "idle";
  }
  if (maintenanceDebt) {
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

function isGpuFlowMotionFrameReason(reason: GpuFrameReason): boolean {
  return reason === "retained-scroll" || reason === "viewport";
}

function isGpuFlowContentFrameReason(reason: GpuFrameReason): boolean {
  return (
    reason === "animation" ||
    reason === "init" ||
    reason === "manual" ||
    reason === "paint" ||
    reason === "resize"
  );
}

function isGpuFlowMaintenanceFrameReason(reason: GpuFrameReason): boolean {
  return reason === "texture-upload";
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
