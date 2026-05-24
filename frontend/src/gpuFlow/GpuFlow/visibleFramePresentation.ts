import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import {
  applyGpuFlowProjectionDebugAttributes,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import {
  publishGpuFlowNodeLayerFrameState,
  submitGpuFlowNodeLayerFrameCanvasSubmission,
  type GpuFlowNodeLayerFrameStatePublication,
} from "./flowFrameLifecycle";
import {
  createGpuFlowRetainedRuntimeFrameOverlayRenderSignature,
  createGpuFlowRetainedRuntimeFrameSourceRenderSignature,
} from "./flowRetainedRuntimeFrameSignatures";
import { createGpuFlowVisibleOverlayProjectionKey } from "./flowVisibleOverlayProjectionKey";
import { resolveGpuFlowBlockedPreparedContentFramePublicationAbort } from "./visibleFrameAbortPolicy";
import { recordGpuFlowBlockedPublicationGuard } from "./visibleFrameBlockedOutcomeGuard";
import { requestGpuFlowBrowserVisualResourcePreparation } from "./visibleFrameBrowserVisualPreparation";
import { clearGpuFlowBrowserVisualResourceWork } from "./visibleFrameBrowserVisualResourceWork";
import type {
  GpuFlowCommittedSurfaceBlockedCandidateResourceWork,
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
  requestGpuFlowSurfacePublicationFollowUpFrames,
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
  GpuFlowSurfacePublicationPreparedFrame,
  RenderGpuFlowSurfaceFrameInput,
} from "./visibleFrameSurfaceFrame";

type GpuFlowBlockedSurfaceVisibleProjectionPublication = {
  readonly blockedErrorMessage: string | null;
  readonly frame: GpuFlowCommittedSurfaceFrame | null;
};

export type GpuFlowVisibleFramePresentationRuntime = Omit<
  Parameters<typeof presentGpuFlowVisibleFramePublicationFrame>[0],
  "publicationTransaction"
>;

function publishGpuFlowVisibleProjectionState({
  presentationToken,
  visibleProjectionPublicationStateRef,
  visibleProjectionState,
  visibleProjectionStateRef,
}: {
  readonly presentationToken: GpuFlowVisibleFramePresentationToken;
  readonly visibleProjectionPublicationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPublicationStateRef"];
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
}): void {
  if (visibleProjectionState.transaction.kind === "held-previous") {
    throw new Error(
      "GPU Flow presented visible projection state publication cannot publish a held-previous frame.",
    );
  }
  publishPresentedVisibleProjectionState({
    token: presentationToken,
    visibleProjectionPublicationStateRef,
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
    token.committedFrameId !==
    visibleProjectionState.committedFrame.displayFrameId
  ) {
    throw new Error(
      "GPU Flow held-previous visible projection state publication requires a hold-previous token for the same visible frame.",
    );
  }
}

function publishPresentedVisibleProjectionState({
  token,
  visibleProjectionPublicationStateRef,
  visibleProjectionState,
  visibleProjectionStateRef,
}: {
  readonly token: GpuFlowVisibleFramePresentationToken;
  readonly visibleProjectionPublicationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPublicationStateRef"];
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
}): void {
  assertGpuFlowVisibleFramePresentationTokenForFrameId({
    committedFrameId: visibleProjectionState.committedFrame.displayFrameId,
    token,
  });
  assertGpuFlowVisibleFramePresentationTokenForProjectionSample({
    projectionSampleId: visibleProjectionState.sample.id,
    token,
  });
  visibleProjectionStateRef.current = visibleProjectionState;
  visibleProjectionPublicationStateRef.current = visibleProjectionState;
}

export function presentGpuFlowVisibleFramePublicationFrame({
  abortPreparedContentFrame,
  callbacksRef,
  presentPreparedContentFrame,
  projectPresentedBrowserVisualActors,
  publicationTransaction,
  publishColdStartShellFrame,
  retainedDisplayFrameRef,
  retainedRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
  runtimeCanvas,
  surfaceRef,
  validatePreparedContentFrame,
  viewportRuntime,
  visibleOverlayProjectionKeyRef,
  visibleProjectionPublicationStateRef,
  visibleProjectionStateRef,
}: {
  readonly abortPreparedContentFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedContentFrame"];
  readonly callbacksRef: RenderGpuFlowSurfaceFrameInput["callbacksRef"];
  readonly presentPreparedContentFrame: RenderGpuFlowSurfaceFrameInput["presentPreparedContentFrame"];
  readonly projectPresentedBrowserVisualActors: RenderGpuFlowSurfaceFrameInput["projectPresentedBrowserVisualActors"];
  readonly publicationTransaction: GpuFlowVisibleFrameCoordinatorResult<GpuFlowSurfacePublicationPreparedFrame>;
  readonly publishColdStartShellFrame: RenderGpuFlowSurfaceFrameInput["publishColdStartShellFrame"];
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly retainedRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
  readonly validatePreparedContentFrame: RenderGpuFlowSurfaceFrameInput["validatePreparedContentFrame"];
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly visibleOverlayProjectionKeyRef: RenderGpuFlowSurfaceFrameInput["visibleOverlayProjectionKeyRef"];
  readonly visibleProjectionPublicationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPublicationStateRef"];
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
}) {
  const {
    followUpFrameRequests,
    heldPreviousVisibleProjectionState,
    outcome,
    preparedFrame: {
      contentPublicationFrame: {
        blockedErrorMessage,
        blockedPreparedContentFrame,
        blockedPreparedContentFrameResourceWork,
        blockedPreservePreparationSnapshot,
        preparedContentFrame,
        heldPreparedContentFrame,
        nodeLayerFrameStatePublication: contentNodeLayerFrameStatePublication,
        retainedDisplayFrame,
        retainedRuntimeFrame,
      },
      motionProjectionFrame: {
        nodeLayerFrameStatePublication: motionNodeLayerFrameStatePublication,
      },
      visibleProjectionState: selectedVisibleProjectionState,
    },
    reducerDecision,
    publicationFrameContext,
  } = publicationTransaction;
  const browserVisualPreparationResourceKeys =
    publicationFrameContext?.budgetDecision.preparationBudget
      .selectedResourceDebtIds ?? [];
  const browserVisualRepairSelected =
    publicationFrameContext?.budgetDecision.browserVisualRepair?.eligible ??
    false;
  const nodeLayerFrameStatePublication =
    contentNodeLayerFrameStatePublication ??
    motionNodeLayerFrameStatePublication;
  assertGpuFlowSingleVisibleFramePresentationOutcome({
    outcome,
    reducerDecision,
    surface: surfaceRef.current,
  });
  const blockedVisibleFramePresentation =
    publishGpuFlowSurfaceVisibleProjectionState({
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
      nodeLayerFrameStatePublication,
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
      visibleProjectionPublicationStateRef,
      visibleProjectionStateRef,
    });
  publishGpuFlowColdStartShellFrame({
    outcome,
    publishColdStartShellFrame,
  });
  const reducerFrameCompletion = publicationTransaction.completeReducerFrame();
  const { completion } = reducerFrameCompletion;
  const debtFrameRequest = createGpuFlowSurfaceReducerDebtFrameRequest({
    activeEditorActivationPending:
      publicationFrameContext.activeEditorPins.length > 0 ||
      hasGpuFlowActiveEditorActivationPendingFrame([
        blockedPreparedContentFrame,
        preparedContentFrame,
        heldPreparedContentFrame,
        selectedVisibleProjectionState?.committedFrame ?? null,
      ]),
    completion,
    debtFrameRequest: reducerFrameCompletion.debtFrameRequest,
    reducerDecision,
  });
  recordGpuFlowBlockedSurfaceVisibleProjectionPublication({
    blockedVisibleFramePresentation,
    completion,
    outcome,
    reducerDecision,
    runtimeCanvas,
    stateMachineOutcome:
      publicationTransaction.preparedFrame.transactionProof
        ?.visibleFrameStateMachineOutcome ?? null,
  });
  postGpuFlowVisibleFramePresentationOutcomeChromeReproEvent({
    completion,
    outcome,
    reducerDecision,
    previousContentFrameId: publicationTransaction.previousContentFrameId,
    transactionProof: publicationTransaction.preparedFrame.transactionProof,
    visibleProjectionState:
      selectedVisibleProjectionState ?? heldPreviousVisibleProjectionState,
  });
  recordGpuFlowBlockedPublicationGuard({
    outcome,
    reducerDecision,
    surface: surfaceRef.current,
  });
  requestGpuFlowSurfacePublicationFollowUpFrames({
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
  frames: readonly (GpuFlowCommittedSurfaceFrame | null)[],
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

function recordGpuFlowBlockedSurfaceVisibleProjectionPublication({
  blockedVisibleFramePresentation,
  completion,
  outcome,
  reducerDecision,
  runtimeCanvas,
  stateMachineOutcome,
}: {
  readonly blockedVisibleFramePresentation: GpuFlowBlockedSurfaceVisibleProjectionPublication | null;
  readonly completion: GpuFlowVisibleFrameReducerCompletion;
  readonly outcome: GpuFlowVisibleFramePresentationOutcome;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly stateMachineOutcome:
    | GpuFlowSurfacePublicationPreparedFrame["transactionProof"]["visibleFrameStateMachineOutcome"]
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
    publicationCompletion: completion,
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

function publishGpuFlowColdStartShellFrame({
  outcome,
  publishColdStartShellFrame,
}: {
  readonly outcome: GpuFlowVisibleFramePresentationOutcome;
  readonly publishColdStartShellFrame: RenderGpuFlowSurfaceFrameInput["publishColdStartShellFrame"];
}): void {
  if (outcome.kind !== "present") {
    return;
  }
  publishColdStartShellFrame({
    frame: null,
    token: outcome.token,
  });
}

function publishGpuFlowSurfaceVisibleProjectionState({
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
  nodeLayerFrameStatePublication,
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
  visibleProjectionPublicationStateRef,
  visibleProjectionStateRef,
}: {
  readonly abortPreparedContentFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedContentFrame"];
  readonly callbacksRef: RenderGpuFlowSurfaceFrameInput["callbacksRef"];
  readonly preparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly presentPreparedContentFrame: RenderGpuFlowSurfaceFrameInput["presentPreparedContentFrame"];
  readonly blockedErrorMessage: string | null;
  readonly blockedPreparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreparedContentFrameResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly browserVisualPreparationResourceKeys: readonly string[];
  readonly browserVisualRepairSelected: boolean;
  readonly heldPreparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly heldPreviousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
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
  readonly visibleProjectionPublicationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPublicationStateRef"];
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
}): GpuFlowBlockedSurfaceVisibleProjectionPublication | null {
  switch (outcome.kind) {
    case "present":
      publishGpuFlowPresentedSurfaceVisibleProjectionState({
        callbacksRef,
        preparedContentFrame,
        presentPreparedContentFrame,
        nodeLayerFrameStatePublication,
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
        visibleProjectionPublicationStateRef,
        visibleProjectionStateRef,
      });
      return null;
    case "hold-previous":
      publishGpuFlowHeldPreviousSurfaceVisibleProjectionOutcome({
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
      return publishGpuFlowBlockedSurfaceVisibleProjectionOutcome({
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

function publishGpuFlowHeldPreviousSurfaceVisibleProjectionOutcome({
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
  readonly blockedPreparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreparedContentFrameResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
  readonly browserVisualPreparationResourceKeys: readonly string[];
  readonly browserVisualRepairSelected: boolean;
  readonly preparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly heldPreparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
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
  publishGpuFlowHeldPreviousSurfaceVisibleProjectionState({
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

function publishGpuFlowBlockedSurfaceVisibleProjectionOutcome({
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
  readonly blockedPreparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreparedContentFrameResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly browserVisualPreparationResourceKeys: readonly string[];
  readonly browserVisualRepairSelected: boolean;
  readonly preparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly heldPreparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly outcome: Extract<
    GpuFlowVisibleFramePresentationOutcome,
    { readonly kind: "blocked" }
  >;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
}): GpuFlowBlockedSurfaceVisibleProjectionPublication {
  const blockedCommittedSurfaceAbort =
    resolveGpuFlowBlockedPreparedContentFramePublicationAbort({
      blockedPreparedContentFrame,
      blockedPreservePreparationSnapshot,
      preparedContentFrame,
      heldPreparedContentFrame,
      selectedVisibleProjectionState,
    });
  publishGpuFlowBlockedSurfaceVisibleProjectionState({
    abortPreparedContentFrame,
    blockedPreparedContentFrame: blockedCommittedSurfaceAbort.frame,
    blockedPreparedContentFrameResourceWork:
      blockedCommittedSurfaceAbort.frame !== null &&
      blockedCommittedSurfaceAbort.frame === blockedPreparedContentFrame
        ? blockedPreparedContentFrameResourceWork
        : null,
    blockedPreservePreparationSnapshot:
      blockedCommittedSurfaceAbort.preservePreparationSnapshot,
    browserVisualPreparationResourceKeys,
    browserVisualRepairSelected,
    outcome,
    runtimeCanvas,
    surfaceRef,
  });
  return Object.freeze({
    blockedErrorMessage,
    frame: blockedCommittedSurfaceAbort.frame,
  });
}

function publishGpuFlowPresentedSurfaceVisibleProjectionState({
  callbacksRef,
  preparedContentFrame,
  presentPreparedContentFrame,
  nodeLayerFrameStatePublication,
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
  visibleProjectionPublicationStateRef,
  visibleProjectionStateRef,
}: {
  readonly callbacksRef: RenderGpuFlowSurfaceFrameInput["callbacksRef"];
  readonly preparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly presentPreparedContentFrame: RenderGpuFlowSurfaceFrameInput["presentPreparedContentFrame"];
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
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
  readonly visibleProjectionPublicationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPublicationStateRef"];
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
}): void {
  if (!selectedVisibleProjectionState) {
    throw new Error(
      "GPU Flow visible presentation requires selected visible projection state.",
    );
  }
  if (
    selectedVisibleProjectionState.transaction.kind === "content-publication" &&
    !preparedContentFrame
  ) {
    throw new Error(
      "GPU Flow content presentation requires the prepared content frame.",
    );
  }
  if (preparedContentFrame) {
    validatePreparedContentFrame(outcome.token, preparedContentFrame);
  }
  const submittedNodeLayerFrameStatePublication =
    submitGpuFlowNodeLayerFrameCanvasSubmission({
      nodeLayerFrameStatePublication,
      token: outcome.token,
    });
  if (preparedContentFrame) {
    presentPreparedContentFrame(outcome.token, preparedContentFrame);
  }
  publishGpuFlowRetainedDisplayFrame({
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
  publishGpuFlowVisibleProjectionState({
    presentationToken: outcome.token,
    visibleProjectionPublicationStateRef,
    visibleProjectionState: selectedVisibleProjectionState,
    visibleProjectionStateRef,
  });
  publishGpuFlowVisibleOverlayProjectionTransform({
    token: outcome.token,
    viewportRuntime,
    visibleOverlayProjectionKeyRef,
    visibleProjectionState: selectedVisibleProjectionState,
  });
  publishPreparedGpuFlowNodeLayerFrameState({
    nodeLayerFrameStatePublication: submittedNodeLayerFrameStatePublication,
    token: outcome.token,
  });
  publishGpuFlowRetainedRuntimeFrame({
    callbacksRef,
    retainedRuntimeFrame,
    retainedRuntimeFrameRenderSignatureRef,
    retainedRuntimeFrameSourceRenderSignatureRef,
    token: outcome.token,
  });
}

function publishGpuFlowHeldPreviousSurfaceVisibleProjectionState({
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
  readonly heldPreparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly heldPreparedContentFrameResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
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
      "GPU Flow held-previous publication requires a selected or coordinator-proven held visible projection state.",
    );
  }
  assertGpuFlowHeldPreviousVisibleProjectionState({
    token: outcome.token,
    visibleProjectionState,
  });
}

function publishPreparedGpuFlowNodeLayerFrameState(publication: {
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly token: GpuFlowVisibleFramePresentationToken;
}): void {
  const { nodeLayerFrameStatePublication, token } = publication;
  if (nodeLayerFrameStatePublication === null) {
    return;
  }
  publishGpuFlowNodeLayerFrameState({
    ...nodeLayerFrameStatePublication,
    token,
  });
}

function publishGpuFlowVisibleOverlayProjectionTransform({
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

function publishGpuFlowRetainedDisplayFrame(publication: {
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly token: GpuFlowVisibleFramePresentationToken;
}): void {
  const { retainedDisplayFrame, retainedDisplayFrameRef, token } = publication;
  assertGpuFlowVisibleFramePresentationTokenBrand({ token });
  if (retainedDisplayFrame === null) {
    return;
  }
  retainedDisplayFrameRef.current = retainedDisplayFrame;
}

function publishGpuFlowBlockedSurfaceVisibleProjectionState({
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
  readonly blockedPreparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreparedContentFrameResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
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
  readonly candidateResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
}): readonly string[] {
  if (budgetSelectedResourceKeys.length > 0 || candidateResourceWork === null) {
    return budgetSelectedResourceKeys;
  }
  return Object.freeze(
    candidateResourceWork.workItems.map((item) => item.candidateResourceKey),
  );
}

function publishGpuFlowRetainedRuntimeFrame({
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
