import type { GpuFrameReason } from "../gpuRenderer";
import type { runGpuFlowVisibleFrameCoordinator } from "./visibleFrameCoordinator";

type GpuFlowSurfaceFrameCoordinatorResult = ReturnType<
  typeof runGpuFlowVisibleFrameCoordinator
>;
type GpuFlowSurfaceFrameSchedulerCompletion = ReturnType<
  GpuFlowSurfaceFrameCoordinatorResult["completeSchedulerFrame"]
>;
type GpuFlowSurfaceFrameLayerResult = NonNullable<
  GpuFlowSurfaceFrameCoordinatorResult["preparedFrame"]["contentPublicationFrame"]["nodeLayerFrameStatePublication"]
>["layerResult"];
type GpuFlowSurfaceFrameDebtRequest =
  GpuFlowSurfaceFrameSchedulerCompletion["debtFrameRequest"];

const EMPTY_LAYER_RESULT_DIAGNOSTIC = {
  drawnNodeIds: [],
  missingTextureNodeIds: [],
  remainingDirtyNodeIds: [],
  uploadDiagnostics: [],
  uploadWorkSummary: null,
  uploadedNodeIds: [],
  visibleNodeIds: [],
} as const;

export function recordGpuFlowSurfacePublicationFrameOutcomeDiagnostic({
  coordinatorResult,
  frame,
  frameReasons,
  schedulerCompletion,
}: {
  readonly coordinatorResult: GpuFlowSurfaceFrameCoordinatorResult;
  readonly frame: number;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly schedulerCompletion: GpuFlowSurfaceFrameSchedulerCompletion;
}): void {
  const view = globalThis as typeof globalThis & {
    __SETTA_GPU_FLOW_PUBLICATION_DEBT_FRAME_REQUESTS__?: unknown[];
  };
  const requests =
    view.__SETTA_GPU_FLOW_PUBLICATION_DEBT_FRAME_REQUESTS__ ?? [];
  const contentFrame = coordinatorResult.preparedFrame.contentPublicationFrame;
  const layerResult =
    contentFrame.nodeLayerFrameStatePublication?.layerResult ?? null;
  requests.push({
    ...createGpuFlowSurfaceFrameDebtRequestDiagnostic(
      schedulerCompletion.debtFrameRequest,
    ),
    ...createGpuFlowSurfaceFrameLayerResultDiagnostic(layerResult),
    blockedReasons: getGpuFlowSurfaceFrameBlockedReasons(contentFrame),
    completionDebt: schedulerCompletion.completion.debt,
    completionOutcome: schedulerCompletion.completion.outcome,
    frame,
    frameReasons: [...frameReasons],
    outcomeKind: coordinatorResult.outcome.kind,
    publicationLane: coordinatorResult.publicationDecision.lane,
    schedulerState: coordinatorResult.publicationDecision.schedulerState,
    source: "surface-frame",
  });
  view.__SETTA_GPU_FLOW_PUBLICATION_DEBT_FRAME_REQUESTS__ =
    requests.slice(-20);
}

function createGpuFlowSurfaceFrameLayerResultDiagnostic(
  layerResult: GpuFlowSurfaceFrameLayerResult | null,
) {
  if (!layerResult) {
    return EMPTY_LAYER_RESULT_DIAGNOSTIC;
  }
  return {
    drawnNodeIds: layerResult.drawnNodeIds,
    missingTextureNodeIds: layerResult.missingTextureNodeIds,
    remainingDirtyNodeIds: layerResult.remainingDirtyNodeIds,
    uploadDiagnostics: layerResult.uploadDiagnostics,
    uploadWorkSummary: layerResult.uploadWorkSummary,
    uploadedNodeIds: layerResult.uploadedNodeIds,
    visibleNodeIds: layerResult.visibleNodeIds,
  };
}

function createGpuFlowSurfaceFrameDebtRequestDiagnostic(
  debtFrameRequest: GpuFlowSurfaceFrameDebtRequest,
) {
  if (!debtFrameRequest) {
    return { delayMs: null, frameReason: null };
  }
  return {
    delayMs: debtFrameRequest.delayMs,
    frameReason: debtFrameRequest.frameReason,
  };
}

function getGpuFlowSurfaceFrameBlockedReasons(
  contentFrame: GpuFlowSurfaceFrameCoordinatorResult["preparedFrame"]["contentPublicationFrame"],
) {
  return contentFrame.blockedPublicationCandidate?.blockedReasons ?? [];
}
