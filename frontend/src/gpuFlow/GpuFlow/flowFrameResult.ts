import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type {
  GpuFlowBlockedCommittedSurfaceCandidate,
  GpuFlowCommittedSurfaceCandidateAction,
} from "./visibleFrameActorAdapters/committedSurfaceCandidateAction";
import type {
  GpuFlowCommittedSurfacePublicationEffect,
  GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "./visibleFramePublicationContentPlan";

export type GpuFlowNodeLayerCommittedSurfacePublicationResult = {
  readonly blockedSurfacePublication: GpuFlowBlockedCommittedSurfaceCandidate | null;
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
  readonly action: GpuFlowCommittedSurfaceCandidateAction;
  readonly effect: GpuFlowCommittedSurfacePublicationEffect;
}): GpuFlowNodeLayerCommittedSurfacePublicationResult {
  switch (action.kind) {
    case "rejected-candidate":
      return {
        ...EMPTY_GPU_FLOW_NODE_LAYER_COMMITTED_SURFACE_PUBLICATION,
        blockedSurfacePublication: action.blockedSurfacePublication,
        committedSurfacePublicationEffect: effect,
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
