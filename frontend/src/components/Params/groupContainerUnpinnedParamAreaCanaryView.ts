import type { DictAreaBlockFrameMountPacket } from "./groupContainerBlockFramePackets";
import type { LiveDictAreaUnpinnedParamAreaCanaryPacket } from "./groupContainerUnpinnedParamAreaCanaryPacket";

export type LiveDictAreaUnpinnedParamAreaCanaryView = {
  blockId: LiveDictAreaUnpinnedParamAreaCanaryPacket["blockId"];
  domPacket: LiveDictAreaUnpinnedParamAreaCanaryPacket["domPacket"];
  kind: "unpinned-param-area";
  mount: DictAreaBlockFrameMountPacket;
  scenePacket: LiveDictAreaUnpinnedParamAreaCanaryPacket["scenePacket"];
};

export function buildLiveDictAreaUnpinnedParamAreaCanaryView({
  canaryPacket,
}: {
  canaryPacket: LiveDictAreaUnpinnedParamAreaCanaryPacket;
}): LiveDictAreaUnpinnedParamAreaCanaryView {
  return {
    blockId: canaryPacket.blockId,
    domPacket: canaryPacket.domPacket,
    kind: "unpinned-param-area",
    mount: canaryPacket.domPacket.mount,
    scenePacket: canaryPacket.scenePacket,
  };
}
