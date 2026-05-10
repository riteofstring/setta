import { useMemo } from "react";

import { getGpuRetainedContentScrollbarVisuals } from "../GpuRetainedContentScrollbarVisuals";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import type { GpuFlowScene } from "../scene";

export function useGpuFlowRetainedContentSources({
  scene,
}: {
  readonly scene: GpuFlowScene | undefined;
}): {
  readonly retainedContentNativeVisuals: readonly HtmlSurfaceSolidRoundedRectVisual[];
} {
  const retainedContentNativeVisuals = useMemo(
    () => getGpuRetainedContentScrollbarVisuals(scene?.contentSurfaces),
    [scene?.contentSurfaces],
  );

  return {
    retainedContentNativeVisuals,
  };
}
