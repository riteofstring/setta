import {
  buildLiveDictAreaNodeMountPacket,
  type LiveDictAreaEdgeStripMountPacket,
  type LiveDictAreaNodeMountPacket,
  type LiveDictAreaPinnedParamAreaMountPacket,
  type LiveDictAreaUnpinnedParamAreaMountPacket,
} from "./groupContainerNodeMountPacket";
import type { LiveDictAreaNodeSurfacePacket } from "./groupContainerNodeSurfacePacket";

export type { LiveDictAreaEdgeStripMountPacket } from "./groupContainerNodeMountPacket";
export type { LiveDictAreaPinnedParamAreaMountPacket } from "./groupContainerNodeMountPacket";
export type { LiveDictAreaUnpinnedParamAreaMountPacket } from "./groupContainerNodeMountPacket";

export type LiveDictAreaNodeDomPacket = {
  domBlocks: (
    | LiveDictAreaEdgeStripMountPacket
    | LiveDictAreaPinnedParamAreaMountPacket
    | LiveDictAreaUnpinnedParamAreaMountPacket
  )[];
  domEdgeStripBlock: LiveDictAreaEdgeStripMountPacket | null;
  domPinnedParamAreaBlock: LiveDictAreaPinnedParamAreaMountPacket | null;
  domUnpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaMountPacket | null;
  edgeStrip: LiveDictAreaNodeMountPacket["edgeStrip"];
  maxNestedDepth: LiveDictAreaNodeMountPacket["maxNestedDepth"];
  scenePacket: LiveDictAreaNodeMountPacket["scenePacket"];
};

export function buildLiveDictAreaNodeDomPacket({
  nodeSurfacePacket,
}: {
  nodeSurfacePacket: LiveDictAreaNodeSurfacePacket;
}): LiveDictAreaNodeDomPacket {
  const nodeMountPacket = buildLiveDictAreaNodeMountPacket({
    nodeSurfacePacket,
  });
  const edgeStripBlock = nodeMountPacket.domEdgeStripBlock;
  const pinnedParamAreaBlock = nodeMountPacket.domPinnedParamAreaBlock;
  const unpinnedParamAreaBlock = nodeMountPacket.domUnpinnedParamAreaBlock;

  return {
    domBlocks: nodeMountPacket.domBlocks.flatMap((block) => {
      const domBlock = buildNodeDomBlock({
        block,
        edgeStripBlock,
        pinnedParamAreaBlock,
        unpinnedParamAreaBlock,
      });

      return domBlock ? [domBlock] : [];
    }),
    domEdgeStripBlock: edgeStripBlock,
    domPinnedParamAreaBlock: pinnedParamAreaBlock,
    domUnpinnedParamAreaBlock: unpinnedParamAreaBlock,
    edgeStrip: nodeMountPacket.edgeStrip,
    maxNestedDepth: nodeMountPacket.maxNestedDepth,
    scenePacket: nodeMountPacket.scenePacket,
  };
}

function buildNodeDomBlock({
  block,
  edgeStripBlock,
  pinnedParamAreaBlock,
  unpinnedParamAreaBlock,
}: {
  block: LiveDictAreaNodeMountPacket["domBlocks"][number];
  edgeStripBlock: LiveDictAreaEdgeStripMountPacket | null;
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaMountPacket | null;
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaMountPacket | null;
}): LiveDictAreaNodeDomPacket["domBlocks"][number] | null {
  if (block.kind === "edge-strip") {
    return edgeStripBlock;
  }

  if (block.kind === "pinned-param-area") {
    return pinnedParamAreaBlock;
  }

  return unpinnedParamAreaBlock;
}
