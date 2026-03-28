import { useEffect, useMemo } from "react";
import { LiveDictAreaMount } from "./groupContainerLiveDictAreaMount";
import type { LiveDictAreaRenderBoundaryInput } from "./groupContainerLiveDictAreaRenderBoundary";
import type { LiveDictAreaSurface } from "./groupContainerLiveDictAreaSurface";
import { buildLiveDictAreaView } from "./groupContainerLiveDictAreaView";

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
  const liveDictAreaView = useMemo(
    () => buildLiveDictAreaView({ input }),
    [input],
  );

  useEffect(() => {
    onMaxNestedDepthChange?.(liveDictAreaView.maxNestedDepth);
  }, [liveDictAreaView.maxNestedDepth, onMaxNestedDepthChange]);

  return (
    <LiveDictAreaMount
      liveDictAreaSurface={liveDictAreaView.liveDictAreaSurface}
    />
  );
}
