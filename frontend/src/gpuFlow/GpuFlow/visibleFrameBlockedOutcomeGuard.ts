import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  assertGpuFlowBlockedPresentationTokenForProjectionSample,
  assertGpuFlowHoldPreviousTokenForProjectionSample,
  assertGpuFlowVisibleFramePresentationTokenForProjectionSample,
} from "./visibleFramePresentationProofs";
import {
  DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
  type GpuFlowVisibleFrameReducerCompletionOutcome,
  type GpuFlowVisibleFrameReducerDecision,
} from "./visibleFrameReducerRuntime";

type GpuFlowBlockedPresentationDebt = {
  readonly firstBlockedAtMs: number;
  readonly frameCount: number;
  readonly key: string;
};

const blockedPresentationDebtBySurface = new WeakMap<
  GpuSurfaceHandle,
  GpuFlowBlockedPresentationDebt
>();

export function recordGpuFlowBlockedPresentationGuard({
  outcome,
  reducerDecision,
  surface,
}: {
  readonly outcome: GpuFlowVisibleFrameReducerCompletionOutcome;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly surface: GpuSurfaceHandle | null;
}): void {
  assertGpuFlowBlockedPresentationGuardOutcomeToken({
    outcome,
    reducerDecision,
  });
  if (!surface) {
    return;
  }
  if (outcome.kind !== "blocked") {
    blockedPresentationDebtBySurface.delete(surface);
    return;
  }
  const key = createGpuFlowBlockedPresentationDebtKey(outcome);
  const previousDebt = blockedPresentationDebtBySurface.get(surface);
  const debt =
    previousDebt?.key === key
      ? {
          firstBlockedAtMs: previousDebt.firstBlockedAtMs,
          frameCount: previousDebt.frameCount + 1,
          key,
        }
      : {
          firstBlockedAtMs: reducerDecision.sample.timestamp,
          frameCount: 1,
          key,
        };
  blockedPresentationDebtBySurface.set(surface, debt);
  if (
    isGpuFlowBlockedPresentationFailFastRuntime() &&
    isGpuFlowBlockedPresentationBudgetExceeded({
      ageMs: Math.max(
        0,
        reducerDecision.sample.timestamp - debt.firstBlockedAtMs,
      ),
      frameCount: debt.frameCount,
    })
  ) {
    throw new Error(
      `GPU Flow blocked visible frame presentation exceeded budget: ${JSON.stringify(
        {
          blockedReasons: outcome.token.blockedReasons,
          frameCount: debt.frameCount,
          frozenFrameId: outcome.token.frozenFrameId,
          projectionSampleId: outcome.token.projectionSampleId,
          transactionId: outcome.token.transactionId,
        },
      )}`,
    );
  }
}

function assertGpuFlowBlockedPresentationGuardOutcomeToken({
  outcome,
  reducerDecision,
}: {
  readonly outcome: GpuFlowVisibleFrameReducerCompletionOutcome;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): void {
  const projectionSampleId = reducerDecision.sample.id;
  switch (outcome.kind) {
    case "present":
      assertGpuFlowVisibleFramePresentationTokenForProjectionSample({
        projectionSampleId,
        token: outcome.token,
      });
      return;
    case "hold-previous":
      assertGpuFlowHoldPreviousTokenForProjectionSample({
        projectionSampleId,
        token: outcome.token,
      });
      return;
    case "blocked":
      assertGpuFlowBlockedPresentationTokenForProjectionSample({
        projectionSampleId,
        token: outcome.token,
      });
      return;
  }
}

function createGpuFlowBlockedPresentationDebtKey(
  outcome: Extract<
    GpuFlowVisibleFrameReducerCompletionOutcome,
    { readonly kind: "blocked" }
  >,
): string {
  return JSON.stringify([
    outcome.token.frozenFrameId,
    outcome.token.blockedReasons,
  ]);
}

function isGpuFlowBlockedPresentationBudgetExceeded({
  ageMs,
  frameCount,
}: {
  readonly ageMs: number;
  readonly frameCount: number;
}): boolean {
  return (
    frameCount >
      DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY.maxHeldPreviousFrames ||
    ageMs > DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY.maxHeldPreviousMs
  );
}

function isGpuFlowBlockedPresentationFailFastRuntime(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV === "test";
}
