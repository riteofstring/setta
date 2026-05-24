import type { RenderHtmlSurfaceFrameResult } from "../htmlSurfaces/frame";
import type {
  GpuFlowProjectionLane,
  GpuFlowProjectionTransactionKind,
} from "../projectionRuntime";

export type GpuFlowMotionProjectionFrameWorkResult = Pick<
  RenderHtmlSurfaceFrameResult,
  | "budgetExhausted"
  | "deferredNodeIds"
  | "evictedTextureBytes"
  | "evictedTextureNodeIds"
  | "missingElementNodeIds"
  | "remainingDirtyNodeIds"
  | "skippedNodeIds"
  | "uploadedNodeIds"
>;

export type GpuFlowMotionProjectionFrameWorkReport = {
  readonly layerResult: GpuFlowMotionProjectionFrameWorkResult;
  readonly projectionLane: GpuFlowProjectionLane;
  readonly transactionKind: GpuFlowProjectionTransactionKind;
};

export type GpuFlowMotionProjectionFrameWithWorkReport = {
  readonly projectionOnlyFrameWork?: GpuFlowMotionProjectionFrameWorkReport | null | undefined;
};
