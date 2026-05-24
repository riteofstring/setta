import type { GpuFrameReason } from "../gpuRenderer";
import {
  isGpuFlowContentFrameReason,
  isGpuFlowMotionFrameReason,
  isGpuFlowRetainedMotionFrameReason,
  shouldDeferGpuFlowMaintenanceContentCatchup,
  type GpuFlowVisibleFrameReducerState,
} from "../projectionSchedulerPolicy";
import {
  assertGpuFlowVisibleFramePresentationTokenForProjectionSample,
  type GpuFlowVisibleFramePresentationToken,
} from "./visibleFramePresentationTokens";
import type {
  GpuFlowVisibleFrameReducerCompletion,
  GpuFlowVisibleFrameReducerDebtProof,
  GpuFlowVisibleFrameReducerDecision,
} from "./visibleFrameReducerRuntime";

type GpuFlowVisibleFrameReducerDebt = GpuFlowVisibleFrameReducerDecision["debt"];

export function hasGpuFlowVisibleFrameReducerDebt(
  debtOrDecision:
    | GpuFlowVisibleFrameReducerDebt
    | GpuFlowVisibleFrameReducerDecision,
): boolean {
  const debt = getGpuFlowVisibleFrameReducerDebt(debtOrDecision);
  return debt.content || debt.maintenance || debt.motion;
}

export function getGpuFlowVisibleFrameReducerDebtReason(
  debtOrDecision:
    | GpuFlowVisibleFrameReducerDebt
    | GpuFlowVisibleFrameReducerDecision,
): GpuFrameReason {
  const debt = getGpuFlowVisibleFrameReducerDebt(debtOrDecision);
  if (debt.motion) {
    return "retained-scroll";
  }
  if (debt.content) {
    return "manual";
  }
  return "texture-upload";
}

export function createGpuFlowVisibleFrameReducerCompletion({
  contentDebt,
  maintenanceDebt,
  motionDebt,
  outcome,
}: {
  readonly contentDebt: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
  readonly outcome: GpuFlowVisibleFrameReducerCompletion["outcome"];
}): GpuFlowVisibleFrameReducerCompletion {
  return Object.freeze({
    debt: createGpuFlowVisibleFrameReducerDebt({
      content: contentDebt,
      maintenance: maintenanceDebt,
      motion: motionDebt,
    }),
    outcome,
  });
}

export function selectGpuFlowProjectionNonMotionReducerState({
  contentDebt,
  contentRetryDeferred,
  maintenanceDebt,
}: {
  readonly contentDebt: boolean;
  readonly contentRetryDeferred: boolean;
  readonly maintenanceDebt: boolean;
}): GpuFlowVisibleFrameReducerState {
  if (contentDebt) {
    if (!contentRetryDeferred) {
      return "content-catchup";
    }
    return maintenanceDebt ? "maintenance-drain" : "idle";
  }
  return maintenanceDebt ? "maintenance-drain" : "idle";
}

export function selectGpuFlowProjectionMotionSettlingState({
  contentDebt,
  contentRetryDeferred,
  motionSettling,
}: {
  readonly contentDebt: boolean;
  readonly contentRetryDeferred: boolean;
  readonly motionSettling: boolean;
}): GpuFlowVisibleFrameReducerState | null {
  return motionSettling && (!contentDebt || contentRetryDeferred)
    ? "motion-settling"
    : null;
}

export function shouldPresentGpuFlowProjectionContentDebtNow({
  contentDebt,
  contentRetryDeferred,
  deferContinuousMotionMaintenance,
  maxContentInterleaveMs,
  rawReasons,
  viewportInteractionActive,
}: {
  readonly contentDebt: boolean;
  readonly contentRetryDeferred: boolean;
  readonly deferContinuousMotionMaintenance: boolean;
  readonly maxContentInterleaveMs: number;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly viewportInteractionActive: boolean;
}): boolean {
  return (
    contentDebt &&
    !contentRetryDeferred &&
    !deferContinuousMotionMaintenance &&
    !viewportInteractionActive &&
    maxContentInterleaveMs > 0 &&
    rawReasons.some(isGpuFlowContentFrameReason)
  );
}

export function hasCurrentGpuFlowProjectionMotion({
  motionRetryDeferred,
  rawReasons,
  viewportInteractionActive,
}: {
  readonly motionRetryDeferred: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly viewportInteractionActive: boolean;
}): boolean {
  const hasProjectionOnlyViewportReason =
    rawReasons.some(isGpuFlowMotionFrameReason) &&
    rawReasons.includes("viewport") &&
    !rawReasons.some(isGpuFlowContentFrameReason);
  return (
    !motionRetryDeferred &&
    (viewportInteractionActive ||
      hasProjectionOnlyViewportReason ||
      rawReasons.some(isGpuFlowRetainedMotionFrameReason))
  );
}

export function assertGpuFlowVisibleFramePresentationTokenMatchesReducerDecision({
  decision,
  token,
}: {
  readonly decision: GpuFlowVisibleFrameReducerDecision;
  readonly token: GpuFlowVisibleFramePresentationToken;
}): void {
  assertGpuFlowVisibleFramePresentationTokenForProjectionSample({
    projectionSampleId: decision.sample.id,
    token,
  });
}

export function assertGpuFlowVisibleFramePresentationDebtProofMatchesReducerDecision({
  debtProof,
  decision,
}: {
  readonly debtProof: GpuFlowVisibleFrameReducerDebtProof;
  readonly decision: GpuFlowVisibleFrameReducerDecision;
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
      `GPU Flow visible reducer debt completion can only clear debt for the selected work lane (${decision.lane}); illegal debt proof: ${illegalDebtKinds.join(
        ", ",
      )}.`,
    );
  }
}

export { shouldDeferGpuFlowMaintenanceContentCatchup };

function createGpuFlowVisibleFrameReducerDebt({
  content,
  maintenance,
  motion,
}: GpuFlowVisibleFrameReducerDebt): GpuFlowVisibleFrameReducerDebt {
  return Object.freeze({
    content,
    maintenance,
    motion,
  });
}

function getGpuFlowVisibleFrameReducerDebt(
  debtOrDecision:
    | GpuFlowVisibleFrameReducerDebt
    | GpuFlowVisibleFrameReducerDecision,
): GpuFlowVisibleFrameReducerDebt {
  return "debt" in debtOrDecision ? debtOrDecision.debt : debtOrDecision;
}
