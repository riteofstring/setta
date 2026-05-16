import { useMemo } from "react";

import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";

export function useGpuFlowRetainedContentSources({
  retainedRuntimeFrame,
}: {
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null | undefined;
}): {
  readonly retainedContentNativeVisuals: readonly HtmlSurfaceSolidRoundedRectVisual[];
} {
  const retainedContentNativeVisuals = useMemo(
    () =>
      retainedRuntimeFrame?.descriptors.htmlSurfaceNativeVisuals ??
      EMPTY_RETAINED_CONTENT_NATIVE_VISUALS,
    [retainedRuntimeFrame],
  );

  return {
    retainedContentNativeVisuals,
  };
}

const EMPTY_RETAINED_CONTENT_NATIVE_VISUALS: readonly HtmlSurfaceSolidRoundedRectVisual[] =
  [];
