import type { LiveDictAreaPinnedParamAreaDrawPacket } from "./groupContainerPinnedParamAreaDrawPacket";

export type LiveDictAreaPinnedParamAreaPainterPacket = {
  blockId: LiveDictAreaPinnedParamAreaDrawPacket["blockId"];
  kind: LiveDictAreaPinnedParamAreaDrawPacket["kind"];
  mount: LiveDictAreaPinnedParamAreaDrawPacket["mount"];
  positionAndSizeLocked: LiveDictAreaPinnedParamAreaDrawPacket["surfacePacket"]["positionAndSizeLocked"];
  sectionTypeName: LiveDictAreaPinnedParamAreaDrawPacket["surfacePacket"]["sectionTypeName"];
  styleColor: LiveDictAreaPinnedParamAreaDrawPacket["surfacePacket"]["styleColor"];
  visualPacket: LiveDictAreaPinnedParamAreaDrawPacket["surfacePacket"]["visualPacket"];
};

export function buildLiveDictAreaPinnedParamAreaPainterPacket({
  drawPacket,
}: {
  drawPacket: LiveDictAreaPinnedParamAreaDrawPacket;
}): LiveDictAreaPinnedParamAreaPainterPacket {
  return {
    blockId: drawPacket.blockId,
    kind: drawPacket.kind,
    mount: drawPacket.mount,
    positionAndSizeLocked: drawPacket.surfacePacket.positionAndSizeLocked,
    sectionTypeName: drawPacket.surfacePacket.sectionTypeName,
    styleColor: drawPacket.surfacePacket.styleColor,
    visualPacket: drawPacket.surfacePacket.visualPacket,
  };
}
