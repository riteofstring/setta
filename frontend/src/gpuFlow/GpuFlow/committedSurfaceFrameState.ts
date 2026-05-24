import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import {
  createGpuFlowCommittedSurfaceFrame,
  createGpuFlowStartupCommittedSurfaceFrame,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import { createGpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuViewportInput } from "../viewportMath";
import { getGpuFlowBrowserVisualActorRuntimeForCommittedSurface } from "./browserVisualActorRuntime";
import {
  createGpuFlowVisibleFrameSelectedResourceWorkKeys,
  type GpuFlowVisibleFrameBudgetBrokerDecision,
} from "./visibleFrameBudgetBroker";
import {
  assertGpuFlowPreparedCandidateAbortToken,
  type GpuFlowBlockedPublicationToken,
  type GpuFlowCommitPublicationToken,
  type GpuFlowHoldPreviousToken,
} from "./visibleFramePresentationProofs";
import { createGpuFlowVisibleFrameResourceGraph } from "./visibleFrameResourceGraph";

export function useGpuFlowCommittedSurfaceFrameState({
  initialRetainedRuntimeFrame,
}: {
  readonly initialRetainedRuntimeFrame: GpuRetainedRuntimeFrame;
}) {
  const committedSurfaceFrameRef = useRef<GpuFlowCommittedSurfaceFrame | null>(
    null,
  );
  const startupCommittedSurfaceFrame = useMemo(
    () =>
      createGpuFlowStartupCommittedSurfaceFrame({
        retainedRuntimeFrame: initialRetainedRuntimeFrame,
      }),
    [initialRetainedRuntimeFrame],
  );
  const committedSurfaceRuntimeRef = useRef(
    createGpuFlowCommittedSurfaceRuntime(startupCommittedSurfaceFrame),
  );
  const visibleFrameResourceGraphRef = useRef(
    createGpuFlowVisibleFrameResourceGraph(),
  );
  const semanticSnapshot = useSyncExternalStore(
    committedSurfaceRuntimeRef.current.subscribeReactSemanticSnapshot.bind(
      committedSurfaceRuntimeRef.current,
    ),
    committedSurfaceRuntimeRef.current.getReactSemanticSnapshot.bind(
      committedSurfaceRuntimeRef.current,
    ),
    committedSurfaceRuntimeRef.current.getReactSemanticSnapshot.bind(
      committedSurfaceRuntimeRef.current,
    ),
  );
  const visibleCommittedSurfaceFrame = semanticSnapshot.frame;
  committedSurfaceFrameRef.current =
    committedSurfaceRuntimeRef.current.getCommittedContentFrame();

  const prepareCommittedSurfaceFrame = useCallback(
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
    ): GpuFlowCommittedSurfaceFrame => {
      const previousCommittedSurfaceFrame =
        committedSurfaceRuntimeRef.current.getCommittedContentFrame();
      const browserVisualRuntime =
        getGpuFlowBrowserVisualActorRuntimeForCommittedSurface(
          committedSurfaceRuntimeRef.current,
        );
      const browserVisualCandidate =
        browserVisualRuntime.prepareCommittedSurfaceFrame({
          retainedDisplayFrame: nextRetainedDisplayFrame,
          viewport: options?.viewport,
        });
      const nextCommittedSurfaceFrame = createGpuFlowCommittedSurfaceFrame({
        browserVisualReadiness: browserVisualCandidate.readiness,
        domPresentationEvidence: browserVisualCandidate.presentationEvidence,
        gpuNativeVisuals: options?.gpuNativeVisuals,
        previousCommittedSurfaceFrame,
        retainedDisplayFrame: nextRetainedDisplayFrame,
      });
      visibleFrameResourceGraphRef.current.registerPreparedCommittedSurfaceFrame(
        {
          browserVisualCandidate,
          frame: nextCommittedSurfaceFrame,
        },
      );
      return nextCommittedSurfaceFrame;
    },
    [],
  );
  const commitPreparedCommittedSurfaceFrame = useCallback(
    (
      token: GpuFlowCommitPublicationToken,
      frame: GpuFlowCommittedSurfaceFrame,
    ): boolean => {
      const result =
        visibleFrameResourceGraphRef.current.commitPreparedCommittedSurfaceFrame(
          {
            commitBrowserVisualCandidate: ({ candidate, token }) =>
              getGpuFlowBrowserVisualActorRuntimeForCommittedSurface(
                committedSurfaceRuntimeRef.current,
              ).commitPreparedBrowserVisualActors({
                candidate,
                token,
              }),
            frame,
            publishCommittedSurfaceFrame: ({ frame, token }) =>
              committedSurfaceRuntimeRef.current.publishCommittedContentFrame(
                token,
                frame,
              ),
            token,
          },
        );
      committedSurfaceFrameRef.current = frame;
      return result.published;
    },
    [],
  );
  const projectCommittedBrowserVisualActors = useCallback(
    (
      token: GpuFlowCommitPublicationToken,
      viewport?: GpuViewportInput | undefined,
    ): void => {
      const browserVisualRuntime =
        getGpuFlowBrowserVisualActorRuntimeForCommittedSurface(
          committedSurfaceRuntimeRef.current,
        );
      browserVisualRuntime.projectDomControls({ token, viewport });
      browserVisualRuntime.projectDomIslands({ token, viewport });
      committedSurfaceRuntimeRef.current.publishCommittedPresentationIdentity(
        token,
      );
    },
    [],
  );
  const abortPreparedCommittedSurfaceFrame = useCallback(
    (
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
    ): void => {
      assertGpuFlowPreparedCandidateAbortToken({ token });
      const browserVisualRuntime =
        getGpuFlowBrowserVisualActorRuntimeForCommittedSurface(
          committedSurfaceRuntimeRef.current,
        );
      visibleFrameResourceGraphRef.current.abortPreparedCommittedSurfaceFrame({
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
    (budgetDecision: GpuFlowVisibleFrameBudgetBrokerDecision) =>
      visibleFrameResourceGraphRef.current.advanceVisibleFrameResourceWork({
        resourceKeys: createGpuFlowVisibleFrameSelectedResourceWorkKeys({
          budgetDecision,
          resourceGraphSnapshot:
            visibleFrameResourceGraphRef.current.getSnapshot(),
        }),
      }),
    [],
  );

  return {
    abortPreparedCommittedSurfaceFrame,
    commitPreparedCommittedSurfaceFrame,
    committedSurfaceFrameRef,
    committedSurfaceRuntime: committedSurfaceRuntimeRef.current,
    getVisibleFrameResourceGraphSnapshot,
    prepareCommittedSurfaceFrame,
    prepareVisibleFrameResourcesForBudget,
    projectCommittedBrowserVisualActors,
    visibleCommittedSurfaceFrame,
  };
}
