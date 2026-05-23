import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import {
  applyGpuFlowProjectionDebugAttributes,
  getGpuFlowVisiblePublicationDebtReason,
  hasGpuFlowVisiblePublicationDebt,
  type GpuFlowVisibleProjectionState,
  type GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import {
  applyGpuFlowBlockedCommittedSurfacePublicationEffect,
  applyGpuFlowCommittedSurfacePublicationEffect,
  applyGpuFlowHeldPreviousCommittedSurfacePublicationEffect,
  recordGpuFlowBlockedVisiblePublication,
} from "./flowCommittedSurfacePublication";
import {
  updateGpuFlowNodeLayerFrameState,
  type GpuFlowNodeLayerFrameStatePublication,
} from "./flowFrameLifecycle";
import type {
  GpuFlowSurfacePublicationPreparedFrame,
  RenderGpuFlowSurfaceFrameInput,
} from "./flowSurfaceFramePublication";
import {
  createGpuFlowRetainedRuntimeFrameOverlayRenderSignature,
  createGpuFlowRetainedRuntimeFrameSourceRenderSignature,
} from "./flowRetainedRuntimeFrameSignatures";
import {
  getDelayedGpuFlowPublicationDebtRequestMs,
  scheduleDelayedGpuFlowPublicationDebtFrame,
} from "./flowSurfacePublicationDebtFrame";
import { createGpuFlowVisibleOverlayProjectionKey } from "./flowVisibleOverlayProjectionKey";
import {
  recordGpuFlowNoFrameHeldPreviousVisibleProjectionState,
  publishGpuFlowVisibleProjectionState,
  recordGpuFlowHeldPreviousVisibleProjectionState,
} from "./flowVisibleProjectionStatePublication";
import { recordGpuFlowBlockedPublicationGuard } from "./flowVisiblePublicationBlockedGuard";
import { postGpuFlowVisiblePublicationOutcomeChromeReproEvent } from "./flowVisiblePublicationOutcomeChromeRepro";
import { assertGpuFlowSingleVisiblePublicationOutcome } from "./flowVisiblePublicationOutcomeGuard";
import type {
  GpuFlowCommittedSurfacePublicationEffect,
  GpuFlowVisibleFramePublicationKernelResult,
  GpuFlowVisiblePublicationOutcome,
} from "./visibleFramePublicationKernel";
import {
  assertGpuFlowCommitPublicationTokenBrand,
  type GpuFlowCommitPublicationToken,
} from "./visibleFramePublicationTokens";

type GpuFlowSurfacePublicationPublisher =
  (publicationTransaction: GpuFlowVisibleFramePublicationKernelResult<GpuFlowSurfacePublicationPreparedFrame>) => void;

type GpuFlowSurfacePublicationPublisherInput = Omit<
  Parameters<typeof completeGpuFlowSurfacePublicationFrame>[0],
  "publicationTransaction"
>;

function completeGpuFlowSurfacePublicationFrame({
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
  visiblePublicationSchedulerRef,
}: {
  readonly abortPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedCommittedSurfaceFrame"];
  readonly callbacksRef: RenderGpuFlowSurfaceFrameInput["callbacksRef"];
  readonly commitPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["commitPreparedCommittedSurfaceFrame"];
  readonly projectCommittedBrowserVisualActors: RenderGpuFlowSurfaceFrameInput["projectCommittedBrowserVisualActors"];
  readonly publicationTransaction: GpuFlowVisibleFramePublicationKernelResult<GpuFlowSurfacePublicationPreparedFrame>;
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
  readonly visiblePublicationSchedulerRef: RenderGpuFlowSurfaceFrameInput["visiblePublicationSchedulerRef"];
}) {
  const {
    completion,
    outcome,
    preparedFrame: {
      contentPublicationFrame: {
        blockedErrorMessage,
        blockedPreparedCommittedSurfaceFrame,
        blockedPreservePreparationSnapshot,
        committedSurfaceFrame,
        committedSurfacePublicationEffect,
        forceImmediatePublicationDebtFrame,
        heldPreparedCommittedSurfaceFrame,
        nodeLayerFrameStatePublication: contentNodeLayerFrameStatePublication,
        retainedDisplayFrame,
        retainedDisplayFollowUpFrameReason,
        retainedRuntimeFrame,
      },
      motionProjectionFrame: {
        nodeLayerFrameStatePublication: motionNodeLayerFrameStatePublication,
      },
      visibleProjectionState: selectedVisibleProjectionState,
    },
    publicationDecision,
  } = publicationTransaction;
  const nodeLayerFrameStatePublication =
    contentNodeLayerFrameStatePublication ??
    motionNodeLayerFrameStatePublication;
  assertGpuFlowSingleVisiblePublicationOutcome({
    outcome,
    publicationDecision,
    surface: surfaceRef.current,
  });
  publishGpuFlowSurfaceVisibleProjectionState({
    abortPreparedCommittedSurfaceFrame,
    callbacksRef,
    committedSurfaceFrame,
    committedSurfacePublicationEffect,
    commitPreparedCommittedSurfaceFrame,
    completion,
    blockedErrorMessage,
    blockedPreparedCommittedSurfaceFrame,
    blockedPreservePreparationSnapshot,
    heldPreparedCommittedSurfaceFrame,
    nodeLayerFrameStatePublication,
    outcome,
    publicationDecision,
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
    visiblePublicationSchedulerRef,
  });
  publishGpuFlowColdStartShellFrame({
    outcome,
    publishColdStartShellFrame,
  });
  postGpuFlowVisiblePublicationOutcomeChromeReproEvent({
    completion,
    outcome,
    publicationDecision,
    previousCommittedFrameId: publicationTransaction.previousCommittedFrameId,
    transactionOracle: publicationTransaction.preparedFrame.transactionOracle,
    visibleProjectionState: selectedVisibleProjectionState,
  });
  recordGpuFlowBlockedPublicationGuard({
    outcome,
    publicationDecision,
    surface: surfaceRef.current,
  });
  if (retainedDisplayFollowUpFrameReason) {
    surfaceRef.current?.requestFrame(retainedDisplayFollowUpFrameReason);
  }
  requestGpuFlowSurfacePublicationDebtFrame({
    completion,
    forceImmediatePublicationDebtFrame,
    outcome,
    publicationDecision,
    surfaceRef,
    visiblePublicationSchedulerRef,
  });
}

export function createGpuFlowSurfacePublicationPublisher({
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
  visiblePublicationSchedulerRef,
}: GpuFlowSurfacePublicationPublisherInput): GpuFlowSurfacePublicationPublisher {
  return (publicationTransaction) =>
    completeGpuFlowSurfacePublicationFrame({
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
      visiblePublicationSchedulerRef,
    });
}

function requestGpuFlowSurfacePublicationDebtFrame({
  completion,
  forceImmediatePublicationDebtFrame,
  outcome,
  publicationDecision,
  surfaceRef,
  visiblePublicationSchedulerRef,
}: {
  readonly completion: GpuFlowVisibleFramePublicationKernelResult<GpuFlowSurfacePublicationPreparedFrame>["completion"];
  readonly forceImmediatePublicationDebtFrame: boolean;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
  readonly visiblePublicationSchedulerRef: RenderGpuFlowSurfaceFrameInput["visiblePublicationSchedulerRef"];
}): void {
  if (hasGpuFlowVisiblePublicationDebt(completion.debt)) {
    const frameReason = getGpuFlowSurfacePublicationDebtFrameReason({
      completion,
      outcome,
    });
    const delayedDebtRequestMs = getDelayedGpuFlowPublicationDebtRequestMs({
      publicationDecision,
      schedulerMotionSettleWindowMs:
        visiblePublicationSchedulerRef.current.getKnobs().motionSettleWindowMs,
    });
    if (
      !forceImmediatePublicationDebtFrame &&
      !shouldRequestGpuFlowSurfacePublicationDebtFrameImmediately(outcome) &&
      delayedDebtRequestMs !== null &&
      scheduleDelayedGpuFlowPublicationDebtFrame({
        delayMs: delayedDebtRequestMs,
        frameReason,
        surfaceRef,
      })
    ) {
      return;
    }
    surfaceRef.current?.requestFrame(frameReason);
  }
}

function publishGpuFlowColdStartShellFrame({
  outcome,
  publishColdStartShellFrame,
}: {
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly publishColdStartShellFrame: RenderGpuFlowSurfaceFrameInput["publishColdStartShellFrame"];
}): void {
  publishColdStartShellFrame({
    frame:
      outcome.kind === "blocked" &&
      outcome.token.frozenFrame.kind === "cold-start-shell"
        ? outcome.token.frozenFrame.frame
        : null,
    token: outcome.token,
  });
}

function getGpuFlowSurfacePublicationDebtFrameReason({
  completion,
  outcome,
}: {
  readonly completion: GpuFlowVisibleFramePublicationKernelResult<GpuFlowSurfacePublicationPreparedFrame>["completion"];
  readonly outcome: GpuFlowVisiblePublicationOutcome;
}): GpuFrameReason {
  if (isGpuFlowRetainedProjectionBlockedOutcome(outcome)) {
    return "texture-upload";
  }
  return getGpuFlowVisiblePublicationDebtReason(completion.debt);
}

function shouldRequestGpuFlowSurfacePublicationDebtFrameImmediately(
  outcome: GpuFlowVisiblePublicationOutcome,
): boolean {
  return isGpuFlowRetainedProjectionBlockedOutcome(outcome);
}

function isGpuFlowRetainedProjectionBlockedOutcome(
  outcome: GpuFlowVisiblePublicationOutcome,
): boolean {
  return (
    outcome.kind === "blocked" &&
    outcome.token.blockedReasons.some(
      (reason) => reason.family === "retained-projection",
    )
  );
}

function publishGpuFlowSurfaceVisibleProjectionState({
  abortPreparedCommittedSurfaceFrame,
  blockedErrorMessage,
  blockedPreparedCommittedSurfaceFrame,
  blockedPreservePreparationSnapshot,
  callbacksRef,
  committedSurfaceFrame,
  committedSurfacePublicationEffect,
  commitPreparedCommittedSurfaceFrame,
  completion,
  heldPreparedCommittedSurfaceFrame,
  nodeLayerFrameStatePublication,
  outcome,
  publicationDecision,
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
  visiblePublicationSchedulerRef,
}: {
  readonly abortPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedCommittedSurfaceFrame"];
  readonly callbacksRef: RenderGpuFlowSurfaceFrameInput["callbacksRef"];
  readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly committedSurfacePublicationEffect: GpuFlowCommittedSurfacePublicationEffect | null;
  readonly commitPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["commitPreparedCommittedSurfaceFrame"];
  readonly completion: GpuFlowVisibleFramePublicationKernelResult<GpuFlowSurfacePublicationPreparedFrame>["completion"];
  readonly blockedErrorMessage: string | null;
  readonly blockedPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
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
  readonly visiblePublicationSchedulerRef: RenderGpuFlowSurfaceFrameInput["visiblePublicationSchedulerRef"];
}): void {
  switch (outcome.kind) {
    case "commit":
      publishGpuFlowCommittedSurfaceVisibleProjectionState({
        callbacksRef,
        committedSurfaceFrame,
        committedSurfacePublicationEffect,
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
      return;
    case "hold-previous":
      publishGpuFlowHeldPreviousSurfaceVisibleProjectionState({
        abortPreparedCommittedSurfaceFrame,
        heldPreparedCommittedSurfaceFrame,
        committedSurfacePublicationEffect,
        outcome,
        publicationDecision,
        runtimeCanvas,
        selectedVisibleProjectionState,
        surfaceRef,
        visibleProjectionPublicationStateRef,
        visibleProjectionStateRef,
        visiblePublicationSchedulerRef,
      });
      return;
    case "blocked":
      publishGpuFlowBlockedSurfaceVisibleProjectionState({
        abortPreparedCommittedSurfaceFrame,
        blockedErrorMessage,
        blockedPreparedCommittedSurfaceFrame:
          resolveGpuFlowBlockedPreparedCommittedSurfaceFrame({
            blockedPreparedCommittedSurfaceFrame,
            committedSurfaceFrame,
            heldPreparedCommittedSurfaceFrame,
            outcome,
            selectedVisibleProjectionState,
          }),
        blockedPreservePreparationSnapshot:
          resolveGpuFlowBlockedPreparedCommittedSurfaceFramePreservation({
            blockedPreparedCommittedSurfaceFrame,
            blockedPreservePreparationSnapshot,
            heldPreparedCommittedSurfaceFrame,
            outcome,
            selectedVisibleProjectionState,
          }),
        committedSurfacePublicationEffect,
        completion,
        outcome,
        publicationDecision,
        runtimeCanvas,
        surfaceRef,
      });
      return;
  }
}

function resolveGpuFlowBlockedPreparedCommittedSurfaceFrame({
  blockedPreparedCommittedSurfaceFrame,
  committedSurfaceFrame,
  heldPreparedCommittedSurfaceFrame,
  outcome,
  selectedVisibleProjectionState,
}: {
  readonly blockedPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowCommittedSurfaceFrame | null {
  if (blockedPreparedCommittedSurfaceFrame) {
    return blockedPreparedCommittedSurfaceFrame;
  }
  if (
    !isGpuFlowBlockedHeldPreviousPublicationOutcomeForVisibleState({
      outcome,
      selectedVisibleProjectionState,
    })
  ) {
    return null;
  }
  return heldPreparedCommittedSurfaceFrame ?? committedSurfaceFrame;
}

function resolveGpuFlowBlockedPreparedCommittedSurfaceFramePreservation({
  blockedPreparedCommittedSurfaceFrame,
  blockedPreservePreparationSnapshot,
  heldPreparedCommittedSurfaceFrame,
  outcome,
  selectedVisibleProjectionState,
}: {
  readonly blockedPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): boolean {
  if (blockedPreparedCommittedSurfaceFrame) {
    return blockedPreservePreparationSnapshot;
  }
  if (
    heldPreparedCommittedSurfaceFrame &&
    isGpuFlowBlockedHeldPreviousPublicationOutcomeForVisibleState({
      outcome,
      selectedVisibleProjectionState,
    })
  ) {
    return true;
  }
  return false;
}

function isGpuFlowBlockedHeldPreviousPublicationOutcomeForVisibleState({
  outcome,
  selectedVisibleProjectionState,
}: {
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): boolean {
  return (
    outcome.kind === "blocked" &&
    selectedVisibleProjectionState?.transaction.kind === "held-previous"
  );
}

function publishGpuFlowCommittedSurfaceVisibleProjectionState({
  callbacksRef,
  committedSurfaceFrame,
  committedSurfacePublicationEffect,
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
  readonly committedSurfacePublicationEffect: GpuFlowCommittedSurfacePublicationEffect | null;
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
  applyGpuFlowCommittedSurfacePublicationEffect({
    effect: committedSurfacePublicationEffect,
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
  publishGpuFlowNodeLayerFrameState({
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
  committedSurfacePublicationEffect,
  heldPreparedCommittedSurfaceFrame,
  outcome,
  publicationDecision,
  runtimeCanvas,
  selectedVisibleProjectionState,
  surfaceRef,
  visibleProjectionPublicationStateRef,
  visibleProjectionStateRef,
  visiblePublicationSchedulerRef,
}: {
  readonly abortPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedCommittedSurfaceFrame"];
  readonly committedSurfacePublicationEffect: GpuFlowCommittedSurfacePublicationEffect | null;
  readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly outcome: Extract<
    GpuFlowVisiblePublicationOutcome,
    { readonly kind: "hold-previous" }
  >;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
  readonly visibleProjectionPublicationStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionPublicationStateRef"];
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
  readonly visiblePublicationSchedulerRef: RenderGpuFlowSurfaceFrameInput["visiblePublicationSchedulerRef"];
}): void {
  applyGpuFlowHeldPreviousCommittedSurfacePublicationEffect({
    effect: committedSurfacePublicationEffect,
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
  if (!selectedVisibleProjectionState) {
    recordGpuFlowNoFrameHeldPreviousVisibleProjectionState({
      previousVisibleProjectionState:
        visibleProjectionPublicationStateRef.current ??
        visibleProjectionStateRef.current,
      publicationDecision,
      schedulerKnobs: visiblePublicationSchedulerRef.current.getKnobs(),
      token: outcome.token,
      visibleProjectionPublicationStateRef,
    });
    return;
  }
  recordGpuFlowHeldPreviousVisibleProjectionState({
    token: outcome.token,
    visibleProjectionPublicationStateRef,
    visibleProjectionState: selectedVisibleProjectionState,
  });
}

function publishGpuFlowNodeLayerFrameState(publication: {
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  const { nodeLayerFrameStatePublication, token } = publication;
  assertGpuFlowCommitPublicationTokenBrand({ token });
  if (nodeLayerFrameStatePublication === null) {
    return;
  }
  updateGpuFlowNodeLayerFrameState(nodeLayerFrameStatePublication);
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
  blockedErrorMessage,
  blockedPreparedCommittedSurfaceFrame,
  blockedPreservePreparationSnapshot,
  committedSurfacePublicationEffect,
  completion,
  outcome,
  publicationDecision,
  runtimeCanvas,
  surfaceRef,
}: {
  readonly abortPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedCommittedSurfaceFrame"];
  readonly blockedErrorMessage: string | null;
  readonly blockedPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly committedSurfacePublicationEffect: GpuFlowCommittedSurfacePublicationEffect | null;
  readonly completion: GpuFlowVisibleFramePublicationKernelResult<GpuFlowSurfacePublicationPreparedFrame>["completion"];
  readonly outcome: Extract<
    GpuFlowVisiblePublicationOutcome,
    { readonly kind: "blocked" }
  >;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
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
  applyGpuFlowBlockedCommittedSurfacePublicationEffect({
    effect: committedSurfacePublicationEffect,
    runtimeCanvas,
    surfaceRef,
    token: outcome.token,
  });
  recordGpuFlowBlockedVisiblePublication({
    frame: blockedPreparedCommittedSurfaceFrame,
    publicationCompletion: completion,
    publicationDecision,
    runtimeCanvas,
    token: outcome.token,
  });
  if (blockedErrorMessage) {
    throw new Error(blockedErrorMessage);
  }
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
