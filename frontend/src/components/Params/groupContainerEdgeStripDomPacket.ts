import type { LiveDictAreaEdgeStripMountPacket } from "./groupContainerEdgeStripMountPacket";

export type LiveDictAreaEdgeStripDomPacket = {
  bgColor: LiveDictAreaEdgeStripMountPacket["bgColor"];
  blockId: LiveDictAreaEdgeStripMountPacket["blockId"];
  kind: LiveDictAreaEdgeStripMountPacket["kind"];
  mount: LiveDictAreaEdgeStripMountPacket["mount"];
  positionAndSizeLocked:
    LiveDictAreaEdgeStripMountPacket["positionAndSizeLocked"];
  styleColor: LiveDictAreaEdgeStripMountPacket["styleColor"];
  visualPacket: LiveDictAreaEdgeStripMountPacket["visualPacket"];
};

export function buildLiveDictAreaEdgeStripDomPacket({
  mountPacket,
}: {
  mountPacket: LiveDictAreaEdgeStripMountPacket;
}): LiveDictAreaEdgeStripDomPacket {
  return {
    bgColor: mountPacket.bgColor,
    blockId: mountPacket.blockId,
    kind: mountPacket.kind,
    mount: mountPacket.mount,
    positionAndSizeLocked: mountPacket.positionAndSizeLocked,
    styleColor: mountPacket.styleColor,
    visualPacket: mountPacket.visualPacket,
  };
}
