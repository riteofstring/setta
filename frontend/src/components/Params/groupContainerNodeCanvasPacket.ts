import type { LiveDictAreaNodeDrawPacket } from "./groupContainerNodeDrawPacket";
import {
  buildLiveDictAreaEdgeStripCanvasPacket,
  type LiveDictAreaEdgeStripCanvasPacket,
} from "./groupContainerEdgeStripCanvasPacket";
import {
  buildLiveDictAreaNodePainterPacket,
  type LiveDictAreaNodePainterBlock,
  type LiveDictAreaPinnedParamAreaPainterPacket,
  type LiveDictAreaUnpinnedParamAreaPainterPacket,
} from "./groupContainerNodePainterPacket";

export type {
  LiveDictAreaPinnedParamAreaPainterPacket,
  LiveDictAreaUnpinnedParamAreaPainterPacket,
} from "./groupContainerNodePainterPacket";
export type { LiveDictAreaEdgeStripCanvasPacket } from "./groupContainerEdgeStripCanvasPacket";

export type LiveDictAreaNodeCanvasPacket = {
  domBlocks: (
    | LiveDictAreaEdgeStripCanvasPacket
    | LiveDictAreaPinnedParamAreaPainterPacket
    | LiveDictAreaUnpinnedParamAreaPainterPacket
  )[];
  domEdgeStripBlock: LiveDictAreaEdgeStripCanvasPacket | null;
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
  const edgeStripBlock = nodePainterPacket.edgeStripBlock
    ? buildLiveDictAreaEdgeStripCanvasPacket({
        painterPacket: nodePainterPacket.edgeStripBlock,
      })
    : null;

  return {
    domBlocks: nodePainterPacket.blocks.flatMap((block) => {
      const canvasBlock = buildNodeCanvasBlock({
        block,
        edgeStripBlock,
        pinnedParamAreaBlock: nodePainterPacket.pinnedParamAreaBlock,
        unpinnedParamAreaBlock: nodePainterPacket.unpinnedParamAreaBlock,
      });

      return canvasBlock ? [canvasBlock] : [];
    }),
    domEdgeStripBlock: edgeStripBlock,
    domPinnedParamAreaBlock: nodePainterPacket.pinnedParamAreaBlock,
    domUnpinnedParamAreaBlock: nodePainterPacket.unpinnedParamAreaBlock,
    edgeStrip: nodePainterPacket.edgeStrip,
    maxNestedDepth: nodePainterPacket.maxNestedDepth,
    scenePacket: nodePainterPacket.scenePacket,
  };
}

function buildNodeCanvasBlock({
  block,
  edgeStripBlock,
  pinnedParamAreaBlock,
  unpinnedParamAreaBlock,
}: {
  block: LiveDictAreaNodePainterBlock;
  edgeStripBlock: LiveDictAreaEdgeStripCanvasPacket | null;
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaPainterPacket | null;
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaPainterPacket | null;
}): LiveDictAreaNodeCanvasPacket["domBlocks"][number] | null {
  if (block.kind === "edge-strip") {
    return edgeStripBlock;
  }

  if (block.kind === "pinned-param-area") {
    return pinnedParamAreaBlock;
  }

  return unpinnedParamAreaBlock;
}
