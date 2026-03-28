import { useEffect, useMemo } from "react";
import { LiveDictAreaMount } from "./groupContainerLiveDictAreaMount";
import { buildLiveDictAreaMountBoundary } from "./groupContainerLiveDictAreaMountBoundary";
import type { LiveDictAreaRenderBoundaryInput } from "./groupContainerLiveDictAreaRenderBoundary";
import type { LiveDictAreaSurface } from "./groupContainerLiveDictAreaSurface";

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
  const liveDictAreaMountBoundary = useMemo(
    () => buildLiveDictAreaMountBoundary({ input }),
    [input],
  );

  useEffect(() => {
    onMaxNestedDepthChange?.(liveDictAreaMountBoundary.maxNestedDepth);
  }, [liveDictAreaMountBoundary.maxNestedDepth, onMaxNestedDepthChange]);

  return (
    <LiveDictAreaMount {...liveDictAreaMountBoundary.liveDictAreaMountProps} />
  );
}
