import type { LiveDictAreaEdgeStripCanaryView } from "./groupContainerEdgeStripCanaryView";

export type LiveDictAreaEdgeStripCanaryRenderView =
  LiveDictAreaEdgeStripCanaryView & {
    key: LiveDictAreaEdgeStripCanaryView["mount"]["frameId"];
  };

export function buildLiveDictAreaEdgeStripCanaryRenderView({
  canaryView,
}: {
  canaryView: LiveDictAreaEdgeStripCanaryView;
}): LiveDictAreaEdgeStripCanaryRenderView {
  return {
    ...canaryView,
    key: canaryView.mount.frameId,
  };
}
