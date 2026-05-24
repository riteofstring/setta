import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type { GpuFlowContentPreparationFrameResult } from "./visibleFrameContentPlan";
import type { runGpuFlowVisibleFrameCoordinator } from "./visibleFrameCoordinator";
import { createGpuFlowVisibleFrameActorManifestDiagnostics } from "./visibleFrameActorManifestDiagnostics";
import type { GpuFlowVisibleFrameResourceGraphSnapshot } from "./visibleFrameResourceGraph";
import { createGpuFlowVisibleFramePresentationTransactionProofReport } from "./visibleFrameTransactionProofs";

type GpuFlowSurfaceFrameCoordinatorBaseResult = ReturnType<
  typeof runGpuFlowVisibleFrameCoordinator
>;
type GpuFlowSurfaceFrameCoordinatorResult =
  GpuFlowSurfaceFrameCoordinatorBaseResult & {
    readonly preparedFrame: GpuFlowSurfaceFrameCoordinatorBaseResult["preparedFrame"] & {
      readonly contentPreparationFrame: GpuFlowContentPreparationFrameResult;
    };
  };
type GpuFlowSurfaceFrameReducerCompletion = ReturnType<
  GpuFlowSurfaceFrameCoordinatorResult["completeReducerFrame"]
>;
type GpuFlowSurfaceFrameLayerResult = NonNullable<
  GpuFlowContentPreparationFrameResult["nodeLayerFrameStatePresentation"]
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

export function recordGpuFlowSurfacePresentationFrameOutcomeDiagnostic({
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
    __SETTA_GPU_FLOW_PRESENTATION_DEBT_FRAME_REQUESTS__?: unknown[];
  };
  const requests =
    view.__SETTA_GPU_FLOW_PRESENTATION_DEBT_FRAME_REQUESTS__ ?? [];
  const contentFrame = coordinatorResult.preparedFrame.contentPreparationFrame;
  const layerResult =
    contentFrame.nodeLayerFrameStatePresentation?.layerResult ?? null;
  const blockedReasons = getGpuFlowSurfaceFrameBlockedReasons(contentFrame);
  requests.push({
    activeEditorPins:
      coordinatorResult.presentationFrameContext.activeEditorPins,
    actorManifest: createGpuFlowSurfaceFrameActorManifestDiagnostic({
      blockedReasons,
      contentFrame,
      coordinatorResult,
      reducerCompletion,
    }),
    ...createGpuFlowSurfaceFrameDebtRequestDiagnostic(
      reducerCompletion.debtFrameRequest,
    ),
    ...createGpuFlowSurfaceFrameLayerResultDiagnostic(layerResult),
    budgetDecision: createGpuFlowSurfaceFrameBudgetDecisionDiagnostic(
      coordinatorResult.presentationFrameContext.budgetDecision,
    ),
    blockedReasons,
    completionDebt: reducerCompletion.completion.debt,
    completionOutcome: reducerCompletion.completion.outcome,
    contentPresentation:
      createGpuFlowSurfaceFrameContentPresentationDiagnostic(contentFrame),
    frame,
    frameRequest: createGpuFlowSurfaceFrameRequestDiagnostic(
      coordinatorResult.presentationFrameContext.frameRequest,
    ),
    frameReasons: [...frameReasons],
    outcomeKind: coordinatorResult.outcome.kind,
    reducerLane: coordinatorResult.reducerDecision.lane,
    recordedAtMs: performance.now(),
    resourceGraph: createGpuFlowSurfaceFrameResourceGraphDiagnostic(
      postFrameResourceGraphSnapshot,
    ),
    reducerState: coordinatorResult.reducerDecision.reducerState,
    sampleRetainedScrollRevision:
      coordinatorResult.reducerDecision.sample.retainedScrollRevision,
    source: "surface-frame",
    transactionProof:
      createGpuFlowVisibleFramePresentationTransactionProofReport(
        coordinatorResult.preparedFrame.transactionProof,
      ),
  });
  view.__SETTA_GPU_FLOW_PRESENTATION_DEBT_FRAME_REQUESTS__ = requests.slice(-20);
}

function createGpuFlowSurfaceFrameContentPresentationDiagnostic(
  contentFrame: GpuFlowContentPreparationFrameResult,
) {
  const retainedDisplayDiagnostics =
    createGpuFlowSurfaceFrameRetainedDisplayDiagnostic(contentFrame);
  const visibleProjection =
    createGpuFlowSurfaceFrameVisibleProjectionDiagnostic(contentFrame);
  return {
    blockedPreparedContentFrameId: getGpuFlowSurfaceFramePreparedContentFrameId(
      contentFrame.blockedPreparedContentFrame,
    ),
    preparedContentFrameId: getGpuFlowSurfaceFramePreparedContentFrameId(
      contentFrame.preparedContentFrame,
    ),
    heldPreparedContentFrameId: getGpuFlowSurfaceFramePreparedContentFrameId(
      contentFrame.heldPreparedContentFrame,
    ),
    rendered: contentFrame.rendered,
    retainedDisplayFrameId: retainedDisplayDiagnostics.frameId,
    retainedDisplayOutcome: retainedDisplayDiagnostics.outcome,
    retainedDisplayHoldReason: retainedDisplayDiagnostics.holdReason,
    visibleProjectionPreparedContentFrameId:
      visibleProjection.preparedContentFrameId,
    visibleProjectionTransactionKind: visibleProjection.transactionKind,
  };
}

function getGpuFlowSurfaceFramePreparedContentFrameId(
  frame: GpuFlowPreparedContentFrame | null | undefined,
): number | null {
  return frame?.displayFrameId ?? null;
}

function createGpuFlowSurfaceFrameRetainedDisplayDiagnostic(
  contentFrame: GpuFlowContentPreparationFrameResult,
) {
  const retainedDisplayFrame = contentFrame.retainedDisplayFrame;
  return {
    frameId: retainedDisplayFrame?.id ?? null,
    holdReason:
      retainedDisplayFrame?.diagnostics.holdDiagnostics?.holdReason ?? null,
    outcome: retainedDisplayFrame?.diagnostics.transactionOutcome ?? null,
  };
}

function createGpuFlowSurfaceFrameVisibleProjectionDiagnostic(
  contentFrame: GpuFlowContentPreparationFrameResult,
) {
  const visibleProjectionState = contentFrame.visibleProjectionState;
  return {
    preparedContentFrameId:
      visibleProjectionState?.preparedContentFrame.displayFrameId ?? null,
    transactionKind: visibleProjectionState?.transaction.kind ?? null,
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
  contentFrame: GpuFlowSurfaceFrameCoordinatorResult["preparedFrame"]["contentPreparationFrame"],
) {
  return contentFrame.blockedPresentationCandidate?.blockedReasons ?? [];
}

function createGpuFlowSurfaceFrameBudgetDecisionDiagnostic(
  budgetDecision: GpuFlowSurfaceFrameCoordinatorResult["presentationFrameContext"]["budgetDecision"],
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
  frameRequest: GpuFlowSurfaceFrameCoordinatorResult["presentationFrameContext"]["frameRequest"],
) {
  return {
    classifiedDebt: frameRequest.classifiedDebt ?? null,
    contentDebt: frameRequest.contentDebt,
    contentRetryDeferred: frameRequest.contentRetryDeferred,
    criticalContentDebt: frameRequest.criticalContentDebt,
    maintenanceDebt: frameRequest.maintenanceDebt,
    motionDebt: frameRequest.motionDebt,
    motionRetryDeferred: frameRequest.motionRetryDeferred,
    rawReasons: frameRequest.rawReasons,
    reducerState: frameRequest.reducerState,
    retainedScrollInteractionActive:
      frameRequest.retainedScrollInteractionActive ?? null,
    viewportInteractionActive: frameRequest.viewportInteractionActive,
  };
}

function createGpuFlowSurfaceFrameActorManifestDiagnostic({
  blockedReasons,
  contentFrame,
  coordinatorResult,
  reducerCompletion,
}: {
  readonly blockedReasons: ReturnType<typeof getGpuFlowSurfaceFrameBlockedReasons>;
  readonly contentFrame: GpuFlowContentPreparationFrameResult;
  readonly coordinatorResult: GpuFlowSurfaceFrameCoordinatorResult;
  readonly reducerCompletion: GpuFlowSurfaceFrameReducerCompletion;
}) {
  return createGpuFlowVisibleFrameActorManifestDiagnostics({
    blockedReasons,
    frame: selectGpuFlowSurfaceFrameActorManifestFrame({
      contentFrame,
      coordinatorResult,
    }),
    presentationId: getGpuFlowSurfaceFrameOutcomeTransactionId(
      coordinatorResult.outcome,
    ),
    remainingDebt: reducerCompletion.completion.debt,
    visibleOutcome: coordinatorResult.outcome.kind,
  });
}

function selectGpuFlowSurfaceFrameActorManifestFrame({
  contentFrame,
  coordinatorResult,
}: {
  readonly contentFrame: GpuFlowContentPreparationFrameResult;
  readonly coordinatorResult: GpuFlowSurfaceFrameCoordinatorResult;
}): GpuFlowPreparedContentFrame | null {
  return (
    coordinatorResult.preparedFrame.transactionProof?.visibleProjectionState
      ?.preparedContentFrame ??
    contentFrame.visibleProjectionState?.preparedContentFrame ??
    contentFrame.preparedContentFrame ??
    contentFrame.heldPreparedContentFrame ??
    contentFrame.blockedPreparedContentFrame ??
    null
  );
}

function getGpuFlowSurfaceFrameOutcomeTransactionId(
  outcome: GpuFlowSurfaceFrameCoordinatorResult["outcome"],
): string | null {
  return outcome.token.transactionId ?? null;
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
