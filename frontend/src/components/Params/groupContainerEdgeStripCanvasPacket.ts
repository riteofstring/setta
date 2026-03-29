import type { LiveDictAreaEdgeStripPainterPacket } from "./groupContainerEdgeStripPainterPacket";

export type LiveDictAreaEdgeStripCanvasPacket = {
  bgColor: LiveDictAreaEdgeStripPainterPacket["bgColor"];
  blockId: LiveDictAreaEdgeStripPainterPacket["blockId"];
  kind: LiveDictAreaEdgeStripPainterPacket["kind"];
  mount: LiveDictAreaEdgeStripPainterPacket["mount"];
  positionAndSizeLocked:
    LiveDictAreaEdgeStripPainterPacket["positionAndSizeLocked"];
  styleColor: LiveDictAreaEdgeStripPainterPacket["styleColor"];
  visualPacket: LiveDictAreaEdgeStripPainterPacket["visualPacket"];
};

export function buildLiveDictAreaEdgeStripCanvasPacket({
  painterPacket,
}: {
  painterPacket: LiveDictAreaEdgeStripPainterPacket;
}): LiveDictAreaEdgeStripCanvasPacket {
  return {
    bgColor: painterPacket.bgColor,
    blockId: painterPacket.blockId,
    kind: painterPacket.kind,
    mount: painterPacket.mount,
    positionAndSizeLocked: painterPacket.positionAndSizeLocked,
    styleColor: painterPacket.styleColor,
    visualPacket: painterPacket.visualPacket,
  };
}
