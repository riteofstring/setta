import type {
  DictAreaBlockFrameMountPacket,
  LiveDictAreaBlockFramePacket,
  LiveDictAreaEdgeStripFramePacket,
  LiveDictAreaParamAreaFramePacket,
} from "./groupContainerBlockFramePackets";
import type { LiveDictAreaNodeLayoutView } from "./groupContainerNodeLayoutView";

export type LiveDictAreaSceneEdgeStripBlockView = {
  blockId: "edges";
  framePacket: LiveDictAreaEdgeStripFramePacket;
  kind: "edge-strip";
  mount: DictAreaBlockFrameMountPacket;
};

export type LiveDictAreaPinnedParamAreaBlockView = {
  blockId: "pinned";
  framePacket: LiveDictAreaParamAreaFramePacket;
  kind: "pinned-param-area";
  mount: DictAreaBlockFrameMountPacket;
};

export type LiveDictAreaUnpinnedParamAreaBlockView = {
  blockId: "unpinned";
  framePacket: LiveDictAreaParamAreaFramePacket;
  kind: "unpinned-param-area";
  mount: DictAreaBlockFrameMountPacket;
};

export type LiveDictAreaSceneBlockView =
  | LiveDictAreaSceneEdgeStripBlockView
  | LiveDictAreaPinnedParamAreaBlockView
  | LiveDictAreaUnpinnedParamAreaBlockView;

export type LiveDictAreaSceneBlocksView = {
  blocks: LiveDictAreaSceneBlockView[];
  edgeStripBlock: LiveDictAreaSceneEdgeStripBlockView | null;
  maxNestedDepth: {
    pinned: number;
    unpinned: number;
  };
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaBlockView | null;
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaBlockView | null;
};

export function buildLiveDictAreaSceneBlockView({
  nodeLayoutView,
}: {
  nodeLayoutView: LiveDictAreaNodeLayoutView;
}): LiveDictAreaSceneBlocksView {
  const blocks = nodeLayoutView.blockFrames.map(buildSceneBlockView);
  const edgeStripBlock =
    blocks.find((block) => block.kind === "edge-strip") ?? null;
  const pinnedParamAreaBlock =
    blocks.find((block) => block.kind === "pinned-param-area") ?? null;
  const unpinnedParamAreaBlock =
    blocks.find((block) => block.kind === "unpinned-param-area") ?? null;

  return {
    blocks,
    edgeStripBlock,
    maxNestedDepth: {
      pinned: pinnedParamAreaBlock?.framePacket.maxNestedDepth ?? 0,
      unpinned: unpinnedParamAreaBlock?.framePacket.maxNestedDepth ?? 0,
    },
    pinnedParamAreaBlock,
    unpinnedParamAreaBlock,
  };
}

function buildSceneBlockView(
  blockFrame: LiveDictAreaBlockFramePacket,
): LiveDictAreaSceneBlockView {
  if (blockFrame.kind === "edge-strip") {
    return {
      blockId: "edges",
      framePacket: blockFrame,
      kind: "edge-strip",
      mount: blockFrame.frame,
    };
  }

  if (blockFrame.id === "pinned") {
    return {
      blockId: "pinned",
      framePacket: blockFrame,
      kind: "pinned-param-area",
      mount: blockFrame.frame,
    };
  }

  return {
    blockId: "unpinned",
    framePacket: blockFrame,
    kind: "unpinned-param-area",
    mount: blockFrame.frame,
  };
}
