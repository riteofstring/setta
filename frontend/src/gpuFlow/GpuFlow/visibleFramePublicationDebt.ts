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
  GpuFlowVisiblePublicationCompletion,
  GpuFlowVisiblePublicationDebtProof,
  GpuFlowVisibleFrameReducerDecision,
} from "./visibleFrameReducerRuntime";

type GpuFlowVisiblePublicationDebt = GpuFlowVisibleFrameReducerDecision["debt"];

export function hasGpuFlowVisiblePublicationDebt(
  debtOrDecision:
    | GpuFlowVisiblePublicationDebt
    | GpuFlowVisibleFrameReducerDecision,
): boolean {
  const debt = getGpuFlowVisiblePublicationDebt(debtOrDecision);
  return debt.content || debt.maintenance || debt.motion;
}

export function getGpuFlowVisiblePublicationDebtReason(
  debtOrDecision:
    | GpuFlowVisiblePublicationDebt
    | GpuFlowVisibleFrameReducerDecision,
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

export function createGpuFlowVisiblePublicationCompletion({
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

export function shouldPublishGpuFlowProjectionContentDebtNow({
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

export function assertGpuFlowVisiblePublicationPresentationTokenMatchesDecision({
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

export function assertGpuFlowVisiblePublicationPresentationDebtProofMatchesDecision({
  debtProof,
  decision,
}: {
  readonly debtProof: GpuFlowVisiblePublicationDebtProof;
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
      `GPU Flow visible publication debt completion can only clear debt for the selected work lane (${decision.lane}); illegal debt proof: ${illegalDebtKinds.join(
        ", ",
      )}.`,
    );
  }
}

export { shouldDeferGpuFlowMaintenanceContentCatchup };

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

function getGpuFlowVisiblePublicationDebt(
  debtOrDecision:
    | GpuFlowVisiblePublicationDebt
    | GpuFlowVisibleFrameReducerDecision,
): GpuFlowVisiblePublicationDebt {
  return "debt" in debtOrDecision ? debtOrDecision.debt : debtOrDecision;
}
