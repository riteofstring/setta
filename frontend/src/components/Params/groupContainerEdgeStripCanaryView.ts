import type { DictAreaBlockFrameMountPacket } from "./groupContainerBlockFramePackets";
import type { LiveDictAreaEdgeStripCanaryPacket } from "./groupContainerEdgeStripCanaryPacket";

export type LiveDictAreaEdgeStripCanaryView = {
  blockId: LiveDictAreaEdgeStripCanaryPacket["blockId"];
  domPacket: LiveDictAreaEdgeStripCanaryPacket["domPacket"];
  kind: "edge-strip";
  mount: DictAreaBlockFrameMountPacket;
  scenePacket: LiveDictAreaEdgeStripCanaryPacket["scenePacket"];
};

export function buildLiveDictAreaEdgeStripCanaryView({
  canaryPacket,
}: {
  canaryPacket: LiveDictAreaEdgeStripCanaryPacket;
}): LiveDictAreaEdgeStripCanaryView {
  return {
    blockId: canaryPacket.blockId,
    domPacket: canaryPacket.domPacket,
    kind: "edge-strip",
    mount: canaryPacket.domPacket.mount,
    scenePacket: canaryPacket.scenePacket,
  };
}
