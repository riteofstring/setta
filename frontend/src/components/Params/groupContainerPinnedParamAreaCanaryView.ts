import type { DictAreaBlockFrameMountPacket } from "./groupContainerBlockFramePackets";
import type { LiveDictAreaPinnedParamAreaCanaryPacket } from "./groupContainerPinnedParamAreaCanaryPacket";

export type LiveDictAreaPinnedParamAreaCanaryView = {
  blockId: LiveDictAreaPinnedParamAreaCanaryPacket["blockId"];
  domPacket: LiveDictAreaPinnedParamAreaCanaryPacket["domPacket"];
  kind: "pinned-param-area";
  mount: DictAreaBlockFrameMountPacket;
  scenePacket: LiveDictAreaPinnedParamAreaCanaryPacket["scenePacket"];
};

export function buildLiveDictAreaPinnedParamAreaCanaryView({
  canaryPacket,
}: {
  canaryPacket: LiveDictAreaPinnedParamAreaCanaryPacket;
}): LiveDictAreaPinnedParamAreaCanaryView {
  return {
    blockId: canaryPacket.blockId,
    domPacket: canaryPacket.domPacket,
    kind: "pinned-param-area",
    mount: canaryPacket.domPacket.mount,
    scenePacket: canaryPacket.scenePacket,
  };
}
