import type {
  LiveDictAreaNodeDrawBlock,
  LiveDictAreaNodeDrawPacket,
  LiveDictAreaPinnedParamAreaDrawPacket,
  LiveDictAreaUnpinnedParamAreaDrawPacket,
} from "./groupContainerNodeDrawPacket";
import {
  buildLiveDictAreaEdgeStripPainterPacket,
  type LiveDictAreaEdgeStripPainterPacket,
} from "./groupContainerEdgeStripPainterPacket";

export type LiveDictAreaPinnedParamAreaPainterPacket = {
  blockId: LiveDictAreaPinnedParamAreaDrawPacket["blockId"];
  kind: LiveDictAreaPinnedParamAreaDrawPacket["kind"];
  mount: LiveDictAreaPinnedParamAreaDrawPacket["mount"];
  positionAndSizeLocked:
    LiveDictAreaPinnedParamAreaDrawPacket["surfacePacket"]["positionAndSizeLocked"];
  sectionTypeName:
    LiveDictAreaPinnedParamAreaDrawPacket["surfacePacket"]["sectionTypeName"];
  styleColor:
    LiveDictAreaPinnedParamAreaDrawPacket["surfacePacket"]["styleColor"];
  visualPacket:
    LiveDictAreaPinnedParamAreaDrawPacket["surfacePacket"]["visualPacket"];
};

export type LiveDictAreaUnpinnedParamAreaPainterPacket = {
  blockId: LiveDictAreaUnpinnedParamAreaDrawPacket["blockId"];
  kind: LiveDictAreaUnpinnedParamAreaDrawPacket["kind"];
  mount: LiveDictAreaUnpinnedParamAreaDrawPacket["mount"];
  styleColor:
    LiveDictAreaUnpinnedParamAreaDrawPacket["surfacePacket"]["styleColor"];
  visualPacket:
    LiveDictAreaUnpinnedParamAreaDrawPacket["surfacePacket"]["visualPacket"];
};

export type LiveDictAreaNodePainterBlock =
  | LiveDictAreaEdgeStripPainterPacket
  | LiveDictAreaPinnedParamAreaPainterPacket
  | LiveDictAreaUnpinnedParamAreaPainterPacket;

export type LiveDictAreaNodePainterPacket = {
  blocks: LiveDictAreaNodePainterBlock[];
  edgeStrip: LiveDictAreaNodeDrawPacket["edgeStrip"];
  edgeStripBlock: LiveDictAreaEdgeStripPainterPacket | null;
  maxNestedDepth: LiveDictAreaNodeDrawPacket["maxNestedDepth"];
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaPainterPacket | null;
  scenePacket: LiveDictAreaNodeDrawPacket["scenePacket"];
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaPainterPacket | null;
};

export function buildLiveDictAreaNodePainterPacket({
  nodeDrawPacket,
}: {
  nodeDrawPacket: LiveDictAreaNodeDrawPacket;
}): LiveDictAreaNodePainterPacket {
  const edgeStripBlock = nodeDrawPacket.edgeStripBlock
    ? buildLiveDictAreaEdgeStripPainterPacket({
        drawPacket: nodeDrawPacket.edgeStripBlock,
      })
    : null;
  const pinnedParamAreaBlock = nodeDrawPacket.pinnedParamAreaBlock
    ? buildPinnedParamAreaPainterPacket(nodeDrawPacket.pinnedParamAreaBlock)
    : null;
  const unpinnedParamAreaBlock = nodeDrawPacket.unpinnedParamAreaBlock
    ? buildUnpinnedParamAreaPainterPacket(nodeDrawPacket.unpinnedParamAreaBlock)
    : null;

  return {
    blocks: nodeDrawPacket.blocks.flatMap((block) => {
      const painterBlock = buildNodePainterBlock({
        block,
        edgeStripBlock,
        pinnedParamAreaBlock,
        unpinnedParamAreaBlock,
      });

      return painterBlock ? [painterBlock] : [];
    }),
    edgeStrip: nodeDrawPacket.edgeStrip,
    edgeStripBlock,
    maxNestedDepth: nodeDrawPacket.maxNestedDepth,
    pinnedParamAreaBlock,
    scenePacket: nodeDrawPacket.scenePacket,
    unpinnedParamAreaBlock,
  };
}

function buildNodePainterBlock({
  block,
  edgeStripBlock,
  pinnedParamAreaBlock,
  unpinnedParamAreaBlock,
}: {
  block: LiveDictAreaNodeDrawBlock;
  edgeStripBlock: LiveDictAreaEdgeStripPainterPacket | null;
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaPainterPacket | null;
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaPainterPacket | null;
}): LiveDictAreaNodePainterBlock | null {
  if (block.kind === "edge-strip") {
    return edgeStripBlock;
  }

  if (block.kind === "pinned-param-area") {
    return pinnedParamAreaBlock;
  }

  return unpinnedParamAreaBlock;
}
function buildPinnedParamAreaPainterPacket(
  drawPacket: LiveDictAreaPinnedParamAreaDrawPacket,
): LiveDictAreaPinnedParamAreaPainterPacket {
  return {
    blockId: drawPacket.blockId,
    kind: drawPacket.kind,
    mount: drawPacket.mount,
    positionAndSizeLocked: drawPacket.surfacePacket.positionAndSizeLocked,
    sectionTypeName: drawPacket.surfacePacket.sectionTypeName,
    styleColor: drawPacket.surfacePacket.styleColor,
    visualPacket: drawPacket.surfacePacket.visualPacket,
  };
}

function buildUnpinnedParamAreaPainterPacket(
  drawPacket: LiveDictAreaUnpinnedParamAreaDrawPacket,
): LiveDictAreaUnpinnedParamAreaPainterPacket {
  return {
    blockId: drawPacket.blockId,
    kind: drawPacket.kind,
    mount: drawPacket.mount,
    styleColor: drawPacket.surfacePacket.styleColor,
    visualPacket: drawPacket.surfacePacket.visualPacket,
  };
}
