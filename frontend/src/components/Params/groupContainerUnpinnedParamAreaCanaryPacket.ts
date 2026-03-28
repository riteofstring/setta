import type { LiveDictAreaUnpinnedParamAreaDomPacket } from "./groupContainerUnpinnedParamAreaDomPacket";
import type { LiveDictAreaSceneParamAreaPacket } from "./groupContainerScenePackets";

export type LiveDictAreaUnpinnedParamAreaCanaryPacket = {
  blockId: LiveDictAreaUnpinnedParamAreaDomPacket["blockId"];
  domPacket: LiveDictAreaUnpinnedParamAreaDomPacket;
  kind: "unpinned-param-area";
  scenePacket: LiveDictAreaSceneParamAreaPacket;
};

export function buildLiveDictAreaUnpinnedParamAreaCanaryPacket({
  domPacket,
  scenePacket,
}: {
  domPacket: LiveDictAreaUnpinnedParamAreaDomPacket;
  scenePacket: LiveDictAreaSceneParamAreaPacket;
}): LiveDictAreaUnpinnedParamAreaCanaryPacket {
  return {
    blockId: domPacket.blockId,
    domPacket,
    kind: "unpinned-param-area",
    scenePacket,
  };
}
