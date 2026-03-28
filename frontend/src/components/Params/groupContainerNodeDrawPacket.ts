import type { DictAreaBlockFrameMountPacket } from "./groupContainerBlockFramePackets";
import {
  buildLiveDictAreaEdgeStripDrawPacket,
  type LiveDictAreaEdgeStripDrawPacket,
} from "./groupContainerEdgeStripDrawPacket";
import {
  buildLiveDictAreaPinnedParamAreaDrawPacket,
  type LiveDictAreaPinnedParamAreaDrawPacket,
} from "./groupContainerPinnedParamAreaDrawPacket";
import {
  buildLiveDictAreaUnpinnedParamAreaDrawPacket,
  type LiveDictAreaUnpinnedParamAreaDrawPacket,
} from "./groupContainerUnpinnedParamAreaDrawPacket";
import type {
  LiveDictAreaNodeSurfaceBlock,
  LiveDictAreaNodeSurfacePacket,
} from "./groupContainerNodeSurfacePacket";

export type LiveDictAreaNodeDrawBlock =
  | LiveDictAreaEdgeStripDrawPacket
  | LiveDictAreaPinnedParamAreaDrawPacket
  | LiveDictAreaUnpinnedParamAreaDrawPacket;

export type LiveDictAreaNodeDrawPacket = {
  blocks: LiveDictAreaNodeDrawBlock[];
  edgeStrip: LiveDictAreaNodeSurfacePacket["edgeStrip"];
  edgeStripBlock: LiveDictAreaEdgeStripDrawPacket | null;
  maxNestedDepth: LiveDictAreaNodeSurfacePacket["maxNestedDepth"];
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaDrawPacket | null;
  scenePacket: LiveDictAreaNodeSurfacePacket["scenePacket"];
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaDrawPacket | null;
};

export function buildLiveDictAreaNodeDrawPacket({
  nodeSurfacePacket,
}: {
  nodeSurfacePacket: LiveDictAreaNodeSurfacePacket;
}): LiveDictAreaNodeDrawPacket {
  const edgeStripBlock = nodeSurfacePacket.edgeStripBlock
    ? buildLiveDictAreaEdgeStripDrawPacket({
        surfacePacket: nodeSurfacePacket.edgeStripBlock,
      })
    : null;
  const pinnedParamAreaBlock = nodeSurfacePacket.pinnedParamAreaBlock
    ? buildLiveDictAreaPinnedParamAreaDrawPacket({
        surfacePacket: nodeSurfacePacket.pinnedParamAreaBlock,
      })
    : null;
  const unpinnedParamAreaBlock = nodeSurfacePacket.unpinnedParamAreaBlock
    ? buildLiveDictAreaUnpinnedParamAreaDrawPacket({
        surfacePacket: nodeSurfacePacket.unpinnedParamAreaBlock,
      })
    : null;

  return {
    blocks: nodeSurfacePacket.blocks.flatMap((block) => {
      const drawBlock = buildNodeDrawBlock({
        block,
        edgeStripBlock,
        pinnedParamAreaBlock,
        unpinnedParamAreaBlock,
      });

      return drawBlock ? [drawBlock] : [];
    }),
    edgeStrip: nodeSurfacePacket.edgeStrip,
    edgeStripBlock,
    maxNestedDepth: nodeSurfacePacket.maxNestedDepth,
    pinnedParamAreaBlock,
    scenePacket: nodeSurfacePacket.scenePacket,
    unpinnedParamAreaBlock,
  };
}

function buildNodeDrawBlock({
  block,
  edgeStripBlock,
  pinnedParamAreaBlock,
  unpinnedParamAreaBlock,
}: {
  block: LiveDictAreaNodeSurfaceBlock;
  edgeStripBlock: LiveDictAreaEdgeStripDrawPacket | null;
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaDrawPacket | null;
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaDrawPacket | null;
}): LiveDictAreaNodeDrawBlock | null {
  if (block.kind === "edge-strip") {
    return edgeStripBlock;
  }

  if (block.kind === "pinned-param-area") {
    return pinnedParamAreaBlock;
  }

  return unpinnedParamAreaBlock;
}
