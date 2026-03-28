import type { DictAreaBlockFrameMountPacket } from "./groupContainerBlockFramePackets";
import type { LiveDictAreaUnpinnedParamAreaSurfacePacket } from "./groupContainerNodeSurfacePacket";

export type LiveDictAreaUnpinnedParamAreaDrawPacket = {
  blockId: "unpinned";
  kind: "unpinned-param-area";
  mount: DictAreaBlockFrameMountPacket;
  surfacePacket: LiveDictAreaUnpinnedParamAreaSurfacePacket;
};

export function buildLiveDictAreaUnpinnedParamAreaDrawPacket({
  surfacePacket,
}: {
  surfacePacket: LiveDictAreaUnpinnedParamAreaSurfacePacket;
}): LiveDictAreaUnpinnedParamAreaDrawPacket {
  return {
    blockId: "unpinned",
    kind: "unpinned-param-area",
    mount: surfacePacket.visualPacket.mount,
    surfacePacket,
  };
}
