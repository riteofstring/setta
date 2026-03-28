import type { LiveDictAreaNodeCanaryPacket } from "./groupContainerNodeCanaryPacket";
import {
  buildLiveDictAreaNodeCanaryRenderView,
  type LiveDictAreaNodeCanaryRenderView,
} from "./groupContainerNodeCanaryRenderView";
import {
  buildLiveDictAreaNodeCanaryView,
  type LiveDictAreaNodeCanaryView,
} from "./groupContainerNodeCanaryView";

export type LiveDictAreaNodeCanaryRenderer =
  LiveDictAreaNodeCanaryRenderView & {
    canaryPacket: LiveDictAreaNodeCanaryPacket;
    canaryView: LiveDictAreaNodeCanaryView;
  };

export function buildLiveDictAreaNodeCanaryRenderer({
  nodeCanaryPacket,
}: {
  nodeCanaryPacket: LiveDictAreaNodeCanaryPacket;
}): LiveDictAreaNodeCanaryRenderer {
  const canaryView = buildLiveDictAreaNodeCanaryView({
    nodeCanaryPacket,
  });
  const renderView = buildLiveDictAreaNodeCanaryRenderView({
    nodeCanaryView: canaryView,
  });

  return {
    ...renderView,
    canaryPacket: nodeCanaryPacket,
    canaryView,
  };
}
