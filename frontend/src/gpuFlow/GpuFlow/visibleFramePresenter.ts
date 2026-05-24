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
  type GpuFlowNodeLayerFrameStatePublication,
} from "./flowFrameLifecycle";
import {
  createGpuFlowRetainedRuntimeFrameOverlayRenderSignature,
  createGpuFlowRetainedRuntimeFrameSourceRenderSignature,
} from "./flowRetainedRuntimeFrameSignatures";
import { createGpuFlowVisibleOverlayProjectionKey } from "./flowVisibleOverlayProjectionKey";
import { resolveGpuFlowBlockedCommittedSurfacePublicationAbort } from "./visibleFrameAbortPolicy";
import { recordGpuFlowBlockedPublicationGuard } from "./visibleFrameBlockedOutcomeGuard";
import type {
  GpuFlowCommittedSurfaceBlockedCandidateResourceWork,
  GpuFlowVisibleFrameCoordinatorResult,
  GpuFlowVisiblePublicationOutcome,
} from "./visibleFrameCoordinator";
import {
  recordGpuFlowBlockedVisiblePublication,
  recordGpuFlowVisibleFrameBlocked,
  recordGpuFlowVisibleFrameHeld,
  recordGpuFlowVisibleFramePresented,
} from "./visibleFrameDiagnostics";
import { postGpuFlowVisiblePublicationOutcomeChromeReproEvent } from "./visibleFrameOutcomeChromeRepro";
import { assertGpuFlowSingleVisiblePublicationOutcome } from "./visibleFrameOutcomeGuard";
import {
  assertGpuFlowCommitPublicationTokenBrand,
  assertGpuFlowCommitPublicationTokenForFrameId,
  assertGpuFlowCommitPublicationTokenForProjectionSample,
  assertGpuFlowHoldPreviousTokenForProjectionSample,
  type GpuFlowCommitPublicationToken,
  type GpuFlowHoldPreviousToken,
} from "./visibleFramePresentationProofs";
import type { GpuFlowVisiblePublicationDecision } from "./visibleFrameScheduling";
import {
  createGpuFlowSurfacePublicationDebtFrameRequest,
  requestGpuFlowSurfacePublicationDebtFrame,
  requestGpuFlowSurfacePublicationFollowUpFrames,
} from "./visibleFramePresenterDebtRequests";
import type {
  GpuFlowSurfacePublicationPreparedFrame,
  RenderGpuFlowSurfaceFrameInput,
} from "./visibleFrameSurfaceFrame";

type GpuFlowVisibleFramePresenter = (
  publicationTransaction: GpuFlowVisibleFrameCoordinatorResult<GpuFlowSurfacePublicationPreparedFrame>,
) => void;

type GpuFlowBlockedSurfaceVisibleProjectionPublication = {
  readonly blockedErrorMessage: string | null;
  readonly frame: GpuFlowCommittedSurfaceFrame | null;
};

type GpuFlowVisibleFramePresenterInput = Omit<
  Parameters<typeof presentGpuFlowVisibleFramePublicationFrame>[0],
  "publicationTransaction"
>;

function publishGpuFlowVisibleProjectionState({
  commitPublicationToken,
  visibleProjectionPublicationStateRef,
  visibleProjectionState,
  visibleProjectionStateRef,
}: {
  readonly commitPublicationToken: GpuFlowCommitPublicationToken;
  readonly visibleProjectionPublicationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPublicationStateRef"];
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
}): void {
  if (visibleProjectionState.transaction.kind === "held-previous") {
    throw new Error(
      "GPU Flow committed visible projection state publication cannot publish a held-previous frame.",
    );
  }
  publishCommittedVisibleProjectionState({
    token: commitPublicationToken,
    visibleProjectionPublicationStateRef,
    visibleProjectionState,
    visibleProjectionStateRef,
  });
}

function recordGpuFlowHeldPreviousVisibleProjectionState({
  token,
  visibleProjectionPublicationStateRef,
  visibleProjectionState,
}: {
  readonly token: GpuFlowHoldPreviousToken;
  readonly visibleProjectionPublicationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPublicationStateRef"];
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): void {
  if (visibleProjectionState.transaction.kind !== "held-previous") {
    throw new Error(
      "GPU Flow held-previous visible projection diagnostics require a held-previous frame.",
    );
  }
  recordHeldPreviousVisibleProjectionState({
    token,
    visibleProjectionPublicationStateRef,
    visibleProjectionState,
  });
}

function publishCommittedVisibleProjectionState({
  token,
  visibleProjectionPublicationStateRef,
  visibleProjectionState,
  visibleProjectionStateRef,
}: {
  readonly token: GpuFlowCommitPublicationToken;
  readonly visibleProjectionPublicationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPublicationStateRef"];
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
}): void {
  assertGpuFlowCommitPublicationTokenForFrameId({
    committedFrameId: visibleProjectionState.committedFrame.displayFrameId,
    token,
  });
  assertGpuFlowCommitPublicationTokenForProjectionSample({
    projectionSampleId: visibleProjectionState.sample.id,
    token,
  });
  visibleProjectionStateRef.current = visibleProjectionState;
  visibleProjectionPublicationStateRef.current = visibleProjectionState;
}

function recordHeldPreviousVisibleProjectionState({
  token,
  visibleProjectionPublicationStateRef,
  visibleProjectionState,
}: {
  readonly token: GpuFlowHoldPreviousToken;
  readonly visibleProjectionPublicationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPublicationStateRef"];
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): void {
  assertGpuFlowHoldPreviousTokenForProjectionSample({
    projectionSampleId: visibleProjectionState.sample.id,
    token,
  });
  if (
    token.committedFrameId !==
    visibleProjectionState.committedFrame.displayFrameId
  ) {
    throw new Error(
      "GPU Flow held-previous visible projection state publication requires a hold-previous token for the same committed frame.",
    );
  }
  visibleProjectionPublicationStateRef.current = visibleProjectionState;
}

function presentGpuFlowVisibleFramePublicationFrame({
  abortPreparedCommittedSurfaceFrame,
  callbacksRef,
  commitPreparedCommittedSurfaceFrame,
  projectCommittedBrowserVisualActors,
  publicationTransaction,
  publishColdStartShellFrame,
  retainedDisplayFrameRef,
  retainedRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
  runtimeCanvas,
  surfaceRef,
  viewportRuntime,
  visibleOverlayProjectionKeyRef,
  visibleProjectionPublicationStateRef,
  visibleProjectionStateRef,
}: {
  readonly abortPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedCommittedSurfaceFrame"];
  readonly callbacksRef: RenderGpuFlowSurfaceFrameInput["callbacksRef"];
  readonly commitPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["commitPreparedCommittedSurfaceFrame"];
  readonly projectCommittedBrowserVisualActors: RenderGpuFlowSurfaceFrameInput["projectCommittedBrowserVisualActors"];
  readonly publicationTransaction: GpuFlowVisibleFrameCoordinatorResult<GpuFlowSurfacePublicationPreparedFrame>;
  readonly publishColdStartShellFrame: RenderGpuFlowSurfaceFrameInput["publishColdStartShellFrame"];
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly retainedRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
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
        blockedPreparedCommittedSurfaceFrame,
        blockedPreparedCommittedSurfaceFrameResourceWork,
        blockedPreservePreparationSnapshot,
        committedSurfaceFrame,
        heldPreparedCommittedSurfaceFrame,
        nodeLayerFrameStatePublication: contentNodeLayerFrameStatePublication,
        retainedDisplayFrame,
        retainedRuntimeFrame,
      },
      motionProjectionFrame: {
        nodeLayerFrameStatePublication: motionNodeLayerFrameStatePublication,
      },
      visibleProjectionState: selectedVisibleProjectionState,
    },
    publicationDecision,
  } = publicationTransaction;
  const { coldStartShellPublication } = publicationTransaction;
  const nodeLayerFrameStatePublication =
    contentNodeLayerFrameStatePublication ??
    motionNodeLayerFrameStatePublication;
  assertGpuFlowSingleVisiblePublicationOutcome({
    outcome,
    publicationDecision,
    surface: surfaceRef.current,
  });
  const blockedVisiblePublication = publishGpuFlowSurfaceVisibleProjectionState(
    {
      abortPreparedCommittedSurfaceFrame,
      callbacksRef,
      committedSurfaceFrame,
      commitPreparedCommittedSurfaceFrame,
      blockedErrorMessage,
      blockedPreparedCommittedSurfaceFrame,
      blockedPreparedCommittedSurfaceFrameResourceWork,
      blockedPreservePreparationSnapshot,
      heldPreparedCommittedSurfaceFrame,
      heldPreviousVisibleProjectionState,
      nodeLayerFrameStatePublication,
      outcome,
      projectCommittedBrowserVisualActors,
      retainedDisplayFrame,
      retainedDisplayFrameRef,
      retainedRuntimeFrame,
      retainedRuntimeFrameRenderSignatureRef,
      retainedRuntimeFrameSourceRenderSignatureRef,
      runtimeCanvas,
      selectedVisibleProjectionState,
      surfaceRef,
      viewportRuntime,
      visibleOverlayProjectionKeyRef,
      visibleProjectionPublicationStateRef,
      visibleProjectionStateRef,
    },
  );
  publishGpuFlowColdStartShellFrame({
    coldStartShellPublication,
    publishColdStartShellFrame,
  });
  const schedulerFrameCompletion =
    publicationTransaction.completeSchedulerFrame();
  const { completion } = schedulerFrameCompletion;
  const debtFrameRequest = createGpuFlowSurfacePublicationDebtFrameRequest({
    completion,
    debtFrameRequest: schedulerFrameCompletion.debtFrameRequest,
    publicationDecision,
  });
  recordGpuFlowBlockedSurfaceVisibleProjectionPublication({
    blockedVisiblePublication,
    completion,
    outcome,
    publicationDecision,
    runtimeCanvas,
    stateMachineOutcome:
      publicationTransaction.preparedFrame.transactionProof
        ?.visibleFrameStateMachineOutcome ?? null,
  });
  postGpuFlowVisiblePublicationOutcomeChromeReproEvent({
    completion,
    outcome,
    publicationDecision,
    previousCommittedFrameId: publicationTransaction.previousCommittedFrameId,
    transactionProof: publicationTransaction.preparedFrame.transactionProof,
    visibleProjectionState:
      selectedVisibleProjectionState ?? heldPreviousVisibleProjectionState,
  });
  recordGpuFlowBlockedPublicationGuard({
    outcome,
    publicationDecision,
    surface: surfaceRef.current,
  });
  requestGpuFlowSurfacePublicationFollowUpFrames({
    debtFrameRequest,
    followUpFrameRequests,
    surfaceRef,
  });
  requestGpuFlowSurfacePublicationDebtFrame({
    debtFrameRequest,
    completion,
    outcome,
    publicationDecision,
    surfaceRef,
  });
  if (blockedVisiblePublication?.blockedErrorMessage) {
    throw new Error(blockedVisiblePublication.blockedErrorMessage);
  }
}

function recordGpuFlowBlockedSurfaceVisibleProjectionPublication({
  blockedVisiblePublication,
  completion,
  outcome,
  publicationDecision,
  runtimeCanvas,
  stateMachineOutcome,
}: {
  readonly blockedVisiblePublication: GpuFlowBlockedSurfaceVisibleProjectionPublication | null;
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly stateMachineOutcome:
    | GpuFlowSurfacePublicationPreparedFrame["transactionProof"]["visibleFrameStateMachineOutcome"]
    | null;
}): void {
  if (blockedVisiblePublication === null) {
    return;
  }
  if (outcome.kind !== "blocked") {
    throw new Error(
      "GPU Flow blocked visible publication recording requires a blocked visible publication outcome.",
    );
  }
  recordGpuFlowBlockedVisiblePublication({
    frame: blockedVisiblePublication.frame,
    publicationCompletion: completion,
    publicationDecision,
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

export function createGpuFlowVisibleFramePresenter({
  abortPreparedCommittedSurfaceFrame,
  callbacksRef,
  commitPreparedCommittedSurfaceFrame,
  projectCommittedBrowserVisualActors,
  publishColdStartShellFrame,
  retainedDisplayFrameRef,
  retainedRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
  runtimeCanvas,
  surfaceRef,
  viewportRuntime,
  visibleOverlayProjectionKeyRef,
  visibleProjectionPublicationStateRef,
  visibleProjectionStateRef,
}: GpuFlowVisibleFramePresenterInput): GpuFlowVisibleFramePresenter {
  return (publicationTransaction) =>
    presentGpuFlowVisibleFramePublicationFrame({
      abortPreparedCommittedSurfaceFrame,
      callbacksRef,
      commitPreparedCommittedSurfaceFrame,
      projectCommittedBrowserVisualActors,
      publicationTransaction,
      publishColdStartShellFrame,
      retainedDisplayFrameRef,
      retainedRuntimeFrameRenderSignatureRef,
      retainedRuntimeFrameSourceRenderSignatureRef,
      runtimeCanvas,
      surfaceRef,
      viewportRuntime,
      visibleOverlayProjectionKeyRef,
      visibleProjectionPublicationStateRef,
      visibleProjectionStateRef,
    });
}

function publishGpuFlowColdStartShellFrame({
  coldStartShellPublication,
  publishColdStartShellFrame,
}: {
  readonly coldStartShellPublication: GpuFlowVisibleFrameCoordinatorResult<GpuFlowSurfacePublicationPreparedFrame>["coldStartShellPublication"];
  readonly publishColdStartShellFrame: RenderGpuFlowSurfaceFrameInput["publishColdStartShellFrame"];
}): void {
  publishColdStartShellFrame(coldStartShellPublication);
}

function publishGpuFlowSurfaceVisibleProjectionState({
  abortPreparedCommittedSurfaceFrame,
  blockedErrorMessage,
  blockedPreparedCommittedSurfaceFrame,
  blockedPreparedCommittedSurfaceFrameResourceWork,
  blockedPreservePreparationSnapshot,
  callbacksRef,
  committedSurfaceFrame,
  commitPreparedCommittedSurfaceFrame,
  heldPreparedCommittedSurfaceFrame,
  heldPreviousVisibleProjectionState,
  nodeLayerFrameStatePublication,
  outcome,
  projectCommittedBrowserVisualActors,
  retainedDisplayFrame,
  retainedDisplayFrameRef,
  retainedRuntimeFrame,
  retainedRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
  runtimeCanvas,
  selectedVisibleProjectionState,
  surfaceRef,
  viewportRuntime,
  visibleOverlayProjectionKeyRef,
  visibleProjectionPublicationStateRef,
  visibleProjectionStateRef,
}: {
  readonly abortPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedCommittedSurfaceFrame"];
  readonly callbacksRef: RenderGpuFlowSurfaceFrameInput["callbacksRef"];
  readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly commitPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["commitPreparedCommittedSurfaceFrame"];
  readonly blockedErrorMessage: string | null;
  readonly blockedPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreparedCommittedSurfaceFrameResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly heldPreviousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly projectCommittedBrowserVisualActors: RenderGpuFlowSurfaceFrameInput["projectCommittedBrowserVisualActors"];
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly retainedRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly visibleOverlayProjectionKeyRef: RenderGpuFlowSurfaceFrameInput["visibleOverlayProjectionKeyRef"];
  readonly visibleProjectionPublicationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPublicationStateRef"];
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
}): GpuFlowBlockedSurfaceVisibleProjectionPublication | null {
  switch (outcome.kind) {
    case "commit":
      publishGpuFlowCommittedSurfaceVisibleProjectionState({
        callbacksRef,
        committedSurfaceFrame,
        commitPreparedCommittedSurfaceFrame,
        nodeLayerFrameStatePublication,
        outcome,
        projectCommittedBrowserVisualActors,
        retainedDisplayFrame,
        retainedDisplayFrameRef,
        retainedRuntimeFrame,
        retainedRuntimeFrameRenderSignatureRef,
        retainedRuntimeFrameSourceRenderSignatureRef,
        runtimeCanvas,
        selectedVisibleProjectionState,
        surfaceRef,
        viewportRuntime,
        visibleOverlayProjectionKeyRef,
        visibleProjectionPublicationStateRef,
        visibleProjectionStateRef,
      });
      return null;
    case "hold-previous":
      publishGpuFlowHeldPreviousSurfaceVisibleProjectionOutcome({
        abortPreparedCommittedSurfaceFrame,
        blockedPreparedCommittedSurfaceFrame,
        blockedPreparedCommittedSurfaceFrameResourceWork,
        committedSurfaceFrame,
        heldPreparedCommittedSurfaceFrame,
        heldPreviousVisibleProjectionState,
        outcome,
        runtimeCanvas,
        selectedVisibleProjectionState,
        surfaceRef,
        visibleProjectionPublicationStateRef,
      });
      return null;
    case "blocked":
      return publishGpuFlowBlockedSurfaceVisibleProjectionOutcome({
        abortPreparedCommittedSurfaceFrame,
        blockedErrorMessage,
        blockedPreparedCommittedSurfaceFrame,
        blockedPreparedCommittedSurfaceFrameResourceWork,
        blockedPreservePreparationSnapshot,
        committedSurfaceFrame,
        heldPreparedCommittedSurfaceFrame,
        outcome,
        runtimeCanvas,
        selectedVisibleProjectionState,
        surfaceRef,
      });
  }
}

function publishGpuFlowHeldPreviousSurfaceVisibleProjectionOutcome({
  abortPreparedCommittedSurfaceFrame,
  blockedPreparedCommittedSurfaceFrame,
  blockedPreparedCommittedSurfaceFrameResourceWork,
  committedSurfaceFrame,
  heldPreparedCommittedSurfaceFrame,
  heldPreviousVisibleProjectionState,
  outcome,
  runtimeCanvas,
  selectedVisibleProjectionState,
  surfaceRef,
  visibleProjectionPublicationStateRef,
}: {
  readonly abortPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedCommittedSurfaceFrame"];
  readonly blockedPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreparedCommittedSurfaceFrameResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
  readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly heldPreviousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly outcome: Extract<
    GpuFlowVisiblePublicationOutcome,
    { readonly kind: "hold-previous" }
  >;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
  readonly visibleProjectionPublicationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPublicationStateRef"];
}): void {
  const heldFrame =
    heldPreparedCommittedSurfaceFrame ??
    blockedPreparedCommittedSurfaceFrame ??
    committedSurfaceFrame;
  publishGpuFlowHeldPreviousSurfaceVisibleProjectionState({
    abortPreparedCommittedSurfaceFrame,
    heldPreparedCommittedSurfaceFrame: heldFrame,
    heldPreparedCommittedSurfaceFrameResourceWork:
      heldFrame !== null && heldFrame === blockedPreparedCommittedSurfaceFrame
        ? blockedPreparedCommittedSurfaceFrameResourceWork
        : null,
    heldPreviousVisibleProjectionState,
    outcome,
    runtimeCanvas,
    selectedVisibleProjectionState,
    surfaceRef,
    visibleProjectionPublicationStateRef,
  });
}

function publishGpuFlowBlockedSurfaceVisibleProjectionOutcome({
  abortPreparedCommittedSurfaceFrame,
  blockedErrorMessage,
  blockedPreparedCommittedSurfaceFrame,
  blockedPreparedCommittedSurfaceFrameResourceWork,
  blockedPreservePreparationSnapshot,
  committedSurfaceFrame,
  heldPreparedCommittedSurfaceFrame,
  outcome,
  runtimeCanvas,
  selectedVisibleProjectionState,
  surfaceRef,
}: {
  readonly abortPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedCommittedSurfaceFrame"];
  readonly blockedErrorMessage: string | null;
  readonly blockedPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreparedCommittedSurfaceFrameResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly outcome: Extract<
    GpuFlowVisiblePublicationOutcome,
    { readonly kind: "blocked" }
  >;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
}): GpuFlowBlockedSurfaceVisibleProjectionPublication {
  const blockedCommittedSurfaceAbort =
    resolveGpuFlowBlockedCommittedSurfacePublicationAbort({
      blockedPreparedCommittedSurfaceFrame,
      blockedPreservePreparationSnapshot,
      committedSurfaceFrame,
      heldPreparedCommittedSurfaceFrame,
      selectedVisibleProjectionState,
    });
  publishGpuFlowBlockedSurfaceVisibleProjectionState({
    abortPreparedCommittedSurfaceFrame,
    blockedPreparedCommittedSurfaceFrame: blockedCommittedSurfaceAbort.frame,
    blockedPreparedCommittedSurfaceFrameResourceWork:
      blockedCommittedSurfaceAbort.frame !== null &&
      blockedCommittedSurfaceAbort.frame ===
        blockedPreparedCommittedSurfaceFrame
        ? blockedPreparedCommittedSurfaceFrameResourceWork
        : null,
    blockedPreservePreparationSnapshot:
      blockedCommittedSurfaceAbort.preservePreparationSnapshot,
    outcome,
    runtimeCanvas,
    surfaceRef,
  });
  return Object.freeze({
    blockedErrorMessage,
    frame: blockedCommittedSurfaceAbort.frame,
  });
}

function publishGpuFlowCommittedSurfaceVisibleProjectionState({
  callbacksRef,
  committedSurfaceFrame,
  commitPreparedCommittedSurfaceFrame,
  nodeLayerFrameStatePublication,
  outcome,
  projectCommittedBrowserVisualActors,
  retainedDisplayFrame,
  retainedDisplayFrameRef,
  retainedRuntimeFrame,
  retainedRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
  runtimeCanvas,
  selectedVisibleProjectionState,
  surfaceRef,
  viewportRuntime,
  visibleOverlayProjectionKeyRef,
  visibleProjectionPublicationStateRef,
  visibleProjectionStateRef,
}: {
  readonly callbacksRef: RenderGpuFlowSurfaceFrameInput["callbacksRef"];
  readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly commitPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["commitPreparedCommittedSurfaceFrame"];
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly outcome: Extract<
    GpuFlowVisiblePublicationOutcome,
    { readonly kind: "commit" }
  >;
  readonly projectCommittedBrowserVisualActors: RenderGpuFlowSurfaceFrameInput["projectCommittedBrowserVisualActors"];
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly retainedRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly visibleOverlayProjectionKeyRef: RenderGpuFlowSurfaceFrameInput["visibleOverlayProjectionKeyRef"];
  readonly visibleProjectionPublicationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPublicationStateRef"];
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
}): void {
  if (!selectedVisibleProjectionState) {
    throw new Error(
      "GPU Flow visible publication commit requires selected visible projection state.",
    );
  }
  if (
    selectedVisibleProjectionState.transaction.kind === "content-publication" &&
    !committedSurfaceFrame
  ) {
    throw new Error(
      "GPU Flow content publication commit requires the prepared committed surface frame.",
    );
  }
  if (committedSurfaceFrame) {
    commitPreparedCommittedSurfaceFrame(outcome.token, committedSurfaceFrame);
  }
  publishGpuFlowRetainedDisplayFrame({
    retainedDisplayFrame,
    retainedDisplayFrameRef,
    token: outcome.token,
  });
  recordGpuFlowVisibleFramePresented({
    committedSurfaceFrame,
    runtimeCanvas,
    surfaceRef,
    token: outcome.token,
  });
  applyGpuFlowProjectionDebugAttributes({
    canvas: runtimeCanvas,
    debugState: selectedVisibleProjectionState.debugState,
    token: outcome.token,
  });
  projectCommittedBrowserVisualActors(
    outcome.token,
    selectedVisibleProjectionState.sample.viewport,
  );
  publishGpuFlowVisibleProjectionState({
    commitPublicationToken: outcome.token,
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
    nodeLayerFrameStatePublication,
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
  abortPreparedCommittedSurfaceFrame,
  heldPreparedCommittedSurfaceFrame,
  heldPreparedCommittedSurfaceFrameResourceWork,
  heldPreviousVisibleProjectionState,
  outcome,
  runtimeCanvas,
  selectedVisibleProjectionState,
  surfaceRef,
  visibleProjectionPublicationStateRef,
}: {
  readonly abortPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedCommittedSurfaceFrame"];
  readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly heldPreparedCommittedSurfaceFrameResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
  readonly heldPreviousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly outcome: Extract<
    GpuFlowVisiblePublicationOutcome,
    { readonly kind: "hold-previous" }
  >;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
  readonly visibleProjectionPublicationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPublicationStateRef"];
}): void {
  recordGpuFlowVisibleFrameHeld({
    candidateFrame: heldPreparedCommittedSurfaceFrame,
    candidateResourceWork: heldPreparedCommittedSurfaceFrameResourceWork,
    runtimeCanvas,
    surfaceRef,
    token: outcome.token,
  });
  if (heldPreparedCommittedSurfaceFrame) {
    abortPreparedCommittedSurfaceFrame(
      outcome.token,
      heldPreparedCommittedSurfaceFrame,
      {
        preservePreparationSnapshot: true,
      },
    );
  }
  const visibleProjectionState =
    selectedVisibleProjectionState ?? heldPreviousVisibleProjectionState;
  if (!visibleProjectionState) {
    throw new Error(
      "GPU Flow held-previous publication requires a selected or coordinator-proven held visible projection state.",
    );
  }
  recordGpuFlowHeldPreviousVisibleProjectionState({
    token: outcome.token,
    visibleProjectionPublicationStateRef,
    visibleProjectionState,
  });
}

function publishPreparedGpuFlowNodeLayerFrameState(publication: {
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly token: GpuFlowCommitPublicationToken;
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
  readonly token: GpuFlowCommitPublicationToken;
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly visibleOverlayProjectionKeyRef: RenderGpuFlowSurfaceFrameInput["visibleOverlayProjectionKeyRef"];
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): void {
  assertGpuFlowCommitPublicationTokenBrand({ token });
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
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  const { retainedDisplayFrame, retainedDisplayFrameRef, token } = publication;
  assertGpuFlowCommitPublicationTokenBrand({ token });
  if (retainedDisplayFrame === null) {
    return;
  }
  retainedDisplayFrameRef.current = retainedDisplayFrame;
}

function publishGpuFlowBlockedSurfaceVisibleProjectionState({
  abortPreparedCommittedSurfaceFrame,
  blockedPreparedCommittedSurfaceFrame,
  blockedPreparedCommittedSurfaceFrameResourceWork,
  blockedPreservePreparationSnapshot,
  outcome,
  runtimeCanvas,
  surfaceRef,
}: {
  readonly abortPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedCommittedSurfaceFrame"];
  readonly blockedPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreparedCommittedSurfaceFrameResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly outcome: Extract<
    GpuFlowVisiblePublicationOutcome,
    { readonly kind: "blocked" }
  >;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
}): void {
  if (blockedPreparedCommittedSurfaceFrame) {
    abortPreparedCommittedSurfaceFrame(
      outcome.token,
      blockedPreparedCommittedSurfaceFrame,
      {
        preservePreparationSnapshot: blockedPreservePreparationSnapshot,
      },
    );
  }
  recordGpuFlowVisibleFrameBlocked({
    candidateFrame: blockedPreparedCommittedSurfaceFrame,
    candidateResourceWork: blockedPreparedCommittedSurfaceFrameResourceWork,
    runtimeCanvas,
    surfaceRef,
    token: outcome.token,
  });
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
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  assertGpuFlowCommitPublicationTokenBrand({ token });
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
