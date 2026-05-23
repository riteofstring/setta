import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import {
  resolveGpuFlowRetainedDisplayPublicationOutcomeFrame,
  type GpuFlowRetainedDisplayPublicationOutcomeFrame,
  type GpuFlowRetainedDisplayPublicationResult,
} from "./flowRetainedDisplayTransaction";
import type { GpuFlowVisibleFrameBlockedPublicationCandidate } from "./visibleFramePublicationContentPlan";
import { createGpuFlowRetainedProjectionBlockedPublicationCandidate } from "./visibleFramePublicationProjectionTransactionAuthority";

export type GpuFlowRetainedDisplayPublicationOutcomeFrameResolver = (
  input: Parameters<
    typeof resolveGpuFlowRetainedDisplayPublicationOutcomeFrame
  >[0],
) => GpuFlowRetainedDisplayPublicationOutcomeFrame;

export type GpuFlowRetainedDisplayOutcomeFrameResult =
  | {
      readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate;
      readonly publishedOutcomeFrame: null;
    }
  | {
      readonly blockedPublicationCandidate: null;
      readonly publishedOutcomeFrame: Extract<
        GpuFlowRetainedDisplayPublicationOutcomeFrame,
        { readonly kind: "published" }
      >;
    };

export type GpuFlowRetainedDisplayOutcomeFrameResultResolver = (input: {
  readonly outcomeFrame: GpuFlowRetainedDisplayPublicationOutcomeFrame;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}) => GpuFlowRetainedDisplayOutcomeFrameResult;

export type GpuFlowRetainedDisplayPublicationFramePlan =
  | {
      readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate;
      readonly kind: "blocked";
    }
  | {
      readonly kind: "published";
      readonly publishedOutcomeFrame: Extract<
        GpuFlowRetainedDisplayPublicationOutcomeFrame,
        { readonly kind: "published" }
      >;
    };

export type GpuFlowRetainedDisplayPublicationFramePlanSelector = (input: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayOutcome: GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];
}) => GpuFlowRetainedDisplayPublicationFramePlan;

export type GpuFlowRetainedDisplayPublicationFramePlanResultResolver =
  (input: {
    readonly framePlan: GpuFlowRetainedDisplayPublicationFramePlan;
  }) => GpuFlowRetainedDisplayOutcomeFrameResult;

export function createGpuFlowRetainedDisplayPublicationOutcomeFrameResolver(): GpuFlowRetainedDisplayPublicationOutcomeFrameResolver {
  return resolveGpuFlowRetainedDisplayPublicationOutcomeFrame;
}

export function createGpuFlowRetainedDisplayOutcomeFrameResultResolver(): GpuFlowRetainedDisplayOutcomeFrameResultResolver {
  return resolveGpuFlowRetainedDisplayOutcomeFrameResult;
}

export function createGpuFlowRetainedDisplayPublicationFramePlanResultResolver(): GpuFlowRetainedDisplayPublicationFramePlanResultResolver {
  return resolveGpuFlowRetainedDisplayPublicationFramePlanResult;
}

export function createGpuFlowRetainedDisplayPublicationFramePlanSelector(): GpuFlowRetainedDisplayPublicationFramePlanSelector {
  return selectGpuFlowRetainedDisplayPublicationFramePlan;
}

function selectGpuFlowRetainedDisplayPublicationFramePlan({
  previousVisibleProjectionState,
  retainedDisplayOutcome,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayOutcome: GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];
}): GpuFlowRetainedDisplayPublicationFramePlan {
  const outcomeFrame = resolveGpuFlowRetainedDisplayPublicationOutcomeFrame(
    retainedDisplayOutcome,
  );
  const result = resolveGpuFlowRetainedDisplayOutcomeFrameResult({
    outcomeFrame,
    previousVisibleProjectionState,
  });
  if (result.blockedPublicationCandidate) {
    return {
      blockedPublicationCandidate: result.blockedPublicationCandidate,
      kind: "blocked" as const,
    };
  }
  return {
    kind: "published" as const,
    publishedOutcomeFrame: result.publishedOutcomeFrame,
  };
}

function resolveGpuFlowRetainedDisplayPublicationFramePlanResult({
  framePlan,
}: {
  readonly framePlan: GpuFlowRetainedDisplayPublicationFramePlan;
}): GpuFlowRetainedDisplayOutcomeFrameResult {
  if (framePlan.kind === "blocked") {
    return {
      blockedPublicationCandidate: framePlan.blockedPublicationCandidate,
      publishedOutcomeFrame: null,
    };
  }
  return {
    blockedPublicationCandidate: null,
    publishedOutcomeFrame: framePlan.publishedOutcomeFrame,
  };
}

function resolveGpuFlowRetainedDisplayOutcomeFrameResult({
  outcomeFrame,
  previousVisibleProjectionState,
}: {
  readonly outcomeFrame: GpuFlowRetainedDisplayPublicationOutcomeFrame;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowRetainedDisplayOutcomeFrameResult {
  if (outcomeFrame.kind !== "blocked") {
    return {
      blockedPublicationCandidate: null,
      publishedOutcomeFrame: outcomeFrame,
    };
  }
  return {
    blockedPublicationCandidate:
      createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: outcomeFrame.reason,
        heldPreviousProjectionState: previousVisibleProjectionState,
      }),
    publishedOutcomeFrame: null,
  };
}
