import type { GpuFrameReason } from "../gpuRenderer";
import type { runGpuFlowVisibleFrameCoordinator } from "./visibleFrameCoordinator";
import type { GpuFlowVisibleFrameResourceGraphSnapshot } from "./visibleFrameResourceGraph";

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
  postFrameResourceGraphSnapshot,
  schedulerCompletion,
}: {
  readonly coordinatorResult: GpuFlowSurfaceFrameCoordinatorResult;
  readonly frame: number;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly postFrameResourceGraphSnapshot: GpuFlowVisibleFrameResourceGraphSnapshot;
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
    budgetDecision: createGpuFlowSurfaceFrameBudgetDecisionDiagnostic(
      coordinatorResult.publicationFrameContext.budgetDecision,
    ),
    blockedReasons: getGpuFlowSurfaceFrameBlockedReasons(contentFrame),
    completionDebt: schedulerCompletion.completion.debt,
    completionOutcome: schedulerCompletion.completion.outcome,
    frame,
    frameRequest: createGpuFlowSurfaceFrameRequestDiagnostic(
      coordinatorResult.publicationFrameContext.frameRequest,
    ),
    frameReasons: [...frameReasons],
    outcomeKind: coordinatorResult.outcome.kind,
    publicationLane: coordinatorResult.publicationDecision.lane,
    resourceGraph: createGpuFlowSurfaceFrameResourceGraphDiagnostic(
      postFrameResourceGraphSnapshot,
    ),
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

function createGpuFlowSurfaceFrameBudgetDecisionDiagnostic(
  budgetDecision: GpuFlowSurfaceFrameCoordinatorResult["publicationFrameContext"]["budgetDecision"],
) {
  const budget = budgetDecision.preparationBudget;
  return {
    browserVisualRepair: budgetDecision.browserVisualRepair,
    deferredDebtByLane: budget.deferredDebtByLane,
    deferredDebtIds: budget.deferredDebtIds,
    overBudgetDebtIds: budget.overBudgetDebtIds,
    selectedDebtByLane: budget.selectedDebtByLane,
    selectedDebtIds: budget.selectedDebtIds,
    selectedResourceDebtIds: budget.selectedResourceDebtIds,
    selectedVisibleDebtIds: budget.selectedVisibleDebtIds,
    selectedVisibleResourceDebtIds: budget.selectedVisibleResourceDebtIds,
    usedMs: budget.usedMs,
  };
}

function createGpuFlowSurfaceFrameRequestDiagnostic(
  frameRequest: GpuFlowSurfaceFrameCoordinatorResult["publicationFrameContext"]["frameRequest"],
) {
  return {
    contentDebt: frameRequest.contentDebt,
    contentRetryDeferred: frameRequest.contentRetryDeferred,
    criticalContentDebt: frameRequest.criticalContentDebt,
    maintenanceDebt: frameRequest.maintenanceDebt,
    motionDebt: frameRequest.motionDebt,
    motionRetryDeferred: frameRequest.motionRetryDeferred,
    rawReasons: frameRequest.rawReasons,
    schedulerState: frameRequest.schedulerState,
    viewportInteractionActive: frameRequest.viewportInteractionActive,
  };
}

function createGpuFlowSurfaceFrameResourceGraphDiagnostic(
  snapshot: GpuFlowVisibleFrameResourceGraphSnapshot,
) {
  const requestedOrPreparing = snapshot.resourceStates.filter(
    (state) => state.state === "requested" || state.state === "preparing",
  );
  const retiredResourceKeys = snapshot.resourceStates
    .filter((state) => state.state === "retired")
    .map((state) => state.resourceKey);
  return {
    candidateResourceKeys: snapshot.candidateResourceKeys,
    committedFrameId: snapshot.committedFrameId,
    committedResourceKeys: snapshot.committedResourceKeys,
    debtAgeByResourceKey: Object.fromEntries(
      requestedOrPreparing.map((state) => [
        state.resourceKey,
        {
          debtAgeFrames: state.debtAgeFrames,
          deadlineFrame: state.deadlineFrame,
          ownerFrameId: state.ownerFrameId,
          preparationLane: state.preparationLane,
          priority: state.priority,
          state: state.state,
        },
      ]),
    ),
    pendingCandidateFrameIds: snapshot.pendingCandidateFrameIds,
    queuedResourceKeys: snapshot.queuedResourceKeys,
    resourceDebtByState: snapshot.resourceDebtByState,
    retiredResourceKeys,
  };
}
