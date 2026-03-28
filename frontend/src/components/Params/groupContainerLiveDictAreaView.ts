import type { LiveDictAreaRenderBoundaryInput } from "./groupContainerLiveDictAreaRenderBoundary";
import {
  buildLiveDictAreaSurface,
  type LiveDictAreaSurface,
} from "./groupContainerLiveDictAreaSurface";

export type LiveDictAreaView = {
  liveDictAreaSurface: LiveDictAreaSurface;
  maxNestedDepth: LiveDictAreaSurface["maxNestedDepth"];
};

export function buildLiveDictAreaView({
  input,
}: {
  input: LiveDictAreaRenderBoundaryInput;
}): LiveDictAreaView {
  const liveDictAreaSurface = buildLiveDictAreaSurface(input);

  return {
    liveDictAreaSurface,
    maxNestedDepth: liveDictAreaSurface.maxNestedDepth,
  };
}
