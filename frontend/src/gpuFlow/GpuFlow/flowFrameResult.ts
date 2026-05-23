import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type {
  GpuFlowBlockedCommittedSurfacePublication,
  GpuFlowCommittedSurfacePublicationCandidateAction,
} from "./flowCommittedSurfacePublicationCandidateHandling";
import type {
  GpuFlowCommittedSurfacePublicationEffect,
  GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "./visibleFramePublicationContentPlan";

export type GpuFlowNodeLayerCommittedSurfacePublicationResult = {
  readonly blockedSurfacePublication: GpuFlowBlockedCommittedSurfacePublication | null;
  readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly committedSurfacePublicationEffect: GpuFlowCommittedSurfacePublicationEffect | null;
  readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
};

const EMPTY_GPU_FLOW_NODE_LAYER_COMMITTED_SURFACE_PUBLICATION = Object.freeze({
  blockedSurfacePublication: null,
  committedSurfaceFrame: null,
  committedSurfacePublicationEffect: null,
  heldPreparedCommittedSurfaceFrame: null,
} satisfies GpuFlowNodeLayerCommittedSurfacePublicationResult);

export type GpuFlowNodeLayerFrameResult =
  | {
      readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
      readonly committedSurfacePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
      readonly kind: "not-rendered";
      readonly visibleProjectionState: null;
    }
  | {
      readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
      readonly committedSurfacePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
      readonly kind: "visible-projection-state";
      readonly visibleProjectionState: GpuFlowVisibleProjectionState;
    };

type GpuFlowNodeLayerFrameResultOptions = {
  readonly blockedPublicationCandidate?:
    | GpuFlowVisibleFrameBlockedPublicationCandidate
    | null
    | undefined;
  readonly committedSurfacePublication?:
    | GpuFlowNodeLayerCommittedSurfacePublicationResult
    | undefined;
};

export function createGpuFlowNodeLayerCommittedSurfacePublicationResult({
  action,
  effect,
}: {
  readonly action: GpuFlowCommittedSurfacePublicationCandidateAction;
  readonly effect: GpuFlowCommittedSurfacePublicationEffect;
}): GpuFlowNodeLayerCommittedSurfacePublicationResult {
  switch (action.kind) {
    case "blocked":
      return {
        ...EMPTY_GPU_FLOW_NODE_LAYER_COMMITTED_SURFACE_PUBLICATION,
        blockedSurfacePublication: action.blockedSurfacePublication,
        committedSurfacePublicationEffect: effect,
      };
    case "held-previous":
      return {
        ...EMPTY_GPU_FLOW_NODE_LAYER_COMMITTED_SURFACE_PUBLICATION,
        committedSurfacePublicationEffect: effect,
        heldPreparedCommittedSurfaceFrame:
          action.heldPreparedCommittedSurfaceFrame,
      };
    case "publish":
      return {
        ...EMPTY_GPU_FLOW_NODE_LAYER_COMMITTED_SURFACE_PUBLICATION,
        committedSurfaceFrame: action.committedSurfaceFrame,
        committedSurfacePublicationEffect: effect,
      };
  }
}

export function createGpuFlowNodeLayerFrameNotRenderedResult(
  options: GpuFlowNodeLayerFrameResultOptions = {},
): GpuFlowNodeLayerFrameResult {
  return {
    blockedPublicationCandidate: options.blockedPublicationCandidate ?? null,
    committedSurfacePublication:
      options.committedSurfacePublication ??
      EMPTY_GPU_FLOW_NODE_LAYER_COMMITTED_SURFACE_PUBLICATION,
    kind: "not-rendered",
    visibleProjectionState: null,
  };
}

export function createGpuFlowNodeLayerFrameVisibleProjectionStateResult(
  visibleProjectionState: GpuFlowVisibleProjectionState,
  options: GpuFlowNodeLayerFrameResultOptions = {},
): GpuFlowNodeLayerFrameResult {
  return {
    blockedPublicationCandidate: options.blockedPublicationCandidate ?? null,
    committedSurfacePublication:
      options.committedSurfacePublication ??
      EMPTY_GPU_FLOW_NODE_LAYER_COMMITTED_SURFACE_PUBLICATION,
    kind: "visible-projection-state",
    visibleProjectionState,
  };
}

export function createGpuFlowNodeLayerFrameResultForVisibleProjectionState(
  visibleProjectionState: GpuFlowVisibleProjectionState | null,
  options: GpuFlowNodeLayerFrameResultOptions = {},
): GpuFlowNodeLayerFrameResult {
  if (visibleProjectionState === null) {
    return createGpuFlowNodeLayerFrameNotRenderedResult(options);
  }
  return createGpuFlowNodeLayerFrameVisibleProjectionStateResult(
    visibleProjectionState,
    options,
  );
}
