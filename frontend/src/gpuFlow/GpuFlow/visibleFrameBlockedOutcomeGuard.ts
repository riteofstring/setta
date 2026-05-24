import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  assertGpuFlowBlockedPublicationTokenForProjectionSample,
  assertGpuFlowCommitPublicationTokenForProjectionSample,
  assertGpuFlowHoldPreviousTokenForProjectionSample,
} from "./visibleFramePresentationProofs";
import {
  DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
  type GpuFlowVisiblePublicationCompletionOutcome,
  type GpuFlowVisiblePublicationDecision,
} from "./visibleFrameScheduling";

type GpuFlowBlockedPublicationDebt = {
  readonly firstBlockedAtMs: number;
  readonly frameCount: number;
  readonly key: string;
};

const blockedPublicationDebtBySurface = new WeakMap<
  GpuSurfaceHandle,
  GpuFlowBlockedPublicationDebt
>();

export function recordGpuFlowBlockedPublicationGuard({
  outcome,
  publicationDecision,
  surface,
}: {
  readonly outcome: GpuFlowVisiblePublicationCompletionOutcome;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly surface: GpuSurfaceHandle | null;
}): void {
  assertGpuFlowBlockedPublicationGuardOutcomeToken({
    outcome,
    publicationDecision,
  });
  if (!surface) {
    return;
  }
  if (outcome.kind !== "blocked") {
    blockedPublicationDebtBySurface.delete(surface);
    return;
  }
  const key = createGpuFlowBlockedPublicationDebtKey(outcome);
  const previousDebt = blockedPublicationDebtBySurface.get(surface);
  const debt =
    previousDebt?.key === key
      ? {
          firstBlockedAtMs: previousDebt.firstBlockedAtMs,
          frameCount: previousDebt.frameCount + 1,
          key,
        }
      : {
          firstBlockedAtMs: publicationDecision.sample.timestamp,
          frameCount: 1,
          key,
        };
  blockedPublicationDebtBySurface.set(surface, debt);
  if (
    isGpuFlowBlockedPublicationFailFastRuntime() &&
    isGpuFlowBlockedPublicationBudgetExceeded({
      ageMs: Math.max(
        0,
        publicationDecision.sample.timestamp - debt.firstBlockedAtMs,
      ),
      frameCount: debt.frameCount,
    })
  ) {
    throw new Error(
      `GPU Flow blocked visible publication exceeded budget: ${JSON.stringify({
        blockedReasons: outcome.token.blockedReasons,
        frameCount: debt.frameCount,
        frozenFrameId: outcome.token.frozenFrameId,
        projectionSampleId: outcome.token.projectionSampleId,
        transactionId: outcome.token.transactionId,
      })}`,
    );
  }
}

function assertGpuFlowBlockedPublicationGuardOutcomeToken({
  outcome,
  publicationDecision,
}: {
  readonly outcome: GpuFlowVisiblePublicationCompletionOutcome;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): void {
  const projectionSampleId = publicationDecision.sample.id;
  switch (outcome.kind) {
    case "commit":
      assertGpuFlowCommitPublicationTokenForProjectionSample({
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
      assertGpuFlowBlockedPublicationTokenForProjectionSample({
        projectionSampleId,
        token: outcome.token,
      });
      return;
  }
}

function createGpuFlowBlockedPublicationDebtKey(
  outcome: Extract<
    GpuFlowVisiblePublicationCompletionOutcome,
    { readonly kind: "blocked" }
  >,
): string {
  return JSON.stringify([
    outcome.token.frozenFrameId,
    outcome.token.blockedReasons,
  ]);
}

function isGpuFlowBlockedPublicationBudgetExceeded({
  ageMs,
  frameCount,
}: {
  readonly ageMs: number;
  readonly frameCount: number;
}): boolean {
  return (
    frameCount >
      DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.maxHeldPreviousFrames ||
    ageMs > DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.maxHeldPreviousMs
  );
}

function isGpuFlowBlockedPublicationFailFastRuntime(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV === "test";
}
