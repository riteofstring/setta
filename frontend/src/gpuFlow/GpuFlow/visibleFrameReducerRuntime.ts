import type { GpuFrameReason } from "../gpuRenderer";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionLane,
} from "../projectionRuntime";
import {
  createGpuFlowProjectionSchedulingReasons,
  getGpuFlowMotionRetryDelayMultiplierAfterUnpresentedFrame,
  GPU_FLOW_BROWSER_VISUAL_CONTENT_RETRY_DELAY_MULTIPLIER,
  GPU_FLOW_CONTENT_BLOCKED_RETRY_DELAY_MULTIPLIER,
  GPU_FLOW_CONTENT_REPAIR_MOTION_BLOCKED_RETRY_DELAY_MULTIPLIER,
  GPU_FLOW_RETAINED_SCROLL_CONTENT_SETTLE_DELAY_MULTIPLIER,
  hasGpuFlowCriticalContentFrameRequest,
  isGpuFlowBrowserTextSnapshotPendingBlockedOutcome,
  isGpuFlowContentFrameReason,
  isGpuFlowMaintenanceFrameReason,
  isGpuFlowMotionFrameReason,
  isGpuFlowRetainedMotionFrameReason,
  isGpuFlowRetainedScrollReducerDecision,
  isGpuFlowRetainedScrollSampleInteractionActive,
  resolveGpuFlowProjectionContentRetryBlock,
  resolveGpuFlowProjectionMotionRetryBlock,
  shouldDeferGpuFlowProjectionMaintenanceOnlyFrame,
  shouldDeferGpuFlowProjectionNonCriticalContentCatchupFrame,
  shouldPrioritizeGpuFlowProjectionMotionDebt,
  shouldThrottleGpuFlowContentRetryAfterUnpresentedFrame,
  shouldYieldGpuFlowCriticalContentDebtForCoverage,
  type GpuFlowVisibleFrameReducerState,
} from "../projectionSchedulerPolicy";
import { shouldDrainGpuFlowBrowserVisualMaintenanceNow } from "./visibleFrameMaintenanceScheduling";
import type {
  GpuFlowBlockedPresentationToken,
  GpuFlowHoldPreviousToken,
  GpuFlowVisibleFramePresentationToken,
} from "./visibleFramePresentationTokens";
import {
  assertGpuFlowBlockedPresentationTokenForProjectionSample,
  assertGpuFlowHoldPreviousTokenForProjectionSample,
} from "./visibleFramePresentationTokens";
import {
  assertGpuFlowVisibleFramePresentationDebtProofMatchesReducerDecision,
  assertGpuFlowVisibleFramePresentationTokenMatchesReducerDecision,
  createGpuFlowVisibleFrameReducerCompletion,
  hasCurrentGpuFlowProjectionMotion,
  selectGpuFlowProjectionMotionSettlingState,
  selectGpuFlowProjectionNonMotionReducerState,
  shouldPresentGpuFlowProjectionContentDebtNow,
} from "./visibleFrameReducerDebt";
import {
  createGpuFlowVisibleFrameStarvationPolicy,
  DEFAULT_GPU_FLOW_VISIBLE_FRAME_STARVATION_POLICY,
  reduceGpuFlowVisibleFrameReducerDecision,
  type GpuFlowVisibleFrameLaneReductionFacts,
  type GpuFlowVisibleFrameStarvationPolicy,
} from "./visibleFrameStateMachine";

export type GpuFlowVisibleFrameReducerPolicy =
  GpuFlowVisibleFrameStarvationPolicy;
export const DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY: GpuFlowVisibleFrameReducerPolicy =
  DEFAULT_GPU_FLOW_VISIBLE_FRAME_STARVATION_POLICY;

export type GpuFlowVisibleFrameReducerDecision = {
  readonly debt: GpuFlowVisibleFrameReducerDebt;
  readonly lane: GpuFlowProjectionLane | "idle";
  readonly rawReasons: readonly GpuFrameReason[];
  readonly sample: GpuFlowLiveProjectionSample;
  readonly reducerState: GpuFlowVisibleFrameReducerState;
};

export type GpuFlowVisibleFrameRequestFacts =
  GpuFlowVisibleFrameLaneReductionFacts & {
    readonly rawReasons: readonly GpuFrameReason[];
    readonly sample: GpuFlowLiveProjectionSample;
    readonly timestamp: DOMHighResTimeStamp;
  };

type GpuFlowVisibleFrameReducerDebt = {
  readonly content: boolean;
  readonly maintenance: boolean;
  readonly motion: boolean;
};

export type GpuFlowVisibleFrameReducerDebtProof =
  GpuFlowVisibleFrameReducerDebt;

export type GpuFlowVisibleFrameReducerCompletion = {
  readonly debt: GpuFlowVisibleFrameReducerDebt;
  readonly outcome: GpuFlowVisibleFrameReducerCompletionOutcome["kind"];
};

export type GpuFlowVisibleFrameReducerPresentCompletionOutcome = {
  readonly debtProof: GpuFlowVisibleFrameReducerDebtProof;
  readonly kind: "present";
  readonly token: GpuFlowVisibleFramePresentationToken;
};

export type GpuFlowVisibleFrameReducerUnpresentedCompletionOutcome =
  | {
      readonly kind: "hold-previous";
      readonly token: GpuFlowHoldPreviousToken;
    }
  | {
      readonly kind: "blocked";
      readonly token: GpuFlowBlockedPresentationToken;
    };

export type GpuFlowVisibleFrameReducerCompletionOutcome =
  | GpuFlowVisibleFrameReducerPresentCompletionOutcome
  | GpuFlowVisibleFrameReducerUnpresentedCompletionOutcome;

export type GpuFlowVisibleFrameReducerRuntime = {
  completeFrame(
    decision: GpuFlowVisibleFrameReducerDecision,
    outcome: GpuFlowVisibleFrameReducerPresentCompletionOutcome,
  ): GpuFlowVisibleFrameReducerCompletion;
  getKnobs(): GpuFlowVisibleFrameReducerPolicy;
  recordUnpresentedFrame(
    decision: GpuFlowVisibleFrameReducerDecision,
    outcome: GpuFlowVisibleFrameReducerUnpresentedCompletionOutcome,
  ): GpuFlowVisibleFrameReducerCompletion;
  selectFrameRequest(input: {
    readonly hasPresentedContentFrame: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly sample: GpuFlowLiveProjectionSample;
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): GpuFlowVisibleFrameRequestFacts;
  selectFrame(input: {
    readonly hasPresentedContentFrame: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly sample: GpuFlowLiveProjectionSample;
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): GpuFlowVisibleFrameReducerDecision;
};

export function createGpuFlowVisibleFrameReducerRuntime({
  knobs = DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
}: {
  readonly knobs?: GpuFlowVisibleFrameReducerPolicy | undefined;
} = {}): GpuFlowVisibleFrameReducerRuntime {
  const reducerPolicy = createGpuFlowVisibleFrameStarvationPolicy(knobs);
  let contentDebt = false;
  let maintenanceDebt = false;
  let motionDebt = false;
  let lastContentAtMs: number | null = null;
  let lastMotionAtMs: number | null = null;
  let contentRetryBlockedUntilMs: number | null = null;
  let contentRetryBlockedByBrowserVisualResource = false;
  let browserVisualContentRepairMotionCooldownUntilMs: number | null = null;
  let textureUploadMaintenanceDebt = false;
  let criticalContentDebt = false;
  let criticalContentOriginDebt = false;
  let motionRetryBlockedUntilMs: number | null = null;
  let lastRetainedScrollAtMs: number | null = null;
  let retainedScrollContentBlockedUntilMs: number | null = null;
  let consecutiveMotionFrames = 0;

  function currentState({
    browserVisualContentRepairBlocked,
    browserVisualContentRepairMotionDeferred,
    browserVisualContentRepairReady,
    contentBlockedRetryDeferred,
    contentRetryDeferred,
    motionRetryDeferred,
    rawReasons,
    timestamp,
    viewportInteractionActive,
  }: {
    readonly browserVisualContentRepairBlocked: boolean;
    readonly browserVisualContentRepairMotionDeferred: boolean;
    readonly browserVisualContentRepairReady: boolean;
    readonly contentBlockedRetryDeferred: boolean;
    readonly contentRetryDeferred: boolean;
    readonly motionRetryDeferred: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): GpuFlowVisibleFrameReducerState {
    const motionSettling = isGpuFlowProjectionMotionSettling(timestamp);
    const priorityState = selectGpuFlowProjectionPriorityReducerState({
      browserVisualContentRepairBlocked,
      browserVisualContentRepairMotionDeferred,
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
    return selectGpuFlowProjectionDebtReducerState({
      contentDebt,
      contentRetryDeferred,
      motionSettling,
      motionRetryDeferred,
    });
  }

  function selectGpuFlowProjectionPriorityReducerState({
    browserVisualContentRepairBlocked,
    browserVisualContentRepairMotionDeferred,
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
    readonly browserVisualContentRepairBlocked: boolean;
    readonly browserVisualContentRepairMotionDeferred: boolean;
    readonly browserVisualContentRepairReady: boolean;
    readonly contentBlockedRetryDeferred: boolean;
    readonly contentRetryDeferred: boolean;
    readonly criticalContentDebt: boolean;
    readonly motionSettling: boolean;
    readonly motionRetryDeferred: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): GpuFlowVisibleFrameReducerState | null {
    const browserVisualPriorityState =
      selectGpuFlowBrowserVisualPriorityReducerState({
        browserVisualContentRepairBlocked,
        browserVisualContentRepairMotionDeferred,
        browserVisualContentRepairReady,
        contentRetryDeferred,
        rawReasons,
        timestamp,
        viewportInteractionActive,
      });
    if (browserVisualPriorityState !== null) {
      return browserVisualPriorityState;
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
    const motionSettlingState = selectGpuFlowProjectionMotionSettlingState({
      contentDebt,
      contentRetryDeferred,
      motionSettling,
    });
    if (motionSettlingState !== null) {
      return motionSettlingState;
    }
    if (
      shouldDeferGpuFlowTextureUploadMaintenanceContentAfterMotion({
        rawReasons,
        timestamp,
      })
    ) {
      return "maintenance-deferred";
    }
    if (
      shouldPresentGpuFlowProjectionContentDebtNow({
        contentDebt,
        contentRetryDeferred,
        deferContinuousMotionMaintenance:
          shouldDeferGpuFlowContentForContinuousMotionMaintenance({
            maintenanceDebt,
            motionDebt,
            rawReasons,
          }),
        maxContentInterleaveMs: reducerPolicy.maxContentInterleaveMs,
        rawReasons,
        viewportInteractionActive,
      })
    ) {
      return "content-catchup";
    }
    return null;
  }

  function selectGpuFlowBrowserVisualPriorityReducerState({
    browserVisualContentRepairBlocked,
    browserVisualContentRepairMotionDeferred,
    browserVisualContentRepairReady,
    contentRetryDeferred,
    rawReasons,
    timestamp,
    viewportInteractionActive,
  }: {
    readonly browserVisualContentRepairBlocked: boolean;
    readonly browserVisualContentRepairMotionDeferred: boolean;
    readonly browserVisualContentRepairReady: boolean;
    readonly contentRetryDeferred: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): GpuFlowVisibleFrameReducerState | null {
    if (
      shouldDrainGpuFlowBrowserVisualMaintenanceNow({
        browserVisualContentRepairBlocked,
        contentDebt,
        maintenanceDebt,
        rawReasons,
        viewportInteractionActive,
      })
    ) {
      return "maintenance-drain";
    }
    if (
      shouldDeferGpuFlowBrowserVisualContentRepairForMotion({
        browserVisualContentRepairMotionDeferred,
        rawReasons,
        viewportInteractionActive,
      })
    ) {
      return "maintenance-deferred";
    }
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
      shouldPresentGpuFlowBrowserVisualContentRepairNow({
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

  function selectGpuFlowProjectionDebtReducerState({
    contentDebt,
    contentRetryDeferred,
    motionSettling,
    motionRetryDeferred,
  }: {
    readonly contentDebt: boolean;
    readonly contentRetryDeferred: boolean;
    readonly motionSettling: boolean;
    readonly motionRetryDeferred: boolean;
  }): GpuFlowVisibleFrameReducerState {
    if (motionDebt && !contentDebt && !motionRetryDeferred) {
      return "motion-active";
    }
    if (motionSettling) {
      return "motion-settling";
    }
    return selectGpuFlowProjectionNonMotionReducerState({
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
      reducerPolicy.maxContentInterleaveMs > 0 &&
      consecutiveMotionFrames >=
        reducerPolicy.maxConsecutiveMotionFramesBeforeContentProbe
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
        reducerPolicy.maxConsecutiveMotionFramesBeforeContentProbe &&
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
        reducerPolicy.motionSettleWindowMs *
          GPU_FLOW_RETAINED_SCROLL_CONTENT_SETTLE_DELAY_MULTIPLIER
    );
  }

  function shouldDeferGpuFlowBrowserVisualContentRepairForMotion({
    browserVisualContentRepairMotionDeferred,
    rawReasons,
    viewportInteractionActive,
  }: {
    readonly browserVisualContentRepairMotionDeferred: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly viewportInteractionActive: boolean;
  }): boolean {
    return (
      browserVisualContentRepairMotionDeferred &&
      contentDebt &&
      !viewportInteractionActive &&
      rawReasons.some(isGpuFlowContentFrameReason) &&
      !hasGpuFlowCriticalContentFrameRequest(rawReasons) &&
      !rawReasons.some(isGpuFlowRetainedMotionFrameReason)
    );
  }

  function shouldPresentGpuFlowBrowserVisualContentRepairNow({
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

  function isGpuFlowProjectionMotionSettling(
    timestamp: DOMHighResTimeStamp,
  ): boolean {
    return (
      lastMotionAtMs !== null &&
      timestamp - lastMotionAtMs <= reducerPolicy.motionSettleWindowMs
    );
  }

  function isGpuFlowProjectionPostContentMaintenanceSettling(
    timestamp: DOMHighResTimeStamp,
  ): boolean {
    return (
      lastContentAtMs !== null &&
      timestamp - lastContentAtMs < reducerPolicy.motionSettleWindowMs * 2
    );
  }

  function assertGpuFlowVisibleFramePresentationUnpresentedTokenMatchesDecision(
    decision: GpuFlowVisibleFrameReducerDecision,
    outcome: GpuFlowVisibleFrameReducerUnpresentedCompletionOutcome,
  ): void {
    if (outcome.kind === "hold-previous") {
      assertGpuFlowHoldPreviousTokenForProjectionSample({
        projectionSampleId: decision.sample.id,
        token: outcome.token,
      });
      return;
    }
    assertGpuFlowBlockedPresentationTokenForProjectionSample({
      projectionSampleId: decision.sample.id,
      token: outcome.token,
    });
  }

  function recordGpuFlowContentRetryAfterUnpresentedFrame(
    decision: GpuFlowVisibleFrameReducerDecision,
    outcome: GpuFlowVisibleFrameReducerUnpresentedCompletionOutcome,
  ): void {
    const browserTextSnapshotPendingBlocked =
      decision.lane === "content" &&
      isGpuFlowBrowserTextSnapshotPendingBlockedOutcome(outcome);
    if (
      shouldThrottleGpuFlowContentRetryAfterUnpresentedFrame(decision, outcome)
    ) {
      const contentRetryDelayMultiplier = browserTextSnapshotPendingBlocked
        ? GPU_FLOW_BROWSER_VISUAL_CONTENT_RETRY_DELAY_MULTIPLIER
        : GPU_FLOW_CONTENT_BLOCKED_RETRY_DELAY_MULTIPLIER;
      const contentRetryBlockedUntil =
        decision.sample.timestamp +
        reducerPolicy.motionSettleWindowMs * contentRetryDelayMultiplier;
      contentRetryBlockedUntilMs = Math.max(
        contentRetryBlockedUntilMs ?? 0,
        contentRetryBlockedUntil,
      );
      contentRetryBlockedByBrowserVisualResource =
        browserTextSnapshotPendingBlocked;
      if (
        browserTextSnapshotPendingBlocked &&
        shouldCooldownGpuFlowBrowserVisualContentRepairAfterMotion(
          decision.sample.timestamp,
        )
      ) {
        browserVisualContentRepairMotionCooldownUntilMs = Math.max(
          browserVisualContentRepairMotionCooldownUntilMs ?? 0,
          decision.sample.timestamp +
            reducerPolicy.motionSettleWindowMs *
              GPU_FLOW_CONTENT_REPAIR_MOTION_BLOCKED_RETRY_DELAY_MULTIPLIER,
        );
      }
      return;
    }
    if (decision.lane === "content") {
      contentRetryBlockedByBrowserVisualResource = false;
    }
  }

  function shouldCooldownGpuFlowBrowserVisualContentRepairAfterMotion(
    timestamp: DOMHighResTimeStamp,
  ): boolean {
    return (
      lastMotionAtMs !== null &&
      timestamp - lastMotionAtMs <=
        reducerPolicy.motionSettleWindowMs *
          GPU_FLOW_CONTENT_REPAIR_MOTION_BLOCKED_RETRY_DELAY_MULTIPLIER
    );
  }

  function recordGpuFlowMotionRetryAfterUnpresentedFrame(
    decision: GpuFlowVisibleFrameReducerDecision,
    outcome: GpuFlowVisibleFrameReducerUnpresentedCompletionOutcome,
  ): void {
    const motionRetryDelayMultiplier =
      getGpuFlowMotionRetryDelayMultiplierAfterUnpresentedFrame(
        decision,
        outcome,
      );
    if (motionRetryDelayMultiplier === null) {
      return;
    }
    motionRetryBlockedUntilMs = Math.max(
      motionRetryBlockedUntilMs ?? 0,
      decision.sample.timestamp +
        reducerPolicy.motionSettleWindowMs * motionRetryDelayMultiplier,
    );
  }

  function recordGpuFlowVisibleFramePresentationRawReasonDebt(
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
    if (rawReasons.includes("texture-upload")) {
      textureUploadMaintenanceDebt = true;
    }
  }

  function recordGpuFlowRetainedScrollContentRetryBlockForSelection({
    hasPresentedContentFrame,
    rawReasons,
    sample,
    timestamp,
  }: {
    readonly hasPresentedContentFrame: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly sample: GpuFlowLiveProjectionSample;
    readonly timestamp: DOMHighResTimeStamp;
  }): void {
    if (
      !hasPresentedContentFrame ||
      lastMotionAtMs === null ||
      criticalContentOriginDebt
    ) {
      return;
    }
    if (
      !isGpuFlowRetainedScrollReducerDecision({
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
        reducerPolicy.motionSettleWindowMs *
          GPU_FLOW_RETAINED_SCROLL_CONTENT_SETTLE_DELAY_MULTIPLIER,
    );
  }

  function resolveGpuFlowProjectionContentRetryBlockForSelection({
    hasPresentedContentFrame,
    rawReasons,
    timestamp,
  }: {
    readonly hasPresentedContentFrame: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly timestamp: DOMHighResTimeStamp;
  }): ReturnType<typeof resolveGpuFlowProjectionContentRetryBlock> {
    const contentRetryBlock = resolveGpuFlowProjectionContentRetryBlock({
      contentRetryBlockedUntilMs,
      hasPresentedContentFrame,
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
    hasPresentedContentFrame,
    timestamp,
  }: {
    readonly hasPresentedContentFrame: boolean;
    readonly timestamp: DOMHighResTimeStamp;
  }): ReturnType<typeof resolveGpuFlowProjectionMotionRetryBlock> {
    const motionRetryBlock = resolveGpuFlowProjectionMotionRetryBlock({
      hasPresentedContentFrame,
      motionRetryBlockedUntilMs,
      timestamp,
    });
    motionRetryBlockedUntilMs = motionRetryBlock.blockedUntilMs;
    return motionRetryBlock;
  }

  function resolveGpuFlowBrowserVisualContentRepairMotionCooldownForSelection({
    timestamp,
  }: {
    readonly timestamp: DOMHighResTimeStamp;
  }): boolean {
    if (
      browserVisualContentRepairMotionCooldownUntilMs === null ||
      !contentDebt
    ) {
      browserVisualContentRepairMotionCooldownUntilMs = null;
      return false;
    }
    if (timestamp >= browserVisualContentRepairMotionCooldownUntilMs) {
      browserVisualContentRepairMotionCooldownUntilMs = null;
      return false;
    }
    return true;
  }

  function shouldDeferGpuFlowTextureUploadMaintenanceContentAfterMotion({
    rawReasons,
    timestamp,
  }: {
    readonly rawReasons: readonly GpuFrameReason[];
    readonly timestamp: DOMHighResTimeStamp;
  }): boolean {
    return (
      contentDebt &&
      textureUploadMaintenanceDebt &&
      lastMotionAtMs !== null &&
      timestamp - lastMotionAtMs <=
        reducerPolicy.motionSettleWindowMs *
          GPU_FLOW_CONTENT_REPAIR_MOTION_BLOCKED_RETRY_DELAY_MULTIPLIER &&
      !hasGpuFlowCriticalContentFrameRequest(rawReasons)
    );
  }

  function selectGpuFlowVisibleFrameRequestFacts({
    hasPresentedContentFrame,
    rawReasons,
    sample,
    timestamp,
    viewportInteractionActive,
  }: {
    readonly hasPresentedContentFrame: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly sample: GpuFlowLiveProjectionSample;
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): GpuFlowVisibleFrameRequestFacts {
    const projectionInteractionActive =
      viewportInteractionActive ||
      isGpuFlowRetainedScrollSampleInteractionActive(sample);
    const schedulingRawReasons = createGpuFlowProjectionSchedulingReasons({
      projectionInteractionActive,
      rawReasons,
    });
    recordGpuFlowVisibleFramePresentationRawReasonDebt(schedulingRawReasons);
    recordGpuFlowRetainedScrollContentRetryBlockForSelection({
      hasPresentedContentFrame,
      rawReasons: schedulingRawReasons,
      sample,
      timestamp,
    });
    const contentRetryBlock =
      resolveGpuFlowProjectionContentRetryBlockForSelection({
        hasPresentedContentFrame,
        rawReasons: schedulingRawReasons,
        timestamp,
      });
    const motionRetryBlock =
      resolveGpuFlowProjectionMotionRetryBlockForSelection({
        hasPresentedContentFrame,
        timestamp,
      });
    const browserVisualContentRepairMotionDeferred =
      resolveGpuFlowBrowserVisualContentRepairMotionCooldownForSelection({
        timestamp,
      });
    const textureUploadMaintenanceContentDeferred =
      shouldDeferGpuFlowTextureUploadMaintenanceContentAfterMotion({
        rawReasons: schedulingRawReasons,
        timestamp,
      });
    const contentRetryDeferred =
      contentRetryBlock.contentRetryDeferred ||
      browserVisualContentRepairMotionDeferred ||
      textureUploadMaintenanceContentDeferred;
    const { motionRetryDeferred } = motionRetryBlock;
    const reducerState = currentState({
      browserVisualContentRepairBlocked:
        contentRetryBlockedByBrowserVisualResource,
      browserVisualContentRepairMotionDeferred,
      browserVisualContentRepairReady:
        contentRetryBlockedByBrowserVisualResource && !contentRetryDeferred,
      contentBlockedRetryDeferred:
        contentRetryBlock.contentBlockedRetryDeferred,
      contentRetryDeferred,
      motionRetryDeferred,
      rawReasons: schedulingRawReasons,
      timestamp,
      viewportInteractionActive: projectionInteractionActive,
    });
    return Object.freeze({
      contentDebt,
      contentRetryDeferred,
      criticalContentDebt,
      hasPresentedContentFrame,
      maintenanceDebt,
      motionDebt,
      motionRetryDeferred,
      rawReasons: Object.freeze([...schedulingRawReasons]),
      sample,
      reducerState,
      timestamp,
      viewportInteractionActive: projectionInteractionActive,
    });
  }

  return Object.freeze({
    completeFrame(decision, outcome) {
      assertGpuFlowVisibleFramePresentationTokenMatchesReducerDecision({
        decision,
        token: outcome.token,
      });
      assertGpuFlowVisibleFramePresentationDebtProofMatchesReducerDecision({
        debtProof: outcome.debtProof,
        decision,
      });
      if (outcome.debtProof.motion) {
        motionDebt = false;
        motionRetryBlockedUntilMs = null;
        lastMotionAtMs = decision.sample.timestamp;
        consecutiveMotionFrames += 1;
        if (
          isGpuFlowRetainedScrollReducerDecision(decision) &&
          !criticalContentOriginDebt
        ) {
          lastRetainedScrollAtMs = decision.sample.timestamp;
          retainedScrollContentBlockedUntilMs = Math.max(
            retainedScrollContentBlockedUntilMs ?? 0,
            decision.sample.timestamp +
              reducerPolicy.motionSettleWindowMs *
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
        browserVisualContentRepairMotionCooldownUntilMs = null;
        retainedScrollContentBlockedUntilMs = null;
        lastContentAtMs = decision.sample.timestamp;
        consecutiveMotionFrames = 0;
      } else if (decision.lane === "content") {
        criticalContentDebt = false;
      }
      if (outcome.debtProof.maintenance) {
        maintenanceDebt = false;
        textureUploadMaintenanceDebt = false;
        if (contentRetryBlockedByBrowserVisualResource) {
          contentRetryBlockedUntilMs = null;
          contentRetryBlockedByBrowserVisualResource = false;
        }
        consecutiveMotionFrames = 0;
      }
      return createGpuFlowVisibleFrameReducerCompletion({
        contentDebt,
        maintenanceDebt,
        motionDebt,
        outcome: outcome.kind,
      });
    },
    getKnobs() {
      return reducerPolicy;
    },
    recordUnpresentedFrame(decision, outcome) {
      assertGpuFlowVisibleFramePresentationUnpresentedTokenMatchesDecision(
        decision,
        outcome,
      );
      recordGpuFlowContentRetryAfterUnpresentedFrame(decision, outcome);
      recordGpuFlowMotionRetryAfterUnpresentedFrame(decision, outcome);
      if (shouldYieldGpuFlowCriticalContentDebtForCoverage(decision, outcome)) {
        criticalContentDebt = false;
      }
      return createGpuFlowVisibleFrameReducerCompletion({
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
      hasPresentedContentFrame,
      rawReasons,
      sample,
      timestamp,
      viewportInteractionActive,
    }) {
      return reduceGpuFlowVisibleFrameReducerDecision({
        frameRequest: selectGpuFlowVisibleFrameRequestFacts({
          hasPresentedContentFrame,
          rawReasons,
          sample,
          timestamp,
          viewportInteractionActive,
        }),
        reducerPolicy,
      });
    },
  });
}

export {
  getGpuFlowVisibleFrameReducerDebtReason,
  hasGpuFlowVisibleFrameReducerDebt,
  shouldDeferGpuFlowMaintenanceContentCatchup,
} from "./visibleFrameReducerDebt";
export { reduceGpuFlowVisibleFrameReducerDecision } from "./visibleFrameStateMachine";
