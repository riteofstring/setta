import type { LiveDictAreaPinnedParamAreaMountPacket } from "./groupContainerPinnedParamAreaMountPacket";

export type LiveDictAreaPinnedParamAreaDomPacket = {
  blockId: LiveDictAreaPinnedParamAreaMountPacket["blockId"];
  kind: LiveDictAreaPinnedParamAreaMountPacket["kind"];
  mount: LiveDictAreaPinnedParamAreaMountPacket["mount"];
  positionAndSizeLocked:
    LiveDictAreaPinnedParamAreaMountPacket["positionAndSizeLocked"];
  sectionTypeName: LiveDictAreaPinnedParamAreaMountPacket["sectionTypeName"];
  styleColor: LiveDictAreaPinnedParamAreaMountPacket["styleColor"];
  visualPacket: LiveDictAreaPinnedParamAreaMountPacket["visualPacket"];
};

export function buildLiveDictAreaPinnedParamAreaDomPacket({
  mountPacket,
}: {
  mountPacket: LiveDictAreaPinnedParamAreaMountPacket;
}): LiveDictAreaPinnedParamAreaDomPacket {
  return {
    blockId: mountPacket.blockId,
    kind: mountPacket.kind,
    mount: mountPacket.mount,
    positionAndSizeLocked: mountPacket.positionAndSizeLocked,
    sectionTypeName: mountPacket.sectionTypeName,
    styleColor: mountPacket.styleColor,
    visualPacket: mountPacket.visualPacket,
  };
}
