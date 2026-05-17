import type { GpuFrameReason } from "./gpuRenderer";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionLane,
} from "./projectionRuntime";

export type GpuFlowProjectionSchedulerState =
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

export type GpuFlowVisiblePublicationDebt = {
  readonly content: boolean;
  readonly maintenance: boolean;
  readonly motion: boolean;
};

export type GpuFlowVisiblePublicationCompletion = {
  readonly debt: GpuFlowVisiblePublicationDebt;
  readonly published: boolean;
};

type GpuFlowVisiblePublicationScheduler = {
  completeFrame(
    decision: GpuFlowVisiblePublicationDecision,
    options?: { readonly published?: boolean } | undefined,
  ): GpuFlowVisiblePublicationCompletion;
  getKnobs(): GpuFlowProjectionSchedulerKnobs;
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

  function currentState(
    timestamp: DOMHighResTimeStamp,
    viewportInteractionActive: boolean,
  ): GpuFlowProjectionSchedulerState {
    if (shouldProbeGpuFlowProjectionContentDebt()) {
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

  function shouldProbeGpuFlowProjectionContentDebt(): boolean {
    return (
      contentDebt &&
      !motionDebt &&
      schedulerKnobs.maxContentInterleaveMs > 0 &&
      consecutiveMotionFrames >=
        schedulerKnobs.maxConsecutiveMotionFramesBeforeContentProbe
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
    completeFrame(decision, options) {
      const published = options?.published ?? true;
      if (published) {
        switch (decision.lane) {
          case "motion":
            motionDebt = false;
            lastMotionAtMs = decision.sample.timestamp;
            consecutiveMotionFrames += 1;
            break;
          case "content":
            contentDebt = false;
            consecutiveMotionFrames = 0;
            break;
          case "maintenance":
            maintenanceDebt = false;
            consecutiveMotionFrames = 0;
            break;
          case "idle":
            break;
        }
      }
      return Object.freeze({
        debt: createGpuFlowVisiblePublicationDebt({
          content: contentDebt,
          maintenance: maintenanceDebt,
          motion: motionDebt,
        }),
        published,
      });
    },
    getKnobs() {
      return schedulerKnobs;
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
      const schedulerState = currentState(timestamp, viewportInteractionActive);
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
  schedulerKnobs,
}: {
  readonly contentDebt: boolean;
  readonly hasCommittedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
}): GpuFlowVisiblePublicationDecision["lane"] {
  if (motionDebt && hasCommittedContentFrame) {
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

export function isGpuFlowMotionFrameReason(reason: GpuFrameReason): boolean {
  return reason === "retained-scroll" || reason === "viewport";
}

export function isGpuFlowContentFrameReason(reason: GpuFrameReason): boolean {
  return (
    reason === "animation" ||
    reason === "init" ||
    reason === "manual" ||
    reason === "paint" ||
    reason === "resize"
  );
}

export function isGpuFlowMaintenanceFrameReason(
  reason: GpuFrameReason,
): boolean {
  return reason === "texture-upload";
}
