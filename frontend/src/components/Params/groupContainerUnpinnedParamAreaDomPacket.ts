import type { LiveDictAreaUnpinnedParamAreaMountPacket } from "./groupContainerUnpinnedParamAreaMountPacket";

export type LiveDictAreaUnpinnedParamAreaDomPacket = {
  blockId: LiveDictAreaUnpinnedParamAreaMountPacket["blockId"];
  kind: LiveDictAreaUnpinnedParamAreaMountPacket["kind"];
  mount: LiveDictAreaUnpinnedParamAreaMountPacket["mount"];
  styleColor: LiveDictAreaUnpinnedParamAreaMountPacket["styleColor"];
  visualPacket: LiveDictAreaUnpinnedParamAreaMountPacket["visualPacket"];
};

export function buildLiveDictAreaUnpinnedParamAreaDomPacket({
  mountPacket,
}: {
  mountPacket: LiveDictAreaUnpinnedParamAreaMountPacket;
}): LiveDictAreaUnpinnedParamAreaDomPacket {
  return {
    blockId: mountPacket.blockId,
    kind: mountPacket.kind,
    mount: mountPacket.mount,
    styleColor: mountPacket.styleColor,
    visualPacket: mountPacket.visualPacket,
  };
}
