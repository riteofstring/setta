import type { LiveDictAreaEdgeStripDomPacket } from "./groupContainerEdgeStripDomPacket";
import type { LiveDictAreaNodeEdgeStripScenePacket } from "./groupContainerNodeScenePacket";

export type LiveDictAreaEdgeStripCanaryPacket = {
  blockId: LiveDictAreaEdgeStripDomPacket["blockId"];
  domPacket: LiveDictAreaEdgeStripDomPacket;
  kind: "edge-strip";
  scenePacket: LiveDictAreaNodeEdgeStripScenePacket;
};

export function buildLiveDictAreaEdgeStripCanaryPacket({
  domPacket,
  scenePacket,
}: {
  domPacket: LiveDictAreaEdgeStripDomPacket;
  scenePacket: LiveDictAreaNodeEdgeStripScenePacket;
}): LiveDictAreaEdgeStripCanaryPacket {
  return {
    blockId: domPacket.blockId,
    domPacket,
    kind: "edge-strip",
    scenePacket,
  };
}
