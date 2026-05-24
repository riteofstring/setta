import type { GpuFlowPreparedContentFrame } from "../../preparedContentFrame";
import type { GpuFlowVisibleProjectionState } from "../../projectionRuntime";
import type {
  GpuFlowNodeLayerFrameResult,
  GpuFlowNodeLayerPreparedContentFramePresentationResult,
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
  resolveGpuFlowPreparedContentFramePresentationFramePlanResult,
  resolveGpuFlowRetainedDisplayPublicationFramePlanResult,
  selectGpuFlowContentPreparationBlockedCandidateForFrameResult,
  selectGpuFlowPreparedContentFramePresentationFramePlan,
  selectGpuFlowRetainedDisplayPublicationFramePlan,
} from "../visibleFrameStateMachine";

type GpuFlowRetainedDisplayPublicationOutcome =
  GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];

export type GpuFlowPreparedContentFramePresentationActionFrameResult = {
  readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly preparedContentFramePresentation: GpuFlowNodeLayerPreparedContentFramePresentationResult;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowPreparedContentFramePresentationFramePlan =
  | {
      readonly blockedPresentationCandidate: null;
      readonly preparedContentFramePresentation: GpuFlowNodeLayerPreparedContentFramePresentationResult;
      readonly kind: "present";
      readonly visibleProjectionState: null;
    }
  | {
      readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
      readonly preparedContentFramePresentation: GpuFlowNodeLayerPreparedContentFramePresentationResult;
      readonly kind: "candidate";
      readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
    };

export type GpuFlowPreparedContentFramePresentationFramePlanResult =
  GpuFlowPreparedContentFramePresentationActionFrameResult;

type GpuFlowPreparedContentFramePresentationFramePlanResultResolver = (input: {
  readonly framePlan: GpuFlowPreparedContentFramePresentationFramePlan;
}) => GpuFlowPreparedContentFramePresentationFramePlanResult;

type GpuFlowPreparedContentFramePresentationFramePlanSelector = (input: {
  readonly candidate: GpuFlowPreparedContentFramePresentationCandidate;
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | void;
}) => GpuFlowPreparedContentFramePresentationFramePlan;

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
  readonly resolvePreparedContentFramePresentationFramePlanResult: GpuFlowPreparedContentFramePresentationFramePlanResultResolver;
  readonly resolveRetainedDisplayPublicationFramePlanResult: GpuFlowRetainedDisplayPublicationFramePlanResultResolver;
  readonly selectPreparedContentFramePresentationFramePlan: GpuFlowPreparedContentFramePresentationFramePlanSelector;
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
    resolvePreparedContentFramePresentationFramePlanResult:
      resolveGpuFlowPreparedContentFramePresentationFramePlanResult,
    resolveRetainedDisplayPublicationFramePlanResult:
      resolveGpuFlowRetainedDisplayPublicationFramePlanResult,
    selectPreparedContentFramePresentationFramePlan:
      selectGpuFlowPreparedContentFramePresentationFramePlan,
    selectContentPreparationBlockedCandidateForFrameResult:
      selectGpuFlowContentPreparationBlockedCandidateForFrameResult,
    selectRetainedDisplayPublicationFramePlan:
      selectGpuFlowRetainedDisplayPublicationFramePlan,
  });
}
