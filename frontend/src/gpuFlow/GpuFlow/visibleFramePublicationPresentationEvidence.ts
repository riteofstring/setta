import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type { GpuFlowNodeLayerFrameStatePublication } from "./flowFrameLifecycle";

export type GpuFlowVisiblePublicationCanvasPresentationEvidence = {
  readonly committedFrameId: number;
  readonly exposable: true;
  readonly prepared: true;
  readonly presentationBatchId: string;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: string;
  readonly source: "deferred-canvas-submission";
};

export type GpuFlowVisiblePublicationPresentationEvidence = {
  readonly canvasGenerationEvidence: GpuFlowVisiblePublicationCanvasPresentationEvidence;
};

export function createGpuFlowVisiblePublicationPresentationEvidence({
  nodeLayerFrameStatePublication,
  visibleProjectionState,
}: {
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuFlowVisiblePublicationPresentationEvidence | null {
  if (
    nodeLayerFrameStatePublication?.layerResult.canvasSubmission === null ||
    nodeLayerFrameStatePublication?.layerResult.canvasSubmission === undefined
  ) {
    return null;
  }
  return Object.freeze({
    canvasGenerationEvidence:
      createGpuFlowVisiblePublicationCanvasPresentationEvidence({
        committedFrame: visibleProjectionState.committedFrame,
        projectionSampleId: visibleProjectionState.sample.id,
        projectionTransactionId: visibleProjectionState.transaction.id,
      }),
  });
}

export function createGpuFlowVisiblePublicationCanvasPresentationEvidence({
  committedFrame,
  projectionSampleId,
  projectionTransactionId,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: string;
}): GpuFlowVisiblePublicationCanvasPresentationEvidence {
  return Object.freeze({
    committedFrameId: committedFrame.displayFrameId,
    exposable: true as const,
    prepared: true as const,
    presentationBatchId: committedFrame.presentationProof.batchId,
    projectionSampleId,
    projectionTransactionId,
    source: "deferred-canvas-submission" as const,
  });
}
