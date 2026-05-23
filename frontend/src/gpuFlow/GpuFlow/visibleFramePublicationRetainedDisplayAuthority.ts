import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import {
  type GpuFlowRetainedDisplayPublicationResult,
} from "./flowRetainedDisplayTransaction";
import type { GpuFlowVisibleFrameBlockedPublicationCandidate } from "./visibleFramePublicationContentPlan";

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
