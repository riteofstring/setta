import type { GpuFrameReason } from "../gpuRenderer";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionLane,
} from "../projectionRuntime";
import {
  getGpuFlowMotionRetryDelayMultiplierAfterUncommittedFrame,
  GPU_FLOW_BROWSER_VISUAL_CONTENT_RETRY_DELAY_MULTIPLIER,
  GPU_FLOW_CONTENT_BLOCKED_RETRY_DELAY_MULTIPLIER,
  GPU_FLOW_RETAINED_SCROLL_CONTENT_SETTLE_DELAY_MULTIPLIER,
  hasGpuFlowCriticalContentFrameRequest,
  isGpuFlowBrowserTextSnapshotPendingBlockedOutcome,
  isGpuFlowContentFrameReason,
  isGpuFlowMaintenanceFrameReason,
  isGpuFlowMotionFrameReason,
  isGpuFlowRetainedMotionFrameReason,
  isGpuFlowRetainedScrollPublicationDecision,
  isGpuFlowRetainedScrollSampleInteractionActive,
  resolveGpuFlowProjectionContentRetryBlock,
  resolveGpuFlowProjectionMotionRetryBlock,
  shouldDeferGpuFlowMaintenanceContentCatchup,
  shouldDeferGpuFlowProjectionMaintenanceOnlyFrame,
  shouldDeferGpuFlowProjectionNonCriticalContentCatchupFrame,
  shouldPrioritizeGpuFlowProjectionMotionDebt,
  shouldThrottleGpuFlowContentRetryAfterUncommittedFrame,
  shouldYieldGpuFlowCriticalContentDebtForCoverage,
  type GpuFlowProjectionSchedulerState,
} from "../projectionSchedulerPolicy";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowCommitPublicationToken,
  GpuFlowHoldPreviousToken,
} from "./visibleFramePresentationTokens";
import {
  assertGpuFlowBlockedPublicationTokenForProjectionSample,
  assertGpuFlowCommitPublicationTokenForProjectionSample,
  assertGpuFlowHoldPreviousTokenForProjectionSample,
} from "./visibleFramePresentationTokens";
import { createGpuFlowVisiblePublicationDecisionForLane } from "./visibleFramePublicationDecision";
import {
  createGpuFlowVisibleFrameStarvationPolicy,
  DEFAULT_GPU_FLOW_VISIBLE_FRAME_STARVATION_POLICY,
  reduceGpuFlowVisibleFramePublicationLane,
  type GpuFlowVisibleFrameLaneReductionFacts,
  type GpuFlowVisibleFrameStarvationPolicy,
} from "./visibleFrameStateMachine";

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

export type GpuFlowVisibleFrameRequestFacts =
  GpuFlowVisibleFrameLaneReductionFacts & {
    readonly rawReasons: readonly GpuFrameReason[];
    readonly sample: GpuFlowLiveProjectionSample;
    readonly timestamp: DOMHighResTimeStamp;
  };

type GpuFlowVisiblePublicationDebt = {
  readonly content: boolean;
  readonly maintenance: boolean;
  readonly motion: boolean;
};

export type GpuFlowVisiblePublicationDebtProof = GpuFlowVisiblePublicationDebt;

export type GpuFlowVisiblePublicationCompletion = {
  readonly debt: GpuFlowVisiblePublicationDebt;
  readonly outcome: GpuFlowVisiblePublicationCompletionOutcome["kind"];
};

export type GpuFlowVisiblePublicationCommitCompletionOutcome = {
  readonly debtProof: GpuFlowVisiblePublicationDebtProof;
  readonly kind: "commit";
  readonly token: GpuFlowCommitPublicationToken;
};

export type GpuFlowVisiblePublicationUncommittedCompletionOutcome =
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

export type GpuFlowVisibleFrameRequestCoordinator = {
  completeFrame(
    decision: GpuFlowVisiblePublicationDecision,
    outcome: GpuFlowVisiblePublicationCommitCompletionOutcome,
  ): GpuFlowVisiblePublicationCompletion;
  getKnobs(): GpuFlowProjectionSchedulerKnobs;
  recordUncommittedFrame(
    decision: GpuFlowVisiblePublicationDecision,
    outcome: GpuFlowVisiblePublicationUncommittedCompletionOutcome,
  ): GpuFlowVisiblePublicationCompletion;
  selectFrameRequest(input: {
    readonly hasCommittedContentFrame: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly sample: GpuFlowLiveProjectionSample;
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): GpuFlowVisibleFrameRequestFacts;
  selectFrame(input: {
    readonly hasCommittedContentFrame: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly sample: GpuFlowLiveProjectionSample;
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): GpuFlowVisiblePublicationDecision;
};

export function createGpuFlowVisibleFrameRequestCoordinator({
  knobs = DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
}: {
  readonly knobs?: GpuFlowProjectionSchedulerKnobs | undefined;
} = {}): GpuFlowVisibleFrameRequestCoordinator {
  const schedulerKnobs = createGpuFlowVisibleFrameStarvationPolicy(knobs);
  let contentDebt = false;
  let maintenanceDebt = false;
  let motionDebt = false;
  let lastContentAtMs: number | null = null;
  let lastMotionAtMs: number | null = null;
  let contentRetryBlockedUntilMs: number | null = null;
  let contentRetryBlockedByBrowserVisualResource = false;
  let criticalContentDebt = false;
  let criticalContentOriginDebt = false;
  let motionRetryBlockedUntilMs: number | null = null;
  let lastRetainedScrollAtMs: number | null = null;
  let retainedScrollContentBlockedUntilMs: number | null = null;
  let consecutiveMotionFrames = 0;

  function currentState({
    browserVisualContentRepairReady,
    contentBlockedRetryDeferred,
    contentRetryDeferred,
    motionRetryDeferred,
    rawReasons,
    timestamp,
    viewportInteractionActive,
  }: {
    readonly browserVisualContentRepairReady: boolean;
    readonly contentBlockedRetryDeferred: boolean;
    readonly contentRetryDeferred: boolean;
    readonly motionRetryDeferred: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): GpuFlowProjectionSchedulerState {
    const motionSettling = isGpuFlowProjectionMotionSettling(timestamp);
    const priorityState = selectGpuFlowProjectionPrioritySchedulerState({
      browserVisualContentRepairReady,
      contentBlockedRetryDeferred,
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
    browserVisualContentRepairReady,
    contentBlockedRetryDeferred,
    contentRetryDeferred,
    criticalContentDebt,
    motionSettling,
    motionRetryDeferred,
    rawReasons,
    timestamp,
    viewportInteractionActive,
  }: {
    readonly browserVisualContentRepairReady: boolean;
    readonly contentBlockedRetryDeferred: boolean;
    readonly contentRetryDeferred: boolean;
    readonly criticalContentDebt: boolean;
    readonly motionSettling: boolean;
    readonly motionRetryDeferred: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): GpuFlowProjectionSchedulerState | null {
    if (
      shouldSelectGpuFlowProjectionPriorityContentCatchup({
        browserVisualContentRepairReady,
        contentRetryDeferred,
        rawReasons,
        timestamp,
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
      shouldDeferGpuFlowProjectionMaintenanceDebt({
        contentBlockedRetryDeferred,
        motionSettling,
        rawReasons,
        timestamp,
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
        maintenanceDebt,
        motionDebt,
        rawReasons,
        viewportInteractionActive,
      })
    ) {
      return "content-catchup";
    }
    return null;
  }

  function shouldSelectGpuFlowProjectionPriorityContentCatchup({
    browserVisualContentRepairReady,
    contentRetryDeferred,
    rawReasons,
    timestamp,
    viewportInteractionActive,
  }: {
    readonly browserVisualContentRepairReady: boolean;
    readonly contentRetryDeferred: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): boolean {
    return (
      shouldProbeGpuFlowProjectionContentDebt({
        contentRetryDeferred,
        maintenanceDebt,
        rawReasons,
        timestamp,
        viewportInteractionActive,
      }) ||
      shouldPublishGpuFlowBrowserVisualContentRepairNow({
        browserVisualContentRepairReady,
        contentDebt,
        rawReasons,
        viewportInteractionActive,
      })
    );
  }

  function shouldDeferGpuFlowProjectionMaintenanceDebt({
    contentBlockedRetryDeferred,
    motionSettling,
    rawReasons,
    timestamp,
  }: {
    readonly contentBlockedRetryDeferred: boolean;
    readonly motionSettling: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly timestamp: DOMHighResTimeStamp;
  }): boolean {
    return shouldDeferGpuFlowProjectionMaintenanceOnlyFrame({
      contentDebt,
      contentBlockedRetryDeferred,
      maintenanceDebt,
      motionDebt,
      motionSettling,
      postContentMaintenanceSettling:
        isGpuFlowProjectionPostContentMaintenanceSettling(timestamp),
      rawReasons,
    });
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
    maintenanceDebt,
    rawReasons,
    timestamp,
    viewportInteractionActive,
  }: {
    readonly contentRetryDeferred: boolean;
    readonly maintenanceDebt: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): boolean {
    return (
      contentDebt &&
      !contentRetryDeferred &&
      !shouldDeferGpuFlowContentForContinuousMotionMaintenance({
        maintenanceDebt,
        motionDebt,
        rawReasons,
      }) &&
      !shouldDeferGpuFlowContentProbeForRetainedScrollMaintenance({
        maintenanceDebt,
        timestamp,
      }) &&
      !viewportInteractionActive &&
      rawReasons.some(isGpuFlowContentFrameReason) &&
      !rawReasons.some(isGpuFlowRetainedMotionFrameReason) &&
      schedulerKnobs.maxContentInterleaveMs > 0 &&
      consecutiveMotionFrames >=
        schedulerKnobs.maxConsecutiveMotionFramesBeforeContentProbe
    );
  }

  function shouldDeferGpuFlowContentForContinuousMotionMaintenance({
    maintenanceDebt,
    motionDebt,
    rawReasons,
  }: {
    readonly maintenanceDebt: boolean;
    readonly motionDebt: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
  }): boolean {
    return (
      maintenanceDebt &&
      motionDebt &&
      consecutiveMotionFrames >=
        schedulerKnobs.maxConsecutiveMotionFramesBeforeContentProbe &&
      !hasGpuFlowCriticalContentFrameRequest(rawReasons)
    );
  }

  function shouldDeferGpuFlowContentProbeForRetainedScrollMaintenance({
    maintenanceDebt,
    timestamp,
  }: {
    readonly maintenanceDebt: boolean;
    readonly timestamp: DOMHighResTimeStamp;
  }): boolean {
    return (
      maintenanceDebt &&
      lastRetainedScrollAtMs !== null &&
      timestamp - lastRetainedScrollAtMs <=
        schedulerKnobs.motionSettleWindowMs *
          GPU_FLOW_RETAINED_SCROLL_CONTENT_SETTLE_DELAY_MULTIPLIER
    );
  }

  function shouldPublishGpuFlowBrowserVisualContentRepairNow({
    browserVisualContentRepairReady,
    contentDebt,
    rawReasons,
    viewportInteractionActive,
  }: {
    readonly browserVisualContentRepairReady: boolean;
    readonly contentDebt: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly viewportInteractionActive: boolean;
  }): boolean {
    return (
      browserVisualContentRepairReady &&
      contentDebt &&
      !viewportInteractionActive &&
      rawReasons.some(isGpuFlowContentFrameReason) &&
      !rawReasons.some(isGpuFlowRetainedMotionFrameReason)
    );
  }

  function shouldPublishGpuFlowProjectionContentDebtNow({
    contentRetryDeferred,
    maintenanceDebt,
    motionDebt,
    rawReasons,
    viewportInteractionActive,
  }: {
    readonly contentRetryDeferred: boolean;
    readonly maintenanceDebt: boolean;
    readonly motionDebt: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly viewportInteractionActive: boolean;
  }): boolean {
    return (
      contentDebt &&
      !contentRetryDeferred &&
      !shouldDeferGpuFlowContentForContinuousMotionMaintenance({
        maintenanceDebt,
        motionDebt,
        rawReasons,
      }) &&
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

  function assertGpuFlowVisiblePublicationUncommittedTokenMatchesDecision(
    decision: GpuFlowVisiblePublicationDecision,
    outcome: GpuFlowVisiblePublicationUncommittedCompletionOutcome,
  ): void {
    if (outcome.kind === "hold-previous") {
      assertGpuFlowHoldPreviousTokenForProjectionSample({
        projectionSampleId: decision.sample.id,
        token: outcome.token,
      });
      return;
    }
    assertGpuFlowBlockedPublicationTokenForProjectionSample({
      projectionSampleId: decision.sample.id,
      token: outcome.token,
    });
  }

  function recordGpuFlowContentRetryAfterUncommittedFrame(
    decision: GpuFlowVisiblePublicationDecision,
    outcome: GpuFlowVisiblePublicationUncommittedCompletionOutcome,
  ): void {
    const browserTextSnapshotPendingBlocked =
      decision.lane === "content" &&
      isGpuFlowBrowserTextSnapshotPendingBlockedOutcome(outcome);
    if (
      shouldThrottleGpuFlowContentRetryAfterUncommittedFrame(decision, outcome)
    ) {
      const contentRetryDelayMultiplier = browserTextSnapshotPendingBlocked
        ? GPU_FLOW_BROWSER_VISUAL_CONTENT_RETRY_DELAY_MULTIPLIER
        : GPU_FLOW_CONTENT_BLOCKED_RETRY_DELAY_MULTIPLIER;
      const contentRetryBlockedUntil =
        decision.sample.timestamp +
        schedulerKnobs.motionSettleWindowMs * contentRetryDelayMultiplier;
      contentRetryBlockedUntilMs = Math.max(
        contentRetryBlockedUntilMs ?? 0,
        contentRetryBlockedUntil,
      );
      contentRetryBlockedByBrowserVisualResource =
        browserTextSnapshotPendingBlocked;
      return;
    }
    if (decision.lane === "content") {
      contentRetryBlockedByBrowserVisualResource = false;
    }
  }

  function recordGpuFlowMotionRetryAfterUncommittedFrame(
    decision: GpuFlowVisiblePublicationDecision,
    outcome: GpuFlowVisiblePublicationUncommittedCompletionOutcome,
  ): void {
    const motionRetryDelayMultiplier =
      getGpuFlowMotionRetryDelayMultiplierAfterUncommittedFrame(
        decision,
        outcome,
      );
    if (motionRetryDelayMultiplier === null) {
      return;
    }
    motionRetryBlockedUntilMs = Math.max(
      motionRetryBlockedUntilMs ?? 0,
      decision.sample.timestamp +
        schedulerKnobs.motionSettleWindowMs * motionRetryDelayMultiplier,
    );
  }

  function recordGpuFlowVisiblePublicationRawReasonDebt(
    rawReasons: readonly GpuFrameReason[],
  ): void {
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
  }

  function recordGpuFlowRetainedScrollContentRetryBlockForSelection({
    hasCommittedContentFrame,
    rawReasons,
    sample,
    timestamp,
  }: {
    readonly hasCommittedContentFrame: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly sample: GpuFlowLiveProjectionSample;
    readonly timestamp: DOMHighResTimeStamp;
  }): void {
    if (
      !hasCommittedContentFrame ||
      lastMotionAtMs === null ||
      criticalContentOriginDebt
    ) {
      return;
    }
    if (
      !isGpuFlowRetainedScrollPublicationDecision({
        lane: "idle",
        rawReasons,
        sample,
      })
    ) {
      return;
    }
    lastRetainedScrollAtMs = timestamp;
    retainedScrollContentBlockedUntilMs = Math.max(
      retainedScrollContentBlockedUntilMs ?? 0,
      timestamp +
        schedulerKnobs.motionSettleWindowMs *
          GPU_FLOW_RETAINED_SCROLL_CONTENT_SETTLE_DELAY_MULTIPLIER,
    );
  }

  function resolveGpuFlowProjectionContentRetryBlockForSelection({
    hasCommittedContentFrame,
    rawReasons,
    timestamp,
  }: {
    readonly hasCommittedContentFrame: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly timestamp: DOMHighResTimeStamp;
  }): ReturnType<typeof resolveGpuFlowProjectionContentRetryBlock> {
    const contentRetryBlock = resolveGpuFlowProjectionContentRetryBlock({
      contentRetryBlockedUntilMs,
      hasCommittedContentFrame,
      rawReasons,
      retainedScrollContentBlockedUntilMs,
      timestamp,
    });
    contentRetryBlockedUntilMs = contentRetryBlock.blockedUntilMs;
    if (!contentDebt) {
      contentRetryBlockedByBrowserVisualResource = false;
    }
    retainedScrollContentBlockedUntilMs =
      contentRetryBlock.retainedScrollBlockedUntilMs;
    return contentRetryBlock;
  }

  function resolveGpuFlowProjectionMotionRetryBlockForSelection({
    hasCommittedContentFrame,
    timestamp,
  }: {
    readonly hasCommittedContentFrame: boolean;
    readonly timestamp: DOMHighResTimeStamp;
  }): ReturnType<typeof resolveGpuFlowProjectionMotionRetryBlock> {
    const motionRetryBlock = resolveGpuFlowProjectionMotionRetryBlock({
      hasCommittedContentFrame,
      motionRetryBlockedUntilMs,
      timestamp,
    });
    motionRetryBlockedUntilMs = motionRetryBlock.blockedUntilMs;
    return motionRetryBlock;
  }

  function selectGpuFlowVisibleFrameRequestFacts({
    hasCommittedContentFrame,
    rawReasons,
    sample,
    timestamp,
    viewportInteractionActive,
  }: {
    readonly hasCommittedContentFrame: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly sample: GpuFlowLiveProjectionSample;
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): GpuFlowVisibleFrameRequestFacts {
    const projectionInteractionActive =
      viewportInteractionActive ||
      isGpuFlowRetainedScrollSampleInteractionActive(sample);
    recordGpuFlowVisiblePublicationRawReasonDebt(rawReasons);
    recordGpuFlowRetainedScrollContentRetryBlockForSelection({
      hasCommittedContentFrame,
      rawReasons,
      sample,
      timestamp,
    });
    const contentRetryBlock =
      resolveGpuFlowProjectionContentRetryBlockForSelection({
        hasCommittedContentFrame,
        rawReasons,
        timestamp,
      });
    const motionRetryBlock =
      resolveGpuFlowProjectionMotionRetryBlockForSelection({
        hasCommittedContentFrame,
        timestamp,
      });
    const { contentRetryDeferred } = contentRetryBlock;
    const { motionRetryDeferred } = motionRetryBlock;
    const schedulerState = currentState({
      browserVisualContentRepairReady:
        contentRetryBlockedByBrowserVisualResource && !contentRetryDeferred,
      contentBlockedRetryDeferred:
        contentRetryBlock.contentBlockedRetryDeferred,
      contentRetryDeferred,
      motionRetryDeferred,
      rawReasons,
      timestamp,
      viewportInteractionActive: projectionInteractionActive,
    });
    return Object.freeze({
      contentDebt,
      contentRetryDeferred,
      criticalContentDebt,
      hasCommittedContentFrame,
      maintenanceDebt,
      motionDebt,
      motionRetryDeferred,
      rawReasons: Object.freeze([...rawReasons]),
      sample,
      schedulerState,
      timestamp,
      viewportInteractionActive: projectionInteractionActive,
    });
  }

  return Object.freeze({
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
          lastRetainedScrollAtMs = decision.sample.timestamp;
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
        contentRetryBlockedByBrowserVisualResource = false;
        retainedScrollContentBlockedUntilMs = null;
        lastContentAtMs = decision.sample.timestamp;
        consecutiveMotionFrames = 0;
      } else if (decision.lane === "content") {
        criticalContentDebt = false;
      }
      if (outcome.debtProof.maintenance) {
        maintenanceDebt = false;
        if (contentRetryBlockedByBrowserVisualResource) {
          contentRetryBlockedUntilMs = null;
          contentRetryBlockedByBrowserVisualResource = false;
        }
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
      assertGpuFlowVisiblePublicationUncommittedTokenMatchesDecision(
        decision,
        outcome,
      );
      recordGpuFlowContentRetryAfterUncommittedFrame(decision, outcome);
      recordGpuFlowMotionRetryAfterUncommittedFrame(decision, outcome);
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
    selectFrameRequest(input) {
      return selectGpuFlowVisibleFrameRequestFacts(input);
    },
    selectFrame({
      hasCommittedContentFrame,
      rawReasons,
      sample,
      timestamp,
      viewportInteractionActive,
    }) {
      return reduceGpuFlowVisibleFramePublicationDecision({
        frameRequest: selectGpuFlowVisibleFrameRequestFacts({
          hasCommittedContentFrame,
          rawReasons,
          sample,
          timestamp,
          viewportInteractionActive,
        }),
        schedulerKnobs,
      });
    },
  });
}

export function reduceGpuFlowVisibleFramePublicationDecision({
  frameRequest,
  schedulerKnobs,
}: {
  readonly frameRequest: GpuFlowVisibleFrameRequestFacts;
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
}): GpuFlowVisiblePublicationDecision {
  const lane = reduceGpuFlowVisibleFramePublicationLane({
    contentDebt: frameRequest.contentDebt,
    contentRetryDeferred: frameRequest.contentRetryDeferred,
    criticalContentDebt: frameRequest.criticalContentDebt,
    hasCommittedContentFrame: frameRequest.hasCommittedContentFrame,
    maintenanceDebt: frameRequest.maintenanceDebt,
    motionDebt: frameRequest.motionDebt,
    motionRetryDeferred: frameRequest.motionRetryDeferred,
    rawReasons: frameRequest.rawReasons,
    schedulerKnobs,
    schedulerState: frameRequest.schedulerState,
    viewportInteractionActive: frameRequest.viewportInteractionActive,
  });
  return createGpuFlowVisiblePublicationDecisionForLane({
    frameRequest,
    lane,
  });
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

export { shouldDeferGpuFlowMaintenanceContentCatchup };

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
