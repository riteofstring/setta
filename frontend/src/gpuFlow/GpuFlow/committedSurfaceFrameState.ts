import {
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

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
import {
  getGpuFlowBrowserVisualActorRuntimeForCommittedSurface,
  type GpuFlowBrowserVisualActorCandidate,
} from "./browserVisualActorRuntime";
import {
  assertGpuFlowPreparedCandidateAbortToken,
  type GpuFlowBlockedPublicationToken,
  type GpuFlowCommitPublicationToken,
  type GpuFlowHoldPreviousToken,
} from "./visibleFramePresentationProofs";

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
  const pendingBrowserVisualCandidateByFrameIdRef = useRef(
    new Map<number, GpuFlowBrowserVisualActorCandidate>(),
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
      pendingBrowserVisualCandidateByFrameIdRef.current.set(
        nextRetainedDisplayFrame.id,
        browserVisualCandidate,
      );
      const nextCommittedSurfaceFrame = createGpuFlowCommittedSurfaceFrame({
        browserVisualReadiness: browserVisualCandidate.readiness,
        domPresentationEvidence: browserVisualCandidate.presentationEvidence,
        gpuNativeVisuals: options?.gpuNativeVisuals,
        previousCommittedSurfaceFrame,
        retainedDisplayFrame: nextRetainedDisplayFrame,
      });
      return nextCommittedSurfaceFrame;
    },
    [],
  );
  const commitPreparedCommittedSurfaceFrame = useCallback(
    (
      token: GpuFlowCommitPublicationToken,
      frame: GpuFlowCommittedSurfaceFrame,
    ): boolean => {
      const browserVisualCandidate =
        pendingBrowserVisualCandidateByFrameIdRef.current.get(
          frame.displayFrameId,
        );
      if (!browserVisualCandidate) {
        throw new Error(
          `GPU Flow browser visual candidate missing for committed frame ${frame.displayFrameId}.`,
        );
      }
      getGpuFlowBrowserVisualActorRuntimeForCommittedSurface(
        committedSurfaceRuntimeRef.current,
      ).commitPreparedBrowserVisualActors({
        candidate: browserVisualCandidate,
        token,
      });
      const published =
        committedSurfaceRuntimeRef.current.publishCommittedContentFrame(
          token,
          frame,
        );
      committedSurfaceFrameRef.current = frame;
      pendingBrowserVisualCandidateByFrameIdRef.current.delete(
        frame.displayFrameId,
      );
      return published;
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
    },
    [],
  );
  const abortPreparedCommittedSurfaceFrame = useCallback(
    (
      token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken,
      frame: GpuFlowCommittedSurfaceFrame,
      options?:
        | {
            readonly preservePreparationSnapshot?: boolean | undefined;
          }
        | undefined,
    ): void => {
      assertGpuFlowPreparedCandidateAbortToken({ token });
      const browserVisualCandidate =
        pendingBrowserVisualCandidateByFrameIdRef.current.get(
          frame.displayFrameId,
        );
      if (!browserVisualCandidate) {
        return;
      }
      const browserVisualRuntime =
        getGpuFlowBrowserVisualActorRuntimeForCommittedSurface(
          committedSurfaceRuntimeRef.current,
        );
      if (options?.preservePreparationSnapshot === true) {
        browserVisualRuntime.stagePreparedBrowserVisualActors({
          candidate: browserVisualCandidate,
          token,
        });
      } else {
        browserVisualRuntime.abortPreparedBrowserVisualActors({
          candidate: browserVisualCandidate,
          token,
        });
      }
      pendingBrowserVisualCandidateByFrameIdRef.current.delete(
        frame.displayFrameId,
      );
    },
    [],
  );

  return {
    abortPreparedCommittedSurfaceFrame,
    commitPreparedCommittedSurfaceFrame,
    committedSurfaceFrameRef,
    committedSurfaceRuntime: committedSurfaceRuntimeRef.current,
    prepareCommittedSurfaceFrame,
    projectCommittedBrowserVisualActors,
    visibleCommittedSurfaceFrame,
  };
}
