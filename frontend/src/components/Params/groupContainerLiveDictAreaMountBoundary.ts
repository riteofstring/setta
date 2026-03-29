import type { LiveDictAreaMountProps } from "./groupContainerLiveDictAreaMount";
import type { LiveDictAreaRenderBoundaryInput } from "./groupContainerLiveDictAreaRenderBoundary";
import type { LiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import { buildLiveDictAreaView } from "./groupContainerLiveDictAreaView";

export type LiveDictAreaMountBoundary = {
  liveDictAreaMountProps: LiveDictAreaMountProps;
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
  maxNestedDepth: LiveDictAreaMountProps["liveDictAreaSurface"]["maxNestedDepth"];
};

export function buildLiveDictAreaMountBoundary({
  input,
}: {
  input: LiveDictAreaRenderBoundaryInput;
}): LiveDictAreaMountBoundary {
  const liveDictAreaView = buildLiveDictAreaView({ input });

  return {
    liveDictAreaMountProps: {
      liveDictAreaSurface: liveDictAreaView.liveDictAreaSurface,
    },
    liveDictAreaSceneBoundary: liveDictAreaView.liveDictAreaSceneBoundary,
    maxNestedDepth: liveDictAreaView.maxNestedDepth,
  };
}
