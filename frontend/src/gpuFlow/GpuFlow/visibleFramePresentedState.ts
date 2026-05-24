import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import { startGpuFlowPerformanceMeasure } from "../gpuFlowPerformanceMarks";
import {
  createGpuFlowPreparedContentFrame,
  createGpuFlowStartupPreparedContentFrame,
  type GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import { createGpuFlowPresentedSurfaceRuntime } from "../presentedSurfaceRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuViewportInput } from "../viewportMath";
import { getGpuFlowBrowserVisualActorRuntimeForPresentedSurface } from "./browserVisualActorRuntime";
import {
  createGpuFlowVisibleFrameSelectedResourceWorkKeys,
  type GpuFlowVisibleFrameBudgetBrokerDecision,
} from "./visibleFrameBudgetBroker";
import {
  assertGpuFlowPreparedCandidateAbortToken,
  type GpuFlowBlockedPresentationToken,
  type GpuFlowHoldPreviousToken,
  type GpuFlowVisibleFramePresentationToken,
} from "./visibleFramePresentationProofs";
import { createGpuFlowVisibleFrameResourceGraph } from "./visibleFrameResourceGraph";

export function useGpuFlowPresentedSurfaceFrameState({
  initialRetainedRuntimeFrame,
}: {
  readonly initialRetainedRuntimeFrame: GpuRetainedRuntimeFrame;
}) {
  const presentedContentFrameRef = useRef<GpuFlowPreparedContentFrame | null>(
    null,
  );
  const startupPresentedContentFrame = useMemo(
    () =>
      createGpuFlowStartupPreparedContentFrame({
        retainedRuntimeFrame: initialRetainedRuntimeFrame,
      }),
    [initialRetainedRuntimeFrame],
  );
  const presentedSurfaceRuntimeRef = useRef(
    createGpuFlowPresentedSurfaceRuntime(startupPresentedContentFrame),
  );
  const visibleFrameResourceGraphRef = useRef(
    createGpuFlowVisibleFrameResourceGraph(),
  );
  const semanticSnapshot = useSyncExternalStore(
    presentedSurfaceRuntimeRef.current.subscribeReactSemanticSnapshot.bind(
      presentedSurfaceRuntimeRef.current,
    ),
    presentedSurfaceRuntimeRef.current.getReactSemanticSnapshot.bind(
      presentedSurfaceRuntimeRef.current,
    ),
    presentedSurfaceRuntimeRef.current.getReactSemanticSnapshot.bind(
      presentedSurfaceRuntimeRef.current,
    ),
  );
  const visiblePresentedContentFrame = semanticSnapshot.frame;
  presentedContentFrameRef.current =
    presentedSurfaceRuntimeRef.current.getPresentedContentFrame();

  const prepareContentFrame = useCallback(
    (
      nextRetainedDisplayFrame: RetainedDisplayFrame,
      options?:
        | {
            readonly gpuNativeVisuals:
              | readonly HtmlSurfaceSolidRoundedRectVisual[]
              | undefined;
            readonly viewport?: GpuViewportInput | undefined;
          }
        | undefined,
    ): GpuFlowPreparedContentFrame => {
      const previousPreparedContentFrame =
        presentedSurfaceRuntimeRef.current.getPresentedContentFrame();
      const browserVisualRuntime =
        getGpuFlowBrowserVisualActorRuntimeForPresentedSurface(
          presentedSurfaceRuntimeRef.current,
        );
      const finishBrowserVisualCandidateMeasure =
        startGpuFlowPerformanceMeasure(
          "prepared-content-browser-visual-candidate",
          {
            domControlCount:
              nextRetainedDisplayFrame.retainedRuntimeFrame.descriptors
                .domControlSources.length,
            frame: nextRetainedDisplayFrame.id,
          },
        );
      const browserVisualCandidate = browserVisualRuntime.prepareContentFrame({
        retainedDisplayFrame: nextRetainedDisplayFrame,
        viewport: options?.viewport,
      });
      finishBrowserVisualCandidateMeasure();
      const finishPreparedContentBuildMeasure =
        startGpuFlowPerformanceMeasure("prepared-content-build", {
          domControlCount:
            nextRetainedDisplayFrame.retainedRuntimeFrame.descriptors
              .domControlSources.length,
          frame: nextRetainedDisplayFrame.id,
        });
      const nextPreparedContentFrame = createGpuFlowPreparedContentFrame({
        browserVisualReadiness: browserVisualCandidate.readiness,
        domPresentationEvidence: browserVisualCandidate.presentationEvidence,
        gpuNativeVisuals: options?.gpuNativeVisuals,
        previousPreparedContentFrame,
        retainedDisplayFrame: nextRetainedDisplayFrame,
      });
      finishPreparedContentBuildMeasure();
      const finishResourceGraphMeasure = startGpuFlowPerformanceMeasure(
        "prepared-content-resource-graph-register",
        {
          actorCount: nextPreparedContentFrame.actorGenerations.length,
          frame: nextPreparedContentFrame.displayFrameId,
        },
      );
      visibleFrameResourceGraphRef.current.registerPreparedContentFrame({
        browserVisualCandidate,
        frame: nextPreparedContentFrame,
      });
      finishResourceGraphMeasure();
      return nextPreparedContentFrame;
    },
    [],
  );
  const presentPreparedContentFrame = useCallback(
    (
      token: GpuFlowVisibleFramePresentationToken,
      frame: GpuFlowPreparedContentFrame,
    ): boolean => {
      const result =
        visibleFrameResourceGraphRef.current.presentPreparedContentFrame({
          presentBrowserVisualCandidate: ({ candidate, token }) =>
            getGpuFlowBrowserVisualActorRuntimeForPresentedSurface(
              presentedSurfaceRuntimeRef.current,
            ).presentPreparedBrowserVisualActors({
              candidate,
              token,
            }),
          frame,
          presentContentFrame: ({ frame, token }) =>
            presentedSurfaceRuntimeRef.current.presentContentFrame(
              token,
              frame,
            ),
          token,
        });
      presentedContentFrameRef.current = frame;
      return result.presented;
    },
    [],
  );
  const validatePreparedContentFrame = useCallback(
    (
      token: GpuFlowVisibleFramePresentationToken,
      frame: GpuFlowPreparedContentFrame,
    ) =>
      visibleFrameResourceGraphRef.current.validatePreparedContentFrame({
        frame,
        token,
      }),
    [],
  );
  const projectPresentedBrowserVisualActors = useCallback(
    (
      token: GpuFlowVisibleFramePresentationToken,
      viewport?: GpuViewportInput | undefined,
    ): void => {
      const browserVisualRuntime =
        getGpuFlowBrowserVisualActorRuntimeForPresentedSurface(
          presentedSurfaceRuntimeRef.current,
        );
      browserVisualRuntime.projectDomControls({ token, viewport });
      browserVisualRuntime.projectDomIslands({ token, viewport });
      presentedSurfaceRuntimeRef.current.presentProjectionIdentity(token);
    },
    [],
  );
  const abortPreparedContentFrame = useCallback(
    (
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
    ): void => {
      assertGpuFlowPreparedCandidateAbortToken({ token });
      const browserVisualRuntime =
        getGpuFlowBrowserVisualActorRuntimeForPresentedSurface(
          presentedSurfaceRuntimeRef.current,
        );
      visibleFrameResourceGraphRef.current.abortPreparedContentFrame({
        abortBrowserVisualCandidate: ({ candidate, token }) =>
          browserVisualRuntime.abortPreparedBrowserVisualActors({
            candidate,
            token,
          }),
        browserVisualPreparationResourceKeys:
          options?.browserVisualPreparationResourceKeys,
        frame,
        preservePreparationSnapshot:
          options?.preservePreparationSnapshot === true,
        stageBrowserVisualCandidate: ({
          candidate,
          selectedResourceKeys,
          token,
        }) =>
          browserVisualRuntime.stagePreparedBrowserVisualActors({
            candidate,
            selectedResourceKeys,
            token,
          }),
        token,
      });
    },
    [],
  );
  const getVisibleFrameResourceGraphSnapshot = useCallback(
    () => visibleFrameResourceGraphRef.current.getSnapshot(),
    [],
  );
  const prepareVisibleFrameResourcesForBudget = useCallback(
    (budgetDecision: GpuFlowVisibleFrameBudgetBrokerDecision) => {
      const browserVisualRuntime =
        getGpuFlowBrowserVisualActorRuntimeForPresentedSurface(
          presentedSurfaceRuntimeRef.current,
        );
      return visibleFrameResourceGraphRef.current.advanceVisibleFrameResourceWork(
        {
          resourceKeys: createGpuFlowVisibleFrameSelectedResourceWorkKeys({
            budgetDecision,
            resourceGraphSnapshot:
              visibleFrameResourceGraphRef.current.getSnapshot(),
          }),
          stageBrowserVisualCandidate: ({
            candidate,
            selectedResourceKeys,
            token,
          }) =>
            browserVisualRuntime.stagePreparedBrowserVisualActors({
              candidate,
              selectedResourceKeys,
              token,
            }),
        },
      );
    },
    [],
  );

  return {
    abortPreparedContentFrame,
    presentPreparedContentFrame,
    presentedContentFrameRef,
    presentedSurfaceRuntime: presentedSurfaceRuntimeRef.current,
    getVisibleFrameResourceGraphSnapshot,
    prepareContentFrame,
    prepareVisibleFrameResourcesForBudget,
    projectPresentedBrowserVisualActors,
    validatePreparedContentFrame,
    visiblePresentedContentFrame,
  };
}
