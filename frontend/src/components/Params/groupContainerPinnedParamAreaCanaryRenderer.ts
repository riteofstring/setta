import type { LiveDictAreaPinnedParamAreaCanaryView } from "./groupContainerPinnedParamAreaCanaryView";
import {
  buildLiveDictAreaPinnedParamAreaCanaryRenderView,
  type LiveDictAreaPinnedParamAreaCanaryRenderView,
} from "./groupContainerPinnedParamAreaCanaryRenderView";

export type LiveDictAreaPinnedParamAreaCanaryRenderer =
  LiveDictAreaPinnedParamAreaCanaryRenderView & {
    canaryView: LiveDictAreaPinnedParamAreaCanaryView;
  };

export function buildLiveDictAreaPinnedParamAreaCanaryRenderer({
  canaryView,
}: {
  canaryView: LiveDictAreaPinnedParamAreaCanaryView;
}): LiveDictAreaPinnedParamAreaCanaryRenderer {
  return {
    ...buildLiveDictAreaPinnedParamAreaCanaryRenderView({
      canaryView,
    }),
    canaryView,
  };
}
