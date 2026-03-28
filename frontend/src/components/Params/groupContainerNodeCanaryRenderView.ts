import type {
  LiveDictAreaEdgeStripCanaryView,
  LiveDictAreaNodeCanaryBlockView,
  LiveDictAreaNodeCanaryView,
  LiveDictAreaPinnedParamAreaCanaryView,
  LiveDictAreaUnpinnedParamAreaCanaryView,
} from "./groupContainerNodeCanaryView";

export type LiveDictAreaEdgeStripCanaryRenderView =
  LiveDictAreaEdgeStripCanaryView & {
    key: LiveDictAreaEdgeStripCanaryView["mount"]["frameId"];
  };

export type LiveDictAreaPinnedParamAreaCanaryRenderView =
  LiveDictAreaPinnedParamAreaCanaryView & {
    key: LiveDictAreaPinnedParamAreaCanaryView["mount"]["frameId"];
  };

export type LiveDictAreaUnpinnedParamAreaCanaryRenderView =
  LiveDictAreaUnpinnedParamAreaCanaryView & {
    key: LiveDictAreaUnpinnedParamAreaCanaryView["mount"]["frameId"];
  };

export type LiveDictAreaNodeCanaryRenderBlock =
  | LiveDictAreaEdgeStripCanaryRenderView
  | LiveDictAreaPinnedParamAreaCanaryRenderView
  | LiveDictAreaUnpinnedParamAreaCanaryRenderView;

export type LiveDictAreaNodeCanaryRenderView = {
  blocks: LiveDictAreaNodeCanaryRenderBlock[];
  edgeStrip: LiveDictAreaNodeCanaryView["edgeStrip"];
  edgeStripBlock: LiveDictAreaEdgeStripCanaryRenderView | null;
  maxNestedDepth: LiveDictAreaNodeCanaryView["maxNestedDepth"];
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaCanaryRenderView | null;
  scenePacket: LiveDictAreaNodeCanaryView["scenePacket"];
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaCanaryRenderView | null;
};

export function buildLiveDictAreaNodeCanaryRenderView({
  nodeCanaryView,
}: {
  nodeCanaryView: LiveDictAreaNodeCanaryView;
}): LiveDictAreaNodeCanaryRenderView {
  const edgeStripBlock = nodeCanaryView.edgeStripBlock
    ? buildLiveDictAreaEdgeStripCanaryRenderView({
        canaryView: nodeCanaryView.edgeStripBlock,
      })
    : null;
  const pinnedParamAreaBlock = nodeCanaryView.pinnedParamAreaBlock
    ? buildLiveDictAreaPinnedParamAreaCanaryRenderView({
        canaryView: nodeCanaryView.pinnedParamAreaBlock,
      })
    : null;
  const unpinnedParamAreaBlock = nodeCanaryView.unpinnedParamAreaBlock
    ? buildLiveDictAreaUnpinnedParamAreaCanaryRenderView({
        canaryView: nodeCanaryView.unpinnedParamAreaBlock,
      })
    : null;

  return {
    blocks: nodeCanaryView.blocks.flatMap((block) => {
      const renderBlock = buildNodeCanaryRenderBlock({
        block,
        edgeStripBlock,
        pinnedParamAreaBlock,
        unpinnedParamAreaBlock,
      });

      return renderBlock ? [renderBlock] : [];
    }),
    edgeStrip: nodeCanaryView.edgeStrip,
    edgeStripBlock,
    maxNestedDepth: nodeCanaryView.maxNestedDepth,
    pinnedParamAreaBlock,
    scenePacket: nodeCanaryView.scenePacket,
    unpinnedParamAreaBlock,
  };
}

function buildLiveDictAreaEdgeStripCanaryRenderView({
  canaryView,
}: {
  canaryView: LiveDictAreaEdgeStripCanaryView;
}): LiveDictAreaEdgeStripCanaryRenderView {
  return {
    ...canaryView,
    key: canaryView.mount.frameId,
  };
}

function buildLiveDictAreaPinnedParamAreaCanaryRenderView({
  canaryView,
}: {
  canaryView: LiveDictAreaPinnedParamAreaCanaryView;
}): LiveDictAreaPinnedParamAreaCanaryRenderView {
  return {
    ...canaryView,
    key: canaryView.mount.frameId,
  };
}

function buildLiveDictAreaUnpinnedParamAreaCanaryRenderView({
  canaryView,
}: {
  canaryView: LiveDictAreaUnpinnedParamAreaCanaryView;
}): LiveDictAreaUnpinnedParamAreaCanaryRenderView {
  return {
    ...canaryView,
    key: canaryView.mount.frameId,
  };
}

function buildNodeCanaryRenderBlock({
  block,
  edgeStripBlock,
  pinnedParamAreaBlock,
  unpinnedParamAreaBlock,
}: {
  block: LiveDictAreaNodeCanaryBlockView;
  edgeStripBlock: LiveDictAreaEdgeStripCanaryRenderView | null;
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaCanaryRenderView | null;
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaCanaryRenderView | null;
}): LiveDictAreaNodeCanaryRenderBlock | null {
  if (block.kind === "edge-strip") {
    return edgeStripBlock;
  }

  if (block.kind === "pinned-param-area") {
    return pinnedParamAreaBlock;
  }

  return unpinnedParamAreaBlock;
}
