import { useMemo, useSyncExternalStore } from "react";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";

const NO_COMMITTED_SURFACE_FRAME_SNAPSHOT = null;

function subscribeNoCommittedSurfaceFrame(): () => void {
  return () => undefined;
}

function getNoCommittedSurfaceFrameSnapshot(): GpuFlowCommittedSurfaceFrame | null {
  return NO_COMMITTED_SURFACE_FRAME_SNAPSHOT;
}

export function useGpuFlowCommittedSurfaceLayerFrame(
  committedSurfaceRuntime: GpuFlowCommittedSurfaceRuntime | undefined,
): GpuFlowCommittedSurfaceFrame | null {
  const subscribeCommittedSurfaceFrame = useMemo(
    () =>
      committedSurfaceRuntime
        ? committedSurfaceRuntime.subscribeCommittedContentFrame.bind(
            committedSurfaceRuntime,
          )
        : subscribeNoCommittedSurfaceFrame,
    [committedSurfaceRuntime],
  );
  const getCommittedSurfaceFrameSnapshot = useMemo(
    () =>
      committedSurfaceRuntime
        ? committedSurfaceRuntime.getCommittedContentFrame.bind(
            committedSurfaceRuntime,
          )
        : getNoCommittedSurfaceFrameSnapshot,
    [committedSurfaceRuntime],
  );
  return useSyncExternalStore(
    subscribeCommittedSurfaceFrame,
    getCommittedSurfaceFrameSnapshot,
    getCommittedSurfaceFrameSnapshot,
  );
}
