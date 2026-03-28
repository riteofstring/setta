import {
  buildLiveDictAreaRenderBoundary,
  type LiveDictAreaRenderBoundary,
  type LiveDictAreaRenderBoundaryInput,
} from "./groupContainerLiveDictAreaRenderBoundary";
import {
  buildLiveDictAreaSceneBoundary,
  type LiveDictAreaSceneBoundary,
} from "./groupContainerLiveDictAreaSceneBoundary";
import {
  buildLiveDictAreaSurfaceFromRenderBoundary,
  type LiveDictAreaSurface,
} from "./groupContainerLiveDictAreaSurface";

export type LiveDictAreaView = {
  liveDictAreaRenderBoundary: LiveDictAreaRenderBoundary;
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
  liveDictAreaSurface: LiveDictAreaSurface;
  maxNestedDepth: LiveDictAreaSurface["maxNestedDepth"];
};

export function buildLiveDictAreaView({
  input,
}: {
  input: LiveDictAreaRenderBoundaryInput;
}): LiveDictAreaView {
  const liveDictAreaRenderBoundary = buildLiveDictAreaRenderBoundary(input);
  const liveDictAreaSceneBoundary = buildLiveDictAreaSceneBoundary({
    liveDictAreaBoundary: liveDictAreaRenderBoundary.liveDictAreaBoundary,
  });
  const liveDictAreaSurface = buildLiveDictAreaSurfaceFromRenderBoundary({
    liveDictAreaRenderBoundary,
  });

  return {
    liveDictAreaRenderBoundary,
    liveDictAreaSceneBoundary,
    liveDictAreaSurface,
    maxNestedDepth: liveDictAreaSurface.maxNestedDepth,
  };
}
