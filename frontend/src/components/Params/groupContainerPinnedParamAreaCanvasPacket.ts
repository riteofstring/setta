import type { LiveDictAreaPinnedParamAreaPainterPacket } from "./groupContainerPinnedParamAreaPainterPacket";

export type LiveDictAreaPinnedParamAreaCanvasPacket = {
  blockId: LiveDictAreaPinnedParamAreaPainterPacket["blockId"];
  kind: LiveDictAreaPinnedParamAreaPainterPacket["kind"];
  mount: LiveDictAreaPinnedParamAreaPainterPacket["mount"];
  positionAndSizeLocked:
    LiveDictAreaPinnedParamAreaPainterPacket["positionAndSizeLocked"];
  sectionTypeName: LiveDictAreaPinnedParamAreaPainterPacket["sectionTypeName"];
  styleColor: LiveDictAreaPinnedParamAreaPainterPacket["styleColor"];
  visualPacket: LiveDictAreaPinnedParamAreaPainterPacket["visualPacket"];
};

export function buildLiveDictAreaPinnedParamAreaCanvasPacket({
  painterPacket,
}: {
  painterPacket: LiveDictAreaPinnedParamAreaPainterPacket;
}): LiveDictAreaPinnedParamAreaCanvasPacket {
  return {
    blockId: painterPacket.blockId,
    kind: painterPacket.kind,
    mount: painterPacket.mount,
    positionAndSizeLocked: painterPacket.positionAndSizeLocked,
    sectionTypeName: painterPacket.sectionTypeName,
    styleColor: painterPacket.styleColor,
    visualPacket: painterPacket.visualPacket,
  };
}
