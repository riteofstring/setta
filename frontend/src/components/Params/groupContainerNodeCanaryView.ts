import {
  buildLiveDictAreaEdgeStripCanaryView,
  type LiveDictAreaEdgeStripCanaryView,
} from "./groupContainerEdgeStripCanaryView";
import type { LiveDictAreaNodeCanaryPacket } from "./groupContainerNodeCanaryPacket";
import {
  buildLiveDictAreaPinnedParamAreaCanaryView,
  type LiveDictAreaPinnedParamAreaCanaryView,
} from "./groupContainerPinnedParamAreaCanaryView";
import {
  buildLiveDictAreaUnpinnedParamAreaCanaryView,
  type LiveDictAreaUnpinnedParamAreaCanaryView,
} from "./groupContainerUnpinnedParamAreaCanaryView";

export type { LiveDictAreaEdgeStripCanaryView } from "./groupContainerEdgeStripCanaryView";
export type { LiveDictAreaPinnedParamAreaCanaryView } from "./groupContainerPinnedParamAreaCanaryView";
export type { LiveDictAreaUnpinnedParamAreaCanaryView } from "./groupContainerUnpinnedParamAreaCanaryView";

export type LiveDictAreaNodeCanaryBlockView =
  | LiveDictAreaEdgeStripCanaryView
  | LiveDictAreaPinnedParamAreaCanaryView
  | LiveDictAreaUnpinnedParamAreaCanaryView;

export type LiveDictAreaNodeCanaryView = {
  blocks: LiveDictAreaNodeCanaryBlockView[];
  edgeStrip: LiveDictAreaNodeCanaryPacket["edgeStrip"];
  edgeStripBlock: LiveDictAreaEdgeStripCanaryView | null;
  maxNestedDepth: LiveDictAreaNodeCanaryPacket["maxNestedDepth"];
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaCanaryView | null;
  scenePacket: LiveDictAreaNodeCanaryPacket["scenePacket"];
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaCanaryView | null;
};

export function buildLiveDictAreaNodeCanaryView({
  nodeCanaryPacket,
}: {
  nodeCanaryPacket: LiveDictAreaNodeCanaryPacket;
}): LiveDictAreaNodeCanaryView {
  const edgeStripBlock = nodeCanaryPacket.edgeStripBlock
    ? buildLiveDictAreaEdgeStripCanaryView({
        canaryPacket: nodeCanaryPacket.edgeStripBlock,
      })
    : null;
  const pinnedParamAreaBlock = nodeCanaryPacket.pinnedParamAreaBlock
    ? buildLiveDictAreaPinnedParamAreaCanaryView({
        canaryPacket: nodeCanaryPacket.pinnedParamAreaBlock,
      })
    : null;
  const unpinnedParamAreaBlock = nodeCanaryPacket.unpinnedParamAreaBlock
    ? buildLiveDictAreaUnpinnedParamAreaCanaryView({
        canaryPacket: nodeCanaryPacket.unpinnedParamAreaBlock,
      })
    : null;

  return {
    blocks: nodeCanaryPacket.blocks.flatMap((block) => {
      const canaryViewBlock = buildNodeCanaryViewBlock({
        block,
        edgeStripBlock,
        pinnedParamAreaBlock,
        unpinnedParamAreaBlock,
      });

      return canaryViewBlock ? [canaryViewBlock] : [];
    }),
    edgeStrip: nodeCanaryPacket.edgeStrip,
    edgeStripBlock,
    maxNestedDepth: nodeCanaryPacket.maxNestedDepth,
    pinnedParamAreaBlock,
    scenePacket: nodeCanaryPacket.scenePacket,
    unpinnedParamAreaBlock,
  };
}

function buildNodeCanaryViewBlock({
  block,
  edgeStripBlock,
  pinnedParamAreaBlock,
  unpinnedParamAreaBlock,
}: {
  block: LiveDictAreaNodeCanaryPacket["blocks"][number];
  edgeStripBlock: LiveDictAreaEdgeStripCanaryView | null;
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaCanaryView | null;
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaCanaryView | null;
}): LiveDictAreaNodeCanaryBlockView | null {
  if (block.kind === "edge-strip") {
    return edgeStripBlock;
  }

  if (block.kind === "pinned-param-area") {
    return pinnedParamAreaBlock;
  }

  return unpinnedParamAreaBlock;
}
