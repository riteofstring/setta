import type { GpuFlowCommittedSurfaceFrame } from "../../committedSurfaceFrame";
import type { GpuFlowVisibleProjectionState } from "../../projectionRuntime";
import {
  createGpuFlowNodeLayerCommittedSurfacePublicationResult,
  type GpuFlowNodeLayerCommittedSurfacePublicationResult,
  type GpuFlowNodeLayerFrameResult,
} from "../flowFrameResult";
import type { GpuFlowRetainedDisplayPublicationResult } from "../flowRetainedDisplayTransaction";
import { createGpuFlowVisibleProjectionStateForRetainedPublication } from "../flowVisibleProjectionState";
import type {
  GpuFlowCommittedSurfacePublicationCandidate,
  GpuFlowCommittedSurfacePublicationCandidateInput,
  GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "../visibleFrameContentPlan";
import { reduceGpuFlowCommittedSurfacePublicationCandidate } from "../visibleFrameStateMachine";
import type { GpuFlowCommittedSurfaceCandidateAction } from "./committedSurfaceCandidateAction";

type GpuFlowRetainedDisplayPublicationOutcome =
  GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];

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

export type GpuFlowRetainedDisplayOutcomeFrameResult = {
  readonly blockedPublicationCandidate: null;
  readonly publishedOutcomeFrame: GpuFlowRetainedDisplayPublicationOutcomeFrame;
};

export type GpuFlowRetainedDisplayPublicationFramePlan = {
  readonly kind: "published";
  readonly publishedOutcomeFrame: GpuFlowRetainedDisplayPublicationOutcomeFrame;
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
  | "frameReasons"
  | "liveProjectionSample"
  | "publicationLane"
  | "publishedCommittedSurfaceFrame"
>;

export type GpuFlowRetainedDisplayPublicationOutcomeFrame =
  {
    readonly frame: GpuFlowRetainedDisplayPublicationOutcome["frame"];
    readonly kind: "published";
    readonly outcome: GpuFlowRetainedDisplayPublicationOutcome;
    readonly outcomeKind: GpuFlowRetainedDisplayPublicationOutcome["kind"];
  };

export function createGpuFlowVisiblePublicationContentDecisionKernel(): GpuFlowVisiblePublicationContentDecisionKernel {
  return createGpuFlowVisiblePublicationContentDecisionKernelMethods();
}

export function selectGpuFlowRetainedDisplayPublicationFramePlan({
  retainedDisplayOutcome,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayOutcome: GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];
}) {
  const outcomeFrame = resolveGpuFlowRetainedDisplayPublicationOutcomeFrame(
    retainedDisplayOutcome,
  );
  return {
    kind: "published" as const,
    publishedOutcomeFrame: outcomeFrame,
  };
}

function selectGpuFlowCommittedSurfacePublicationFramePlan({
  candidate,
  publishedCommittedSurfaceFrame,
}: {
  readonly candidate: GpuFlowCommittedSurfacePublicationCandidate;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowCommittedSurfacePublicationFramePlan {
  const action = resolveGpuFlowCommittedSurfaceCandidateAction({
    candidate,
    publishedCommittedSurfaceFrame,
  });
  const result = resolveGpuFlowCommittedSurfacePublicationActionFrameResult({
    action,
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

function resolveGpuFlowCommittedSurfaceCandidateAction({
  candidate,
  publishedCommittedSurfaceFrame,
}: {
  readonly candidate: GpuFlowCommittedSurfacePublicationCandidate;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowCommittedSurfaceCandidateAction {
  switch (candidate.kind) {
    case "nonpublishable":
      return {
        blockedSurfacePublication: candidate,
        kind: "blocked-candidate",
        visibleProjectionState: null,
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
}: {
  readonly action: GpuFlowCommittedSurfaceCandidateAction;
}): GpuFlowCommittedSurfacePublicationActionFrameResult {
  const committedSurfacePublication =
    createGpuFlowNodeLayerCommittedSurfacePublicationResult({
      action,
    });
  if (action.kind === "publish") {
    return {
      blockedPublicationCandidate: null,
      committedSurfacePublication,
      visibleProjectionState: null,
    };
  }
  if (action.kind === "blocked-candidate") {
    return {
      blockedPublicationCandidate:
        action.blockedSurfacePublication.blockedPublicationCandidate,
      committedSurfacePublication,
      visibleProjectionState: null,
    };
  }
  action satisfies never;
  throw new Error("Unknown GPU Flow committed surface publication action.");
}

function resolveGpuFlowRetainedDisplayPublicationFramePlanResult({
  framePlan,
}: {
  readonly framePlan: GpuFlowRetainedDisplayPublicationFramePlan;
}): GpuFlowRetainedDisplayOutcomeFrameResult {
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
    retainedDisplayBlockedPublicationCandidate,
  }) => {
    if (blockedCommittedSurfacePublicationCandidate) {
      return blockedCommittedSurfacePublicationCandidate;
    }
    if (retainedDisplayBlockedPublicationCandidate) {
      return retainedDisplayBlockedPublicationCandidate;
    }
    void previousVisibleProjectionState;
    return null;
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
    retainedDisplayBlockedPublicationCandidate:
      nodeLayerFrameResult.blockedPublicationCandidate,
  });
}

function createGpuFlowVisiblePublicationContentDecisionKernelMethods(): GpuFlowVisiblePublicationContentDecisionKernel {
  return Object.freeze({
    createVisibleProjectionStateForRetainedPublication:
      createGpuFlowVisibleProjectionStateForRetainedPublication,
    prepareCommittedSurfacePublicationCandidate:
      reduceGpuFlowCommittedSurfacePublicationCandidate,
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
  });
}

function resolveGpuFlowRetainedDisplayPublicationOutcomeFrame(
  outcome: GpuFlowRetainedDisplayPublicationOutcome,
): GpuFlowRetainedDisplayPublicationOutcomeFrame {
  return {
    frame: outcome.frame,
    kind: "published",
    outcome,
    outcomeKind: outcome.kind,
  };
}
