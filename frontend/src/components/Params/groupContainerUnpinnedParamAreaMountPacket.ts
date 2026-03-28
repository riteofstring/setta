import type { LiveDictAreaUnpinnedParamAreaCanvasPacket } from "./groupContainerUnpinnedParamAreaCanvasPacket";

export type LiveDictAreaUnpinnedParamAreaMountPacket = {
  blockId: LiveDictAreaUnpinnedParamAreaCanvasPacket["blockId"];
  kind: LiveDictAreaUnpinnedParamAreaCanvasPacket["kind"];
  mount: LiveDictAreaUnpinnedParamAreaCanvasPacket["mount"];
  styleColor: LiveDictAreaUnpinnedParamAreaCanvasPacket["styleColor"];
  visualPacket: LiveDictAreaUnpinnedParamAreaCanvasPacket["visualPacket"];
};

export function buildLiveDictAreaUnpinnedParamAreaMountPacket({
  canvasPacket,
}: {
  canvasPacket: LiveDictAreaUnpinnedParamAreaCanvasPacket;
}): LiveDictAreaUnpinnedParamAreaMountPacket {
  return {
    blockId: canvasPacket.blockId,
    kind: canvasPacket.kind,
    mount: canvasPacket.mount,
    styleColor: canvasPacket.styleColor,
    visualPacket: canvasPacket.visualPacket,
  };
}
