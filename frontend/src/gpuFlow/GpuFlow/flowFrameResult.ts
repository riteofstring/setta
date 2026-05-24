import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type {
  GpuFlowBlockedPreparedContentFrameCandidate,
  GpuFlowPreparedContentFrameCandidateAction,
} from "./visibleFrameActorAdapters/preparedContentFrameCandidateAction";
import type { GpuFlowVisibleFrameBlockedPresentationCandidate } from "./visibleFrameContentPlan";

export type GpuFlowNodeLayerPreparedContentFramePublicationResult = {
  readonly blockedSurfacePublication: GpuFlowBlockedPreparedContentFrameCandidate | null;
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly heldPreparedContentFrame: GpuFlowPreparedContentFrame | null;
};

const EMPTY_GPU_FLOW_NODE_LAYER_PREPARED_CONTENT_FRAME_PUBLICATION =
  Object.freeze({
    blockedSurfacePublication: null,
    preparedContentFrame: null,
    heldPreparedContentFrame: null,
  } satisfies GpuFlowNodeLayerPreparedContentFramePublicationResult);

export type GpuFlowNodeLayerFrameResult =
  | {
      readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
      readonly preparedContentFramePublication: GpuFlowNodeLayerPreparedContentFramePublicationResult;
      readonly kind: "not-rendered";
      readonly visibleProjectionState: null;
    }
  | {
      readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
      readonly preparedContentFramePublication: GpuFlowNodeLayerPreparedContentFramePublicationResult;
      readonly kind: "visible-projection-state";
      readonly visibleProjectionState: GpuFlowVisibleProjectionState;
    };

type GpuFlowNodeLayerFrameResultOptions = {
  readonly blockedPresentationCandidate?:
    | GpuFlowVisibleFrameBlockedPresentationCandidate
    | null
    | undefined;
  readonly preparedContentFramePublication?:
    | GpuFlowNodeLayerPreparedContentFramePublicationResult
    | undefined;
};

export function createGpuFlowNodeLayerPreparedContentFramePublicationResult({
  action,
}: {
  readonly action: GpuFlowPreparedContentFrameCandidateAction;
}): GpuFlowNodeLayerPreparedContentFramePublicationResult {
  switch (action.kind) {
    case "blocked-candidate":
      return {
        ...EMPTY_GPU_FLOW_NODE_LAYER_PREPARED_CONTENT_FRAME_PUBLICATION,
        blockedSurfacePublication: action.blockedSurfacePublication,
      };
    case "present":
      return {
        ...EMPTY_GPU_FLOW_NODE_LAYER_PREPARED_CONTENT_FRAME_PUBLICATION,
        preparedContentFrame: action.preparedContentFrame,
      };
  }
}

export function createGpuFlowNodeLayerFrameNotRenderedResult(
  options: GpuFlowNodeLayerFrameResultOptions = {},
): GpuFlowNodeLayerFrameResult {
  return {
    blockedPresentationCandidate: options.blockedPresentationCandidate ?? null,
    preparedContentFramePublication:
      options.preparedContentFramePublication ??
      EMPTY_GPU_FLOW_NODE_LAYER_PREPARED_CONTENT_FRAME_PUBLICATION,
    kind: "not-rendered",
    visibleProjectionState: null,
  };
}

export function createGpuFlowNodeLayerFrameVisibleProjectionStateResult(
  visibleProjectionState: GpuFlowVisibleProjectionState,
  options: GpuFlowNodeLayerFrameResultOptions = {},
): GpuFlowNodeLayerFrameResult {
  return {
    blockedPresentationCandidate: options.blockedPresentationCandidate ?? null,
    preparedContentFramePublication:
      options.preparedContentFramePublication ??
      EMPTY_GPU_FLOW_NODE_LAYER_PREPARED_CONTENT_FRAME_PUBLICATION,
    kind: "visible-projection-state",
    visibleProjectionState,
  };
}
