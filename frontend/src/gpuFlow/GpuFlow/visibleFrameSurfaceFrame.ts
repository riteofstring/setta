import type { MutableRefObject } from "react";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowRuntime } from "../gpuDevice";
import { startGpuFlowPerformanceMeasure } from "../gpuFlowPerformanceMarks";
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuSurfaceProps } from "../GpuSurface";
import { getGpuWheelGestureOwnershipArbiter } from "../interactions/wheelOwnership";
import {
  createGpuFlowLiveProjectionSampler,
  createGpuFlowProjectionTransaction,
  createGpuFlowVisibleProjectionState,
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import { chooseZoomBucket } from "../textureResolution";
import { normalizeGpuViewport, type GpuViewportInput } from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import { renderGpuFlowNodeLayerFrame } from "./flowFrame";
import type { GpuFlowNodeLayerFrameStatePublication } from "./flowFrameLifecycle";
import { createGpuFlowRetainedRuntimeFrameSourceSignature } from "./flowMountedSceneNodes";
import { renderGpuFlowNodeLayerProjectionFrame } from "./flowProjectionFrame";
import { shouldReuseGpuFlowDeferredRetainedContentPublicationFrame } from "./flowRetainedContentFrameCache";
import { createGpuFlowRetainedRuntimeFrameSourceRenderSignature } from "./flowRetainedRuntimeFrameSignatures";
import { sampleGpuFlowRetainedContentRuntimeScene } from "./retainedContentRuntimeSceneSampling";
import type {
  GpuFlowVisibleFrameBudgetBroker,
  GpuFlowVisibleFrameBudgetBrokerDecision,
} from "./visibleFrameBudgetBroker";
import {
  createGpuFlowContentPublicationFrameResult,
  runGpuFlowVisibleFrameCoordinator,
  shouldConsiderGpuFlowDeferredContentPublication,
  shouldDeferGpuFlowBrowserVisualResourceWakeupForPublication,
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
import { createGpuFlowVisibleFramePresenter } from "./visibleFramePresenter";
import { resolveGpuFlowRetainedProjectionFrame } from "./visibleFrameProjectionCoverage";
import type {
  GpuFlowVisibleFrameRequestCoordinator,
  GpuFlowVisiblePublicationDecision,
} from "./visibleFrameScheduling";
import type { GpuFlowVisibleFrameResourceGraphSnapshot } from "./visibleFrameResourceGraph";
import type { GpuFlowColdStartShellFrame } from "./visibleFrameTypes";

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
    readonly token:
      | GpuFlowBlockedPublicationToken
      | GpuFlowCommitPublicationToken
      | GpuFlowHoldPreviousToken;
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
  readonly visibleFrameCoordinatorRef: MutableRefObject<GpuFlowVisibleFrameRequestCoordinator>;
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
    const publishGpuFlowSurfacePublicationFrame =
      createGpuFlowVisibleFramePresenter({
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
        viewportRuntime,
        visibleFrameBudgetBrokerRef: input.visibleFrameBudgetBrokerRef,
        visibleOverlayProjectionKeyRef: input.visibleOverlayProjectionKeyRef,
        visibleProjectionPublicationStateRef:
          input.visibleProjectionPublicationStateRef,
        visibleProjectionStateRef: input.visibleProjectionStateRef,
      });
    runGpuFlowVisibleFrameCoordinator({
      budgetBroker: input.visibleFrameBudgetBrokerRef.current,
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
      publish: publishGpuFlowSurfacePublicationFrame,
      sampleVisibleFramePublication: () => {
        const runtimeFrame = viewportRuntime.runFrame(event.timestamp);
        const hasCommittedContentFrame =
          input.retainedDisplayFrameRef.current !== null;
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
          timestamp: event.timestamp,
          viewport: nodeLayerRef.current.viewport,
        });
        const sampleViewport = normalizeGpuViewport(sample.viewport);
        frameMeasureDetail.eventTimestamp = event.timestamp;
        frameMeasureDetail.sampleTimestamp = sample.timestamp;
        frameMeasureDetail.sampleViewportX = sampleViewport.x;
        frameMeasureDetail.sampleViewportY = sampleViewport.y;
        frameMeasureDetail.sampleViewportZoom = sampleViewport.zoom;
        return {
          hasCommittedContentFrame,
          previousVisibleProjectionState:
            input.visibleProjectionPublicationStateRef.current ??
            input.visibleProjectionStateRef.current,
          rawReasons: withGpuFlowContentCatchupReasonForStalePublicationSample({
            committedFrame: input.committedSurfaceFrameRef.current,
            rawReasons: event.reasons,
            sample,
          }),
          runtimeViewportFrame: runtimeFrame.viewportFrame,
          sample,
          timestamp: event.timestamp,
          visibleFrameResourceGraphSnapshot:
            input.getVisibleFrameResourceGraphSnapshot(),
          viewportInteractionActive:
            viewportStore.getState().viewportInteractionActive,
        };
      },
      scheduler: input.visibleFrameCoordinatorRef.current,
    });
    finishCompletionMeasure();
    const visibleProjectionState = input.visibleProjectionStateRef.current;
    input.callbacksRef.current.onFrame?.(runtime, event);
    return {
      visibleProjectionState,
    };
  } finally {
    finishFrameMeasure();
  }
}

export function withGpuFlowContentCatchupReasonForStalePublicationSample({
  committedFrame,
  rawReasons,
  sample,
}: {
  readonly committedFrame: Pick<
    GpuFlowCommittedSurfaceFrame,
    "coherence" | "viewportSample"
  > | null;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly sample: Pick<
    GpuFlowLiveProjectionSample,
    "retainedScrollRevision" | "viewport"
  >;
}): readonly GpuFrameReason[] {
  if (
    !committedFrame ||
    isGpuFlowCommittedSurfaceFrameSampleCurrent({
      committedFrame,
      sample,
    }) ||
    rawReasons.includes("manual")
  ) {
    return rawReasons;
  }
  return Object.freeze([...rawReasons, "manual" as const]);
}

export function shouldDeferGpuFlowContentPublicationResolutionUpdatesForSample({
  committedFrame,
  deferResolutionUpdates,
  sample,
}: {
  readonly committedFrame: Pick<
    GpuFlowCommittedSurfaceFrame,
    "coherence" | "viewportSample"
  > | null;
  readonly deferResolutionUpdates: boolean;
  readonly sample: Pick<
    GpuFlowLiveProjectionSample,
    "retainedScrollRevision" | "viewport"
  >;
}): boolean {
  return (
    deferResolutionUpdates &&
    (committedFrame === null ||
      isGpuFlowCommittedSurfaceFrameSampleCurrent({ committedFrame, sample }))
  );
}

function isGpuFlowCommittedSurfaceFrameSampleCurrent({
  committedFrame,
  sample,
}: {
  readonly committedFrame: Pick<
    GpuFlowCommittedSurfaceFrame,
    "coherence" | "viewportSample"
  >;
  readonly sample: Pick<
    GpuFlowLiveProjectionSample,
    "retainedScrollRevision" | "viewport"
  >;
}): boolean {
  return (
    committedFrame.coherence.retainedScrollRevision ===
      sample.retainedScrollRevision &&
    areGpuFlowProjectionViewportsEqual(
      committedFrame.viewportSample,
      sample.viewport,
    )
  );
}

function areGpuFlowProjectionViewportsEqual(
  left: GpuViewportInput,
  right: GpuViewportInput,
): boolean {
  const normalizedLeft = normalizeGpuViewport(left);
  const normalizedRight = normalizeGpuViewport(right);
  return (
    normalizedLeft.x === normalizedRight.x &&
    normalizedLeft.y === normalizedRight.y &&
    normalizedLeft.zoom === normalizedRight.zoom
  );
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
    hasActiveRetainedDomControl:
      hasActiveGpuFlowRetainedDomControlCandidate(retainedDisplayFrame),
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

function hasActiveGpuFlowRetainedDomControlCandidate(
  retainedDisplayFrame: RetainedDisplayFrame,
): boolean {
  return retainedDisplayFrame.retainedRuntimeFrame.descriptors.domControlSources.some(
    (control) => control.active,
  );
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
  readonly contentPublicationWorkPlan: GpuFlowContentPublicationWorkPlan;
  readonly deferResolutionUpdates: boolean;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly runRetainedCommittedSurfacePublicationContentStage: GpuFlowRetainedCommittedSurfacePublicationContentStageRunner;
  readonly viewportFrame: boolean;
}): GpuFlowContentPublicationFrameResult {
  const contentDeferResolutionUpdates =
    shouldDeferGpuFlowContentPublicationResolutionUpdatesForSample({
      committedFrame: input.committedSurfaceFrameRef.current,
      deferResolutionUpdates,
      sample: liveProjectionSample,
    });
  if (
    !shouldRenderGpuFlowSurfaceContentPublicationFrame({
      contentPublicationWorkPlan,
      deferResolutionUpdates: contentDeferResolutionUpdates,
      liveProjectionSample,
      nodeElementByIdRef: input.nodeElementByIdRef,
      nodeLayerRef,
      publicationDecision,
      retainedContentFrameCacheRef: input.retainedContentFrameCacheRef,
      retainedDisplayFrameRef: input.retainedDisplayFrameRef,
      retainedPreparationRuntimeFrameRenderSignatureRef,
      retainedRuntimeFrameSourceRenderSignatureRef:
        input.retainedRuntimeFrameSourceRenderSignatureRef,
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
  contentPublicationWorkPlan,
  deferResolutionUpdates,
  liveProjectionSample,
  nodeElementByIdRef,
  nodeLayerRef,
  publicationDecision,
  retainedContentFrameCacheRef,
  retainedDisplayFrameRef,
  retainedPreparationRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
}: {
  readonly contentPublicationWorkPlan: GpuFlowContentPublicationWorkPlan;
  readonly deferResolutionUpdates: boolean;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly nodeElementByIdRef: RenderGpuFlowSurfaceFrameInput["nodeElementByIdRef"];
  readonly nodeLayerRef: RenderGpuFlowSurfaceFrameInput["nodeLayerRef"];
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly retainedContentFrameCacheRef: RenderGpuFlowSurfaceFrameInput["retainedContentFrameCacheRef"];
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly retainedPreparationRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedPreparationRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
}): boolean {
  if (contentPublicationWorkPlan.kind === "skip") {
    return false;
  }
  return !shouldSkipDeferredGpuFlowContentPublication({
    deferResolutionUpdates,
    liveProjectionSample,
    nodeElementByIdRef,
    nodeLayerRef,
    publicationDecision,
    retainedContentFrameCacheRef,
    retainedDisplayFrameRef,
    retainedPreparationRuntimeFrameRenderSignatureRef,
    retainedRuntimeFrameSourceRenderSignatureRef,
  });
}

function shouldSkipDeferredGpuFlowContentPublication({
  deferResolutionUpdates,
  liveProjectionSample,
  nodeElementByIdRef,
  nodeLayerRef,
  publicationDecision,
  retainedContentFrameCacheRef,
  retainedDisplayFrameRef,
  retainedPreparationRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly nodeElementByIdRef: RenderGpuFlowSurfaceFrameInput["nodeElementByIdRef"];
  readonly nodeLayerRef: RenderGpuFlowSurfaceFrameInput["nodeLayerRef"];
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly retainedContentFrameCacheRef: RenderGpuFlowSurfaceFrameInput["retainedContentFrameCacheRef"];
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly retainedPreparationRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedPreparationRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
}): boolean {
  if (
    !shouldConsiderGpuFlowDeferredContentPublication({
      deferResolutionUpdates,
      hasPreviousRetainedDisplayFrame: retainedDisplayFrameRef.current !== null,
      publicationDecision,
    })
  ) {
    return false;
  }
  const preparedFrame = retainedContentFrameCacheRef.current;
  if (!preparedFrame) {
    return false;
  }
  if (
    hasUnpublishedGpuFlowRetainedRuntimeSourceFrame({
      retainedPreparationRuntimeFrameRenderSignatureRef,
      retainedRuntimeFrameSourceRenderSignatureRef,
    })
  ) {
    return false;
  }
  const targetZoomBucket = chooseZoomBucket(
    normalizeGpuViewport(liveProjectionSample.viewport).zoom,
  );
  return isReusableGpuFlowDeferredContentPublicationFrame({
    nodeElementByIdRef,
    nodeLayerRef,
    preparedFrame,
    targetViewport: liveProjectionSample.viewport,
    targetZoomBucket,
  });
}

function isReusableGpuFlowDeferredContentPublicationFrame({
  nodeElementByIdRef,
  nodeLayerRef,
  preparedFrame,
  targetViewport,
  targetZoomBucket,
}: {
  readonly nodeElementByIdRef: RenderGpuFlowSurfaceFrameInput["nodeElementByIdRef"];
  readonly nodeLayerRef: RenderGpuFlowSurfaceFrameInput["nodeLayerRef"];
  readonly preparedFrame: NonNullable<
    RenderGpuFlowSurfaceFrameInput["retainedContentFrameCacheRef"]["current"]
  >;
  readonly targetViewport: GpuViewportInput;
  readonly targetZoomBucket: ReturnType<typeof chooseZoomBucket>;
}): boolean {
  return shouldReuseGpuFlowDeferredRetainedContentPublicationFrame({
    cachedFrame: preparedFrame,
    contentSurfaces: nodeLayerRef.current.scene?.contentSurfaces,
    nativeVisualSignature: createGpuFlowRetainedRuntimeFrameSourceSignature({
      layer: nodeLayerRef.current,
      nodeElementById: nodeElementByIdRef.current,
    }),
    sceneRevision: nodeLayerRef.current.scene?.revision ?? 0,
    targetViewport,
    targetZoomBucket,
  });
}

function hasUnpublishedGpuFlowRetainedRuntimeSourceFrame({
  retainedPreparationRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
}: {
  readonly retainedPreparationRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedPreparationRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
}): boolean {
  const preparedSourceSignature =
    retainedPreparationRuntimeFrameRenderSignatureRef.current;
  return (
    preparedSourceSignature !== null &&
    preparedSourceSignature !==
      retainedRuntimeFrameSourceRenderSignatureRef.current
  );
}
