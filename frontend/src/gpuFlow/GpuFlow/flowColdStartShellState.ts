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
  readonly presentColdStartShellFrame: Parameters<
    typeof renderGpuFlowSurfaceFrame
  >[0]["presentColdStartShellFrame"];
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
  const presentColdStartShellFrame = useCallback<
    Parameters<
      typeof renderGpuFlowSurfaceFrame
    >[0]["presentColdStartShellFrame"]
  >((presentation) => {
    assertGpuFlowVisibleFramePresentationTokenBrand({
      token: presentation.token,
    });
    if (presentation.frame !== null) {
      throw new Error(
        "GPU Flow cold-start shell visible frame presentation only clears from visible presentation.",
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
    presentColdStartShellFrame,
  };
}
