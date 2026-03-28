import type { LiveDictAreaNodeDrawPacket } from "./groupContainerNodeDrawPacket";
import {
  buildLiveDictAreaNodePainterPacket,
  type LiveDictAreaEdgeStripPainterPacket,
  type LiveDictAreaPinnedParamAreaPainterPacket,
  type LiveDictAreaUnpinnedParamAreaPainterPacket,
} from "./groupContainerNodePainterPacket";

export type {
  LiveDictAreaEdgeStripPainterPacket,
  LiveDictAreaPinnedParamAreaPainterPacket,
  LiveDictAreaUnpinnedParamAreaPainterPacket,
} from "./groupContainerNodePainterPacket";

export type LiveDictAreaNodeCanvasPacket = {
  domBlocks: (
    | LiveDictAreaEdgeStripPainterPacket
    | LiveDictAreaPinnedParamAreaPainterPacket
    | LiveDictAreaUnpinnedParamAreaPainterPacket
  )[];
  domEdgeStripBlock: LiveDictAreaEdgeStripPainterPacket | null;
  domPinnedParamAreaBlock: LiveDictAreaPinnedParamAreaPainterPacket | null;
  domUnpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaPainterPacket | null;
  edgeStrip: LiveDictAreaNodeDrawPacket["edgeStrip"];
  maxNestedDepth: LiveDictAreaNodeDrawPacket["maxNestedDepth"];
  scenePacket: LiveDictAreaNodeDrawPacket["scenePacket"];
};

export function buildLiveDictAreaNodeCanvasPacket({
  nodeDrawPacket,
}: {
  nodeDrawPacket: LiveDictAreaNodeDrawPacket;
}): LiveDictAreaNodeCanvasPacket {
  const nodePainterPacket = buildLiveDictAreaNodePainterPacket({
    nodeDrawPacket,
  });

  return {
    domBlocks: nodePainterPacket.blocks,
    domEdgeStripBlock: nodePainterPacket.edgeStripBlock,
    domPinnedParamAreaBlock: nodePainterPacket.pinnedParamAreaBlock,
    domUnpinnedParamAreaBlock: nodePainterPacket.unpinnedParamAreaBlock,
    edgeStrip: nodePainterPacket.edgeStrip,
    maxNestedDepth: nodePainterPacket.maxNestedDepth,
    scenePacket: nodePainterPacket.scenePacket,
  };
}
