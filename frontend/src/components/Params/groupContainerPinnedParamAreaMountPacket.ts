import type { LiveDictAreaPinnedParamAreaCanvasPacket } from "./groupContainerPinnedParamAreaCanvasPacket";

export type LiveDictAreaPinnedParamAreaMountPacket = {
  blockId: LiveDictAreaPinnedParamAreaCanvasPacket["blockId"];
  kind: LiveDictAreaPinnedParamAreaCanvasPacket["kind"];
  mount: LiveDictAreaPinnedParamAreaCanvasPacket["mount"];
  positionAndSizeLocked:
    LiveDictAreaPinnedParamAreaCanvasPacket["positionAndSizeLocked"];
  sectionTypeName: LiveDictAreaPinnedParamAreaCanvasPacket["sectionTypeName"];
  styleColor: LiveDictAreaPinnedParamAreaCanvasPacket["styleColor"];
  visualPacket: LiveDictAreaPinnedParamAreaCanvasPacket["visualPacket"];
};

export function buildLiveDictAreaPinnedParamAreaMountPacket({
  canvasPacket,
}: {
  canvasPacket: LiveDictAreaPinnedParamAreaCanvasPacket;
}): LiveDictAreaPinnedParamAreaMountPacket {
  return {
    blockId: canvasPacket.blockId,
    kind: canvasPacket.kind,
    mount: canvasPacket.mount,
    positionAndSizeLocked: canvasPacket.positionAndSizeLocked,
    sectionTypeName: canvasPacket.sectionTypeName,
    styleColor: canvasPacket.styleColor,
    visualPacket: canvasPacket.visualPacket,
  };
}
