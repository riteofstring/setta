import type { LiveDictAreaEdgeStripCanvasPacket } from "./groupContainerEdgeStripCanvasPacket";

export type LiveDictAreaEdgeStripMountPacket = {
  bgColor: LiveDictAreaEdgeStripCanvasPacket["bgColor"];
  blockId: LiveDictAreaEdgeStripCanvasPacket["blockId"];
  kind: LiveDictAreaEdgeStripCanvasPacket["kind"];
  mount: LiveDictAreaEdgeStripCanvasPacket["mount"];
  positionAndSizeLocked:
    LiveDictAreaEdgeStripCanvasPacket["positionAndSizeLocked"];
  styleColor: LiveDictAreaEdgeStripCanvasPacket["styleColor"];
  visualPacket: LiveDictAreaEdgeStripCanvasPacket["visualPacket"];
};

export function buildLiveDictAreaEdgeStripMountPacket({
  canvasPacket,
}: {
  canvasPacket: LiveDictAreaEdgeStripCanvasPacket;
}): LiveDictAreaEdgeStripMountPacket {
  return {
    bgColor: canvasPacket.bgColor,
    blockId: canvasPacket.blockId,
    kind: canvasPacket.kind,
    mount: canvasPacket.mount,
    positionAndSizeLocked: canvasPacket.positionAndSizeLocked,
    styleColor: canvasPacket.styleColor,
    visualPacket: canvasPacket.visualPacket,
  };
}
