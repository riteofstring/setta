import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type {
  GpuFlowBlockedPreparedContentFrameCandidate,
  GpuFlowPreparedContentFrameCandidateAction,
} from "./visibleFrameActorAdapters/preparedContentFrameCandidateAction";
import type { GpuFlowVisibleFrameBlockedPresentationCandidate } from "./visibleFrameContentPlan";

export type GpuFlowNodeLayerPreparedContentFramePresentationResult = {
  readonly blockedSurfacePresentation: GpuFlowBlockedPreparedContentFrameCandidate | null;
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly heldPreparedContentFrame: GpuFlowPreparedContentFrame | null;
};

const EMPTY_GPU_FLOW_NODE_LAYER_PREPARED_CONTENT_FRAME_PRESENTATION =
  Object.freeze({
    blockedSurfacePresentation: null,
    preparedContentFrame: null,
    heldPreparedContentFrame: null,
  } satisfies GpuFlowNodeLayerPreparedContentFramePresentationResult);

export type GpuFlowNodeLayerFrameResult =
  | {
      readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
      readonly preparedContentFramePresentation: GpuFlowNodeLayerPreparedContentFramePresentationResult;
      readonly kind: "not-rendered";
      readonly visibleProjectionState: null;
    }
  | {
      readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
      readonly preparedContentFramePresentation: GpuFlowNodeLayerPreparedContentFramePresentationResult;
      readonly kind: "visible-projection-state";
      readonly visibleProjectionState: GpuFlowVisibleProjectionState;
    };

type GpuFlowNodeLayerFrameResultOptions = {
  readonly blockedPresentationCandidate?:
    | GpuFlowVisibleFrameBlockedPresentationCandidate
    | null
    | undefined;
  readonly preparedContentFramePresentation?:
    | GpuFlowNodeLayerPreparedContentFramePresentationResult
    | undefined;
};

export function createGpuFlowNodeLayerPreparedContentFramePresentationResult({
  action,
}: {
  readonly action: GpuFlowPreparedContentFrameCandidateAction;
}): GpuFlowNodeLayerPreparedContentFramePresentationResult {
  switch (action.kind) {
    case "blocked-candidate":
      return {
        ...EMPTY_GPU_FLOW_NODE_LAYER_PREPARED_CONTENT_FRAME_PRESENTATION,
        blockedSurfacePresentation: action.blockedSurfacePresentation,
      };
    case "present":
      return {
        ...EMPTY_GPU_FLOW_NODE_LAYER_PREPARED_CONTENT_FRAME_PRESENTATION,
        preparedContentFrame: action.preparedContentFrame,
      };
  }
}

export function createGpuFlowNodeLayerFrameNotRenderedResult(
  options: GpuFlowNodeLayerFrameResultOptions = {},
): GpuFlowNodeLayerFrameResult {
  return {
    blockedPresentationCandidate: options.blockedPresentationCandidate ?? null,
    preparedContentFramePresentation:
      options.preparedContentFramePresentation ??
      EMPTY_GPU_FLOW_NODE_LAYER_PREPARED_CONTENT_FRAME_PRESENTATION,
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
    preparedContentFramePresentation:
      options.preparedContentFramePresentation ??
      EMPTY_GPU_FLOW_NODE_LAYER_PREPARED_CONTENT_FRAME_PRESENTATION,
    kind: "visible-projection-state",
    visibleProjectionState,
  };
}
