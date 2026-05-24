import type { MutableRefObject } from "react";

import { nowChromeReproPerformanceMs } from "state/actions/chromeRepro";

import type { GpuFlowRuntime } from "../gpuDevice";
import { startGpuFlowPerformanceMeasure } from "../gpuFlowPerformanceMarks";
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuSurfaceProps } from "../GpuSurface";
import { getGpuWheelGestureOwnershipArbiter } from "../interactions/wheelOwnership";
import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import {
  createGpuFlowLiveProjectionSampler,
  createGpuFlowProjectionTransaction,
  createGpuFlowVisibleProjectionState,
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { withGpuFlowContentCatchupReasonForStalePreparedContentSample } from "../projectionSchedulerPolicy";
import type { GpuRetainedContentRuntimeState } from "../retainedContentRuntimeState";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import { normalizeGpuViewport, type GpuViewportInput } from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import { renderGpuFlowNodeLayerFrame } from "./flowFrame";
import type { GpuFlowNodeLayerFrameStatePresentation } from "./flowFrameLifecycle";
import { renderGpuFlowNodeLayerProjectionFrame } from "./flowProjectionFrame";
import { createGpuFlowRetainedRuntimeFrameSourceRenderSignature } from "./flowRetainedRuntimeFrameSignatures";
import { sampleGpuFlowRetainedContentRuntimeScene } from "./retainedContentRuntimeSceneSampling";
import { isGpuFlowVisibleProjectionStateRetainedScrollCurrent } from "./retainedScrollProjectionState";
import type {
  GpuFlowVisibleFrameBudgetBroker,
  GpuFlowVisibleFrameBudgetBrokerDecision,
} from "./visibleFrameBudgetBroker";
import {
  createGpuFlowContentPreparationFrameResult,
  runGpuFlowVisibleFrameCoordinator,
  shouldConsiderGpuFlowDeferredContentPreparation,
  shouldDeferGpuFlowBrowserVisualResourceWakeupForPreparation,
  shouldSkipGpuFlowDeferredContentPreparationFrame,
  type GpuFlowContentPreparationFrameResult,
  type GpuFlowContentPreparationWorkPlan,
  type GpuFlowMotionProjectionFramePreparation,
  type GpuFlowMotionProjectionFrameWorkReport,
  type GpuFlowMotionProjectionWorkPlan,
  type GpuFlowProjectionFrameRenderablePlan,
  type GpuFlowRetainedPreparedContentFramePresentationContentStageRunner,
  type GpuFlowVisibleFrameBlockedPresentationCandidate,
  type GpuFlowVisibleFramePresentationFrameContext,
  type GpuFlowVisibleFramePresentationPreparedCandidateSetFrame,
} from "./visibleFrameCoordinator";
import {
  createGpuFlowVisibleFramePresentationEvidence,
  type GpuFlowVisibleFramePresentationEvidence,
} from "./visibleFramePresentationEvidence";
import type {
  GpuFlowBlockedPresentationToken,
  GpuFlowHoldPreviousToken,
  GpuFlowVisibleFramePresentationToken,
} from "./visibleFramePresentationProofs";
import { resolveGpuFlowRetainedProjectionFrame } from "./visibleFrameProjectionCoverage";
import type {
  GpuFlowVisibleFrameReducerDecision,
  GpuFlowVisibleFrameReducerRuntime,
} from "./visibleFrameReducerRuntime";
import { shouldDeferGpuFlowContentPreparationResolutionUpdatesForFrame } from "./visibleFrameResolutionDeferral";
import type { GpuFlowVisibleFrameResourceGraphSnapshot } from "./visibleFrameResourceGraph";
import { recordGpuFlowSurfacePresentationFrameOutcomeDiagnostic } from "./visibleFrameSurfaceFrameDiagnostics";
import type { GpuFlowColdStartShellFrame } from "./visibleFrameTypes";

export { withGpuFlowContentCatchupReasonForStalePreparedContentSample };

type GpuFlowNodeLayerFrameInput = Parameters<
  typeof renderGpuFlowNodeLayerFrame
>[0];
type GpuFlowSurfaceFrameEvent = Parameters<
  NonNullable<GpuSurfaceProps["onFrame"]>
>[1];
type GpuFlowSurfaceFrameMeasureDetail = Record<
  string,
  boolean | number | string | null | undefined
>;

type GpuFlowMotionProjectionFrameResult = {
  readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly nodeLayerFrameStatePresentation: GpuFlowNodeLayerFrameStatePresentation | null;
  readonly presentationEvidence: GpuFlowVisibleFramePresentationEvidence | null;
  readonly projectionOnlyFrameWork: GpuFlowMotionProjectionFrameWorkReport | null;
  readonly rendered: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowSurfacePresentationPreparedFrame =
  GpuFlowVisibleFramePresentationPreparedCandidateSetFrame<
    GpuFlowContentPreparationFrameResult,
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
  | "contentWorkLane"
  | "runRetainedPreparedContentFramePresentationContentStage"
  | "viewportFrame"
> & {
  readonly abortPreparedContentFrame: (
    token: GpuFlowBlockedPresentationToken | GpuFlowHoldPreviousToken,
    frame: GpuFlowPreparedContentFrame,
    options?:
      | {
          readonly browserVisualPreparationResourceKeys?:
            | readonly string[]
            | undefined;
          readonly preservePreparationSnapshot?: boolean | undefined;
        }
      | undefined,
  ) => void;
  readonly presentedContentFrameRef: MutableRefObject<GpuFlowPreparedContentFrame | null>;
  readonly event: GpuFlowSurfaceFrameEvent;
  readonly getVisibleFrameResourceGraphSnapshot: () => GpuFlowVisibleFrameResourceGraphSnapshot;
  readonly initialRetainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly liveProjectionSamplerRef: MutableRefObject<
    ReturnType<typeof createGpuFlowLiveProjectionSampler>
  >;
  readonly presentPreparedContentFrame: (
    token: GpuFlowVisibleFramePresentationToken,
    frame: GpuFlowPreparedContentFrame,
  ) => boolean;
  readonly validatePreparedContentFrame: (
    token: GpuFlowVisibleFramePresentationToken,
    frame: GpuFlowPreparedContentFrame,
  ) => void;
  readonly prepareContentFrame: NonNullable<
    GpuFlowNodeLayerFrameInput["onRetainedDisplayFrame"]
  >;
  readonly prepareVisibleFrameResourcesForBudget: (
    budgetDecision: GpuFlowVisibleFrameBudgetBrokerDecision,
  ) => void;
  readonly projectPresentedBrowserVisualActors: (
    token: GpuFlowVisibleFramePresentationToken,
    viewport?: GpuViewportInput | undefined,
  ) => void;
  readonly presentColdStartShellFrame: (presentation: {
    readonly frame: GpuFlowColdStartShellFrame | null;
    readonly token: GpuFlowVisibleFramePresentationToken;
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
  readonly visiblePresentedContentFrame: GpuFlowPreparedContentFrame;
  readonly visibleOverlayProjectionKeyRef: MutableRefObject<string | null>;
  readonly visibleFrameBudgetBrokerRef: MutableRefObject<GpuFlowVisibleFrameBudgetBroker>;
  readonly visibleProjectionPresentationStateRef: MutableRefObject<GpuFlowVisibleProjectionState | null>;
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
  const frameMeasureDetail: GpuFlowSurfaceFrameMeasureDetail = {
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
        abortPreparedContentFrame: input.abortPreparedContentFrame,
        callbacksRef: input.callbacksRef,
        presentPreparedContentFrame: input.presentPreparedContentFrame,
        projectPresentedBrowserVisualActors:
          input.projectPresentedBrowserVisualActors,
        presentColdStartShellFrame: input.presentColdStartShellFrame,
        retainedDisplayFrameRef: input.retainedDisplayFrameRef,
        retainedRuntimeFrameRenderSignatureRef:
          input.retainedRuntimeFrameRenderSignatureRef,
        retainedRuntimeFrameSourceRenderSignatureRef:
          input.retainedRuntimeFrameSourceRenderSignatureRef,
        runtimeCanvas: runtime.canvas,
        surfaceRef: input.surfaceRef,
        validatePreparedContentFrame: input.validatePreparedContentFrame,
        viewportRuntime,
        visibleOverlayProjectionKeyRef: input.visibleOverlayProjectionKeyRef,
        visibleProjectionPresentationStateRef:
          input.visibleProjectionPresentationStateRef,
        visibleProjectionStateRef: input.visibleProjectionStateRef,
      },
      prepareVisibleFrameResourcesForBudget:
        input.prepareVisibleFrameResourcesForBudget,
      prepareMotionProjectionFrame: ({
        motionProjectionWorkPlan,
        previousVisibleProjectionState,
        reducerDecision,
        presentationFrameContext,
      }) => {
        recordGpuFlowSurfaceFrameReducerDecisionMeasureDetail({
          frameMeasureDetail,
          presentationFrameContext,
          reducerDecision,
        });
        finishSetupMeasure();
        const finishMotionMeasure = startGpuFlowPerformanceMeasure(
          "surface-frame-motion-projection",
          frameMeasureDetail,
        );
        const motionProjectionPreparation =
          prepareGpuFlowSurfaceMotionProjectionFrame({
            ...input,
            event,
            liveProjectionSample: reducerDecision.sample,
            nodeLayerRef,
            previousVisibleProjectionState,
            motionProjectionWorkPlan,
            retainedContentRuntimeState,
            runtime,
            viewportFrame: presentationFrameContext.viewportFrame,
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
      prepareContentPreparationFrame: ({
        contentPreparationWorkPlan,
        previousVisibleProjectionState,
        reducerDecision,
        presentationFrameContext,
        runRetainedPreparedContentFramePresentationContentStage,
      }) => {
        frameMeasureDetail.activeEditorPinCount =
          presentationFrameContext.activeEditorPins.length;
        frameMeasureDetail.contentWorkPlanKind =
          contentPreparationWorkPlan.kind;
        frameMeasureDetail.hasPreviousRetainedDisplayFrame =
          input.retainedDisplayFrameRef.current !== null;
        frameMeasureDetail.hasPreviousVisibleProjectionState =
          previousVisibleProjectionState !== null;
        const finishContentMeasure = startGpuFlowPerformanceMeasure(
          "surface-frame-prepared-content",
          frameMeasureDetail,
        );
        const contentPreparationFrame =
          renderGpuFlowSurfaceContentPreparationFrame({
            ...input,
            deferResolutionUpdates:
              presentationFrameContext.deferResolutionUpdates,
            event,
            liveProjectionSample: reducerDecision.sample,
            nodeLayerRef,
            contentPreparationWorkPlan,
            activeEditorActivationPending:
              presentationFrameContext.activeEditorPins.length > 0,
            previousVisibleProjectionState,
            reducerDecision,
            retainedContentRuntimeState,
            runtime,
            runRetainedPreparedContentFramePresentationContentStage,
            viewportFrame: presentationFrameContext.viewportFrame,
            viewportStore,
          });
        finishContentMeasure();
        frameMeasureDetail.contentRendered = contentPreparationFrame.rendered;
        frameMeasureDetail.contentVisibleTransaction =
          contentPreparationFrame.visibleProjectionState?.transaction.kind ??
          null;
        frameMeasureDetail.contentSurfacePresented =
          contentPreparationFrame.preparedContentFrame !== null;
        frameMeasureDetail.contentBlocked =
          contentPreparationFrame.blockedPresentationCandidate !== null;
        frameMeasureDetail.contentForceImmediateDebtFrame =
          contentPreparationFrame.forceImmediateReducerDebtFrame;
        finishCompletionMeasure = startGpuFlowPerformanceMeasure(
          "surface-frame-completion",
          frameMeasureDetail,
        );
        return contentPreparationFrame;
      },
      sampleVisibleFramePresentation: () => {
        const runtimeFrame = viewportRuntime.runFrame(frameStartedAtMs);
        const hasPresentedContentFrame = hasGpuFlowPresentedContentFrame(
          input.presentedContentFrameRef.current,
        );
        const previousVisibleProjectionState =
          input.visibleProjectionPresentationStateRef.current ??
          input.visibleProjectionStateRef.current;
        frameMeasureDetail.hasPresentedContentFrame = hasPresentedContentFrame;
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
          hasPresentedContentFrame,
          previousVisibleProjectionState,
          rawReasons:
            withGpuFlowContentCatchupReasonForStalePreparedContentSample({
              preparedContentFrame: input.presentedContentFrameRef.current,
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
    recordGpuFlowSurfacePresentationFrameOutcomeDiagnostic({
      coordinatorResult,
      frame: input.frameRef.current,
      frameReasons: event.reasons,
      postFrameResourceGraphSnapshot:
        input.getVisibleFrameResourceGraphSnapshot(),
      reducerCompletion,
    });
    frameMeasureDetail.presentationDebtFrameReason =
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

export function hasGpuFlowPresentedContentFrame(
  frame: Pick<GpuFlowPreparedContentFrame, "retainedDisplayFrame"> | null,
): boolean {
  return frame !== null && frame.retainedDisplayFrame !== null;
}

function recordGpuFlowSurfaceFrameReducerDecisionMeasureDetail({
  frameMeasureDetail,
  presentationFrameContext,
  reducerDecision,
}: {
  readonly frameMeasureDetail: GpuFlowSurfaceFrameMeasureDetail;
  readonly presentationFrameContext: GpuFlowVisibleFramePresentationFrameContext;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): void {
  const safetyDebt = getGpuFlowSurfaceFrameClassifiedDebtMeasure(
    reducerDecision.classifiedDebt?.safety,
  );
  const continuityDebt = getGpuFlowSurfaceFrameClassifiedDebtMeasure(
    reducerDecision.classifiedDebt?.continuity,
  );
  const qualityDebt = getGpuFlowSurfaceFrameClassifiedDebtMeasure(
    reducerDecision.classifiedDebt?.quality,
  );
  frameMeasureDetail.lane = reducerDecision.lane;
  frameMeasureDetail.reducerState = reducerDecision.reducerState;
  frameMeasureDetail.reducerReasons =
    reducerDecision.rawReasons.join("+") || "none";
  frameMeasureDetail.contentDebt = reducerDecision.debt.content;
  frameMeasureDetail.maintenanceDebt = reducerDecision.debt.maintenance;
  frameMeasureDetail.motionDebt = reducerDecision.debt.motion;
  frameMeasureDetail.safetyDebtActive = safetyDebt.active;
  frameMeasureDetail.safetyDebtAgeFrames = safetyDebt.ageFrames;
  frameMeasureDetail.continuityDebtActive = continuityDebt.active;
  frameMeasureDetail.continuityDebtAgeFrames = continuityDebt.ageFrames;
  frameMeasureDetail.qualityDebtActive = qualityDebt.active;
  frameMeasureDetail.qualityDebtAgeFrames = qualityDebt.ageFrames;
  frameMeasureDetail.requestContentDebt =
    presentationFrameContext.frameRequest.contentDebt;
  frameMeasureDetail.requestCriticalContentDebt =
    presentationFrameContext.frameRequest.criticalContentDebt;
  frameMeasureDetail.requestMaintenanceDebt =
    presentationFrameContext.frameRequest.maintenanceDebt;
  frameMeasureDetail.requestMotionDebt =
    presentationFrameContext.frameRequest.motionDebt;
  frameMeasureDetail.requestMotionRetryDeferred =
    presentationFrameContext.frameRequest.motionRetryDeferred;
  frameMeasureDetail.viewportFrame = presentationFrameContext.viewportFrame;
  frameMeasureDetail.deferResolutionUpdates =
    presentationFrameContext.deferResolutionUpdates;
}

function getGpuFlowSurfaceFrameClassifiedDebtMeasure(
  debt:
    | {
        readonly active: boolean;
        readonly ageFrames: number;
      }
    | undefined,
): { readonly active: boolean; readonly ageFrames: number } {
  return debt ?? { active: false, ageFrames: 0 };
}

function prepareGpuFlowSurfaceMotionProjectionFrame({
  presentedContentFrameRef,
  event,
  liveProjectionSample,
  motionProjectionWorkPlan,
  nodeLayerRef,
  previousVisibleProjectionState,
  runtime,
  visiblePresentedContentFrame,
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
  const preparedContentFrame =
    presentedContentFrameRef.current ?? visiblePresentedContentFrame;
  const projectionTransaction = createGpuFlowProjectionTransaction({
    preparedContentFrame,
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
    createBlockedProjectionFrame: ({ blockedPresentationCandidate }) =>
      createGpuFlowMotionProjectionFrameResult({
        blockedPresentationCandidate,
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
        preparedContentFrame,
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
  preparedContentFrame,
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
  | "presentedContentFrameRef"
  | "initialRetainedRuntimeFrame"
  | "viewportRuntime"
  | "visiblePresentedContentFrame"
> & {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
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
  const visiblePreparedContentFrame =
    rendered.transaction.kind === "held-previous"
      ? previousVisibleProjectionState?.preparedContentFrame ??
        preparedContentFrame
      : preparedContentFrame;
  return createGpuFlowMotionProjectionFrameResult({
    nodeLayerFrameStatePresentation: rendered.nodeLayerFrameStatePresentation,
    projectionOnlyFrameWork: rendered.projectionOnlyFrameWork ?? null,
    rendered: true,
    visibleProjectionState: createGpuFlowVisibleProjectionState({
      preparedContentFrame: visiblePreparedContentFrame,
      heldPreviousProjection: rendered.heldPreviousProjection,
      transaction: rendered.transaction,
    }),
  });
}

function createGpuFlowMotionProjectionFrameResult({
  blockedPresentationCandidate = null,
  nodeLayerFrameStatePresentation = null,
  presentationEvidence,
  projectionOnlyFrameWork = null,
  rendered,
  visibleProjectionState = null,
}: {
  readonly blockedPresentationCandidate?:
    | GpuFlowVisibleFrameBlockedPresentationCandidate
    | null
    | undefined;
  readonly nodeLayerFrameStatePresentation?:
    | GpuFlowNodeLayerFrameStatePresentation
    | null
    | undefined;
  readonly presentationEvidence?:
    | GpuFlowVisibleFramePresentationEvidence
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
    blockedPresentationCandidate,
    nodeLayerFrameStatePresentation,
    presentationEvidence:
      presentationEvidence ??
      (visibleProjectionState
        ? createGpuFlowVisibleFramePresentationEvidence({
            nodeLayerFrameStatePresentation,
            visibleProjectionState,
          })
        : null),
    projectionOnlyFrameWork,
    rendered,
    visibleProjectionState,
  };
}

function renderGpuFlowSurfaceContentPreparationFrame({
  activeEditorActivationPending,
  contentPreparationWorkPlan,
  deferResolutionUpdates,
  event,
  liveProjectionSample,
  nodeLayerRef,
  previousVisibleProjectionState,
  reducerDecision,
  retainedContentRuntimeState,
  retainedPreparationRuntimeFrameRenderSignatureRef,
  retainedPreparationRuntimeFrameScrollRevisionRef,
  runtime,
  runRetainedPreparedContentFramePresentationContentStage,
  viewportFrame,
  viewportStore,
  ...input
}: Omit<RenderGpuFlowSurfaceFrameInput, "viewportRuntime"> & {
  readonly activeEditorActivationPending: boolean;
  readonly contentPreparationWorkPlan: GpuFlowContentPreparationWorkPlan;
  readonly deferResolutionUpdates: boolean;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly runRetainedPreparedContentFramePresentationContentStage: GpuFlowRetainedPreparedContentFramePresentationContentStageRunner;
  readonly viewportFrame: boolean;
}): GpuFlowContentPreparationFrameResult {
  const contentDeferResolutionUpdates =
    shouldDeferGpuFlowContentPreparationResolutionUpdatesForFrame({
      preparedContentFrame: input.presentedContentFrameRef.current,
      deferResolutionUpdates,
      hasPreviousVisibleProjectionState:
        previousVisibleProjectionState !== null,
      sample: liveProjectionSample,
      viewportFrame,
    });
  if (
    !shouldRenderGpuFlowSurfaceContentPreparationFrame({
      activeEditorActivationPending,
      contentPreparationWorkPlan,
      deferResolutionUpdates,
      frameReasons: event.reasons,
      previousVisibleProjectionState,
      reducerDecision,
      retainedContentFrameCacheRef: input.retainedContentFrameCacheRef,
      retainedDisplayFrameRef: input.retainedDisplayFrameRef,
    })
  ) {
    return createGpuFlowContentPreparationFrameResult({ rendered: false });
  }
  if (contentPreparationWorkPlan.kind !== "prepare") {
    throw new Error(
      "GPU Flow content preparation frame requires a coordinator prepare work plan.",
    );
  }
  return renderGpuFlowNodeLayerFrame({
    activeResizeNodeIdRef: input.activeResizeNodeIdRef,
    callbacksRef: input.callbacksRef,
    canvasSizeRef: input.canvasSizeRef,
    deferResolutionUpdates: contentDeferResolutionUpdates,
    deferBrowserVisualWakeup:
      shouldDeferGpuFlowBrowserVisualResourceWakeupForPreparation({
        budgetBroker: input.visibleFrameBudgetBrokerRef.current,
        deferResolutionUpdates: contentDeferResolutionUpdates,
        reducerDecision,
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
    contentWorkLane: contentPreparationWorkPlan.contentWorkLane,
    runtime,
    surfaceRef: input.surfaceRef,
    textureManagerRef: input.textureManagerRef,
    transformOnlyPaintNodeIdsRef: input.transformOnlyPaintNodeIdsRef,
    visibleNodeIdsRef: input.visibleNodeIdsRef,
    viewportStore,
    viewportFrame,
    runRetainedPreparedContentFramePresentationContentStage,
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
    onRetainedDisplayFrame: input.prepareContentFrame,
  });
}

function shouldRenderGpuFlowSurfaceContentPreparationFrame({
  activeEditorActivationPending,
  contentPreparationWorkPlan,
  deferResolutionUpdates,
  frameReasons,
  previousVisibleProjectionState,
  reducerDecision,
  retainedContentFrameCacheRef,
  retainedDisplayFrameRef,
}: {
  readonly activeEditorActivationPending: boolean;
  readonly contentPreparationWorkPlan: GpuFlowContentPreparationWorkPlan;
  readonly deferResolutionUpdates: boolean;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly retainedContentFrameCacheRef: RenderGpuFlowSurfaceFrameInput["retainedContentFrameCacheRef"];
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
}): boolean {
  if (contentPreparationWorkPlan.kind === "skip") {
    return false;
  }
  return !shouldSkipDeferredGpuFlowContentPresentation({
    activeEditorActivationPending,
    deferResolutionUpdates,
    frameReasons,
    previousVisibleProjectionState,
    reducerDecision,
    retainedContentFrameCacheRef,
    retainedDisplayFrameRef,
  });
}

function shouldSkipDeferredGpuFlowContentPresentation({
  activeEditorActivationPending,
  deferResolutionUpdates,
  frameReasons,
  previousVisibleProjectionState,
  reducerDecision,
  retainedContentFrameCacheRef,
  retainedDisplayFrameRef,
}: {
  readonly activeEditorActivationPending: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly retainedContentFrameCacheRef: RenderGpuFlowSurfaceFrameInput["retainedContentFrameCacheRef"];
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
}): boolean {
  if (
    !shouldConsiderGpuFlowDeferredContentPreparation({
      activeEditorActivationPending,
      deferResolutionUpdates,
      frameReasons,
      hasPreviousRetainedDisplayFrame: retainedDisplayFrameRef.current !== null,
      hasPreviousVisibleProjectionState:
        previousVisibleProjectionState !== null,
      reducerDecision,
    })
  ) {
    return false;
  }
  return shouldSkipGpuFlowDeferredContentPreparationFrame({
    canReusePreparedFrame: false,
    hasPreparedFrame: retainedContentFrameCacheRef.current !== null,
    hasUnpresentedPreparedSourceFrame: false,
    shouldConsiderDeferredPreparation: true,
  });
}
