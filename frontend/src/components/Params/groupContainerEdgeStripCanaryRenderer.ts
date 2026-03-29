import type { LiveDictAreaEdgeStripCanaryView } from "./groupContainerEdgeStripCanaryView";
import {
  buildLiveDictAreaEdgeStripCanaryRenderView,
  type LiveDictAreaEdgeStripCanaryRenderView,
} from "./groupContainerEdgeStripCanaryRenderView";

export type LiveDictAreaEdgeStripCanaryRenderer =
  LiveDictAreaEdgeStripCanaryRenderView & {
    canaryView: LiveDictAreaEdgeStripCanaryView;
  };

export function buildLiveDictAreaEdgeStripCanaryRenderer({
  canaryView,
}: {
  canaryView: LiveDictAreaEdgeStripCanaryView;
}): LiveDictAreaEdgeStripCanaryRenderer {
  return {
    ...buildLiveDictAreaEdgeStripCanaryRenderView({
      canaryView,
    }),
    canaryView,
  };
}
