import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  applyGpuFlowProjectionDebugAttributes,
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
  publishGpuFlowNodeLayerFrameState,
  type GpuFlowNodeLayerFrameStatePublication,
} from "./flowFrameLifecycle";
import {
  createGpuFlowRetainedRuntimeFrameOverlayRenderSignature,
  createGpuFlowRetainedRuntimeFrameSourceRenderSignature,
} from "./flowRetainedRuntimeFrameSignatures";
import type {
  GpuFlowSurfacePublicationPreparedFrame,
  RenderGpuFlowSurfaceFrameInput,
} from "./flowSurfaceFramePublication";
import { createGpuFlowVisibleOverlayProjectionKey } from "./flowVisibleOverlayProjectionKey";
import { recordGpuFlowBlockedPublicationGuard } from "./flowVisiblePublicationBlockedGuard";
import { postGpuFlowVisiblePublicationOutcomeChromeReproEvent } from "./flowVisiblePublicationOutcomeChromeRepro";
import { assertGpuFlowSingleVisiblePublicationOutcome } from "./flowVisiblePublicationOutcomeGuard";
import type {
  GpuFlowCommittedSurfacePublicationEffect,
  GpuFlowVisibleFramePublicationKernelResult,
  GpuFlowVisiblePublicationOutcome,
} from "./visibleFramePublicationKernel";
import { resolveGpuFlowBlockedCommittedSurfacePublicationAbort } from "./visibleFramePublicationKernel";
import {
  assertGpuFlowCommitPublicationToken,
  assertGpuFlowCommitPublicationTokenBrand,
  assertGpuFlowCommitPublicationTokenForProjectionSample,
  assertGpuFlowHoldPreviousTokenForProjectionSample,
  type GpuFlowCommitPublicationToken,
  type GpuFlowHoldPreviousToken,
} from "./visibleFramePublicationTokens";

type GpuFlowSurfacePublicationPublisher = (
  publicationTransaction: GpuFlowVisibleFramePublicationKernelResult<GpuFlowSurfacePublicationPreparedFrame>,
) => void;

const deferredResolutionFrameTimers = new WeakMap<GpuSurfaceHandle, number>();

type GpuFlowSurfacePublicationPublisherInput = Omit<
  Parameters<typeof completeGpuFlowSurfacePublicationFrame>[0],
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
  assertGpuFlowCommitPublicationToken({
    frame: visibleProjectionState.committedFrame,
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
}) {
  const {
    completion,
    debtFrameRequest,
    followUpFrameRequests,
    heldPreviousVisibleProjectionState,
    outcome,
    preparedFrame: {
      contentPublicationFrame: {
        blockedErrorMessage,
        blockedPreparedCommittedSurfaceFrame,
        blockedPreservePreparationSnapshot,
        committedSurfaceFrame,
        committedSurfacePublicationEffect,
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
    heldPreviousVisibleProjectionState,
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
  });
  publishGpuFlowColdStartShellFrame({
    coldStartShellPublication,
    publishColdStartShellFrame,
  });
  postGpuFlowVisiblePublicationOutcomeChromeReproEvent({
    completion,
    outcome,
    publicationDecision,
    previousCommittedFrameId: publicationTransaction.previousCommittedFrameId,
    transactionOracle: publicationTransaction.preparedFrame.transactionOracle,
    visibleProjectionState:
      selectedVisibleProjectionState ?? heldPreviousVisibleProjectionState,
  });
  recordGpuFlowBlockedPublicationGuard({
    outcome,
    publicationDecision,
    surface: surfaceRef.current,
  });
  requestGpuFlowSurfacePublicationFollowUpFrames({
    followUpFrameRequests,
    surfaceRef,
  });
  requestGpuFlowSurfacePublicationDebtFrame({
    debtFrameRequest,
    surfaceRef,
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
    });
}

function requestGpuFlowSurfacePublicationFollowUpFrames({
  followUpFrameRequests,
  surfaceRef,
}: {
  readonly followUpFrameRequests: GpuFlowVisibleFramePublicationKernelResult<GpuFlowSurfacePublicationPreparedFrame>["followUpFrameRequests"];
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
}): void {
  for (const frameReason of followUpFrameRequests) {
    surfaceRef.current?.requestFrame(frameReason);
  }
}

function requestGpuFlowSurfacePublicationDebtFrame({
  debtFrameRequest,
  surfaceRef,
}: {
  readonly debtFrameRequest: GpuFlowVisibleFramePublicationKernelResult<GpuFlowSurfacePublicationPreparedFrame>["debtFrameRequest"];
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
}): void {
  if (debtFrameRequest === null) {
    return;
  }
  if (
    debtFrameRequest.delayMs !== null &&
    scheduleDelayedGpuFlowPublicationDebtFrame({
      delayMs: debtFrameRequest.delayMs,
      frameReason: debtFrameRequest.frameReason,
      surfaceRef,
    })
  ) {
    return;
  }
  surfaceRef.current?.requestFrame(debtFrameRequest.frameReason);
}

function scheduleDelayedGpuFlowPublicationDebtFrame({
  delayMs,
  frameReason,
  surfaceRef,
}: {
  readonly delayMs: number;
  readonly frameReason: GpuFrameReason;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
}): boolean {
  const surface = surfaceRef.current;
  const ownerWindow = surface?.getRuntime()?.canvas.ownerDocument.defaultView;
  if (!surface || !ownerWindow) {
    return false;
  }
  const existingTimer = deferredResolutionFrameTimers.get(surface);
  if (existingTimer !== undefined) {
    ownerWindow.clearTimeout(existingTimer);
  }
  const timer = ownerWindow.setTimeout(
    () => {
      deferredResolutionFrameTimers.delete(surface);
      surface.requestFrame(frameReason);
    },
    Math.max(0, delayMs),
  );
  deferredResolutionFrameTimers.set(surface, timer);
  return true;
}

function publishGpuFlowColdStartShellFrame({
  coldStartShellPublication,
  publishColdStartShellFrame,
}: {
  readonly coldStartShellPublication: GpuFlowVisibleFramePublicationKernelResult<GpuFlowSurfacePublicationPreparedFrame>["coldStartShellPublication"];
  readonly publishColdStartShellFrame: RenderGpuFlowSurfaceFrameInput["publishColdStartShellFrame"];
}): void {
  publishColdStartShellFrame(coldStartShellPublication);
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
  heldPreviousVisibleProjectionState,
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
  readonly heldPreviousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
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
        heldPreviousVisibleProjectionState,
        outcome,
        runtimeCanvas,
        selectedVisibleProjectionState,
        surfaceRef,
        visibleProjectionPublicationStateRef,
      });
      return;
    case "blocked": {
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
        blockedErrorMessage,
        blockedPreparedCommittedSurfaceFrame:
          blockedCommittedSurfaceAbort.frame,
        blockedPreservePreparationSnapshot:
          blockedCommittedSurfaceAbort.preservePreparationSnapshot,
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
  committedSurfacePublicationEffect,
  heldPreparedCommittedSurfaceFrame,
  heldPreviousVisibleProjectionState,
  outcome,
  runtimeCanvas,
  selectedVisibleProjectionState,
  surfaceRef,
  visibleProjectionPublicationStateRef,
}: {
  readonly abortPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedCommittedSurfaceFrame"];
  readonly committedSurfacePublicationEffect: GpuFlowCommittedSurfacePublicationEffect | null;
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
  const visibleProjectionState =
    selectedVisibleProjectionState ?? heldPreviousVisibleProjectionState;
  if (!visibleProjectionState) {
    throw new Error(
      "GPU Flow held-previous publication requires a selected or kernel-proven held visible projection state.",
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
