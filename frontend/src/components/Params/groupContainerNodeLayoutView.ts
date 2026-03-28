import type {
  DictAreaNodeLayoutPacket,
  DictAreaNodeLayoutParamAreaBlockPacket,
} from "../Section/Layouts/dictAreaNodeLayoutPackets";
import { buildDictAreaNodeLayoutPacket } from "../Section/Layouts/dictAreaNodeLayoutPackets";
import {
  buildLiveDictAreaBlockFramePackets,
  type LiveDictAreaBlockFramePacket,
  type LiveDictAreaEdgeStripFramePacket,
  type LiveDictAreaParamAreaFramePacket,
} from "./groupContainerBlockFramePackets";
import type {
  LiveDictAreaScenePacket,
  LiveDictAreaSceneParamAreaPacket,
} from "./groupContainerScenePackets";

export type LiveDictAreaNodeLayoutParamAreaView =
  LiveDictAreaSceneParamAreaPacket & {
    layoutBlock: DictAreaNodeLayoutParamAreaBlockPacket;
  };

export type LiveDictAreaNodeLayoutView = {
  blockFrames: LiveDictAreaBlockFramePacket[];
  edgeStripFrame: LiveDictAreaEdgeStripFramePacket | null;
  nodeLayoutPacket: DictAreaNodeLayoutPacket;
  paramAreas: LiveDictAreaNodeLayoutParamAreaView[];
  pinnedParamArea: LiveDictAreaNodeLayoutParamAreaView | null;
  pinnedParamAreaFrame: LiveDictAreaParamAreaFramePacket | null;
  unpinnedParamArea: LiveDictAreaNodeLayoutParamAreaView | null;
  unpinnedParamAreaFrame: LiveDictAreaParamAreaFramePacket | null;
};

export function buildLiveDictAreaNodeLayoutView({
  inputPortCount,
  outputPortCount,
  liveScenePacket,
}: {
  inputPortCount: number;
  outputPortCount: number;
  liveScenePacket: LiveDictAreaScenePacket;
}): LiveDictAreaNodeLayoutView {
  const nodeLayoutPacket = buildDictAreaNodeLayoutPacket({
    inputPortCount,
    outputPortCount,
    paramAreas: liveScenePacket.paramAreas,
  });
  const sceneParamAreasById = new Map(
    liveScenePacket.paramAreas.map((paramArea) => [paramArea.id, paramArea]),
  );
  const paramAreas = nodeLayoutPacket.blocks.flatMap((block) => {
    if (block.kind !== "param-area") {
      return [];
    }

    const sceneParamArea = sceneParamAreasById.get(block.id);
    if (!sceneParamArea) {
      return [];
    }

    return [{ ...sceneParamArea, layoutBlock: block }];
  });
  const {
    blockFrames,
    edgeStripFrame,
    pinnedParamAreaFrame,
    unpinnedParamAreaFrame,
  } = buildLiveDictAreaBlockFramePackets({
    nodeLayoutPacket,
    paramAreas,
  });

  return {
    blockFrames,
    edgeStripFrame,
    nodeLayoutPacket,
    paramAreas,
    pinnedParamArea:
      paramAreas.find((paramArea) => paramArea.id === "pinned") ?? null,
    pinnedParamAreaFrame,
    unpinnedParamArea:
      paramAreas.find((paramArea) => paramArea.id === "unpinned") ?? null,
    unpinnedParamAreaFrame,
  };
}
