import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import {
  applyGpuFlowProjectionDebugAttributes,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import {
  presentGpuFlowNodeLayerFrameState,
  submitGpuFlowNodeLayerFrameCanvasSubmission,
  type GpuFlowNodeLayerFrameStatePresentation,
} from "./flowFrameLifecycle";
import {
  createGpuFlowRetainedRuntimeFrameOverlayRenderSignature,
  createGpuFlowRetainedRuntimeFrameSourceRenderSignature,
} from "./flowRetainedRuntimeFrameSignatures";
import { createGpuFlowVisibleOverlayProjectionKey } from "./flowVisibleOverlayProjectionKey";
import { resolveGpuFlowBlockedPreparedContentFramePresentationAbort } from "./visibleFrameAbortPolicy";
import { recordGpuFlowBlockedPresentationGuard } from "./visibleFrameBlockedOutcomeGuard";
import { requestGpuFlowBrowserVisualResourcePreparation } from "./visibleFrameBrowserVisualPreparation";
import { clearGpuFlowBrowserVisualResourceWork } from "./visibleFrameBrowserVisualResourceWork";
import type {
  GpuFlowPreparedContentBlockedCandidateResourceWork,
  GpuFlowVisibleFrameCoordinatorResult,
  GpuFlowVisibleFramePresentationOutcome,
} from "./visibleFrameCoordinator";
import {
  recordGpuFlowBlockedVisibleFramePresentation,
  recordGpuFlowVisibleFrameBlocked,
  recordGpuFlowVisibleFrameHeld,
  recordGpuFlowVisibleFramePresented,
} from "./visibleFrameDiagnostics";
import { postGpuFlowVisibleFramePresentationOutcomeChromeReproEvent } from "./visibleFrameOutcomeChromeRepro";
import { assertGpuFlowSingleVisibleFramePresentationOutcome } from "./visibleFrameOutcomeGuard";
import {
  createGpuFlowSurfaceReducerDebtFrameRequest,
  requestGpuFlowSurfacePresentationFollowUpFrames,
  requestGpuFlowSurfaceReducerDebtFrame,
} from "./visibleFramePresentationDebtRequests";
import {
  assertGpuFlowHoldPreviousTokenForProjectionSample,
  assertGpuFlowVisibleFramePresentationTokenBrand,
  assertGpuFlowVisibleFramePresentationTokenForFrameId,
  assertGpuFlowVisibleFramePresentationTokenForProjectionSample,
  type GpuFlowHoldPreviousToken,
  type GpuFlowVisibleFramePresentationToken,
} from "./visibleFramePresentationProofs";
import type {
  GpuFlowVisibleFrameReducerCompletion,
  GpuFlowVisibleFrameReducerDecision,
} from "./visibleFrameReducerRuntime";
import type {
  GpuFlowSurfacePresentationPreparedFrame,
  RenderGpuFlowSurfaceFrameInput,
} from "./visibleFrameSurfaceFrame";

type GpuFlowBlockedSurfaceVisibleProjectionPresentation = {
  readonly blockedErrorMessage: string | null;
  readonly frame: GpuFlowPreparedContentFrame | null;
};

export type GpuFlowVisibleFramePresentationRuntime = Omit<
  Parameters<typeof presentGpuFlowVisibleFramePresentationFrame>[0],
  "presentationTransaction"
>;

function presentGpuFlowVisibleProjectionState({
  presentationToken,
  visibleProjectionPresentationStateRef,
  visibleProjectionState,
  visibleProjectionStateRef,
}: {
  readonly presentationToken: GpuFlowVisibleFramePresentationToken;
  readonly visibleProjectionPresentationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPresentationStateRef"];
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
}): void {
  if (visibleProjectionState.transaction.kind === "held-previous") {
    throw new Error(
      "GPU Flow presented visible projection state presentation cannot present a held-previous frame.",
    );
  }
  presentVisibleProjectionState({
    token: presentationToken,
    visibleProjectionPresentationStateRef,
    visibleProjectionState,
    visibleProjectionStateRef,
  });
}

function assertGpuFlowHeldPreviousVisibleProjectionState({
  token,
  visibleProjectionState,
}: {
  readonly token: GpuFlowHoldPreviousToken;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): void {
  if (visibleProjectionState.transaction.kind !== "held-previous") {
    throw new Error(
      "GPU Flow held-previous visible projection diagnostics require a held-previous frame.",
    );
  }
  assertGpuFlowHoldPreviousTokenForProjectionSample({
    projectionSampleId: visibleProjectionState.sample.id,
    token,
  });
  if (
    token.preparedContentFrameId !==
    visibleProjectionState.preparedContentFrame.displayFrameId
  ) {
    throw new Error(
      "GPU Flow held-previous visible projection state presentation requires a hold-previous token for the same visible frame.",
    );
  }
}

function presentVisibleProjectionState({
  token,
  visibleProjectionPresentationStateRef,
  visibleProjectionState,
  visibleProjectionStateRef,
}: {
  readonly token: GpuFlowVisibleFramePresentationToken;
  readonly visibleProjectionPresentationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPresentationStateRef"];
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
}): void {
  assertGpuFlowVisibleFramePresentationTokenForFrameId({
    preparedContentFrameId:
      visibleProjectionState.preparedContentFrame.displayFrameId,
    token,
  });
  assertGpuFlowVisibleFramePresentationTokenForProjectionSample({
    projectionSampleId: visibleProjectionState.sample.id,
    token,
  });
  visibleProjectionStateRef.current = visibleProjectionState;
  visibleProjectionPresentationStateRef.current = visibleProjectionState;
}

export function presentGpuFlowVisibleFramePresentationFrame({
  abortPreparedContentFrame,
  callbacksRef,
  presentPreparedContentFrame,
  projectPresentedBrowserVisualActors,
  presentationTransaction,
  presentColdStartShellFrame,
  retainedDisplayFrameRef,
  retainedRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
  runtimeCanvas,
  surfaceRef,
  validatePreparedContentFrame,
  viewportRuntime,
  visibleOverlayProjectionKeyRef,
  visibleProjectionPresentationStateRef,
  visibleProjectionStateRef,
}: {
  readonly abortPreparedContentFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedContentFrame"];
  readonly callbacksRef: RenderGpuFlowSurfaceFrameInput["callbacksRef"];
  readonly presentPreparedContentFrame: RenderGpuFlowSurfaceFrameInput["presentPreparedContentFrame"];
  readonly projectPresentedBrowserVisualActors: RenderGpuFlowSurfaceFrameInput["projectPresentedBrowserVisualActors"];
  readonly presentationTransaction: GpuFlowVisibleFrameCoordinatorResult<GpuFlowSurfacePresentationPreparedFrame>;
  readonly presentColdStartShellFrame: RenderGpuFlowSurfaceFrameInput["presentColdStartShellFrame"];
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly retainedRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
  readonly validatePreparedContentFrame: RenderGpuFlowSurfaceFrameInput["validatePreparedContentFrame"];
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly visibleOverlayProjectionKeyRef: RenderGpuFlowSurfaceFrameInput["visibleOverlayProjectionKeyRef"];
  readonly visibleProjectionPresentationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPresentationStateRef"];
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
}) {
  const {
    followUpFrameRequests,
    heldPreviousVisibleProjectionState,
    outcome,
    preparedFrame: {
      contentPreparationFrame: {
        blockedErrorMessage,
        blockedPreparedContentFrame,
        blockedPreparedContentFrameResourceWork,
        blockedPreservePreparationSnapshot,
        preparedContentFrame,
        heldPreparedContentFrame,
        nodeLayerFrameStatePresentation: contentNodeLayerFrameStatePresentation,
        retainedDisplayFrame,
        retainedRuntimeFrame,
      },
      motionProjectionFrame: {
        nodeLayerFrameStatePresentation: motionNodeLayerFrameStatePresentation,
      },
      visibleProjectionState: selectedVisibleProjectionState,
    },
    reducerDecision,
    presentationFrameContext,
  } = presentationTransaction;
  const browserVisualPreparationResourceKeys =
    presentationFrameContext?.budgetDecision.preparationBudget
      .selectedResourceDebtIds ?? [];
  const browserVisualRepairSelected =
    presentationFrameContext?.budgetDecision.browserVisualRepair?.eligible ??
    false;
  const nodeLayerFrameStatePresentation =
    contentNodeLayerFrameStatePresentation ??
    motionNodeLayerFrameStatePresentation;
  assertGpuFlowSingleVisibleFramePresentationOutcome({
    outcome,
    reducerDecision,
    surface: surfaceRef.current,
  });
  const blockedVisibleFramePresentation =
    applyGpuFlowSurfaceVisibleProjectionOutcome({
      abortPreparedContentFrame,
      callbacksRef,
      preparedContentFrame,
      presentPreparedContentFrame,
      blockedErrorMessage,
      blockedPreparedContentFrame,
      blockedPreparedContentFrameResourceWork,
      blockedPreservePreparationSnapshot,
      browserVisualRepairSelected,
      browserVisualPreparationResourceKeys,
      heldPreparedContentFrame,
      heldPreviousVisibleProjectionState,
      nodeLayerFrameStatePresentation,
      outcome,
      projectPresentedBrowserVisualActors,
      retainedDisplayFrame,
      retainedDisplayFrameRef,
      retainedRuntimeFrame,
      retainedRuntimeFrameRenderSignatureRef,
      retainedRuntimeFrameSourceRenderSignatureRef,
      runtimeCanvas,
      selectedVisibleProjectionState,
      surfaceRef,
      validatePreparedContentFrame,
      viewportRuntime,
      visibleOverlayProjectionKeyRef,
      visibleProjectionPresentationStateRef,
      visibleProjectionStateRef,
    });
  presentGpuFlowColdStartShellFrame({
    outcome,
    presentColdStartShellFrame,
  });
  const reducerFrameCompletion = presentationTransaction.completeReducerFrame();
  const { completion } = reducerFrameCompletion;
  const debtFrameRequest = createGpuFlowSurfaceReducerDebtFrameRequest({
    activeEditorActivationPending:
      presentationFrameContext.activeEditorPins.length > 0 ||
      hasGpuFlowActiveEditorActivationPendingFrame([
        blockedPreparedContentFrame,
        preparedContentFrame,
        heldPreparedContentFrame,
        selectedVisibleProjectionState?.preparedContentFrame ?? null,
      ]),
    completion,
    debtFrameRequest: reducerFrameCompletion.debtFrameRequest,
    reducerDecision,
  });
  recordGpuFlowBlockedSurfaceVisibleProjectionPresentation({
    blockedVisibleFramePresentation,
    completion,
    outcome,
    reducerDecision,
    runtimeCanvas,
    stateMachineOutcome:
      presentationTransaction.preparedFrame.transactionProof
        ?.visibleFrameStateMachineOutcome ?? null,
  });
  postGpuFlowVisibleFramePresentationOutcomeChromeReproEvent({
    completion,
    outcome,
    reducerDecision,
    previousContentFrameId: presentationTransaction.previousContentFrameId,
    transactionProof: presentationTransaction.preparedFrame.transactionProof,
    visibleProjectionState:
      selectedVisibleProjectionState ?? heldPreviousVisibleProjectionState,
  });
  recordGpuFlowBlockedPresentationGuard({
    outcome,
    reducerDecision,
    surface: surfaceRef.current,
  });
  requestGpuFlowSurfacePresentationFollowUpFrames({
    debtFrameRequest,
    followUpFrameRequests,
    surfaceRef,
  });
  requestGpuFlowSurfaceReducerDebtFrame({
    debtFrameRequest,
    completion,
    outcome,
    reducerDecision,
    surfaceRef,
  });
  if (blockedVisibleFramePresentation?.blockedErrorMessage) {
    throw new Error(blockedVisibleFramePresentation.blockedErrorMessage);
  }
}

function hasGpuFlowActiveEditorActivationPendingFrame(
  frames: readonly (GpuFlowPreparedContentFrame | null)[],
): boolean {
  return frames.some((frame) =>
    frame?.actorGenerations.some((actor) =>
      Boolean(
        actor.active ||
          actor.browserVisual?.representationKind === "active-editor" ||
          actor.textCoverageProof?.pointerSemantics === "active-browser-editor",
      ),
    ),
  );
}

function recordGpuFlowBlockedSurfaceVisibleProjectionPresentation({
  blockedVisibleFramePresentation,
  completion,
  outcome,
  reducerDecision,
  runtimeCanvas,
  stateMachineOutcome,
}: {
  readonly blockedVisibleFramePresentation: GpuFlowBlockedSurfaceVisibleProjectionPresentation | null;
  readonly completion: GpuFlowVisibleFrameReducerCompletion;
  readonly outcome: GpuFlowVisibleFramePresentationOutcome;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly stateMachineOutcome:
    | GpuFlowSurfacePresentationPreparedFrame["transactionProof"]["visibleFrameStateMachineOutcome"]
    | null;
}): void {
  if (blockedVisibleFramePresentation === null) {
    return;
  }
  if (outcome.kind !== "blocked") {
    throw new Error(
      "GPU Flow blocked visible frame presentation recording requires a blocked visible frame presentation outcome.",
    );
  }
  recordGpuFlowBlockedVisibleFramePresentation({
    frame: blockedVisibleFramePresentation.frame,
    presentationCompletion: completion,
    reducerDecision,
    runtimeCanvas,
    stateMachineOutcome:
      stateMachineOutcome === null
        ? null
        : {
            decidingProof: stateMachineOutcome.decidingProof,
            kind: stateMachineOutcome.kind,
          },
    token: outcome.token,
  });
}

function presentGpuFlowColdStartShellFrame({
  outcome,
  presentColdStartShellFrame,
}: {
  readonly outcome: GpuFlowVisibleFramePresentationOutcome;
  readonly presentColdStartShellFrame: RenderGpuFlowSurfaceFrameInput["presentColdStartShellFrame"];
}): void {
  if (outcome.kind !== "present") {
    return;
  }
  presentColdStartShellFrame({
    frame: null,
    token: outcome.token,
  });
}

function applyGpuFlowSurfaceVisibleProjectionOutcome({
  abortPreparedContentFrame,
  blockedErrorMessage,
  blockedPreparedContentFrame,
  blockedPreparedContentFrameResourceWork,
  blockedPreservePreparationSnapshot,
  browserVisualPreparationResourceKeys,
  browserVisualRepairSelected,
  callbacksRef,
  preparedContentFrame,
  presentPreparedContentFrame,
  heldPreparedContentFrame,
  heldPreviousVisibleProjectionState,
  nodeLayerFrameStatePresentation,
  outcome,
  projectPresentedBrowserVisualActors,
  retainedDisplayFrame,
  retainedDisplayFrameRef,
  retainedRuntimeFrame,
  retainedRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
  runtimeCanvas,
  selectedVisibleProjectionState,
  surfaceRef,
  validatePreparedContentFrame,
  viewportRuntime,
  visibleOverlayProjectionKeyRef,
  visibleProjectionPresentationStateRef,
  visibleProjectionStateRef,
}: {
  readonly abortPreparedContentFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedContentFrame"];
  readonly callbacksRef: RenderGpuFlowSurfaceFrameInput["callbacksRef"];
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly presentPreparedContentFrame: RenderGpuFlowSurfaceFrameInput["presentPreparedContentFrame"];
  readonly blockedErrorMessage: string | null;
  readonly blockedPreparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly blockedPreparedContentFrameResourceWork: GpuFlowPreparedContentBlockedCandidateResourceWork | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly browserVisualPreparationResourceKeys: readonly string[];
  readonly browserVisualRepairSelected: boolean;
  readonly heldPreparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly heldPreviousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly nodeLayerFrameStatePresentation: GpuFlowNodeLayerFrameStatePresentation | null;
  readonly outcome: GpuFlowVisibleFramePresentationOutcome;
  readonly projectPresentedBrowserVisualActors: RenderGpuFlowSurfaceFrameInput["projectPresentedBrowserVisualActors"];
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly retainedRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
  readonly validatePreparedContentFrame: RenderGpuFlowSurfaceFrameInput["validatePreparedContentFrame"];
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly visibleOverlayProjectionKeyRef: RenderGpuFlowSurfaceFrameInput["visibleOverlayProjectionKeyRef"];
  readonly visibleProjectionPresentationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPresentationStateRef"];
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
}): GpuFlowBlockedSurfaceVisibleProjectionPresentation | null {
  switch (outcome.kind) {
    case "present":
      presentGpuFlowSurfaceVisibleProjectionState({
        callbacksRef,
        preparedContentFrame,
        presentPreparedContentFrame,
        nodeLayerFrameStatePresentation,
        outcome,
        projectPresentedBrowserVisualActors,
        retainedDisplayFrame,
        retainedDisplayFrameRef,
        retainedRuntimeFrame,
        retainedRuntimeFrameRenderSignatureRef,
        retainedRuntimeFrameSourceRenderSignatureRef,
        runtimeCanvas,
        selectedVisibleProjectionState,
        validatePreparedContentFrame,
        viewportRuntime,
        visibleOverlayProjectionKeyRef,
        visibleProjectionPresentationStateRef,
        visibleProjectionStateRef,
      });
      return null;
    case "hold-previous":
      completeGpuFlowHeldPreviousSurfaceVisibleProjectionOutcome({
        abortPreparedContentFrame,
        blockedPreparedContentFrame,
        blockedPreparedContentFrameResourceWork,
        browserVisualPreparationResourceKeys,
        browserVisualRepairSelected,
        preparedContentFrame,
        heldPreparedContentFrame,
        heldPreviousVisibleProjectionState,
        outcome,
        runtimeCanvas,
        selectedVisibleProjectionState,
        surfaceRef,
      });
      return null;
    case "blocked":
      return completeGpuFlowBlockedSurfaceVisibleProjectionOutcome({
        abortPreparedContentFrame,
        blockedErrorMessage,
        blockedPreparedContentFrame,
        blockedPreparedContentFrameResourceWork,
        blockedPreservePreparationSnapshot,
        browserVisualPreparationResourceKeys,
        browserVisualRepairSelected,
        preparedContentFrame,
        heldPreparedContentFrame,
        outcome,
        runtimeCanvas,
        selectedVisibleProjectionState,
        surfaceRef,
      });
  }
}

function completeGpuFlowHeldPreviousSurfaceVisibleProjectionOutcome({
  abortPreparedContentFrame,
  blockedPreparedContentFrame,
  blockedPreparedContentFrameResourceWork,
  browserVisualPreparationResourceKeys,
  browserVisualRepairSelected,
  preparedContentFrame,
  heldPreparedContentFrame,
  heldPreviousVisibleProjectionState,
  outcome,
  runtimeCanvas,
  selectedVisibleProjectionState,
  surfaceRef,
}: {
  readonly abortPreparedContentFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedContentFrame"];
  readonly blockedPreparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly blockedPreparedContentFrameResourceWork: GpuFlowPreparedContentBlockedCandidateResourceWork | null;
  readonly browserVisualPreparationResourceKeys: readonly string[];
  readonly browserVisualRepairSelected: boolean;
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly heldPreparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly heldPreviousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly outcome: Extract<
    GpuFlowVisibleFramePresentationOutcome,
    { readonly kind: "hold-previous" }
  >;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
}): void {
  const heldFrame =
    heldPreparedContentFrame ??
    blockedPreparedContentFrame ??
    preparedContentFrame;
  completeGpuFlowHeldPreviousSurfaceVisibleProjectionState({
    abortPreparedContentFrame,
    heldPreparedContentFrame: heldFrame,
    heldPreparedContentFrameResourceWork:
      heldFrame !== null && heldFrame === blockedPreparedContentFrame
        ? blockedPreparedContentFrameResourceWork
        : null,
    browserVisualPreparationResourceKeys,
    browserVisualRepairSelected,
    heldPreviousVisibleProjectionState,
    outcome,
    runtimeCanvas,
    selectedVisibleProjectionState,
    surfaceRef,
  });
}

function completeGpuFlowBlockedSurfaceVisibleProjectionOutcome({
  abortPreparedContentFrame,
  blockedErrorMessage,
  blockedPreparedContentFrame,
  blockedPreparedContentFrameResourceWork,
  blockedPreservePreparationSnapshot,
  browserVisualPreparationResourceKeys,
  browserVisualRepairSelected,
  preparedContentFrame,
  heldPreparedContentFrame,
  outcome,
  runtimeCanvas,
  selectedVisibleProjectionState,
  surfaceRef,
}: {
  readonly abortPreparedContentFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedContentFrame"];
  readonly blockedErrorMessage: string | null;
  readonly blockedPreparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly blockedPreparedContentFrameResourceWork: GpuFlowPreparedContentBlockedCandidateResourceWork | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly browserVisualPreparationResourceKeys: readonly string[];
  readonly browserVisualRepairSelected: boolean;
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly heldPreparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly outcome: Extract<
    GpuFlowVisibleFramePresentationOutcome,
    { readonly kind: "blocked" }
  >;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
}): GpuFlowBlockedSurfaceVisibleProjectionPresentation {
  const blockedPreparedContentAbort =
    resolveGpuFlowBlockedPreparedContentFramePresentationAbort({
      blockedPreparedContentFrame,
      blockedPreservePreparationSnapshot,
      preparedContentFrame,
      heldPreparedContentFrame,
      selectedVisibleProjectionState,
    });
  completeGpuFlowBlockedSurfaceVisibleProjectionState({
    abortPreparedContentFrame,
    blockedPreparedContentFrame: blockedPreparedContentAbort.frame,
    blockedPreparedContentFrameResourceWork:
      blockedPreparedContentAbort.frame !== null &&
      blockedPreparedContentAbort.frame === blockedPreparedContentFrame
        ? blockedPreparedContentFrameResourceWork
        : null,
    blockedPreservePreparationSnapshot:
      blockedPreparedContentAbort.preservePreparationSnapshot,
    browserVisualPreparationResourceKeys,
    browserVisualRepairSelected,
    outcome,
    runtimeCanvas,
    surfaceRef,
  });
  return Object.freeze({
    blockedErrorMessage,
    frame: blockedPreparedContentAbort.frame,
  });
}

function presentGpuFlowSurfaceVisibleProjectionState({
  callbacksRef,
  preparedContentFrame,
  presentPreparedContentFrame,
  nodeLayerFrameStatePresentation,
  outcome,
  projectPresentedBrowserVisualActors,
  retainedDisplayFrame,
  retainedDisplayFrameRef,
  retainedRuntimeFrame,
  retainedRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
  runtimeCanvas,
  selectedVisibleProjectionState,
  validatePreparedContentFrame,
  viewportRuntime,
  visibleOverlayProjectionKeyRef,
  visibleProjectionPresentationStateRef,
  visibleProjectionStateRef,
}: {
  readonly callbacksRef: RenderGpuFlowSurfaceFrameInput["callbacksRef"];
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly presentPreparedContentFrame: RenderGpuFlowSurfaceFrameInput["presentPreparedContentFrame"];
  readonly nodeLayerFrameStatePresentation: GpuFlowNodeLayerFrameStatePresentation | null;
  readonly outcome: Extract<
    GpuFlowVisibleFramePresentationOutcome,
    { readonly kind: "present" }
  >;
  readonly projectPresentedBrowserVisualActors: RenderGpuFlowSurfaceFrameInput["projectPresentedBrowserVisualActors"];
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly retainedRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly validatePreparedContentFrame: RenderGpuFlowSurfaceFrameInput["validatePreparedContentFrame"];
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly visibleOverlayProjectionKeyRef: RenderGpuFlowSurfaceFrameInput["visibleOverlayProjectionKeyRef"];
  readonly visibleProjectionPresentationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPresentationStateRef"];
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
}): void {
  if (!selectedVisibleProjectionState) {
    throw new Error(
      "GPU Flow visible presentation requires selected visible projection state.",
    );
  }
  if (
    selectedVisibleProjectionState.transaction.kind === "prepared-content" &&
    !preparedContentFrame
  ) {
    throw new Error(
      "GPU Flow content presentation requires the prepared content frame.",
    );
  }
  if (preparedContentFrame) {
    validatePreparedContentFrame(outcome.token, preparedContentFrame);
  }
  const submittedNodeLayerFrameStatePresentation =
    submitGpuFlowNodeLayerFrameCanvasSubmission({
      nodeLayerFrameStatePresentation,
      token: outcome.token,
    });
  if (preparedContentFrame) {
    presentPreparedContentFrame(outcome.token, preparedContentFrame);
  }
  presentGpuFlowRetainedDisplayFrame({
    retainedDisplayFrame,
    retainedDisplayFrameRef,
    token: outcome.token,
  });
  recordGpuFlowVisibleFramePresented({
    preparedContentFrame,
    runtimeCanvas,
    token: outcome.token,
  });
  if (preparedContentFrame !== null) {
    clearGpuFlowBrowserVisualResourceWork(runtimeCanvas);
  }
  applyGpuFlowProjectionDebugAttributes({
    canvas: runtimeCanvas,
    debugState: selectedVisibleProjectionState.debugState,
    token: outcome.token,
  });
  projectPresentedBrowserVisualActors(
    outcome.token,
    selectedVisibleProjectionState.sample.viewport,
  );
  presentGpuFlowVisibleProjectionState({
    presentationToken: outcome.token,
    visibleProjectionPresentationStateRef,
    visibleProjectionState: selectedVisibleProjectionState,
    visibleProjectionStateRef,
  });
  presentGpuFlowVisibleOverlayProjectionTransform({
    token: outcome.token,
    viewportRuntime,
    visibleOverlayProjectionKeyRef,
    visibleProjectionState: selectedVisibleProjectionState,
  });
  presentPreparedGpuFlowNodeLayerFrameState({
    nodeLayerFrameStatePresentation: submittedNodeLayerFrameStatePresentation,
    token: outcome.token,
  });
  presentGpuFlowRetainedRuntimeFrame({
    callbacksRef,
    retainedRuntimeFrame,
    retainedRuntimeFrameRenderSignatureRef,
    retainedRuntimeFrameSourceRenderSignatureRef,
    token: outcome.token,
  });
}

function completeGpuFlowHeldPreviousSurfaceVisibleProjectionState({
  abortPreparedContentFrame,
  browserVisualPreparationResourceKeys,
  browserVisualRepairSelected,
  heldPreparedContentFrame,
  heldPreparedContentFrameResourceWork,
  heldPreviousVisibleProjectionState,
  outcome,
  runtimeCanvas,
  selectedVisibleProjectionState,
  surfaceRef,
}: {
  readonly abortPreparedContentFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedContentFrame"];
  readonly browserVisualPreparationResourceKeys: readonly string[];
  readonly browserVisualRepairSelected: boolean;
  readonly heldPreparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly heldPreparedContentFrameResourceWork: GpuFlowPreparedContentBlockedCandidateResourceWork | null;
  readonly heldPreviousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly outcome: Extract<
    GpuFlowVisibleFramePresentationOutcome,
    { readonly kind: "hold-previous" }
  >;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
}): void {
  recordGpuFlowVisibleFrameHeld({
    candidateFrame: heldPreparedContentFrame,
    runtimeCanvas,
    token: outcome.token,
  });
  if (heldPreparedContentFrame) {
    abortPreparedContentFrame(outcome.token, heldPreparedContentFrame, {
      browserVisualPreparationResourceKeys,
      preservePreparationSnapshot: true,
    });
  }
  requestGpuFlowBrowserVisualResourcePreparation({
    budgetSelectedResourceKeys: browserVisualPreparationResourceKeys,
    browserVisualRepairSelected,
    candidateFrame: heldPreparedContentFrame,
    candidateResourceWork: heldPreparedContentFrameResourceWork,
    outcome: "held-previous",
    runtimeCanvas,
    surfaceRef,
  });
  const visibleProjectionState =
    selectedVisibleProjectionState ?? heldPreviousVisibleProjectionState;
  if (!visibleProjectionState) {
    throw new Error(
      "GPU Flow held-previous presentation requires a selected or coordinator-proven held visible projection state.",
    );
  }
  assertGpuFlowHeldPreviousVisibleProjectionState({
    token: outcome.token,
    visibleProjectionState,
  });
}

function presentPreparedGpuFlowNodeLayerFrameState(presentation: {
  readonly nodeLayerFrameStatePresentation: GpuFlowNodeLayerFrameStatePresentation | null;
  readonly token: GpuFlowVisibleFramePresentationToken;
}): void {
  const { nodeLayerFrameStatePresentation, token } = presentation;
  if (nodeLayerFrameStatePresentation === null) {
    return;
  }
  presentGpuFlowNodeLayerFrameState({
    ...nodeLayerFrameStatePresentation,
    token,
  });
}

function presentGpuFlowVisibleOverlayProjectionTransform({
  token,
  viewportRuntime,
  visibleOverlayProjectionKeyRef,
  visibleProjectionState,
}: {
  readonly token: GpuFlowVisibleFramePresentationToken;
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly visibleOverlayProjectionKeyRef: RenderGpuFlowSurfaceFrameInput["visibleOverlayProjectionKeyRef"];
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): void {
  assertGpuFlowVisibleFramePresentationTokenBrand({ token });
  const overlayProjectionKey = createGpuFlowVisibleOverlayProjectionKey(
    visibleProjectionState,
  );
  if (visibleOverlayProjectionKeyRef.current === overlayProjectionKey) {
    return;
  }
  visibleOverlayProjectionKeyRef.current = overlayProjectionKey;
  viewportRuntime.applyOverlayTransforms(
    visibleProjectionState.sample.viewport,
  );
}

function presentGpuFlowRetainedDisplayFrame(presentation: {
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly token: GpuFlowVisibleFramePresentationToken;
}): void {
  const { retainedDisplayFrame, retainedDisplayFrameRef, token } = presentation;
  assertGpuFlowVisibleFramePresentationTokenBrand({ token });
  if (retainedDisplayFrame === null) {
    return;
  }
  retainedDisplayFrameRef.current = retainedDisplayFrame;
}

function completeGpuFlowBlockedSurfaceVisibleProjectionState({
  abortPreparedContentFrame,
  blockedPreparedContentFrame,
  blockedPreparedContentFrameResourceWork,
  blockedPreservePreparationSnapshot,
  browserVisualPreparationResourceKeys,
  browserVisualRepairSelected,
  outcome,
  runtimeCanvas,
  surfaceRef,
}: {
  readonly abortPreparedContentFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedContentFrame"];
  readonly blockedPreparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly blockedPreparedContentFrameResourceWork: GpuFlowPreparedContentBlockedCandidateResourceWork | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly browserVisualPreparationResourceKeys: readonly string[];
  readonly browserVisualRepairSelected: boolean;
  readonly outcome: Extract<
    GpuFlowVisibleFramePresentationOutcome,
    { readonly kind: "blocked" }
  >;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
}): void {
  const browserVisualStagingResourceKeys =
    createGpuFlowBrowserVisualStagingResourceKeys({
      budgetSelectedResourceKeys: browserVisualPreparationResourceKeys,
      candidateResourceWork: blockedPreparedContentFrameResourceWork,
    });
  if (blockedPreparedContentFrame) {
    abortPreparedContentFrame(outcome.token, blockedPreparedContentFrame, {
      browserVisualPreparationResourceKeys: browserVisualStagingResourceKeys,
      preservePreparationSnapshot: blockedPreservePreparationSnapshot,
    });
  }
  recordGpuFlowVisibleFrameBlocked({
    candidateFrame: blockedPreparedContentFrame,
    runtimeCanvas,
    token: outcome.token,
  });
  requestGpuFlowBrowserVisualResourcePreparation({
    budgetSelectedResourceKeys: browserVisualPreparationResourceKeys,
    browserVisualRepairSelected,
    candidateFrame: blockedPreparedContentFrame,
    candidateResourceWork: blockedPreparedContentFrameResourceWork,
    outcome: "blocked",
    runtimeCanvas,
    surfaceRef,
  });
}

function createGpuFlowBrowserVisualStagingResourceKeys({
  budgetSelectedResourceKeys,
  candidateResourceWork,
}: {
  readonly budgetSelectedResourceKeys: readonly string[];
  readonly candidateResourceWork: GpuFlowPreparedContentBlockedCandidateResourceWork | null;
}): readonly string[] {
  if (budgetSelectedResourceKeys.length > 0 || candidateResourceWork === null) {
    return budgetSelectedResourceKeys;
  }
  return Object.freeze(
    candidateResourceWork.workItems.map((item) => item.candidateResourceKey),
  );
}

function presentGpuFlowRetainedRuntimeFrame({
  callbacksRef,
  retainedRuntimeFrame,
  retainedRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
  token,
}: {
  readonly callbacksRef: RenderGpuFlowSurfaceFrameInput["callbacksRef"];
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly retainedRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
  readonly token: GpuFlowVisibleFramePresentationToken;
}): void {
  assertGpuFlowVisibleFramePresentationTokenBrand({ token });
  if (retainedRuntimeFrame === null) {
    return;
  }
  callbacksRef.current.onRetainedRuntimeFrame?.(retainedRuntimeFrame);
  retainedRuntimeFrameSourceRenderSignatureRef.current =
    createGpuFlowRetainedRuntimeFrameSourceRenderSignature(
      retainedRuntimeFrame,
    );
  const nextSignature =
    createGpuFlowRetainedRuntimeFrameOverlayRenderSignature(
      retainedRuntimeFrame,
    );
  if (retainedRuntimeFrameRenderSignatureRef.current === nextSignature) {
    return;
  }
  retainedRuntimeFrameRenderSignatureRef.current = nextSignature;
}
