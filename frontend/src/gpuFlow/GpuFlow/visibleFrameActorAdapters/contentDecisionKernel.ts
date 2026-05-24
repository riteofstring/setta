import type { GpuFlowCommittedSurfaceFrame } from "../../committedSurfaceFrame";
import type { GpuFlowVisibleProjectionState } from "../../projectionRuntime";
import type {
  GpuFlowNodeLayerCommittedSurfacePublicationResult,
  GpuFlowNodeLayerFrameResult,
} from "../flowFrameResult";
import type { GpuFlowRetainedDisplayPublicationResult } from "../flowRetainedDisplayTransaction";
import { createGpuFlowVisibleProjectionStateForRetainedPublication } from "../flowVisibleProjectionState";
import type {
  GpuFlowCommittedSurfacePublicationCandidate,
  GpuFlowCommittedSurfacePublicationCandidateInput,
  GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "../visibleFrameContentPlan";
import {
  reduceGpuFlowCommittedSurfacePublicationCandidate,
  resolveGpuFlowCommittedSurfacePublicationFramePlanResult,
  resolveGpuFlowRetainedDisplayPublicationFramePlanResult,
  selectGpuFlowCommittedSurfacePublicationFramePlan,
  selectGpuFlowContentPublicationBlockedCandidateForFrameResult,
  selectGpuFlowRetainedDisplayPublicationFramePlan,
} from "../visibleFrameStateMachine";

type GpuFlowRetainedDisplayPublicationOutcome =
  GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];

export type GpuFlowCommittedSurfacePublicationActionFrameResult = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly preparedContentFramePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowCommittedSurfacePublicationFramePlan =
  | {
      readonly blockedPublicationCandidate: null;
      readonly preparedContentFramePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
      readonly kind: "publish";
      readonly visibleProjectionState: null;
    }
  | {
      readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
      readonly preparedContentFramePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
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
  readonly preparedContentFrame: GpuFlowCommittedSurfaceFrame | void;
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
  | "preparedContentFrame"
>;

export type GpuFlowRetainedDisplayPublicationOutcomeFrame = {
  readonly frame: GpuFlowRetainedDisplayPublicationOutcome["frame"];
  readonly kind: "published";
  readonly outcome: GpuFlowRetainedDisplayPublicationOutcome;
  readonly outcomeKind: GpuFlowRetainedDisplayPublicationOutcome["kind"];
};

export function createGpuFlowVisiblePublicationContentDecisionKernel(): GpuFlowVisiblePublicationContentDecisionKernel {
  return createGpuFlowVisiblePublicationContentDecisionKernelMethods();
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
    selectContentPublicationBlockedCandidateForFrameResult:
      selectGpuFlowContentPublicationBlockedCandidateForFrameResult,
    selectRetainedDisplayPublicationFramePlan:
      selectGpuFlowRetainedDisplayPublicationFramePlan,
  });
}
