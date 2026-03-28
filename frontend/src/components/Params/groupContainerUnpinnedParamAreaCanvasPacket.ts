import type { LiveDictAreaUnpinnedParamAreaPainterPacket } from "./groupContainerUnpinnedParamAreaPainterPacket";

export type LiveDictAreaUnpinnedParamAreaCanvasPacket = {
  blockId: LiveDictAreaUnpinnedParamAreaPainterPacket["blockId"];
  kind: LiveDictAreaUnpinnedParamAreaPainterPacket["kind"];
  mount: LiveDictAreaUnpinnedParamAreaPainterPacket["mount"];
  styleColor: LiveDictAreaUnpinnedParamAreaPainterPacket["styleColor"];
  visualPacket: LiveDictAreaUnpinnedParamAreaPainterPacket["visualPacket"];
};

export function buildLiveDictAreaUnpinnedParamAreaCanvasPacket({
  painterPacket,
}: {
  painterPacket: LiveDictAreaUnpinnedParamAreaPainterPacket;
}): LiveDictAreaUnpinnedParamAreaCanvasPacket {
  return {
    blockId: painterPacket.blockId,
    kind: painterPacket.kind,
    mount: painterPacket.mount,
    styleColor: painterPacket.styleColor,
    visualPacket: painterPacket.visualPacket,
  };
}
