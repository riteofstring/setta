import { useEffect, useMemo } from "react";
import { LiveDictAreaMount } from "./groupContainerLiveDictAreaMount";
import type { LiveDictAreaRenderBoundaryInput } from "./groupContainerLiveDictAreaRenderBoundary";
import {
  buildLiveDictAreaSurface,
  type LiveDictAreaSurface,
} from "./groupContainerLiveDictAreaSurface";

export type LiveDictAreaProps = {
  input: LiveDictAreaRenderBoundaryInput;
  onMaxNestedDepthChange?: (
    maxNestedDepth: LiveDictAreaSurface["maxNestedDepth"],
  ) => void;
};

export function LiveDictArea({
  input,
  onMaxNestedDepthChange,
}: LiveDictAreaProps) {
  const liveDictAreaSurface = useMemo(
    () => buildLiveDictAreaSurface(input),
    [input],
  );

  useEffect(() => {
    onMaxNestedDepthChange?.(liveDictAreaSurface.maxNestedDepth);
  }, [liveDictAreaSurface.maxNestedDepth, onMaxNestedDepthChange]);

  return <LiveDictAreaMount liveDictAreaSurface={liveDictAreaSurface} />;
}
