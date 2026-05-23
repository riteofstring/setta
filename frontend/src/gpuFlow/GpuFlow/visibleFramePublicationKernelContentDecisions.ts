import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type { GpuFlowCommittedSurfacePublicationCandidateAction } from "./flowCommittedSurfacePublicationCandidateHandling";
import {
  createGpuFlowNodeLayerCommittedSurfacePublicationResult,
  type GpuFlowNodeLayerCommittedSurfacePublicationResult,
  type GpuFlowNodeLayerFrameResult,
} from "./flowFrameResult";
import type { GpuFlowRetainedDisplayPublicationResult } from "./flowRetainedDisplayTransaction";
import { createGpuFlowVisibleProjectionStateForRetainedPublication } from "./flowVisibleProjectionState";
import { createGpuFlowBrowserVisualBlockedPublicationCandidate } from "./visibleFramePublicationBlockedCandidate";
import {
  prepareGpuFlowCommittedSurfacePublicationCandidate,
  selectGpuFlowRetainedDisplayPublicationFramePlan,
  type GpuFlowRetainedDisplayPublicationOutcomeFrame,
} from "./visibleFramePublicationContentOracle";
import type {
  GpuFlowCommittedSurfacePublicationCandidate,
  GpuFlowCommittedSurfacePublicationCandidateInput,
  GpuFlowCommittedSurfacePublicationEffect,
  GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "./visibleFramePublicationContentPlan";

export type GpuFlowCommittedSurfacePublicationActionFrameResult = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly committedSurfacePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowCommittedSurfacePublicationFramePlan =
  | {
      readonly blockedPublicationCandidate: null;
      readonly committedSurfacePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
      readonly kind: "publish";
      readonly visibleProjectionState: null;
    }
  | {
      readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
      readonly committedSurfacePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
      readonly kind: "candidate";
      readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
    };

export type GpuFlowCommittedSurfacePublicationFramePlanResult =
  GpuFlowCommittedSurfacePublicationActionFrameResult;

type GpuFlowCommittedSurfacePublicationFramePlanResultResolver = (input: {
  readonly framePlan: GpuFlowCommittedSurfacePublicationFramePlan;
}) => GpuFlowCommittedSurfacePublicationFramePlanResult;

type GpuFlowCommittedSurfacePublicationFramePlanSelector = (input: {
  readonly candidate: GpuFlowCommittedSurfacePublicationCandidate;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}) => GpuFlowCommittedSurfacePublicationFramePlan;

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

type GpuFlowRetainedDisplayPublicationFramePlanSelector = (input: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayOutcome: GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];
}) => GpuFlowRetainedDisplayPublicationFramePlan;

type GpuFlowRetainedDisplayPublicationFramePlanResultResolver = (input: {
  readonly framePlan: GpuFlowRetainedDisplayPublicationFramePlan;
}) => GpuFlowRetainedDisplayOutcomeFrameResult;

type GpuFlowContentPublicationBlockedCandidateSelector = (input: {
  readonly blockedCommittedSurfacePublicationCandidate?:
    | GpuFlowVisibleFrameBlockedPublicationCandidate
    | null
    | undefined;
  readonly committedSurfacePublicationEffect?:
    | GpuFlowCommittedSurfacePublicationEffect
    | null
    | undefined;
  readonly retainedDisplayBlockedPublicationCandidate?:
    | GpuFlowVisibleFrameBlockedPublicationCandidate
    | null
    | undefined;
}) => GpuFlowVisibleFrameBlockedPublicationCandidate | null;

export type GpuFlowVisiblePublicationContentDecisionKernel = {
  readonly createVisibleProjectionStateForRetainedPublication: (
    input: GpuFlowRetainedPublicationVisibleProjectionStateInput,
  ) => GpuFlowVisibleProjectionState;
  readonly prepareCommittedSurfacePublicationCandidate: (
    input: GpuFlowCommittedSurfacePublicationCandidateInput,
  ) => GpuFlowCommittedSurfacePublicationCandidate;
  readonly resolveCommittedSurfacePublicationFramePlanResult: GpuFlowCommittedSurfacePublicationFramePlanResultResolver;
  readonly resolveRetainedDisplayPublicationFramePlanResult: GpuFlowRetainedDisplayPublicationFramePlanResultResolver;
  readonly selectCommittedSurfacePublicationFramePlan: GpuFlowCommittedSurfacePublicationFramePlanSelector;
  readonly selectContentPublicationBlockedCandidateForFrameResult: (input: {
    readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
    readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  }) => GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly selectRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanSelector;
};

type GpuFlowRetainedPublicationVisibleProjectionStateInput = Pick<
  GpuFlowCommittedSurfacePublicationCandidateInput,
  | "committedGpuNativeVisuals"
  | "frameReasons"
  | "heldPreviousProjectionState"
  | "liveProjectionSample"
  | "publicationLane"
  | "publishedCommittedSurfaceFrame"
  | "publishedRetainedFrame"
> & {
  readonly retainedDisplayOutcomeKind: string;
};

export function createGpuFlowVisiblePublicationContentDecisionKernel(): GpuFlowVisiblePublicationContentDecisionKernel {
  return {
    createVisibleProjectionStateForRetainedPublication:
      createGpuFlowVisibleProjectionStateForRetainedPublication,
    prepareCommittedSurfacePublicationCandidate:
      prepareGpuFlowCommittedSurfacePublicationCandidate,
    resolveCommittedSurfacePublicationFramePlanResult:
      resolveGpuFlowCommittedSurfacePublicationFramePlanResult,
    resolveRetainedDisplayPublicationFramePlanResult:
      resolveGpuFlowRetainedDisplayPublicationFramePlanResult,
    selectCommittedSurfacePublicationFramePlan:
      selectGpuFlowCommittedSurfacePublicationFramePlan,
    selectContentPublicationBlockedCandidateForFrameResult: ({
      nodeLayerFrameResult,
      previousVisibleProjectionState,
    }) => {
      const selectContentPublicationBlockedCandidate =
        selectGpuFlowContentPublicationBlockedCandidate({
          previousVisibleProjectionState,
        });
      return selectGpuFlowContentPublicationBlockedCandidateForFrameResult({
        nodeLayerFrameResult,
        selectContentPublicationBlockedCandidate,
      });
    },
    selectRetainedDisplayPublicationFramePlan:
      selectGpuFlowRetainedDisplayPublicationFramePlan,
  };
}

function selectGpuFlowCommittedSurfacePublicationFramePlan({
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
  if (action.kind !== "publish") {
    return {
      blockedPublicationCandidate: result.blockedPublicationCandidate,
      committedSurfacePublication: result.committedSurfacePublication,
      kind: "candidate" as const,
      visibleProjectionState: result.visibleProjectionState,
    };
  }
  return {
    blockedPublicationCandidate: null,
    committedSurfacePublication: result.committedSurfacePublication,
    kind: "publish" as const,
    visibleProjectionState: null,
  };
}

function resolveGpuFlowCommittedSurfacePublicationCandidateAction({
  candidate,
  publishedCommittedSurfaceFrame,
}: {
  readonly candidate: GpuFlowCommittedSurfacePublicationCandidate;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowCommittedSurfacePublicationCandidateAction {
  switch (candidate.kind) {
    case "blocked":
      return {
        blockedSurfacePublication: candidate,
        kind: "blocked",
        visibleProjectionState: null,
      };
    case "held-previous":
      return {
        heldPreparedCommittedSurfaceFrame:
          publishedCommittedSurfaceFrame ?? null,
        kind: "held-previous",
        visibleProjectionState: candidate.visibleProjectionState,
      };
    case "publish":
      return {
        committedSurfaceFrame: publishedCommittedSurfaceFrame ?? null,
        kind: "publish",
      };
  }
}

function resolveGpuFlowCommittedSurfacePublicationFramePlanResult({
  framePlan,
}: {
  readonly framePlan: GpuFlowCommittedSurfacePublicationFramePlan;
}): GpuFlowCommittedSurfacePublicationFramePlanResult {
  return {
    blockedPublicationCandidate: framePlan.blockedPublicationCandidate,
    committedSurfacePublication: framePlan.committedSurfacePublication,
    visibleProjectionState: framePlan.visibleProjectionState,
  };
}

function resolveGpuFlowCommittedSurfacePublicationActionFrameResult({
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
      blockedPublicationCandidate: null,
      committedSurfacePublication,
      visibleProjectionState: null,
    };
  }
  if (action.kind === "blocked") {
    return {
      blockedPublicationCandidate:
        action.blockedSurfacePublication.blockedPublicationCandidate,
      committedSurfacePublication,
      visibleProjectionState: null,
    };
  }
  return {
    blockedPublicationCandidate: null,
    committedSurfacePublication,
    visibleProjectionState: action.visibleProjectionState,
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

function selectGpuFlowContentPublicationBlockedCandidate({
  previousVisibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPublicationBlockedCandidateSelector {
  return ({
    blockedCommittedSurfacePublicationCandidate,
    committedSurfacePublicationEffect,
    retainedDisplayBlockedPublicationCandidate,
  }) => {
    if (blockedCommittedSurfacePublicationCandidate) {
      return blockedCommittedSurfacePublicationCandidate;
    }
    if (retainedDisplayBlockedPublicationCandidate) {
      return retainedDisplayBlockedPublicationCandidate;
    }
    if (committedSurfacePublicationEffect?.kind !== "held-previous") {
      return null;
    }
    return createGpuFlowBrowserVisualBlockedPublicationCandidate({
      frame: committedSurfacePublicationEffect.candidateFrame,
      heldPreviousProjectionState: previousVisibleProjectionState,
    });
  };
}

function selectGpuFlowContentPublicationBlockedCandidateForFrameResult({
  nodeLayerFrameResult,
  selectContentPublicationBlockedCandidate,
}: {
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  readonly selectContentPublicationBlockedCandidate: GpuFlowContentPublicationBlockedCandidateSelector;
}): GpuFlowVisibleFrameBlockedPublicationCandidate | null {
  const committedSurfacePublication =
    nodeLayerFrameResult.committedSurfacePublication;
  return selectContentPublicationBlockedCandidate({
    blockedCommittedSurfacePublicationCandidate:
      committedSurfacePublication.blockedSurfacePublication
        ?.blockedPublicationCandidate ?? null,
    committedSurfacePublicationEffect:
      committedSurfacePublication.committedSurfacePublicationEffect,
    retainedDisplayBlockedPublicationCandidate:
      nodeLayerFrameResult.blockedPublicationCandidate,
  });
}
