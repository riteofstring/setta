import type {
  DictAreaNodeLayoutPacket,
  DictAreaNodeLayoutParamAreaBlockPacket,
} from "../Section/Layouts/dictAreaNodeLayoutPackets";
import { buildDictAreaNodeLayoutPacket } from "../Section/Layouts/dictAreaNodeLayoutPackets";
import type {
  LiveDictAreaScenePacket,
  LiveDictAreaSceneParamAreaPacket,
} from "./groupContainerScenePackets";

export type LiveDictAreaNodeLayoutParamAreaView =
  LiveDictAreaSceneParamAreaPacket & {
    layoutBlock: DictAreaNodeLayoutParamAreaBlockPacket;
  };

export type LiveDictAreaNodeLayoutView = {
  nodeLayoutPacket: DictAreaNodeLayoutPacket;
  paramAreas: LiveDictAreaNodeLayoutParamAreaView[];
  pinnedParamArea: LiveDictAreaNodeLayoutParamAreaView | null;
  unpinnedParamArea: LiveDictAreaNodeLayoutParamAreaView | null;
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

  return {
    nodeLayoutPacket,
    paramAreas,
    pinnedParamArea: paramAreas.find((paramArea) => paramArea.id === "pinned") ?? null,
    unpinnedParamArea:
      paramAreas.find((paramArea) => paramArea.id === "unpinned") ?? null,
  };
}
