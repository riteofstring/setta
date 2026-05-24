import { useCallback, useRef, useState } from "react";

import { assertGpuFlowVisibleFramePresentationTokenBrand } from "./visibleFramePresentationProofs";
import type { renderGpuFlowSurfaceFrame } from "./visibleFrameSurfaceFrame";
import {
  GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
  createGpuFlowColdStartShellFrame,
  type GpuFlowColdStartShellFrame,
} from "./visibleFrameTypes";

export function useGpuFlowColdStartShellFrame(): {
  readonly activeColdStartShellFrame: GpuFlowColdStartShellFrame | null;
  readonly publishColdStartShellFrame: Parameters<
    typeof renderGpuFlowSurfaceFrame
  >[0]["publishColdStartShellFrame"];
} {
  const [initialColdStartShellFrame] = useState(() =>
    createGpuFlowColdStartShellFrame(
      GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
    ),
  );
  const activeColdStartShellFrameRef =
    useRef<GpuFlowColdStartShellFrame | null>(initialColdStartShellFrame);
  const [activeColdStartShellFrame, setActiveColdStartShellFrame] =
    useState<GpuFlowColdStartShellFrame | null>(initialColdStartShellFrame);
  const publishColdStartShellFrame = useCallback<
    Parameters<
      typeof renderGpuFlowSurfaceFrame
    >[0]["publishColdStartShellFrame"]
  >((publication) => {
    assertGpuFlowVisibleFramePresentationTokenBrand({
      token: publication.token,
    });
    if (publication.frame !== null) {
      throw new Error(
        "GPU Flow cold-start shell visible publication only clears from committed presentation.",
      );
    }
    if (activeColdStartShellFrameRef.current === null) {
      return;
    }
    activeColdStartShellFrameRef.current = null;
    setActiveColdStartShellFrame(null);
  }, []);
  return {
    activeColdStartShellFrame,
    publishColdStartShellFrame,
  };
}
