import type { GpuFlowPreparedContentFrame } from "../../preparedContentFrame";
import type { GpuFlowVisibleProjectionState } from "../../projectionRuntime";
import type {
  GpuFlowNodeLayerFrameResult,
  GpuFlowNodeLayerPreparedContentFramePublicationResult,
} from "../flowFrameResult";
import type { GpuFlowRetainedDisplayPublicationResult } from "../flowRetainedDisplayTransaction";
import { createGpuFlowVisibleProjectionStateForRetainedPublication } from "../flowVisibleProjectionState";
import type {
  GpuFlowPreparedContentFramePresentationCandidate,
  GpuFlowPreparedContentFramePresentationCandidateInput,
  GpuFlowVisibleFrameBlockedPresentationCandidate,
} from "../visibleFrameContentPlan";
import {
  reduceGpuFlowPreparedContentFramePresentationCandidate,
  resolveGpuFlowPreparedContentFramePublicationFramePlanResult,
  resolveGpuFlowRetainedDisplayPublicationFramePlanResult,
  selectGpuFlowContentPreparationBlockedCandidateForFrameResult,
  selectGpuFlowPreparedContentFramePublicationFramePlan,
  selectGpuFlowRetainedDisplayPublicationFramePlan,
} from "../visibleFrameStateMachine";

type GpuFlowRetainedDisplayPublicationOutcome =
  GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];

export type GpuFlowPreparedContentFramePublicationActionFrameResult = {
  readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly preparedContentFramePublication: GpuFlowNodeLayerPreparedContentFramePublicationResult;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowPreparedContentFramePublicationFramePlan =
  | {
      readonly blockedPresentationCandidate: null;
      readonly preparedContentFramePublication: GpuFlowNodeLayerPreparedContentFramePublicationResult;
      readonly kind: "present";
      readonly visibleProjectionState: null;
    }
  | {
      readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
      readonly preparedContentFramePublication: GpuFlowNodeLayerPreparedContentFramePublicationResult;
      readonly kind: "candidate";
      readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
    };

export type GpuFlowPreparedContentFramePublicationFramePlanResult =
  GpuFlowPreparedContentFramePublicationActionFrameResult;

type GpuFlowPreparedContentFramePublicationFramePlanResultResolver = (input: {
  readonly framePlan: GpuFlowPreparedContentFramePublicationFramePlan;
}) => GpuFlowPreparedContentFramePublicationFramePlanResult;

type GpuFlowPreparedContentFramePublicationFramePlanSelector = (input: {
  readonly candidate: GpuFlowPreparedContentFramePresentationCandidate;
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | void;
}) => GpuFlowPreparedContentFramePublicationFramePlan;

export type GpuFlowRetainedDisplayOutcomeFrameResult = {
  readonly blockedPresentationCandidate: null;
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

export type GpuFlowVisibleFramePresentationContentDecisionKernel = {
  readonly createVisibleProjectionStateForRetainedPublication: (
    input: GpuFlowRetainedPublicationVisibleProjectionStateInput,
  ) => GpuFlowVisibleProjectionState;
  readonly preparePreparedContentFramePresentationCandidate: (
    input: GpuFlowPreparedContentFramePresentationCandidateInput,
  ) => GpuFlowPreparedContentFramePresentationCandidate;
  readonly resolvePreparedContentFramePublicationFramePlanResult: GpuFlowPreparedContentFramePublicationFramePlanResultResolver;
  readonly resolveRetainedDisplayPublicationFramePlanResult: GpuFlowRetainedDisplayPublicationFramePlanResultResolver;
  readonly selectPreparedContentFramePublicationFramePlan: GpuFlowPreparedContentFramePublicationFramePlanSelector;
  readonly selectContentPreparationBlockedCandidateForFrameResult: (input: {
    readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
    readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  }) => GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly selectRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanSelector;
};

type GpuFlowRetainedPublicationVisibleProjectionStateInput = Pick<
  GpuFlowPreparedContentFramePresentationCandidateInput,
  | "frameReasons"
  | "liveProjectionSample"
  | "contentWorkLane"
  | "preparedContentFrame"
>;

export type GpuFlowRetainedDisplayPublicationOutcomeFrame = {
  readonly frame: GpuFlowRetainedDisplayPublicationOutcome["frame"];
  readonly kind: "published";
  readonly outcome: GpuFlowRetainedDisplayPublicationOutcome;
  readonly outcomeKind: GpuFlowRetainedDisplayPublicationOutcome["kind"];
};

export function createGpuFlowVisibleFramePresentationContentDecisionKernel(): GpuFlowVisibleFramePresentationContentDecisionKernel {
  return createGpuFlowVisibleFramePresentationContentDecisionKernelMethods();
}

function createGpuFlowVisibleFramePresentationContentDecisionKernelMethods(): GpuFlowVisibleFramePresentationContentDecisionKernel {
  return Object.freeze({
    createVisibleProjectionStateForRetainedPublication:
      createGpuFlowVisibleProjectionStateForRetainedPublication,
    preparePreparedContentFramePresentationCandidate:
      reduceGpuFlowPreparedContentFramePresentationCandidate,
    resolvePreparedContentFramePublicationFramePlanResult:
      resolveGpuFlowPreparedContentFramePublicationFramePlanResult,
    resolveRetainedDisplayPublicationFramePlanResult:
      resolveGpuFlowRetainedDisplayPublicationFramePlanResult,
    selectPreparedContentFramePublicationFramePlan:
      selectGpuFlowPreparedContentFramePublicationFramePlan,
    selectContentPreparationBlockedCandidateForFrameResult:
      selectGpuFlowContentPreparationBlockedCandidateForFrameResult,
    selectRetainedDisplayPublicationFramePlan:
      selectGpuFlowRetainedDisplayPublicationFramePlan,
  });
}
