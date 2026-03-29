import type { LiveDictAreaUnpinnedParamAreaCanaryView } from "./groupContainerUnpinnedParamAreaCanaryView";
import {
  buildLiveDictAreaUnpinnedParamAreaCanaryRenderView,
  type LiveDictAreaUnpinnedParamAreaCanaryRenderView,
} from "./groupContainerUnpinnedParamAreaCanaryRenderView";

export type LiveDictAreaUnpinnedParamAreaCanaryRenderer =
  LiveDictAreaUnpinnedParamAreaCanaryRenderView & {
    canaryView: LiveDictAreaUnpinnedParamAreaCanaryView;
  };

export function buildLiveDictAreaUnpinnedParamAreaCanaryRenderer({
  canaryView,
}: {
  canaryView: LiveDictAreaUnpinnedParamAreaCanaryView;
}): LiveDictAreaUnpinnedParamAreaCanaryRenderer {
  return {
    ...buildLiveDictAreaUnpinnedParamAreaCanaryRenderView({
      canaryView,
    }),
    canaryView,
  };
}
