import {
  buildLiveDictAreaNodeMountPacket,
  type LiveDictAreaNodeMountPacket,
} from "./groupContainerNodeMountPacket";
import {
  buildLiveDictAreaEdgeStripDomPacket,
  type LiveDictAreaEdgeStripDomPacket,
} from "./groupContainerEdgeStripDomPacket";
import {
  buildLiveDictAreaPinnedParamAreaDomPacket,
  type LiveDictAreaPinnedParamAreaDomPacket,
} from "./groupContainerPinnedParamAreaDomPacket";
import {
  buildLiveDictAreaUnpinnedParamAreaDomPacket,
  type LiveDictAreaUnpinnedParamAreaDomPacket,
} from "./groupContainerUnpinnedParamAreaDomPacket";
import type { LiveDictAreaNodeSurfacePacket } from "./groupContainerNodeSurfacePacket";

export type { LiveDictAreaEdgeStripDomPacket } from "./groupContainerEdgeStripDomPacket";
export type { LiveDictAreaPinnedParamAreaDomPacket } from "./groupContainerPinnedParamAreaDomPacket";
export type { LiveDictAreaUnpinnedParamAreaDomPacket } from "./groupContainerUnpinnedParamAreaDomPacket";

export type LiveDictAreaNodeDomPacket = {
  domBlocks: (
    | LiveDictAreaEdgeStripDomPacket
    | LiveDictAreaPinnedParamAreaDomPacket
    | LiveDictAreaUnpinnedParamAreaDomPacket
  )[];
  domEdgeStripBlock: LiveDictAreaEdgeStripDomPacket | null;
  domPinnedParamAreaBlock: LiveDictAreaPinnedParamAreaDomPacket | null;
  domUnpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaDomPacket | null;
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
  const edgeStripBlock = nodeMountPacket.domEdgeStripBlock
    ? buildLiveDictAreaEdgeStripDomPacket({
        mountPacket: nodeMountPacket.domEdgeStripBlock,
      })
    : null;
  const pinnedParamAreaBlock = nodeMountPacket.domPinnedParamAreaBlock
    ? buildLiveDictAreaPinnedParamAreaDomPacket({
        mountPacket: nodeMountPacket.domPinnedParamAreaBlock,
      })
    : null;
  const unpinnedParamAreaBlock = nodeMountPacket.domUnpinnedParamAreaBlock
    ? buildLiveDictAreaUnpinnedParamAreaDomPacket({
        mountPacket: nodeMountPacket.domUnpinnedParamAreaBlock,
      })
    : null;

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
  edgeStripBlock: LiveDictAreaEdgeStripDomPacket | null;
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaDomPacket | null;
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaDomPacket | null;
}): LiveDictAreaNodeDomPacket["domBlocks"][number] | null {
  if (block.kind === "edge-strip") {
    return edgeStripBlock;
  }

  if (block.kind === "pinned-param-area") {
    return pinnedParamAreaBlock;
  }

  return unpinnedParamAreaBlock;
}
