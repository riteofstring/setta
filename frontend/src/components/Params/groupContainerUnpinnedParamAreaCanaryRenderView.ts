import type { LiveDictAreaUnpinnedParamAreaCanaryView } from "./groupContainerUnpinnedParamAreaCanaryView";

export type LiveDictAreaUnpinnedParamAreaCanaryRenderView =
  LiveDictAreaUnpinnedParamAreaCanaryView & {
    key: LiveDictAreaUnpinnedParamAreaCanaryView["mount"]["frameId"];
  };

export function buildLiveDictAreaUnpinnedParamAreaCanaryRenderView({
  canaryView,
}: {
  canaryView: LiveDictAreaUnpinnedParamAreaCanaryView;
}): LiveDictAreaUnpinnedParamAreaCanaryRenderView {
  return {
    ...canaryView,
    key: canaryView.mount.frameId,
  };
}
