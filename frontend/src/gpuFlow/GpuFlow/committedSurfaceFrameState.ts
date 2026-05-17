import { useCallback, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  createGpuFlowCommittedSurfaceFrame,
  createGpuFlowCommittedSurfaceFrameRenderSignature,
  createGpuFlowStartupCommittedSurfaceFrame,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";

export function useGpuFlowCommittedSurfaceFrameState({
  initialRetainedRuntimeFrame,
}: {
  readonly initialRetainedRuntimeFrame: GpuRetainedRuntimeFrame;
}) {
  const [committedSurfaceFrame, setCommittedSurfaceFrame] =
    useState<GpuFlowCommittedSurfaceFrame | null>(null);
  const committedSurfaceFrameRef = useRef<GpuFlowCommittedSurfaceFrame | null>(
    null,
  );
  const committedSurfaceFrameRenderSignatureRef = useRef<string | null>(null);
  const startupCommittedSurfaceFrame = useMemo(
    () =>
      createGpuFlowStartupCommittedSurfaceFrame({
        retainedRuntimeFrame: initialRetainedRuntimeFrame,
      }),
    [initialRetainedRuntimeFrame],
  );
  const visibleCommittedSurfaceFrame =
    committedSurfaceFrame ?? startupCommittedSurfaceFrame;
  committedSurfaceFrameRef.current = visibleCommittedSurfaceFrame;

  const resetCommittedSurfaceFrame = useCallback(() => {
    committedSurfaceFrameRef.current = null;
    committedSurfaceFrameRenderSignatureRef.current = null;
    setCommittedSurfaceFrame(null);
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
    ) => {
      const nextCommittedSurfaceFrame = createGpuFlowCommittedSurfaceFrame({
        gpuNativeVisuals: options?.gpuNativeVisuals,
        retainedDisplayFrame: nextRetainedDisplayFrame,
      });
      const nextSignature = createGpuFlowCommittedSurfaceFrameRenderSignature(
        nextCommittedSurfaceFrame,
      );
      if (committedSurfaceFrameRenderSignatureRef.current === nextSignature) {
        return;
      }
      committedSurfaceFrameRenderSignatureRef.current = nextSignature;
      flushSync(() => {
        setCommittedSurfaceFrame(nextCommittedSurfaceFrame);
      });
      committedSurfaceFrameRef.current = nextCommittedSurfaceFrame;
    },
    [],
  );

  return {
    committedSurfaceFrameRef,
    publishCommittedSurfaceFrame,
    resetCommittedSurfaceFrame,
    visibleCommittedSurfaceFrame,
  };
}
