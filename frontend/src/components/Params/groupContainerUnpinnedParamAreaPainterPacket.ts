import type { LiveDictAreaUnpinnedParamAreaDrawPacket } from "./groupContainerUnpinnedParamAreaDrawPacket";

export type LiveDictAreaUnpinnedParamAreaPainterPacket = {
  blockId: LiveDictAreaUnpinnedParamAreaDrawPacket["blockId"];
  kind: LiveDictAreaUnpinnedParamAreaDrawPacket["kind"];
  mount: LiveDictAreaUnpinnedParamAreaDrawPacket["mount"];
  styleColor: LiveDictAreaUnpinnedParamAreaDrawPacket["surfacePacket"]["styleColor"];
  visualPacket: LiveDictAreaUnpinnedParamAreaDrawPacket["surfacePacket"]["visualPacket"];
};

export function buildLiveDictAreaUnpinnedParamAreaPainterPacket({
  drawPacket,
}: {
  drawPacket: LiveDictAreaUnpinnedParamAreaDrawPacket;
}): LiveDictAreaUnpinnedParamAreaPainterPacket {
  return {
    blockId: drawPacket.blockId,
    kind: drawPacket.kind,
    mount: drawPacket.mount,
    styleColor: drawPacket.surfacePacket.styleColor,
    visualPacket: drawPacket.surfacePacket.visualPacket,
  };
}
