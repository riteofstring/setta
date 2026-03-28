import {
  buildLiveDictAreaBoundary,
  type LiveDictAreaBoundary,
} from "./groupContainerLiveDictAreaBoundary";
import {
  buildLiveDictAreaRenderBoundaryFromBoundary,
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
  liveDictAreaBoundary: LiveDictAreaBoundary;
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
  const {
    handleColumnResizeStart,
    sectionId,
    ...liveDictAreaBoundaryInput
  } = input;
  const liveDictAreaBoundary = buildLiveDictAreaBoundary(
    liveDictAreaBoundaryInput,
  );
  const liveDictAreaRenderBoundary = buildLiveDictAreaRenderBoundaryFromBoundary(
    {
      handleColumnResizeStart,
      liveDictAreaBoundary,
      sectionId,
    },
  );
  const liveDictAreaSceneBoundary = buildLiveDictAreaSceneBoundary({
    liveDictAreaBoundary,
  });
  const liveDictAreaSurface = buildLiveDictAreaSurfaceFromRenderBoundary({
    liveDictAreaRenderBoundary,
  });

  return {
    liveDictAreaBoundary,
    liveDictAreaRenderBoundary,
    liveDictAreaSceneBoundary,
    liveDictAreaSurface,
    maxNestedDepth: liveDictAreaSurface.maxNestedDepth,
  };
}
