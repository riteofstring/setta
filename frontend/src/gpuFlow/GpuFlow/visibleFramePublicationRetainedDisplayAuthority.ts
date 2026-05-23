import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import {
  type GpuFlowRetainedDisplayPublicationResult,
} from "./flowRetainedDisplayTransaction";
import type { GpuFlowVisibleFrameBlockedPublicationCandidate } from "./visibleFramePublicationContentPlan";
import { createGpuFlowRetainedProjectionBlockedPublicationCandidateFactory } from "./visibleFramePublicationProjectionTransactionAuthority";

const createRetainedProjectionBlockedPublicationCandidate =
  createGpuFlowRetainedProjectionBlockedPublicationCandidateFactory();

type GpuFlowRetainedDisplayPublicationOutcome =
  GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];

type GpuFlowRetainedDisplayPublicationOutcomeFrame =
  | {
      readonly kind: "blocked";
      readonly reason: string;
    }
  | {
      readonly frame: Extract<
        GpuFlowRetainedDisplayPublicationOutcome,
        { readonly frame: unknown }
      >["frame"];
      readonly kind: "published";
      readonly outcome: Extract<
        GpuFlowRetainedDisplayPublicationOutcome,
        { readonly frame: unknown }
      >;
      readonly outcomeKind: Extract<
        GpuFlowRetainedDisplayPublicationOutcome,
        { readonly frame: unknown }
      >["kind"];
    };

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

function resolveGpuFlowRetainedDisplayPublicationOutcomeFrame(
  outcome: GpuFlowRetainedDisplayPublicationOutcome,
): GpuFlowRetainedDisplayPublicationOutcomeFrame {
  if (outcome.kind === "block-cold-first-coverage") {
    return {
      kind: "blocked",
      reason: outcome.reason,
    };
  }
  return {
    frame: outcome.frame,
    kind: "published",
    outcome,
    outcomeKind: outcome.kind,
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
      createRetainedProjectionBlockedPublicationCandidate({
        blockedReason: outcomeFrame.reason,
        heldPreviousProjectionState: previousVisibleProjectionState,
      }),
    publishedOutcomeFrame: null,
  };
}
