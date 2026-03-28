import type { LiveDictAreaPinnedParamAreaDomPacket } from "./groupContainerPinnedParamAreaDomPacket";
import type { LiveDictAreaSceneParamAreaPacket } from "./groupContainerScenePackets";

export type LiveDictAreaPinnedParamAreaCanaryPacket = {
  blockId: LiveDictAreaPinnedParamAreaDomPacket["blockId"];
  domPacket: LiveDictAreaPinnedParamAreaDomPacket;
  kind: "pinned-param-area";
  scenePacket: LiveDictAreaSceneParamAreaPacket;
};

export function buildLiveDictAreaPinnedParamAreaCanaryPacket({
  domPacket,
  scenePacket,
}: {
  domPacket: LiveDictAreaPinnedParamAreaDomPacket;
  scenePacket: LiveDictAreaSceneParamAreaPacket;
}): LiveDictAreaPinnedParamAreaCanaryPacket {
  return {
    blockId: domPacket.blockId,
    domPacket,
    kind: "pinned-param-area",
    scenePacket,
  };
}
