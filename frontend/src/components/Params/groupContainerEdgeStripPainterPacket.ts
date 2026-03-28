import type { LiveDictAreaEdgeStripDrawPacket } from "./groupContainerEdgeStripDrawPacket";

export type LiveDictAreaEdgeStripPainterPacket = {
  bgColor: LiveDictAreaEdgeStripDrawPacket["surfacePacket"]["bgColor"];
  blockId: LiveDictAreaEdgeStripDrawPacket["blockId"];
  kind: LiveDictAreaEdgeStripDrawPacket["kind"];
  mount: LiveDictAreaEdgeStripDrawPacket["mount"];
  positionAndSizeLocked:
    LiveDictAreaEdgeStripDrawPacket["surfacePacket"]["positionAndSizeLocked"];
  styleColor: LiveDictAreaEdgeStripDrawPacket["surfacePacket"]["styleColor"];
  visualPacket: LiveDictAreaEdgeStripDrawPacket["surfacePacket"]["visualPacket"];
};

export function buildLiveDictAreaEdgeStripPainterPacket({
  drawPacket,
}: {
  drawPacket: LiveDictAreaEdgeStripDrawPacket;
}): LiveDictAreaEdgeStripPainterPacket {
  return {
    bgColor: drawPacket.surfacePacket.bgColor,
    blockId: drawPacket.blockId,
    kind: drawPacket.kind,
    mount: drawPacket.mount,
    positionAndSizeLocked: drawPacket.surfacePacket.positionAndSizeLocked,
    styleColor: drawPacket.surfacePacket.styleColor,
    visualPacket: drawPacket.surfacePacket.visualPacket,
  };
}
