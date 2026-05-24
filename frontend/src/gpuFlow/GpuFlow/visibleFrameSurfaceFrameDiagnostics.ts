import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuFlowContentPublicationFrameResult } from "./visibleFrameContentPlan";
import type { runGpuFlowVisibleFrameCoordinator } from "./visibleFrameCoordinator";
import type { GpuFlowVisibleFrameResourceGraphSnapshot } from "./visibleFrameResourceGraph";
import { createGpuFlowVisiblePublicationTransactionProofReport } from "./visibleFrameTransactionProofs";

type GpuFlowSurfaceFrameCoordinatorBaseResult = ReturnType<
  typeof runGpuFlowVisibleFrameCoordinator
>;
type GpuFlowSurfaceFrameCoordinatorResult =
  GpuFlowSurfaceFrameCoordinatorBaseResult & {
    readonly preparedFrame: GpuFlowSurfaceFrameCoordinatorBaseResult["preparedFrame"] & {
      readonly contentPublicationFrame: GpuFlowContentPublicationFrameResult;
    };
  };
type GpuFlowSurfaceFrameReducerCompletion = ReturnType<
  GpuFlowSurfaceFrameCoordinatorResult["completeReducerFrame"]
>;
type GpuFlowSurfaceFrameLayerResult = NonNullable<
  GpuFlowContentPublicationFrameResult["nodeLayerFrameStatePublication"]
>["layerResult"];
type GpuFlowSurfaceFrameDebtRequest =
  GpuFlowSurfaceFrameReducerCompletion["debtFrameRequest"];

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
  reducerCompletion,
}: {
  readonly coordinatorResult: GpuFlowSurfaceFrameCoordinatorResult;
  readonly frame: number;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly postFrameResourceGraphSnapshot: GpuFlowVisibleFrameResourceGraphSnapshot;
  readonly reducerCompletion: GpuFlowSurfaceFrameReducerCompletion;
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
    activeEditorPins:
      coordinatorResult.publicationFrameContext.activeEditorPins,
    ...createGpuFlowSurfaceFrameDebtRequestDiagnostic(
      reducerCompletion.debtFrameRequest,
    ),
    ...createGpuFlowSurfaceFrameLayerResultDiagnostic(layerResult),
    budgetDecision: createGpuFlowSurfaceFrameBudgetDecisionDiagnostic(
      coordinatorResult.publicationFrameContext.budgetDecision,
    ),
    blockedReasons: getGpuFlowSurfaceFrameBlockedReasons(contentFrame),
    completionDebt: reducerCompletion.completion.debt,
    completionOutcome: reducerCompletion.completion.outcome,
    contentPublication:
      createGpuFlowSurfaceFrameContentPublicationDiagnostic(contentFrame),
    frame,
    frameRequest: createGpuFlowSurfaceFrameRequestDiagnostic(
      coordinatorResult.publicationFrameContext.frameRequest,
    ),
    frameReasons: [...frameReasons],
    outcomeKind: coordinatorResult.outcome.kind,
    publicationLane: coordinatorResult.reducerDecision.lane,
    recordedAtMs: performance.now(),
    resourceGraph: createGpuFlowSurfaceFrameResourceGraphDiagnostic(
      postFrameResourceGraphSnapshot,
    ),
    reducerState: coordinatorResult.reducerDecision.reducerState,
    sampleRetainedScrollRevision:
      coordinatorResult.reducerDecision.sample.retainedScrollRevision,
    source: "surface-frame",
    transactionProof: createGpuFlowVisiblePublicationTransactionProofReport(
      coordinatorResult.preparedFrame.transactionProof,
    ),
  });
  view.__SETTA_GPU_FLOW_PUBLICATION_DEBT_FRAME_REQUESTS__ = requests.slice(-20);
}

function createGpuFlowSurfaceFrameContentPublicationDiagnostic(
  contentFrame: GpuFlowContentPublicationFrameResult,
) {
  return {
    blockedPreparedContentFrameId:
      contentFrame.blockedPreparedContentFrame?.displayFrameId ?? null,
    preparedContentFrameId:
      contentFrame.preparedContentFrame?.displayFrameId ?? null,
    heldPreparedContentFrameId:
      contentFrame.heldPreparedContentFrame?.displayFrameId ?? null,
    rendered: contentFrame.rendered,
    retainedDisplayFrameId: contentFrame.retainedDisplayFrame?.id ?? null,
    retainedDisplayOutcome:
      contentFrame.retainedDisplayFrame?.diagnostics.transactionOutcome ?? null,
    retainedDisplayHoldReason:
      contentFrame.retainedDisplayFrame?.diagnostics.holdDiagnostics
        ?.holdReason ?? null,
    visibleProjectionCommittedFrameId:
      contentFrame.visibleProjectionState?.committedFrame.displayFrameId ??
      null,
    visibleProjectionTransactionKind:
      contentFrame.visibleProjectionState?.transaction.kind ?? null,
  };
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
    reducerState: frameRequest.reducerState,
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
    actorResourceKeys: snapshot.actorResourceKeys ?? [],
    candidateResourceKeys: snapshot.candidateResourceKeys,
    presentedFrameId: snapshot.presentedFrameId,
    presentedResourceKeys: snapshot.presentedResourceKeys,
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
