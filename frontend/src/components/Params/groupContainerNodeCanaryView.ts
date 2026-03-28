import type { DictAreaBlockFrameMountPacket } from "./groupContainerBlockFramePackets";
import type { LiveDictAreaEdgeStripCanaryPacket } from "./groupContainerEdgeStripCanaryPacket";
import type { LiveDictAreaNodeCanaryPacket } from "./groupContainerNodeCanaryPacket";
import type { LiveDictAreaPinnedParamAreaCanaryPacket } from "./groupContainerPinnedParamAreaCanaryPacket";
import type { LiveDictAreaUnpinnedParamAreaCanaryPacket } from "./groupContainerUnpinnedParamAreaCanaryPacket";

export type LiveDictAreaEdgeStripCanaryView = {
  blockId: LiveDictAreaEdgeStripCanaryPacket["blockId"];
  domPacket: LiveDictAreaEdgeStripCanaryPacket["domPacket"];
  kind: "edge-strip";
  mount: DictAreaBlockFrameMountPacket;
  scenePacket: LiveDictAreaEdgeStripCanaryPacket["scenePacket"];
};

export type LiveDictAreaPinnedParamAreaCanaryView = {
  blockId: LiveDictAreaPinnedParamAreaCanaryPacket["blockId"];
  domPacket: LiveDictAreaPinnedParamAreaCanaryPacket["domPacket"];
  kind: "pinned-param-area";
  mount: DictAreaBlockFrameMountPacket;
  scenePacket: LiveDictAreaPinnedParamAreaCanaryPacket["scenePacket"];
};

export type LiveDictAreaUnpinnedParamAreaCanaryView = {
  blockId: LiveDictAreaUnpinnedParamAreaCanaryPacket["blockId"];
  domPacket: LiveDictAreaUnpinnedParamAreaCanaryPacket["domPacket"];
  kind: "unpinned-param-area";
  mount: DictAreaBlockFrameMountPacket;
  scenePacket: LiveDictAreaUnpinnedParamAreaCanaryPacket["scenePacket"];
};

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

function buildLiveDictAreaEdgeStripCanaryView({
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

function buildLiveDictAreaPinnedParamAreaCanaryView({
  canaryPacket,
}: {
  canaryPacket: LiveDictAreaPinnedParamAreaCanaryPacket;
}): LiveDictAreaPinnedParamAreaCanaryView {
  return {
    blockId: canaryPacket.blockId,
    domPacket: canaryPacket.domPacket,
    kind: "pinned-param-area",
    mount: canaryPacket.domPacket.mount,
    scenePacket: canaryPacket.scenePacket,
  };
}

function buildLiveDictAreaUnpinnedParamAreaCanaryView({
  canaryPacket,
}: {
  canaryPacket: LiveDictAreaUnpinnedParamAreaCanaryPacket;
}): LiveDictAreaUnpinnedParamAreaCanaryView {
  return {
    blockId: canaryPacket.blockId,
    domPacket: canaryPacket.domPacket,
    kind: "unpinned-param-area",
    mount: canaryPacket.domPacket.mount,
    scenePacket: canaryPacket.scenePacket,
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
