import type { LiveDictAreaPinnedParamAreaCanaryView } from "./groupContainerPinnedParamAreaCanaryView";

export type LiveDictAreaPinnedParamAreaCanaryRenderView =
  LiveDictAreaPinnedParamAreaCanaryView & {
    key: LiveDictAreaPinnedParamAreaCanaryView["mount"]["frameId"];
  };

export function buildLiveDictAreaPinnedParamAreaCanaryRenderView({
  canaryView,
}: {
  canaryView: LiveDictAreaPinnedParamAreaCanaryView;
}): LiveDictAreaPinnedParamAreaCanaryRenderView {
  return {
    ...canaryView,
    key: canaryView.mount.frameId,
  };
}
