import type { GpuFrameReason } from "./gpuRenderer";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionLane,
  GpuFlowVisibleProjectionState,
} from "./projectionRuntime";
import { normalizeGpuViewport, type GpuViewportInput } from "./viewportMath";

export type GpuFlowVisibleFrameReducerState =
  | "content-catchup"
  | "idle"
  | "maintenance-deferred"
  | "maintenance-drain"
  | "motion-active"
  | "motion-settling";

export const GPU_FLOW_CONTENT_BLOCKED_RETRY_DELAY_MULTIPLIER = 2;
export const GPU_FLOW_BROWSER_VISUAL_CONTENT_RETRY_DELAY_MULTIPLIER = 0.25;
export const GPU_FLOW_CONTENT_REPAIR_MOTION_BLOCKED_RETRY_DELAY_MULTIPLIER = 4;
export const GPU_FLOW_MOTION_BLOCKED_RETRY_DELAY_MULTIPLIER = 2;
export const GPU_FLOW_RETAINED_SCROLL_CONTENT_SETTLE_DELAY_MULTIPLIER = 2;

type GpuFlowVisibleFrameReducerDecisionLike = {
  readonly lane: GpuFlowProjectionLane | "idle";
  readonly rawReasons: readonly GpuFrameReason[];
  readonly sample: GpuFlowLiveProjectionSample;
};

type GpuFlowBlockedReasonLike = {
  readonly family?: string | undefined;
  readonly reason: string;
};

type GpuFlowVisibleFrameReducerUnpresentedCompletionOutcomeLike =
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
  contentBlockedRetryDeferred,
  motionDebt,
  maintenanceDebt,
  motionSettling,
  postContentMaintenanceSettling,
  rawReasons,
}: {
  readonly contentDebt: boolean;
  readonly contentBlockedRetryDeferred: boolean;
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
  if (contentBlockedRetryDeferred) {
    return false;
  }
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
    reason === "retained-native-visual" ||
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
    reason === "retained-native-visual" ||
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

export function isGpuFlowRetainedScrollReducerDecision(
  decision: GpuFlowVisibleFrameReducerDecisionLike,
): boolean {
  return (
    decision.rawReasons.includes("retained-scroll") ||
    isGpuFlowRetainedScrollSampleInteractionActive(decision.sample)
  );
}

export function createGpuFlowProjectionSchedulingReasons({
  rawReasons,
}: {
  readonly projectionInteractionActive: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
}): readonly GpuFrameReason[] {
  return rawReasons;
}

export function withGpuFlowContentCatchupReasonForStalePublicationSample({
  preparedContentFrame,
  previousVisibleProjectionState = null,
  rawReasons,
  sample,
}: {
  readonly preparedContentFrame: {
    readonly coherence: { readonly retainedScrollRevision: number };
    readonly viewportSample: GpuViewportInput;
  } | null;
  readonly previousVisibleProjectionState?:
    | Pick<GpuFlowVisibleProjectionState, "sample">
    | null
    | undefined;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly sample: Pick<
    GpuFlowLiveProjectionSample,
    "retainedScrollRevision" | "viewport"
  >;
}): readonly GpuFrameReason[] {
  const projectionRawReasons = withoutGpuFlowUnchangedViewportProjectionReason({
    previousVisibleProjectionState,
    rawReasons,
    sample,
  });
  if (
    !preparedContentFrame ||
    isGpuFlowPreparedContentFrameSampleCurrent({
      preparedContentFrame,
      sample,
    }) ||
    projectionRawReasons.includes("manual")
  ) {
    return projectionRawReasons;
  }
  return Object.freeze([...projectionRawReasons, "manual" as const]);
}

function withoutGpuFlowUnchangedViewportProjectionReason({
  previousVisibleProjectionState,
  rawReasons,
  sample,
}: {
  readonly previousVisibleProjectionState: Pick<
    GpuFlowVisibleProjectionState,
    "sample"
  > | null;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly sample: Pick<GpuFlowLiveProjectionSample, "viewport">;
}): readonly GpuFrameReason[] {
  if (
    !previousVisibleProjectionState ||
    !rawReasons.includes("viewport") ||
    !areGpuFlowProjectionViewportsEqual(
      previousVisibleProjectionState.sample.viewport,
      sample.viewport,
    )
  ) {
    return rawReasons;
  }
  return Object.freeze(rawReasons.filter((reason) => reason !== "viewport"));
}

function isGpuFlowPreparedContentFrameSampleCurrent({
  preparedContentFrame,
  sample,
}: {
  readonly preparedContentFrame: {
    readonly coherence: { readonly retainedScrollRevision: number };
    readonly viewportSample: GpuViewportInput;
  };
  readonly sample: Pick<
    GpuFlowLiveProjectionSample,
    "retainedScrollRevision" | "viewport"
  >;
}): boolean {
  return (
    preparedContentFrame.coherence.retainedScrollRevision ===
      sample.retainedScrollRevision &&
    areGpuFlowProjectionViewportsEqual(
      preparedContentFrame.viewportSample,
      sample.viewport,
    )
  );
}

function areGpuFlowProjectionViewportsEqual(
  left: GpuViewportInput,
  right: GpuViewportInput,
): boolean {
  const normalizedLeft = normalizeGpuViewport(left);
  const normalizedRight = normalizeGpuViewport(right);
  return (
    normalizedLeft.x === normalizedRight.x &&
    normalizedLeft.y === normalizedRight.y &&
    normalizedLeft.zoom === normalizedRight.zoom
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
  motionDebt,
  motionRetryDeferred,
}: {
  readonly contentDebt: boolean;
  readonly motionDebt: boolean;
  readonly motionRetryDeferred: boolean;
}): boolean {
  return motionDebt && !contentDebt && !motionRetryDeferred;
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
  hasPresentedContentFrame,
  rawReasons,
  timestamp,
}: {
  readonly contentRetryBlockedUntilMs: number | null;
  readonly hasPresentedContentFrame: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly timestamp: DOMHighResTimeStamp;
}): boolean {
  return (
    contentRetryBlockedUntilMs !== null &&
    timestamp < contentRetryBlockedUntilMs &&
    (hasPresentedContentFrame ||
      rawReasons.some(isGpuFlowMaintenanceFrameReason)) &&
    !hasGpuFlowCriticalContentFrameRequest(rawReasons)
  );
}

function isGpuFlowCriticalContentFrameReason(reason: GpuFrameReason): boolean {
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
  hasPresentedContentFrame,
  rawReasons,
  retainedScrollContentBlockedUntilMs,
  timestamp,
}: {
  readonly contentRetryBlockedUntilMs: number | null;
  readonly hasPresentedContentFrame: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly retainedScrollContentBlockedUntilMs: number | null;
  readonly timestamp: DOMHighResTimeStamp;
}): {
  readonly blockedUntilMs: number | null;
  readonly contentBlockedRetryDeferred: boolean;
  readonly contentRetryDeferred: boolean;
  readonly retainedScrollBlockedUntilMs: number | null;
} {
  const retryDeferred = shouldDeferGpuFlowProjectionContentRetry({
    contentRetryBlockedUntilMs,
    hasPresentedContentFrame,
    rawReasons,
    timestamp,
  });
  const retainedScrollDeferred = shouldDeferGpuFlowRetainedScrollContentRetry({
    hasPresentedContentFrame,
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
    contentBlockedRetryDeferred: retryDeferred,
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
  hasPresentedContentFrame,
  rawReasons,
  retainedScrollContentBlockedUntilMs,
  timestamp,
}: {
  readonly hasPresentedContentFrame: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly retainedScrollContentBlockedUntilMs: number | null;
  readonly timestamp: DOMHighResTimeStamp;
}): boolean {
  return (
    hasPresentedContentFrame &&
    retainedScrollContentBlockedUntilMs !== null &&
    timestamp < retainedScrollContentBlockedUntilMs &&
    !hasGpuFlowCriticalContentFrameRequest(rawReasons)
  );
}

function shouldDeferGpuFlowProjectionMotionRetry({
  hasPresentedContentFrame,
  motionRetryBlockedUntilMs,
  timestamp,
}: {
  readonly hasPresentedContentFrame: boolean;
  readonly motionRetryBlockedUntilMs: number | null;
  readonly timestamp: DOMHighResTimeStamp;
}): boolean {
  return (
    hasPresentedContentFrame &&
    motionRetryBlockedUntilMs !== null &&
    timestamp < motionRetryBlockedUntilMs
  );
}

export function resolveGpuFlowProjectionMotionRetryBlock({
  hasPresentedContentFrame,
  motionRetryBlockedUntilMs,
  timestamp,
}: {
  readonly hasPresentedContentFrame: boolean;
  readonly motionRetryBlockedUntilMs: number | null;
  readonly timestamp: DOMHighResTimeStamp;
}): {
  readonly blockedUntilMs: number | null;
  readonly motionRetryDeferred: boolean;
} {
  const motionRetryDeferred = shouldDeferGpuFlowProjectionMotionRetry({
    hasPresentedContentFrame,
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
    shouldSelectGpuFlowContentPriorityWorkLane({
      contentDebt,
      contentRetryDeferred,
    })
  );
}

export function shouldSelectGpuFlowMotionPriorityWorkLane({
  hasPresentedContentFrame,
  motionDebt,
  motionRetryDeferred,
  reducerState,
}: {
  readonly hasPresentedContentFrame: boolean;
  readonly motionDebt: boolean;
  readonly motionRetryDeferred: boolean;
  readonly reducerState: GpuFlowVisibleFrameReducerState;
}): boolean {
  return (
    hasPresentedContentFrame &&
    !motionRetryDeferred &&
    (motionDebt || reducerState === "motion-active")
  );
}

export function shouldSelectGpuFlowContentPriorityWorkLane({
  contentDebt,
  contentRetryDeferred,
}: {
  readonly contentDebt: boolean;
  readonly contentRetryDeferred: boolean;
}): boolean {
  return contentDebt && !contentRetryDeferred;
}

export function shouldSelectGpuFlowMaintenancePriorityWorkLane({
  contentRetryDeferred,
  maintenanceDebt,
}: {
  readonly contentRetryDeferred: boolean;
  readonly maintenanceDebt: boolean;
}): boolean {
  return maintenanceDebt && !contentRetryDeferred;
}

export function shouldThrottleGpuFlowContentRetryAfterUnpresentedFrame(
  decision: GpuFlowVisibleFrameReducerDecisionLike,
  outcome: GpuFlowVisibleFrameReducerUnpresentedCompletionOutcomeLike,
): boolean {
  return (
    (decision.lane === "content" && outcome.kind === "hold-previous") ||
    (decision.lane === "content" &&
      isGpuFlowBrowserTextSnapshotPendingBlockedOutcome(outcome)) ||
    (outcome.kind === "blocked" &&
      decision.lane !== "idle" &&
      decision.lane !== "motion" &&
      outcome.token.blockedReasons.some(
        isGpuFlowHeldPreviousBudgetBlockedReason,
      ))
  );
}

export function isGpuFlowBrowserTextSnapshotPendingBlockedOutcome(
  outcome: GpuFlowVisibleFrameReducerUnpresentedCompletionOutcomeLike,
): boolean {
  return (
    outcome.kind === "blocked" &&
    outcome.token.blockedReasons.some(
      isGpuFlowBrowserTextSnapshotPendingBlockedReason,
    )
  );
}

export function shouldThrottleGpuFlowMotionRetryAfterUnpresentedFrame(
  decision: GpuFlowVisibleFrameReducerDecisionLike,
  outcome: GpuFlowVisibleFrameReducerUnpresentedCompletionOutcomeLike,
): boolean {
  return (
    getGpuFlowMotionRetryDelayMultiplierAfterUnpresentedFrame(
      decision,
      outcome,
    ) !== null
  );
}

export function getGpuFlowMotionRetryDelayMultiplierAfterUnpresentedFrame(
  decision: GpuFlowVisibleFrameReducerDecisionLike,
  outcome: GpuFlowVisibleFrameReducerUnpresentedCompletionOutcomeLike,
): number | null {
  if (outcome.kind !== "blocked") {
    return null;
  }
  if (
    decision.lane !== "idle" &&
    outcome.token.blockedReasons.some(
      isGpuFlowSectionSurfaceRepairBlockedReason,
    )
  ) {
    return GPU_FLOW_CONTENT_REPAIR_MOTION_BLOCKED_RETRY_DELAY_MULTIPLIER;
  }
  if (decision.lane === "motion") {
    return outcome.token.blockedReasons.some(isGpuFlowMotionRepairBlockedReason)
      ? GPU_FLOW_MOTION_BLOCKED_RETRY_DELAY_MULTIPLIER
      : null;
  }
  return null;
}

export function shouldYieldGpuFlowCriticalContentDebtForCoverage(
  decision: GpuFlowVisibleFrameReducerDecisionLike,
  outcome: GpuFlowVisibleFrameReducerUnpresentedCompletionOutcomeLike,
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

function isGpuFlowMotionRepairBlockedReason(
  reason: GpuFlowBlockedReasonLike,
): boolean {
  return (
    isGpuFlowHeldPreviousBudgetBlockedReason(reason) ||
    isGpuFlowRetainedProjectionCoverageBlockedReason(reason) ||
    isGpuFlowSectionSurfaceRepairBlockedReason(reason)
  );
}

function isGpuFlowSectionSurfaceRepairBlockedReason(
  reason: GpuFlowBlockedReasonLike,
): boolean {
  return (
    reason.reason === "section-surface-not-drawn" ||
    reason.reason === "section-surface-texture-missing"
  );
}

export function isGpuFlowBrowserTextSnapshotPendingBlockedReason(
  reason: GpuFlowBlockedReasonLike,
): boolean {
  return (
    (reason.family === "browser-text-snapshot" ||
      reason.family === "browser-visual") &&
    reason.reason === "snapshot-pending"
  );
}

function isGpuFlowRetainedProjectionCoverageBlockedReason(
  reason: GpuFlowBlockedReasonLike,
): boolean {
  return (
    reason.family === "retained-projection" &&
    reason.reason === "retained-projection-coverage-missing"
  );
}
