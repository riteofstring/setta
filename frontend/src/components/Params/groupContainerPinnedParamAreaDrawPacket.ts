import type { DictAreaBlockFrameMountPacket } from "./groupContainerBlockFramePackets";
import type { LiveDictAreaPinnedParamAreaSurfacePacket } from "./groupContainerNodeSurfacePacket";

export type LiveDictAreaPinnedParamAreaDrawPacket = {
  blockId: "pinned";
  kind: "pinned-param-area";
  mount: DictAreaBlockFrameMountPacket;
  surfacePacket: LiveDictAreaPinnedParamAreaSurfacePacket;
};

export function buildLiveDictAreaPinnedParamAreaDrawPacket({
  surfacePacket,
}: {
  surfacePacket: LiveDictAreaPinnedParamAreaSurfacePacket;
}): LiveDictAreaPinnedParamAreaDrawPacket {
  return {
    blockId: "pinned",
    kind: "pinned-param-area",
    mount: surfacePacket.visualPacket.mount,
    surfacePacket,
  };
}
