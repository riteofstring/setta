import { getGpuFlowVisibleFrameHeldPreviousBudgetStatus } from "./GpuFlow/visibleFrameEngine";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionSchedulerKnobs,
  GpuFlowProjectionTransaction,
  GpuFlowProjectionTransactionId,
  GpuFlowProjectionTransactionKind,
  GpuFlowVisibleProjectionState,
} from "./projectionRuntime";

export type GpuFlowHeldPreviousProjection = {
  readonly activationMappingId: string;
  readonly canvasDrawStateId: string;
  readonly committedFrameId: number;
  readonly consecutiveFrameCount: number;
  readonly debugStateId: string;
  readonly domTransformBatchId: string;
  readonly firstHeldAtMs: DOMHighResTimeStamp;
  readonly heldDurationMs: number;
  readonly heldAtMs: DOMHighResTimeStamp;
  readonly hitProjectionId: string;
  readonly maxHeldPreviousFramesExceeded: boolean;
  readonly maxHeldPreviousMsExceeded: boolean;
  readonly previousTransactionId: GpuFlowProjectionTransactionId;
  readonly projectionSampleId: number;
  readonly reason: string;
  readonly requestedProjectionSampleId: number;
};

export type GpuFlowHeldPreviousProjectionDebugState = {
  readonly heldPreviousDurationMs: number;
  readonly heldPreviousFrameCount: number;
  readonly heldPreviousOverBudget: boolean;
  readonly heldPreviousReason: string | null;
  readonly heldPreviousRequestedSampleId: number | null;
};

const EMPTY_GPU_FLOW_HELD_PREVIOUS_DEBUG_STATE: GpuFlowHeldPreviousProjectionDebugState =
  Object.freeze({
    heldPreviousDurationMs: 0,
    heldPreviousFrameCount: 0,
    heldPreviousOverBudget: false,
    heldPreviousReason: null,
    heldPreviousRequestedSampleId: null,
  });

export function createGpuFlowHeldPreviousProjection({
  heldTransaction,
  knobs,
  previousVisibleProjectionState,
  reason,
  requestedSample,
}: {
  readonly heldTransaction: GpuFlowProjectionTransaction;
  readonly knobs: GpuFlowProjectionSchedulerKnobs;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState;
  readonly reason: string;
  readonly requestedSample: GpuFlowLiveProjectionSample;
}): GpuFlowHeldPreviousProjection {
  const previousHeld = previousVisibleProjectionState.heldPreviousProjection;
  const firstHeldAtMs =
    previousHeld?.firstHeldAtMs ?? requestedSample.timestamp;
  const consecutiveFrameCount = (previousHeld?.consecutiveFrameCount ?? 0) + 1;
  const heldDurationMs = Math.max(0, requestedSample.timestamp - firstHeldAtMs);
  const committedFrameId =
    previousVisibleProjectionState.committedFrame.displayFrameId;
  const previousDebugState = previousVisibleProjectionState.debugState;
  const hitGenerationId =
    previousVisibleProjectionState.committedFrame.coherence?.hitGenerationId ??
    `hit:${committedFrameId}`;
  const budgetStatus = getGpuFlowVisibleFrameHeldPreviousBudgetStatus({
    consecutiveFrameCount,
    heldDurationMs,
    policy: knobs,
  });
  return Object.freeze({
    activationMappingId: `activation:${committedFrameId}:${hitGenerationId}`,
    canvasDrawStateId: `canvas:${committedFrameId}`,
    committedFrameId,
    consecutiveFrameCount,
    debugStateId: previousDebugState.projectionTransactionId,
    domTransformBatchId: `dom-transform:${committedFrameId}:sample-${heldTransaction.sample.id}`,
    firstHeldAtMs,
    heldAtMs: requestedSample.timestamp,
    heldDurationMs,
    hitProjectionId: hitGenerationId,
    maxHeldPreviousFramesExceeded:
      budgetStatus.maxHeldPreviousFramesExceeded,
    maxHeldPreviousMsExceeded: budgetStatus.maxHeldPreviousMsExceeded,
    previousTransactionId: previousVisibleProjectionState.transaction.id,
    projectionSampleId: heldTransaction.sample.id,
    reason,
    requestedProjectionSampleId: requestedSample.id,
  });
}

export function createGpuFlowHeldPreviousDebugState({
  heldPreviousProjection,
  transactionKind,
}: {
  readonly heldPreviousProjection:
    | GpuFlowHeldPreviousProjection
    | null
    | undefined;
  readonly transactionKind: GpuFlowProjectionTransactionKind;
}): GpuFlowHeldPreviousProjectionDebugState {
  if (transactionKind !== "held-previous" || !heldPreviousProjection) {
    return EMPTY_GPU_FLOW_HELD_PREVIOUS_DEBUG_STATE;
  }
  return {
    heldPreviousDurationMs: heldPreviousProjection.heldDurationMs,
    heldPreviousFrameCount: heldPreviousProjection.consecutiveFrameCount,
    heldPreviousOverBudget: isGpuFlowHeldPreviousProjectionOverBudget(
      heldPreviousProjection,
    ),
    heldPreviousReason: heldPreviousProjection.reason,
    heldPreviousRequestedSampleId:
      heldPreviousProjection.requestedProjectionSampleId,
  };
}

function isGpuFlowHeldPreviousProjectionOverBudget(
  heldPrevious: GpuFlowHeldPreviousProjection,
): boolean {
  return Boolean(
    heldPrevious.maxHeldPreviousFramesExceeded ||
      heldPrevious.maxHeldPreviousMsExceeded,
  );
}
