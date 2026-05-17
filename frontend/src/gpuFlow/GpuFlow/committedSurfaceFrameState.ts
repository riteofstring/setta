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
  committedSurfaceRuntimeRef.current.setStartupFrame(
    startupCommittedSurfaceFrame,
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
  committedSurfaceFrameRef.current = visibleCommittedSurfaceFrame;

  const resetCommittedSurfaceFrame = useCallback(() => {
    committedSurfaceRuntimeRef.current.resetCommittedContentFrame();
    committedSurfaceFrameRef.current =
      committedSurfaceRuntimeRef.current.getCommittedContentFrame();
  }, []);

  const publishCommittedSurfaceFrame = useCallback(
    (
      nextRetainedDisplayFrame: RetainedDisplayFrame,
      options?:
        | {
            readonly gpuNativeVisuals:
              | readonly HtmlSurfaceSolidRoundedRectVisual[]
              | undefined;
          }
        | undefined,
    ): GpuFlowCommittedSurfaceFrame => {
      const previousCommittedSurfaceFrame =
        committedSurfaceRuntimeRef.current.getCommittedContentFrame();
      const nextCommittedSurfaceFrame = createGpuFlowCommittedSurfaceFrame({
        gpuNativeVisuals: options?.gpuNativeVisuals,
        previousCommittedSurfaceFrame,
        retainedDisplayFrame: nextRetainedDisplayFrame,
      });
      if (nextCommittedSurfaceFrame.publishability.kind !== "publishable") {
        return nextCommittedSurfaceFrame;
      }
      committedSurfaceRuntimeRef.current.publishCommittedContentFrame(
        nextCommittedSurfaceFrame,
      );
      committedSurfaceFrameRef.current = nextCommittedSurfaceFrame;
      return nextCommittedSurfaceFrame;
    },
    [],
  );

  return {
    committedSurfaceFrameRef,
    committedSurfaceRuntime: committedSurfaceRuntimeRef.current,
    publishCommittedSurfaceFrame,
    resetCommittedSurfaceFrame,
    visibleCommittedSurfaceFrame,
  };
}
