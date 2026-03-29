import type { DictAreaBlockFrameMountPacket } from "./groupContainerBlockFramePackets";
import type { LiveDictAreaEdgeStripSurfacePacket } from "./groupContainerNodeSurfacePacket";

export type LiveDictAreaEdgeStripDrawPacket = {
  blockId: "edges";
  kind: "edge-strip";
  mount: DictAreaBlockFrameMountPacket;
  surfacePacket: LiveDictAreaEdgeStripSurfacePacket;
};

export function buildLiveDictAreaEdgeStripDrawPacket({
  surfacePacket,
}: {
  surfacePacket: LiveDictAreaEdgeStripSurfacePacket;
}): LiveDictAreaEdgeStripDrawPacket {
  return {
    blockId: "edges",
    kind: "edge-strip",
    mount: surfacePacket.visualPacket.mount,
    surfacePacket,
  };
}
