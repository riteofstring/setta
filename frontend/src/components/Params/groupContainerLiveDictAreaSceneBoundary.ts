import type { LiveDictAreaBoundary } from "./groupContainerLiveDictAreaBoundary";
import {
  buildLiveDictAreaNodeLayoutView,
  type LiveDictAreaNodeLayoutView,
} from "./groupContainerNodeLayoutView";
import {
  buildLiveDictAreaSceneBlockView,
  type LiveDictAreaSceneBlocksView,
} from "./groupContainerSceneBlockView";
import {
  buildLiveDictAreaSceneRendererPackets,
  type LiveDictAreaSceneRendererPackets,
} from "./groupContainerSceneRendererPackets";

export type LiveDictAreaSceneBoundary = LiveDictAreaSceneRendererPackets & {
  liveDictAreaBoundary: LiveDictAreaBoundary;
  nodeLayoutView: LiveDictAreaNodeLayoutView;
  sceneBlockView: LiveDictAreaSceneBlocksView;
};

export function buildLiveDictAreaSceneBoundary({
  liveDictAreaBoundary,
}: {
  liveDictAreaBoundary: LiveDictAreaBoundary;
}): LiveDictAreaSceneBoundary {
  const { edgeStrip, scenePacket } = liveDictAreaBoundary.nodeScenePacket;
  const nodeLayoutView = buildLiveDictAreaNodeLayoutView({
    inputPortCount: edgeStrip.inputPortCount,
    outputPortCount: edgeStrip.outputPortCount,
    liveScenePacket: scenePacket,
  });
  const sceneBlockView = buildLiveDictAreaSceneBlockView({
    nodeLayoutView,
  });
  const sceneRendererPackets = buildLiveDictAreaSceneRendererPackets({
    sceneBlockView,
  });

  return {
    ...sceneRendererPackets,
    liveDictAreaBoundary,
    nodeLayoutView,
    sceneBlockView,
  };
}
