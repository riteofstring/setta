import type { GpuFrameReason } from "./gpuRenderer";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionLane,
} from "./projectionRuntime";

export type GpuFlowProjectionSchedulerState =
  | "content-catchup"
  | "idle"
  | "maintenance-deferred"
  | "maintenance-drain"
  | "motion-active"
  | "motion-settling";

export const GPU_FLOW_CONTENT_BLOCKED_RETRY_DELAY_MULTIPLIER = 2;
export const GPU_FLOW_MOTION_BLOCKED_RETRY_DELAY_MULTIPLIER = 2;
export const GPU_FLOW_RETAINED_SCROLL_CONTENT_SETTLE_DELAY_MULTIPLIER = 12;

type GpuFlowVisiblePublicationDecisionLike = {
  readonly lane: GpuFlowProjectionLane | "idle";
  readonly rawReasons: readonly GpuFrameReason[];
  readonly sample: GpuFlowLiveProjectionSample;
};

type GpuFlowBlockedReasonLike = {
  readonly family?: string | undefined;
  readonly reason: string;
};

type GpuFlowVisiblePublicationUncommittedCompletionOutcomeLike =
  | {
      readonly kind: "hold-previous";
    }
  | {
      readonly kind: "blocked";
      readonly token: {
        readonly blockedReasons: readonly GpuFlowBlockedReasonLike[];
      };
    };

export function shouldDeferGpuFlowProjectionMaintenanceOnlyFrame({
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
  const maintenanceOnlyFrame = isGpuFlowMaintenanceOnlyFrame(rawReasons);
  const maintenanceBackedNonCriticalContentFrame =
    isGpuFlowMaintenanceBackedNonCriticalContentFrame({
      postContentMaintenanceSettling,
      rawReasons,
    });
  return (
    !motionDebt &&
    (maintenanceOnlyFrame || maintenanceBackedNonCriticalContentFrame) &&
    hasGpuFlowDeferredProjectionDebt({
      contentDebt,
      maintenanceDebt,
      motionSettling,
      postContentMaintenanceSettling,
    })
  );
}

function isGpuFlowMaintenanceOnlyFrame(
  rawReasons: readonly GpuFrameReason[],
): boolean {
  return (
    rawReasons.length > 0 && rawReasons.every(isGpuFlowMaintenanceFrameReason)
  );
}

function isGpuFlowMaintenanceBackedNonCriticalContentFrame({
  postContentMaintenanceSettling,
  rawReasons,
}: {
  readonly postContentMaintenanceSettling: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
}): boolean {
  if (!postContentMaintenanceSettling) {
    return false;
  }
  if (hasGpuFlowCriticalContentFrameRequest(rawReasons)) {
    return false;
  }
  return (
    rawReasons.some(isGpuFlowMaintenanceFrameReason) &&
    rawReasons.some(isGpuFlowContentFrameReason)
  );
}

function hasGpuFlowDeferredProjectionDebt({
  contentDebt,
  maintenanceDebt,
  motionSettling,
  postContentMaintenanceSettling,
}: {
  readonly contentDebt: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionSettling: boolean;
  readonly postContentMaintenanceSettling: boolean;
}): boolean {
  if (contentDebt || motionSettling) {
    return true;
  }
  return maintenanceDebt && postContentMaintenanceSettling;
}

export function shouldDeferGpuFlowProjectionNonCriticalContentCatchupFrame({
  contentDebt,
  criticalContentDebt,
  motionDebt,
  postContentMaintenanceSettling,
  rawReasons,
}: {
  readonly contentDebt: boolean;
  readonly criticalContentDebt: boolean;
  readonly motionDebt: boolean;
  readonly postContentMaintenanceSettling: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
}): boolean {
  return (
    contentDebt &&
    !criticalContentDebt &&
    !motionDebt &&
    postContentMaintenanceSettling &&
    rawReasons.some(isGpuFlowContentFrameReason) &&
    !hasGpuFlowCriticalContentFrameRequest(rawReasons)
  );
}

export function isGpuFlowMotionFrameReason(reason: GpuFrameReason): boolean {
  return (
    reason === "retained-row-hover-clear" ||
    reason === "retained-row-hover-visual" ||
    reason === "retained-scroll" ||
    reason === "viewport"
  );
}

export function isGpuFlowRetainedMotionFrameReason(
  reason: GpuFrameReason,
): boolean {
  return (
    reason === "retained-row-hover-clear" ||
    reason === "retained-row-hover-visual" ||
    reason === "retained-scroll"
  );
}

export function isGpuFlowRetainedScrollSampleInteractionActive(
  sample: GpuFlowLiveProjectionSample,
): boolean {
  return (
    sample.gestureOwner === "ownedByRetainedSectionScroll" ||
    hasGpuFlowRetainedScrollSampleDelta(sample.retainedScrollDelta) ||
    hasGpuFlowRetainedScrollSampleDelta(sample.retainedScrollVelocityCssPxPerMs)
  );
}

export function isGpuFlowRetainedScrollPublicationDecision(
  decision: GpuFlowVisiblePublicationDecisionLike,
): boolean {
  return (
    decision.rawReasons.includes("retained-scroll") ||
    isGpuFlowRetainedScrollSampleInteractionActive(decision.sample)
  );
}

function hasGpuFlowRetainedScrollSampleDelta(
  offsets: GpuFlowLiveProjectionSample["retainedScrollDelta"] | undefined,
): boolean {
  if (!offsets) {
    return false;
  }
  for (const offset of offsets.values()) {
    if (offset.x !== 0 || offset.y !== 0) {
      return true;
    }
  }
  return false;
}

export function shouldPrioritizeGpuFlowProjectionMotionDebt({
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

export function isGpuFlowContentFrameReason(reason: GpuFrameReason): boolean {
  return (
    reason === "animation" ||
    reason === "dom-control-activation" ||
    reason === "init" ||
    reason === "manual" ||
    reason === "retained-native-visual" ||
    reason === "resize"
  );
}

export function isGpuFlowMaintenanceFrameReason(
  reason: GpuFrameReason,
): boolean {
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
    !hasGpuFlowCriticalContentFrameRequest(rawReasons)
  );
}

export function isGpuFlowCriticalContentFrameReason(
  reason: GpuFrameReason,
): boolean {
  return (
    reason === "dom-control-activation" ||
    reason === "init" ||
    reason === "resize"
  );
}

export function hasGpuFlowCriticalContentFrameRequest(
  rawReasons: readonly GpuFrameReason[],
): boolean {
  const hasMotionReason = rawReasons.some(isGpuFlowMotionFrameReason);
  return (
    rawReasons.some(isGpuFlowCriticalContentFrameReason) ||
    (!hasMotionReason && rawReasons.includes("retained-native-visual"))
  );
}

export function shouldDeferGpuFlowMaintenanceContentCatchup({
  lane,
  rawReasons,
}: {
  readonly lane: GpuFlowProjectionLane | "idle";
  readonly rawReasons: readonly GpuFrameReason[];
}): boolean {
  return (
    lane === "content" &&
    rawReasons.some(isGpuFlowMaintenanceFrameReason) &&
    !hasGpuFlowCriticalContentFrameRequest(rawReasons)
  );
}

export function resolveGpuFlowProjectionContentRetryBlock({
  contentRetryBlockedUntilMs,
  hasCommittedContentFrame,
  rawReasons,
  retainedScrollContentBlockedUntilMs,
  timestamp,
}: {
  readonly contentRetryBlockedUntilMs: number | null;
  readonly hasCommittedContentFrame: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly retainedScrollContentBlockedUntilMs: number | null;
  readonly timestamp: DOMHighResTimeStamp;
}): {
  readonly blockedUntilMs: number | null;
  readonly contentRetryDeferred: boolean;
  readonly retainedScrollBlockedUntilMs: number | null;
} {
  const retryDeferred = shouldDeferGpuFlowProjectionContentRetry({
    contentRetryBlockedUntilMs,
    hasCommittedContentFrame,
    rawReasons,
    timestamp,
  });
  const retainedScrollDeferred = shouldDeferGpuFlowRetainedScrollContentRetry({
    hasCommittedContentFrame,
    rawReasons,
    retainedScrollContentBlockedUntilMs,
    timestamp,
  });
  return Object.freeze({
    blockedUntilMs:
      contentRetryBlockedUntilMs !== null &&
      !retryDeferred &&
      timestamp >= contentRetryBlockedUntilMs
        ? null
        : contentRetryBlockedUntilMs,
    contentRetryDeferred: retryDeferred || retainedScrollDeferred,
    retainedScrollBlockedUntilMs:
      retainedScrollContentBlockedUntilMs !== null &&
      !retainedScrollDeferred &&
      timestamp >= retainedScrollContentBlockedUntilMs
        ? null
        : retainedScrollContentBlockedUntilMs,
  });
}

function shouldDeferGpuFlowRetainedScrollContentRetry({
  hasCommittedContentFrame,
  rawReasons,
  retainedScrollContentBlockedUntilMs,
  timestamp,
}: {
  readonly hasCommittedContentFrame: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly retainedScrollContentBlockedUntilMs: number | null;
  readonly timestamp: DOMHighResTimeStamp;
}): boolean {
  return (
    hasCommittedContentFrame &&
    retainedScrollContentBlockedUntilMs !== null &&
    timestamp < retainedScrollContentBlockedUntilMs &&
    !hasGpuFlowCriticalContentFrameRequest(rawReasons)
  );
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

export function resolveGpuFlowProjectionMotionRetryBlock({
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

export function shouldSelectGpuFlowSettledExplicitContentRepairLane({
  contentDebt,
  contentRetryDeferred,
  criticalContentDebt,
  rawReasons,
  viewportInteractionActive,
}: {
  readonly contentDebt: boolean;
  readonly contentRetryDeferred: boolean;
  readonly criticalContentDebt: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly viewportInteractionActive: boolean;
}): boolean {
  const hasCriticalContentReason =
    hasGpuFlowCriticalContentFrameRequest(rawReasons);
  const hasMotionReason = rawReasons.some(isGpuFlowMotionFrameReason);
  return (
    (!viewportInteractionActive || criticalContentDebt) &&
    (criticalContentDebt || rawReasons.some(isGpuFlowContentFrameReason)) &&
    (criticalContentDebt || hasCriticalContentReason || !hasMotionReason) &&
    shouldSelectGpuFlowContentPriorityPublicationLane({
      contentDebt,
      contentRetryDeferred,
    })
  );
}

export function shouldSelectGpuFlowMotionPriorityPublicationLane({
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

export function shouldSelectGpuFlowContentPriorityPublicationLane({
  contentDebt,
  contentRetryDeferred,
}: {
  readonly contentDebt: boolean;
  readonly contentRetryDeferred: boolean;
}): boolean {
  return contentDebt && !contentRetryDeferred;
}

export function shouldSelectGpuFlowMaintenancePriorityPublicationLane({
  contentRetryDeferred,
  maintenanceDebt,
}: {
  readonly contentRetryDeferred: boolean;
  readonly maintenanceDebt: boolean;
}): boolean {
  return maintenanceDebt && !contentRetryDeferred;
}

export function shouldThrottleGpuFlowContentRetryAfterUncommittedFrame(
  decision: GpuFlowVisiblePublicationDecisionLike,
  outcome: GpuFlowVisiblePublicationUncommittedCompletionOutcomeLike,
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

export function shouldThrottleGpuFlowMotionRetryAfterUncommittedFrame(
  decision: GpuFlowVisiblePublicationDecisionLike,
  outcome: GpuFlowVisiblePublicationUncommittedCompletionOutcomeLike,
): boolean {
  return (
    decision.lane === "motion" &&
    outcome.kind === "blocked" &&
    outcome.token.blockedReasons.some(isGpuFlowHeldPreviousBudgetBlockedReason)
  );
}

export function shouldYieldGpuFlowCriticalContentDebtForCoverage(
  decision: GpuFlowVisiblePublicationDecisionLike,
  outcome: GpuFlowVisiblePublicationUncommittedCompletionOutcomeLike,
): boolean {
  return (
    decision.lane === "content" &&
    outcome.kind === "blocked" &&
    outcome.token.blockedReasons.some(
      isGpuFlowRetainedProjectionCoverageBlockedReason,
    )
  );
}

function isGpuFlowHeldPreviousBudgetBlockedReason(reason: {
  readonly reason: string;
}): boolean {
  return reason.reason === "held-previous-budget-exceeded";
}

function isGpuFlowRetainedProjectionCoverageBlockedReason(
  reason: GpuFlowBlockedReasonLike,
): boolean {
  return (
    reason.family === "retained-projection" &&
    reason.reason === "retained-projection-coverage-missing"
  );
}
