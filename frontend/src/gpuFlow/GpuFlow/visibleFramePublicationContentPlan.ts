import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import {
  resolveGpuFlowCommittedSurfacePublicationCandidateAction,
  type GpuFlowCommittedSurfacePublicationCandidateAction,
} from "./flowCommittedSurfacePublicationCandidateHandling";
import {
  createGpuFlowNodeLayerCommittedSurfacePublicationResult,
  createGpuFlowNodeLayerFrameResultForVisibleProjectionState,
  createGpuFlowNodeLayerFrameRetainedProjectionBlockedResult,
  type GpuFlowNodeLayerCommittedSurfacePublicationResult,
  type GpuFlowNodeLayerFrameResult,
} from "./flowFrameResult";
import {
  resolveGpuFlowRetainedDisplayPublicationOutcomeFrame,
  type GpuFlowRetainedDisplayPublicationOutcomeFrame,
  type GpuFlowRetainedDisplayPublicationResult,
} from "./flowRetainedDisplayTransaction";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowBlockedVisibleReason,
} from "./visibleFramePublicationTokens";

export type GpuFlowCommittedSurfacePublicationEffect =
  | {
      readonly kind: "publish";
    }
  | {
      readonly candidateFrame: GpuFlowCommittedSurfaceFrame;
      readonly deferRetry: boolean;
      readonly kind: "blocked";
      readonly timestamp: number;
    }
  | {
      readonly candidateFrame: GpuFlowCommittedSurfaceFrame;
      readonly deferRetry: boolean;
      readonly kind: "held-previous";
      readonly timestamp: number;
    };

export type GpuFlowVisibleFrameBlockedPublicationCandidate = {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrameId: GpuFlowBlockedPublicationToken["frozenFrameId"];
};

export type GpuFlowCommittedSurfacePublicationCandidate =
  | {
      readonly effect: GpuFlowCommittedSurfacePublicationEffect;
      readonly kind: "publish";
    }
  | {
      readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate;
      readonly candidateFrame: GpuFlowCommittedSurfaceFrame;
      readonly effect: GpuFlowCommittedSurfacePublicationEffect;
      readonly errorMessage: string | null;
      readonly kind: "blocked";
      readonly preservePreparationSnapshot: boolean;
    }
  | {
      readonly effect: GpuFlowCommittedSurfacePublicationEffect;
      readonly kind: "held-previous";
      readonly visibleProjectionState: NonNullable<
        GpuFlowNodeLayerFrameResult["visibleProjectionState"]
      >;
    };

export type GpuFlowCommittedSurfacePublicationCandidateActionResolver = (
  input: Parameters<
    typeof resolveGpuFlowCommittedSurfacePublicationCandidateAction
  >[0],
) => GpuFlowCommittedSurfacePublicationCandidateAction;

export type GpuFlowCommittedSurfacePublicationActionFrameResult = {
  readonly committedSurfacePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
  readonly frameResult: GpuFlowNodeLayerFrameResult | null;
};

export type GpuFlowCommittedSurfacePublicationActionFrameResultResolver =
  (input: {
    readonly action: GpuFlowCommittedSurfacePublicationCandidateAction;
    readonly effect: GpuFlowCommittedSurfacePublicationEffect;
  }) => GpuFlowCommittedSurfacePublicationActionFrameResult;

export type GpuFlowCommittedSurfacePublicationFramePlan =
  | {
      readonly committedSurfacePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
      readonly kind: "publish";
    }
  | {
      readonly frameResult: GpuFlowNodeLayerFrameResult;
      readonly kind: "frame-result";
    };

export type GpuFlowCommittedSurfacePublicationFramePlanSelector = (input: {
  readonly candidate: GpuFlowCommittedSurfacePublicationCandidate;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}) => GpuFlowCommittedSurfacePublicationFramePlan;

export type GpuFlowRetainedDisplayPublicationOutcomeFrameResolver = (
  input: Parameters<
    typeof resolveGpuFlowRetainedDisplayPublicationOutcomeFrame
  >[0],
) => GpuFlowRetainedDisplayPublicationOutcomeFrame;

export type GpuFlowRetainedDisplayOutcomeFrameResult =
  | {
      readonly frameResult: GpuFlowNodeLayerFrameResult;
      readonly publishedOutcomeFrame: null;
    }
  | {
      readonly frameResult: null;
      readonly publishedOutcomeFrame: Extract<
        GpuFlowRetainedDisplayPublicationOutcomeFrame,
        { readonly kind: "published" }
      >;
    };

export type GpuFlowRetainedDisplayOutcomeFrameResultResolver = (input: {
  readonly outcomeFrame: GpuFlowRetainedDisplayPublicationOutcomeFrame;
}) => GpuFlowRetainedDisplayOutcomeFrameResult;

export type GpuFlowRetainedDisplayPublicationFramePlan =
  | {
      readonly frameResult: GpuFlowNodeLayerFrameResult;
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
  readonly retainedDisplayOutcome: GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];
}) => GpuFlowRetainedDisplayPublicationFramePlan;

export function createGpuFlowCommittedSurfacePublicationCandidateActionResolver(): GpuFlowCommittedSurfacePublicationCandidateActionResolver {
  return resolveGpuFlowCommittedSurfacePublicationCandidateAction;
}

export function createGpuFlowCommittedSurfacePublicationActionFrameResultResolver(): GpuFlowCommittedSurfacePublicationActionFrameResultResolver {
  return resolveGpuFlowCommittedSurfacePublicationActionFrameResult;
}

export function createGpuFlowCommittedSurfacePublicationFramePlanSelector(): GpuFlowCommittedSurfacePublicationFramePlanSelector {
  return selectGpuFlowCommittedSurfacePublicationFramePlan;
}

export function selectGpuFlowCommittedSurfacePublicationFramePlan({
  candidate,
  publishedCommittedSurfaceFrame,
}: {
  readonly candidate: GpuFlowCommittedSurfacePublicationCandidate;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowCommittedSurfacePublicationFramePlan {
  const action = resolveGpuFlowCommittedSurfacePublicationCandidateAction({
    candidate,
    publishedCommittedSurfaceFrame,
  });
  const result = resolveGpuFlowCommittedSurfacePublicationActionFrameResult({
    action,
    effect: candidate.effect,
  });
  if (result.frameResult) {
    return {
      frameResult: result.frameResult,
      kind: "frame-result" as const,
    };
  }
  return {
    committedSurfacePublication: result.committedSurfacePublication,
    kind: "publish" as const,
  };
}

export function resolveGpuFlowCommittedSurfacePublicationActionFrameResult({
  action,
  effect,
}: {
  readonly action: GpuFlowCommittedSurfacePublicationCandidateAction;
  readonly effect: GpuFlowCommittedSurfacePublicationEffect;
}): GpuFlowCommittedSurfacePublicationActionFrameResult {
  const committedSurfacePublication =
    createGpuFlowNodeLayerCommittedSurfacePublicationResult({
      action,
      effect,
    });
  if (action.kind === "publish") {
    return {
      committedSurfacePublication,
      frameResult: null,
    };
  }
  return {
    committedSurfacePublication,
    frameResult: createGpuFlowNodeLayerFrameResultForVisibleProjectionState(
      action.visibleProjectionState,
      { committedSurfacePublication },
    ),
  };
}

export function createGpuFlowRetainedDisplayPublicationOutcomeFrameResolver(): GpuFlowRetainedDisplayPublicationOutcomeFrameResolver {
  return resolveGpuFlowRetainedDisplayPublicationOutcomeFrame;
}

export function createGpuFlowRetainedDisplayOutcomeFrameResultResolver(): GpuFlowRetainedDisplayOutcomeFrameResultResolver {
  return resolveGpuFlowRetainedDisplayOutcomeFrameResult;
}

export function createGpuFlowRetainedDisplayPublicationFramePlanSelector(): GpuFlowRetainedDisplayPublicationFramePlanSelector {
  return selectGpuFlowRetainedDisplayPublicationFramePlan;
}

export function selectGpuFlowRetainedDisplayPublicationFramePlan({
  retainedDisplayOutcome,
}: {
  readonly retainedDisplayOutcome: GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];
}): GpuFlowRetainedDisplayPublicationFramePlan {
  const outcomeFrame = resolveGpuFlowRetainedDisplayPublicationOutcomeFrame(
    retainedDisplayOutcome,
  );
  const result = resolveGpuFlowRetainedDisplayOutcomeFrameResult({
    outcomeFrame,
  });
  if (result.frameResult) {
    return {
      frameResult: result.frameResult,
      kind: "blocked" as const,
    };
  }
  return {
    kind: "published" as const,
    publishedOutcomeFrame: result.publishedOutcomeFrame,
  };
}

export function resolveGpuFlowRetainedDisplayOutcomeFrameResult({
  outcomeFrame,
}: {
  readonly outcomeFrame: GpuFlowRetainedDisplayPublicationOutcomeFrame;
}): GpuFlowRetainedDisplayOutcomeFrameResult {
  if (outcomeFrame.kind !== "blocked") {
    return {
      frameResult: null,
      publishedOutcomeFrame: outcomeFrame,
    };
  }
  return {
    frameResult: createGpuFlowNodeLayerFrameRetainedProjectionBlockedResult(
      outcomeFrame.reason,
    ),
    publishedOutcomeFrame: null,
  };
}
