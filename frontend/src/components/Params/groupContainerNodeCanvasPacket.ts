import type { LiveDictAreaNodeDrawPacket } from "./groupContainerNodeDrawPacket";
import {
  buildLiveDictAreaEdgeStripCanvasPacket,
  type LiveDictAreaEdgeStripCanvasPacket,
} from "./groupContainerEdgeStripCanvasPacket";
import {
  buildLiveDictAreaPinnedParamAreaCanvasPacket,
  type LiveDictAreaPinnedParamAreaCanvasPacket,
} from "./groupContainerPinnedParamAreaCanvasPacket";
import {
  buildLiveDictAreaUnpinnedParamAreaCanvasPacket,
  type LiveDictAreaUnpinnedParamAreaCanvasPacket,
} from "./groupContainerUnpinnedParamAreaCanvasPacket";
import {
  buildLiveDictAreaNodePainterPacket,
  type LiveDictAreaNodePainterBlock,
} from "./groupContainerNodePainterPacket";

export type { LiveDictAreaEdgeStripCanvasPacket } from "./groupContainerEdgeStripCanvasPacket";
export type { LiveDictAreaPinnedParamAreaCanvasPacket } from "./groupContainerPinnedParamAreaCanvasPacket";
export type { LiveDictAreaUnpinnedParamAreaCanvasPacket } from "./groupContainerUnpinnedParamAreaCanvasPacket";

export type LiveDictAreaNodeCanvasPacket = {
  domBlocks: (
    | LiveDictAreaEdgeStripCanvasPacket
    | LiveDictAreaPinnedParamAreaCanvasPacket
    | LiveDictAreaUnpinnedParamAreaCanvasPacket
  )[];
  domEdgeStripBlock: LiveDictAreaEdgeStripCanvasPacket | null;
  domPinnedParamAreaBlock: LiveDictAreaPinnedParamAreaCanvasPacket | null;
  domUnpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaCanvasPacket | null;
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
  const pinnedParamAreaBlock = nodePainterPacket.pinnedParamAreaBlock
    ? buildLiveDictAreaPinnedParamAreaCanvasPacket({
        painterPacket: nodePainterPacket.pinnedParamAreaBlock,
      })
    : null;
  const unpinnedParamAreaBlock = nodePainterPacket.unpinnedParamAreaBlock
    ? buildLiveDictAreaUnpinnedParamAreaCanvasPacket({
        painterPacket: nodePainterPacket.unpinnedParamAreaBlock,
      })
    : null;

  return {
    domBlocks: nodePainterPacket.blocks.flatMap((block) => {
      const canvasBlock = buildNodeCanvasBlock({
        block,
        edgeStripBlock,
        pinnedParamAreaBlock,
        unpinnedParamAreaBlock,
      });

      return canvasBlock ? [canvasBlock] : [];
    }),
    domEdgeStripBlock: edgeStripBlock,
    domPinnedParamAreaBlock: pinnedParamAreaBlock,
    domUnpinnedParamAreaBlock: unpinnedParamAreaBlock,
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
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaCanvasPacket | null;
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaCanvasPacket | null;
}): LiveDictAreaNodeCanvasPacket["domBlocks"][number] | null {
  if (block.kind === "edge-strip") {
    return edgeStripBlock;
  }

  if (block.kind === "pinned-param-area") {
    return pinnedParamAreaBlock;
  }

  return unpinnedParamAreaBlock;
}
