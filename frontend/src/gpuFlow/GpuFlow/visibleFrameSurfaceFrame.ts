import type { MutableRefObject } from "react";

import { nowChromeReproPerformanceMs } from "state/actions/chromeRepro";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowRuntime } from "../gpuDevice";
import { startGpuFlowPerformanceMeasure } from "../gpuFlowPerformanceMarks";
import type { GpuSurfaceProps } from "../GpuSurface";
import { getGpuWheelGestureOwnershipArbiter } from "../interactions/wheelOwnership";
import {
  createGpuFlowLiveProjectionSampler,
  createGpuFlowProjectionTransaction,
  createGpuFlowVisibleProjectionState,
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { withGpuFlowContentCatchupReasonForStalePublicationSample } from "../projectionSchedulerPolicy";
import type { GpuRetainedContentRuntimeState } from "../retainedContentRuntimeState";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import { normalizeGpuViewport, type GpuViewportInput } from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import { renderGpuFlowNodeLayerFrame } from "./flowFrame";
import type { GpuFlowNodeLayerFrameStatePublication } from "./flowFrameLifecycle";
import { renderGpuFlowNodeLayerProjectionFrame } from "./flowProjectionFrame";
import { createGpuFlowRetainedRuntimeFrameSourceRenderSignature } from "./flowRetainedRuntimeFrameSignatures";
import { sampleGpuFlowRetainedContentRuntimeScene } from "./retainedContentRuntimeSceneSampling";
import { isGpuFlowVisibleProjectionStateRetainedScrollCurrent } from "./retainedScrollProjectionState";
import type {
  GpuFlowVisibleFrameBudgetBroker,
  GpuFlowVisibleFrameBudgetBrokerDecision,
} from "./visibleFrameBudgetBroker";
import {
  createGpuFlowContentPublicationFrameResult,
  runGpuFlowVisibleFrameCoordinator,
  shouldConsiderGpuFlowDeferredContentPublication,
  shouldDeferGpuFlowBrowserVisualResourceWakeupForPublication,
  shouldSkipGpuFlowDeferredContentPublicationFrame,
  type GpuFlowContentPublicationFrameResult,
  type GpuFlowContentPublicationWorkPlan,
  type GpuFlowMotionProjectionFramePreparation,
  type GpuFlowMotionProjectionFrameWorkReport,
  type GpuFlowMotionProjectionWorkPlan,
  type GpuFlowProjectionFrameRenderablePlan,
  type GpuFlowRetainedCommittedSurfacePublicationContentStageRunner,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
  type GpuFlowVisibleFramePublicationPreparedCandidateSetFrame,
} from "./visibleFrameCoordinator";
import {
  createGpuFlowVisiblePublicationPresentationEvidence,
  type GpuFlowVisiblePublicationPresentationEvidence,
} from "./visibleFramePresentationEvidence";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowCommitPublicationToken,
  GpuFlowHoldPreviousToken,
} from "./visibleFramePresentationProofs";
import { resolveGpuFlowRetainedProjectionFrame } from "./visibleFrameProjectionCoverage";
import { shouldDeferGpuFlowContentPublicationResolutionUpdatesForFrame } from "./visibleFrameResolutionDeferral";
import type { GpuFlowVisibleFrameResourceGraphSnapshot } from "./visibleFrameResourceGraph";
import type {
  GpuFlowVisibleFrameReducerRuntime,
  GpuFlowVisiblePublicationDecision,
} from "./visibleFrameReducerRuntime";
import { recordGpuFlowSurfacePublicationFrameOutcomeDiagnostic } from "./visibleFrameSurfaceFrameDiagnostics";
import type { GpuFlowColdStartShellFrame } from "./visibleFrameTypes";

export { withGpuFlowContentCatchupReasonForStalePublicationSample };

type GpuFlowNodeLayerFrameInput = Parameters<
  typeof renderGpuFlowNodeLayerFrame
>[0];
type GpuFlowSurfaceFrameEvent = Parameters<
  NonNullable<GpuSurfaceProps["onFrame"]>
>[1];

type GpuFlowMotionProjectionFrameResult = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly presentationEvidence: GpuFlowVisiblePublicationPresentationEvidence | null;
  readonly projectionOnlyFrameWork: GpuFlowMotionProjectionFrameWorkReport | null;
  readonly rendered: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowSurfacePublicationPreparedFrame =
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
    GpuFlowContentPublicationFrameResult,
    GpuFlowMotionProjectionFrameResult
  >;

export type RenderGpuFlowSurfaceFrameInput = Omit<
  GpuFlowNodeLayerFrameInput,
  | "deferResolutionUpdates"
  | "deferBrowserVisualWakeup"
  | "frameReasons"
  | "heldPreviousProjectionState"
  | "liveProjectionSample"
  | "onRetainedDisplayFrame"
  | "onRetainedPreparedRuntimeFrame"
  | "publicationLane"
  | "runRetainedCommittedSurfacePublicationContentStage"
  | "viewportFrame"
> & {
  readonly abortPreparedCommittedSurfaceFrame: (
    token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken,
    frame: GpuFlowCommittedSurfaceFrame,
    options?:
      | {
          readonly browserVisualPreparationResourceKeys?:
            | readonly string[]
            | undefined;
          readonly preservePreparationSnapshot?: boolean | undefined;
        }
      | undefined,
  ) => void;
  readonly committedSurfaceFrameRef: MutableRefObject<GpuFlowCommittedSurfaceFrame | null>;
  readonly event: GpuFlowSurfaceFrameEvent;
  readonly getVisibleFrameResourceGraphSnapshot: () => GpuFlowVisibleFrameResourceGraphSnapshot;
  readonly initialRetainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly liveProjectionSamplerRef: MutableRefObject<
    ReturnType<typeof createGpuFlowLiveProjectionSampler>
  >;
  readonly commitPreparedCommittedSurfaceFrame: (
    token: GpuFlowCommitPublicationToken,
    frame: GpuFlowCommittedSurfaceFrame,
  ) => boolean;
  readonly validatePreparedCommittedSurfaceFrame: (
    token: GpuFlowCommitPublicationToken,
    frame: GpuFlowCommittedSurfaceFrame,
  ) => void;
  readonly prepareCommittedSurfaceFrame: NonNullable<
    GpuFlowNodeLayerFrameInput["onRetainedDisplayFrame"]
  >;
  readonly prepareVisibleFrameResourcesForBudget: (
    budgetDecision: GpuFlowVisibleFrameBudgetBrokerDecision,
  ) => void;
  readonly projectCommittedBrowserVisualActors: (
    token: GpuFlowCommitPublicationToken,
    viewport?: GpuViewportInput | undefined,
  ) => void;
  readonly publishColdStartShellFrame: (publication: {
    readonly frame: GpuFlowColdStartShellFrame | null;
    readonly token: GpuFlowCommitPublicationToken;
  }) => void;
  readonly retainedPreparationRuntimeFrameRenderSignatureRef: MutableRefObject<
    string | null
  >;
  readonly retainedPreparationRuntimeFrameScrollRevisionRef: MutableRefObject<
    number | null
  >;
  readonly retainedRuntimeFrameRenderSignatureRef: MutableRefObject<
    string | null
  >;
  readonly retainedRuntimeFrameSourceRenderSignatureRef: MutableRefObject<
    string | null
  >;
  readonly runtime: GpuFlowRuntime;
  readonly visibleCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame;
  readonly visibleOverlayProjectionKeyRef: MutableRefObject<string | null>;
  readonly visibleFrameBudgetBrokerRef: MutableRefObject<GpuFlowVisibleFrameBudgetBroker>;
  readonly visibleProjectionPublicationStateRef: MutableRefObject<GpuFlowVisibleProjectionState | null>;
  readonly visibleProjectionStateRef: MutableRefObject<GpuFlowVisibleProjectionState | null>;
  readonly visibleFrameReducerRuntimeRef: MutableRefObject<GpuFlowVisibleFrameReducerRuntime>;
  readonly viewportRuntime: GpuFlowViewportRuntime;
};

export function renderGpuFlowSurfaceFrame({
  event,
  nodeLayerRef,
  retainedContentRuntimeState,
  runtime,
  viewportRuntime,
  viewportStore,
  ...input
}: RenderGpuFlowSurfaceFrameInput) {
  const frameMeasureDetail: Record<
    string,
    boolean | number | string | null | undefined
  > = {
    frame: input.frameRef.current,
    reasons: event.reasons.join("+") || "none",
  };
  const frameStartedAtMs = nowChromeReproPerformanceMs();
  const finishFrameMeasure = startGpuFlowPerformanceMeasure(
    "surface-frame",
    frameMeasureDetail,
  );
  try {
    const finishSetupMeasure = startGpuFlowPerformanceMeasure(
      "surface-frame-setup",
      frameMeasureDetail,
    );
    let finishCompletionMeasure: () => number = () => 0;
    const coordinatorResult = runGpuFlowVisibleFrameCoordinator({
      budgetBroker: input.visibleFrameBudgetBrokerRef.current,
      presentationRuntime: {
        abortPreparedCommittedSurfaceFrame:
          input.abortPreparedCommittedSurfaceFrame,
        callbacksRef: input.callbacksRef,
        commitPreparedCommittedSurfaceFrame:
          input.commitPreparedCommittedSurfaceFrame,
        projectCommittedBrowserVisualActors:
          input.projectCommittedBrowserVisualActors,
        publishColdStartShellFrame: input.publishColdStartShellFrame,
        retainedDisplayFrameRef: input.retainedDisplayFrameRef,
        retainedRuntimeFrameRenderSignatureRef:
          input.retainedRuntimeFrameRenderSignatureRef,
        retainedRuntimeFrameSourceRenderSignatureRef:
          input.retainedRuntimeFrameSourceRenderSignatureRef,
        runtimeCanvas: runtime.canvas,
        surfaceRef: input.surfaceRef,
        validatePreparedCommittedSurfaceFrame:
          input.validatePreparedCommittedSurfaceFrame,
        viewportRuntime,
        visibleOverlayProjectionKeyRef: input.visibleOverlayProjectionKeyRef,
        visibleProjectionPublicationStateRef:
          input.visibleProjectionPublicationStateRef,
        visibleProjectionStateRef: input.visibleProjectionStateRef,
      },
      prepareVisibleFrameResourcesForBudget:
        input.prepareVisibleFrameResourcesForBudget,
      prepareMotionProjectionFrame: ({
        motionProjectionWorkPlan,
        previousVisibleProjectionState,
        publicationDecision,
        publicationFrameContext,
      }) => {
        frameMeasureDetail.lane = publicationDecision.lane;
        frameMeasureDetail.schedulerState = publicationDecision.schedulerState;
        frameMeasureDetail.contentDebt = publicationDecision.debt.content;
        frameMeasureDetail.maintenanceDebt =
          publicationDecision.debt.maintenance;
        frameMeasureDetail.motionDebt = publicationDecision.debt.motion;
        frameMeasureDetail.requestContentDebt =
          publicationFrameContext.frameRequest.contentDebt;
        frameMeasureDetail.requestCriticalContentDebt =
          publicationFrameContext.frameRequest.criticalContentDebt;
        frameMeasureDetail.requestMaintenanceDebt =
          publicationFrameContext.frameRequest.maintenanceDebt;
        frameMeasureDetail.requestMotionDebt =
          publicationFrameContext.frameRequest.motionDebt;
        frameMeasureDetail.requestMotionRetryDeferred =
          publicationFrameContext.frameRequest.motionRetryDeferred;
        frameMeasureDetail.viewportFrame =
          publicationFrameContext.viewportFrame;
        frameMeasureDetail.deferResolutionUpdates =
          publicationFrameContext.deferResolutionUpdates;
        finishSetupMeasure();
        const finishMotionMeasure = startGpuFlowPerformanceMeasure(
          "surface-frame-motion-projection",
          frameMeasureDetail,
        );
        const motionProjectionPreparation =
          prepareGpuFlowSurfaceMotionProjectionFrame({
            ...input,
            event,
            liveProjectionSample: publicationDecision.sample,
            nodeLayerRef,
            previousVisibleProjectionState,
            motionProjectionWorkPlan,
            retainedContentRuntimeState,
            runtime,
            viewportFrame: publicationFrameContext.viewportFrame,
            viewportStore,
          });
        if (motionProjectionPreparation.kind === "not-rendered") {
          finishMotionMeasure();
          frameMeasureDetail.motionRendered =
            motionProjectionPreparation.frame.rendered;
          return motionProjectionPreparation;
        }
        return {
          ...motionProjectionPreparation,
          createBlockedProjectionFrame: (blockedInput) => {
            const frame =
              motionProjectionPreparation.createBlockedProjectionFrame(
                blockedInput,
              );
            finishMotionMeasure();
            frameMeasureDetail.motionRendered = frame.rendered;
            return frame;
          },
          renderProjectionFrame: (renderInput) => {
            const frame =
              motionProjectionPreparation.renderProjectionFrame(renderInput);
            finishMotionMeasure();
            frameMeasureDetail.motionRendered = frame.rendered;
            return frame;
          },
        };
      },
      prepareContentPublicationFrame: ({
        contentPublicationWorkPlan,
        previousVisibleProjectionState,
        publicationDecision,
        publicationFrameContext,
        runRetainedCommittedSurfacePublicationContentStage,
      }) => {
        const finishContentMeasure = startGpuFlowPerformanceMeasure(
          "surface-frame-content-publication",
          frameMeasureDetail,
        );
        const contentPublicationFrame =
          renderGpuFlowSurfaceContentPublicationFrame({
            ...input,
            deferResolutionUpdates:
              publicationFrameContext.deferResolutionUpdates,
            event,
            liveProjectionSample: publicationDecision.sample,
            nodeLayerRef,
            contentPublicationWorkPlan,
            activeEditorActivationPending:
              publicationFrameContext.activeEditorPins.length > 0,
            previousVisibleProjectionState,
            publicationDecision,
            retainedContentRuntimeState,
            runtime,
            runRetainedCommittedSurfacePublicationContentStage,
            viewportFrame: publicationFrameContext.viewportFrame,
            viewportStore,
          });
        finishContentMeasure();
        frameMeasureDetail.contentRendered = contentPublicationFrame.rendered;
        frameMeasureDetail.contentVisibleTransaction =
          contentPublicationFrame.visibleProjectionState?.transaction.kind ??
          null;
        frameMeasureDetail.contentCommittedSurfacePublished =
          contentPublicationFrame.committedSurfaceFrame !== null;
        frameMeasureDetail.contentBlocked =
          contentPublicationFrame.blockedPublicationCandidate !== null;
        frameMeasureDetail.contentForceImmediateDebtFrame =
          contentPublicationFrame.forceImmediatePublicationDebtFrame;
        finishCompletionMeasure = startGpuFlowPerformanceMeasure(
          "surface-frame-completion",
          frameMeasureDetail,
        );
        return contentPublicationFrame;
      },
      sampleVisibleFramePublication: () => {
        const runtimeFrame = viewportRuntime.runFrame(frameStartedAtMs);
        const hasCommittedContentFrame = hasGpuFlowCommittedContentFrame(
          input.committedSurfaceFrameRef.current,
        );
        const previousVisibleProjectionState =
          input.visibleProjectionPublicationStateRef.current ??
          input.visibleProjectionStateRef.current;
        frameMeasureDetail.hasCommittedContentFrame = hasCommittedContentFrame;
        nodeLayerRef.current = {
          ...nodeLayerRef.current,
          viewport: viewportRuntime.getViewportTuple(),
        };
        sampleGpuFlowRetainedContentRuntimeScene({
          nodeLayerRef,
          retainedContentRuntimeState,
        });
        const sample = input.liveProjectionSamplerRef.current.capture({
          canvasSize: input.canvasSizeRef.current,
          gestureOwner:
            getGpuWheelGestureOwnershipArbiter(viewportStore).getState().owner,
          retainedContentRuntimeState,
          timestamp: frameStartedAtMs,
          viewport: nodeLayerRef.current.viewport,
        });
        const sampleViewport = normalizeGpuViewport(sample.viewport);
        frameMeasureDetail.eventTimestamp = event.timestamp;
        frameMeasureDetail.frameStartedAtMs = frameStartedAtMs;
        frameMeasureDetail.sampleTimestamp = sample.timestamp;
        frameMeasureDetail.sampleViewportX = sampleViewport.x;
        frameMeasureDetail.sampleViewportY = sampleViewport.y;
        frameMeasureDetail.sampleViewportZoom = sampleViewport.zoom;
        return {
          hasCommittedContentFrame,
          previousVisibleProjectionState,
          rawReasons: withGpuFlowContentCatchupReasonForStalePublicationSample({
            committedFrame: input.committedSurfaceFrameRef.current,
            previousVisibleProjectionState,
            rawReasons: event.reasons,
            sample,
          }),
          runtimeViewportFrame: runtimeFrame.viewportFrame,
          sample,
          timestamp: frameStartedAtMs,
          visibleFrameResourceGraphSnapshot:
            input.getVisibleFrameResourceGraphSnapshot(),
          viewportInteractionActive:
            viewportStore.getState().viewportInteractionActive,
        };
      },
      reducerRuntime: input.visibleFrameReducerRuntimeRef.current,
    });
    const reducerCompletion = coordinatorResult.completeReducerFrame();
    recordGpuFlowSurfacePublicationFrameOutcomeDiagnostic({
      coordinatorResult,
      frame: input.frameRef.current,
      frameReasons: event.reasons,
      postFrameResourceGraphSnapshot:
        input.getVisibleFrameResourceGraphSnapshot(),
      reducerCompletion,
    });
    frameMeasureDetail.publicationDebtFrameReason =
      reducerCompletion.debtFrameRequest?.frameReason ?? null;
    finishCompletionMeasure();
    const visibleProjectionState = input.visibleProjectionStateRef.current;
    requestGpuFlowRetainedScrollCatchupFrameForStaleVisibleState({
      retainedContentRuntimeState,
      surface: input.surfaceRef.current,
      visibleProjectionState,
    });
    input.callbacksRef.current.onFrame?.(runtime, event);
    return {
      visibleProjectionState,
    };
  } finally {
    finishFrameMeasure();
  }
}

export function shouldRequestGpuFlowRetainedScrollCatchupFrame({
  retainedContentRuntimeState,
  visibleProjectionState,
}: {
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): boolean {
  return (
    visibleProjectionState !== null &&
    !isGpuFlowVisibleProjectionStateRetainedScrollCurrent({
      retainedContentRuntimeState,
      visibleProjectionState,
    })
  );
}

function requestGpuFlowRetainedScrollCatchupFrameForStaleVisibleState({
  retainedContentRuntimeState,
  surface,
  visibleProjectionState,
}: {
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly surface: RenderGpuFlowSurfaceFrameInput["surfaceRef"]["current"];
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): void {
  if (
    !shouldRequestGpuFlowRetainedScrollCatchupFrame({
      retainedContentRuntimeState,
      visibleProjectionState,
    })
  ) {
    return;
  }
  surface?.requestFrame("retained-scroll");
}

export function hasGpuFlowCommittedContentFrame(
  frame: Pick<GpuFlowCommittedSurfaceFrame, "retainedDisplayFrame"> | null,
): boolean {
  return frame !== null && frame.retainedDisplayFrame !== null;
}

function prepareGpuFlowSurfaceMotionProjectionFrame({
  committedSurfaceFrameRef,
  event,
  liveProjectionSample,
  motionProjectionWorkPlan,
  nodeLayerRef,
  previousVisibleProjectionState,
  runtime,
  visibleCommittedSurfaceFrame,
  viewportFrame,
  viewportStore,
  ...input
}: Omit<
  RenderGpuFlowSurfaceFrameInput,
  "initialRetainedRuntimeFrame" | "viewportRuntime"
> & {
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly motionProjectionWorkPlan: GpuFlowMotionProjectionWorkPlan;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly viewportFrame: boolean;
}): GpuFlowMotionProjectionFramePreparation<GpuFlowMotionProjectionFrameResult> {
  if (motionProjectionWorkPlan.kind === "skip") {
    return {
      frame: createGpuFlowMotionProjectionFrameResult({ rendered: false }),
      kind: "not-rendered",
    };
  }
  const committedFrame =
    committedSurfaceFrameRef.current ?? visibleCommittedSurfaceFrame;
  const projectionTransaction = createGpuFlowProjectionTransaction({
    committedFrame,
    kind: "motion-projection",
    lane: "motion",
    rawReasons: event.reasons,
    sample: liveProjectionSample,
  });
  const retainedDisplayFrame = input.retainedDisplayFrameRef.current;
  if (!retainedDisplayFrame) {
    return {
      frame: createGpuFlowMotionProjectionFrameResult({ rendered: false }),
      kind: "not-rendered",
    };
  }
  return {
    createBlockedProjectionFrame: ({ blockedPublicationCandidate }) =>
      createGpuFlowMotionProjectionFrameResult({
        blockedPublicationCandidate,
        rendered: false,
      }),
    kind: "render",
    requestedTransaction: projectionTransaction,
    resolveRetainedProjectionFrame: ({ transaction }) =>
      resolveGpuFlowRetainedProjectionFrame({
        layer: nodeLayerRef.current,
        retainedDisplayFrame,
        transaction,
      }),
    renderProjectionFrame: ({
      projectionFrameRenderPlan,
      requestedProjectionTransaction,
    }) =>
      renderGpuFlowSurfaceMotionProjectionFrame({
        ...input,
        committedFrame,
        event,
        nodeLayerRef,
        previousVisibleProjectionState,
        projectionFrameRenderPlan,
        projectionTransaction: requestedProjectionTransaction,
        runtime,
        viewportFrame,
        viewportStore,
      }),
  };
}

function renderGpuFlowSurfaceMotionProjectionFrame({
  committedFrame,
  event,
  nodeLayerRef,
  previousVisibleProjectionState,
  projectionFrameRenderPlan,
  projectionTransaction,
  runtime,
  viewportFrame,
  viewportStore,
  ...input
}: Omit<
  RenderGpuFlowSurfaceFrameInput,
  | "committedSurfaceFrameRef"
  | "initialRetainedRuntimeFrame"
  | "viewportRuntime"
  | "visibleCommittedSurfaceFrame"
> & {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly projectionFrameRenderPlan: GpuFlowProjectionFrameRenderablePlan;
  readonly projectionTransaction: ReturnType<
    typeof createGpuFlowProjectionTransaction
  >;
  readonly viewportFrame: boolean;
}): GpuFlowMotionProjectionFrameResult {
  const rendered = renderGpuFlowNodeLayerProjectionFrame({
    activeResizeNodeIdRef: input.activeResizeNodeIdRef,
    callbacksRef: input.callbacksRef,
    canvasSizeRef: input.canvasSizeRef,
    frameReasons: event.reasons,
    frameRef: input.frameRef,
    interactionDiagnosticsRef: input.interactionDiagnosticsRef,
    nodeElementByIdRef: input.nodeElementByIdRef,
    nodeDomTransformSyncCacheRef: input.nodeDomTransformSyncCacheRef,
    nodeInteractionRef: input.nodeInteractionRef,
    nodeLayerRef,
    projectionFrameRenderPlan,
    requestedProjectionTransaction: projectionTransaction,
    heldPreviousProjectionState: previousVisibleProjectionState,
    htmlSurfaceRendererRef: input.htmlSurfaceRendererRef,
    retainedContentPageManagerRef: input.retainedContentPageManagerRef,
    retainedContentSwitchAnimations: input.retainedContentSwitchAnimations,
    retainedDisplayFrameRef: input.retainedDisplayFrameRef,
    runtime,
    surfaceRef: input.surfaceRef,
    textureManagerRef: input.textureManagerRef,
    transformOnlyPaintNodeIdsRef: input.transformOnlyPaintNodeIdsRef,
    visibleNodeIdsRef: input.visibleNodeIdsRef,
    viewportStore,
    viewportFrame,
  });
  if (!rendered.rendered) {
    return createGpuFlowMotionProjectionFrameResult({
      rendered: false,
    });
  }
  const visibleCommittedFrame =
    rendered.transaction.kind === "held-previous"
      ? previousVisibleProjectionState?.committedFrame ?? committedFrame
      : committedFrame;
  return createGpuFlowMotionProjectionFrameResult({
    nodeLayerFrameStatePublication: rendered.nodeLayerFrameStatePublication,
    projectionOnlyFrameWork: rendered.projectionOnlyFrameWork ?? null,
    rendered: true,
    visibleProjectionState: createGpuFlowVisibleProjectionState({
      committedFrame: visibleCommittedFrame,
      heldPreviousProjection: rendered.heldPreviousProjection,
      transaction: rendered.transaction,
    }),
  });
}

function createGpuFlowMotionProjectionFrameResult({
  blockedPublicationCandidate = null,
  nodeLayerFrameStatePublication = null,
  presentationEvidence,
  projectionOnlyFrameWork = null,
  rendered,
  visibleProjectionState = null,
}: {
  readonly blockedPublicationCandidate?:
    | GpuFlowVisibleFrameBlockedPublicationCandidate
    | null
    | undefined;
  readonly nodeLayerFrameStatePublication?:
    | GpuFlowNodeLayerFrameStatePublication
    | null
    | undefined;
  readonly presentationEvidence?:
    | GpuFlowVisiblePublicationPresentationEvidence
    | null
    | undefined;
  readonly projectionOnlyFrameWork?:
    | GpuFlowMotionProjectionFrameWorkReport
    | null
    | undefined;
  readonly rendered: boolean;
  readonly visibleProjectionState?:
    | GpuFlowVisibleProjectionState
    | null
    | undefined;
}): GpuFlowMotionProjectionFrameResult {
  return {
    blockedPublicationCandidate,
    nodeLayerFrameStatePublication,
    presentationEvidence:
      presentationEvidence ??
      (visibleProjectionState
        ? createGpuFlowVisiblePublicationPresentationEvidence({
            nodeLayerFrameStatePublication,
            visibleProjectionState,
          })
        : null),
    projectionOnlyFrameWork,
    rendered,
    visibleProjectionState,
  };
}

function renderGpuFlowSurfaceContentPublicationFrame({
  activeEditorActivationPending,
  contentPublicationWorkPlan,
  deferResolutionUpdates,
  event,
  liveProjectionSample,
  nodeLayerRef,
  previousVisibleProjectionState,
  publicationDecision,
  retainedContentRuntimeState,
  retainedPreparationRuntimeFrameRenderSignatureRef,
  retainedPreparationRuntimeFrameScrollRevisionRef,
  runtime,
  runRetainedCommittedSurfacePublicationContentStage,
  viewportFrame,
  viewportStore,
  ...input
}: Omit<RenderGpuFlowSurfaceFrameInput, "viewportRuntime"> & {
  readonly activeEditorActivationPending: boolean;
  readonly contentPublicationWorkPlan: GpuFlowContentPublicationWorkPlan;
  readonly deferResolutionUpdates: boolean;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly runRetainedCommittedSurfacePublicationContentStage: GpuFlowRetainedCommittedSurfacePublicationContentStageRunner;
  readonly viewportFrame: boolean;
}): GpuFlowContentPublicationFrameResult {
  const contentDeferResolutionUpdates =
    shouldDeferGpuFlowContentPublicationResolutionUpdatesForFrame({
      committedFrame: input.committedSurfaceFrameRef.current,
      deferResolutionUpdates,
      hasPreviousVisibleProjectionState:
        previousVisibleProjectionState !== null,
      sample: liveProjectionSample,
      viewportFrame,
    });
  if (
    !shouldRenderGpuFlowSurfaceContentPublicationFrame({
      activeEditorActivationPending,
      contentPublicationWorkPlan,
      deferResolutionUpdates,
      previousVisibleProjectionState,
      publicationDecision,
      retainedContentFrameCacheRef: input.retainedContentFrameCacheRef,
      retainedDisplayFrameRef: input.retainedDisplayFrameRef,
    })
  ) {
    return createGpuFlowContentPublicationFrameResult({ rendered: false });
  }
  if (contentPublicationWorkPlan.kind !== "prepare") {
    throw new Error(
      "GPU Flow content publication frame requires a coordinator prepare work plan.",
    );
  }
  return renderGpuFlowNodeLayerFrame({
    activeResizeNodeIdRef: input.activeResizeNodeIdRef,
    callbacksRef: input.callbacksRef,
    canvasSizeRef: input.canvasSizeRef,
    deferResolutionUpdates: contentDeferResolutionUpdates,
    deferBrowserVisualWakeup:
      shouldDeferGpuFlowBrowserVisualResourceWakeupForPublication({
        budgetBroker: input.visibleFrameBudgetBrokerRef.current,
        deferResolutionUpdates: contentDeferResolutionUpdates,
        publicationDecision,
      }),
    frameReasons: event.reasons,
    frameRef: input.frameRef,
    interactionDiagnosticsRef: input.interactionDiagnosticsRef,
    nodeElementByIdRef: input.nodeElementByIdRef,
    nodeDomTransformSyncCacheRef: input.nodeDomTransformSyncCacheRef,
    nodeInteractionRef: input.nodeInteractionRef,
    nodeLayerRef,
    htmlSurfaceRendererRef: input.htmlSurfaceRendererRef,
    retainedContentPageManagerRef: input.retainedContentPageManagerRef,
    retainedContentFrameCacheRef: input.retainedContentFrameCacheRef,
    retainedContentRuntimeState,
    retainedDisplayFrameRef: input.retainedDisplayFrameRef,
    retainedContentSwitchAnimations: input.retainedContentSwitchAnimations,
    heldPreviousProjectionState: previousVisibleProjectionState,
    liveProjectionSample,
    publicationLane: contentPublicationWorkPlan.publicationLane,
    runtime,
    surfaceRef: input.surfaceRef,
    textureManagerRef: input.textureManagerRef,
    transformOnlyPaintNodeIdsRef: input.transformOnlyPaintNodeIdsRef,
    visibleNodeIdsRef: input.visibleNodeIdsRef,
    viewportStore,
    viewportFrame,
    runRetainedCommittedSurfacePublicationContentStage,
    onRetainedPreparedRuntimeFrame: (nextRetainedRuntimeFrame) => {
      const nextSignature =
        createGpuFlowRetainedRuntimeFrameSourceRenderSignature(
          nextRetainedRuntimeFrame,
        );
      if (
        retainedPreparationRuntimeFrameRenderSignatureRef.current ===
        nextSignature
      ) {
        return;
      }
      retainedPreparationRuntimeFrameRenderSignatureRef.current = nextSignature;
      retainedPreparationRuntimeFrameScrollRevisionRef.current =
        nextRetainedRuntimeFrame.input.scrollRevision;
    },
    onRetainedDisplayFrame: input.prepareCommittedSurfaceFrame,
  });
}

function shouldRenderGpuFlowSurfaceContentPublicationFrame({
  activeEditorActivationPending,
  contentPublicationWorkPlan,
  deferResolutionUpdates,
  previousVisibleProjectionState,
  publicationDecision,
  retainedContentFrameCacheRef,
  retainedDisplayFrameRef,
}: {
  readonly activeEditorActivationPending: boolean;
  readonly contentPublicationWorkPlan: GpuFlowContentPublicationWorkPlan;
  readonly deferResolutionUpdates: boolean;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly retainedContentFrameCacheRef: RenderGpuFlowSurfaceFrameInput["retainedContentFrameCacheRef"];
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
}): boolean {
  if (contentPublicationWorkPlan.kind === "skip") {
    return false;
  }
  return !shouldSkipDeferredGpuFlowContentPublication({
    activeEditorActivationPending,
    deferResolutionUpdates,
    previousVisibleProjectionState,
    publicationDecision,
    retainedContentFrameCacheRef,
    retainedDisplayFrameRef,
  });
}

function shouldSkipDeferredGpuFlowContentPublication({
  activeEditorActivationPending,
  deferResolutionUpdates,
  previousVisibleProjectionState,
  publicationDecision,
  retainedContentFrameCacheRef,
  retainedDisplayFrameRef,
}: {
  readonly activeEditorActivationPending: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly retainedContentFrameCacheRef: RenderGpuFlowSurfaceFrameInput["retainedContentFrameCacheRef"];
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
}): boolean {
  if (
    !shouldConsiderGpuFlowDeferredContentPublication({
      activeEditorActivationPending,
      deferResolutionUpdates,
      hasPreviousRetainedDisplayFrame: retainedDisplayFrameRef.current !== null,
      hasPreviousVisibleProjectionState:
        previousVisibleProjectionState !== null,
      publicationDecision,
    })
  ) {
    return false;
  }
  return shouldSkipGpuFlowDeferredContentPublicationFrame({
    canReusePreparedFrame: false,
    hasPreparedFrame: retainedContentFrameCacheRef.current !== null,
    hasUnpublishedPreparedSourceFrame: false,
    shouldConsiderDeferredPublication: true,
  });
}
