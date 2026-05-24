import type { GpuFlowPreparedContentFrame } from "../../preparedContentFrame";
import type { GpuFlowVisibleProjectionState } from "../../projectionRuntime";
import type {
  GpuFlowNodeLayerFrameResult,
  GpuFlowNodeLayerPreparedContentFramePresentationResult,
} from "../flowFrameResult";
import type { GpuFlowRetainedDisplayPresentationResult } from "../flowRetainedDisplayTransaction";
import { createGpuFlowVisibleProjectionStateForRetainedPresentation } from "../flowVisibleProjectionState";
import type {
  GpuFlowPreparedContentFramePresentationCandidate,
  GpuFlowPreparedContentFramePresentationCandidateInput,
  GpuFlowVisibleFrameBlockedPresentationCandidate,
} from "../visibleFrameContentPlan";
import {
  reduceGpuFlowPreparedContentFramePresentationCandidate,
  resolveGpuFlowPreparedContentFramePresentationFramePlanResult,
  resolveGpuFlowRetainedDisplayPresentationFramePlanResult,
  selectGpuFlowContentPreparationBlockedCandidateForFrameResult,
  selectGpuFlowPreparedContentFramePresentationFramePlan,
  selectGpuFlowRetainedDisplayPresentationFramePlan,
} from "../visibleFrameStateMachine";

type GpuFlowRetainedDisplayPresentationOutcome =
  GpuFlowRetainedDisplayPresentationResult["retainedDisplayOutcome"];

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
  readonly presentedOutcomeFrame: GpuFlowRetainedDisplayPresentationOutcomeFrame;
};

export type GpuFlowRetainedDisplayPresentationFramePlan = {
  readonly kind: "presented";
  readonly presentedOutcomeFrame: GpuFlowRetainedDisplayPresentationOutcomeFrame;
};

type GpuFlowRetainedDisplayPresentationFramePlanSelector = (input: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayOutcome: GpuFlowRetainedDisplayPresentationResult["retainedDisplayOutcome"];
}) => GpuFlowRetainedDisplayPresentationFramePlan;

type GpuFlowRetainedDisplayPresentationFramePlanResultResolver = (input: {
  readonly framePlan: GpuFlowRetainedDisplayPresentationFramePlan;
}) => GpuFlowRetainedDisplayOutcomeFrameResult;

export type GpuFlowVisibleFramePresentationContentDecisionKernel = {
  readonly createVisibleProjectionStateForRetainedPresentation: (
    input: GpuFlowRetainedPresentationVisibleProjectionStateInput,
  ) => GpuFlowVisibleProjectionState;
  readonly preparePreparedContentFramePresentationCandidate: (
    input: GpuFlowPreparedContentFramePresentationCandidateInput,
  ) => GpuFlowPreparedContentFramePresentationCandidate;
  readonly resolvePreparedContentFramePresentationFramePlanResult: GpuFlowPreparedContentFramePresentationFramePlanResultResolver;
  readonly resolveRetainedDisplayPresentationFramePlanResult: GpuFlowRetainedDisplayPresentationFramePlanResultResolver;
  readonly selectPreparedContentFramePresentationFramePlan: GpuFlowPreparedContentFramePresentationFramePlanSelector;
  readonly selectContentPreparationBlockedCandidateForFrameResult: (input: {
    readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
    readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  }) => GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly selectRetainedDisplayPresentationFramePlan: GpuFlowRetainedDisplayPresentationFramePlanSelector;
};

type GpuFlowRetainedPresentationVisibleProjectionStateInput = Pick<
  GpuFlowPreparedContentFramePresentationCandidateInput,
  | "frameReasons"
  | "liveProjectionSample"
  | "contentWorkLane"
  | "preparedContentFrame"
>;

export type GpuFlowRetainedDisplayPresentationOutcomeFrame = {
  readonly frame: GpuFlowRetainedDisplayPresentationOutcome["frame"];
  readonly kind: "presented";
  readonly outcome: GpuFlowRetainedDisplayPresentationOutcome;
  readonly outcomeKind: GpuFlowRetainedDisplayPresentationOutcome["kind"];
};

export function createGpuFlowVisibleFramePresentationContentDecisionKernel(): GpuFlowVisibleFramePresentationContentDecisionKernel {
  return createGpuFlowVisibleFramePresentationContentDecisionKernelMethods();
}

function createGpuFlowVisibleFramePresentationContentDecisionKernelMethods(): GpuFlowVisibleFramePresentationContentDecisionKernel {
  return Object.freeze({
    createVisibleProjectionStateForRetainedPresentation:
      createGpuFlowVisibleProjectionStateForRetainedPresentation,
    preparePreparedContentFramePresentationCandidate:
      reduceGpuFlowPreparedContentFramePresentationCandidate,
    resolvePreparedContentFramePresentationFramePlanResult:
      resolveGpuFlowPreparedContentFramePresentationFramePlanResult,
    resolveRetainedDisplayPresentationFramePlanResult:
      resolveGpuFlowRetainedDisplayPresentationFramePlanResult,
    selectPreparedContentFramePresentationFramePlan:
      selectGpuFlowPreparedContentFramePresentationFramePlan,
    selectContentPreparationBlockedCandidateForFrameResult:
      selectGpuFlowContentPreparationBlockedCandidateForFrameResult,
    selectRetainedDisplayPresentationFramePlan:
      selectGpuFlowRetainedDisplayPresentationFramePlan,
  });
}
