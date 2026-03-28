import type {
  LiveDictAreaNodeCanaryBlockView,
  LiveDictAreaNodeCanaryView,
} from "./groupContainerNodeCanaryView";
import {
  buildLiveDictAreaEdgeStripCanaryRenderView,
  type LiveDictAreaEdgeStripCanaryRenderView,
} from "./groupContainerEdgeStripCanaryRenderView";
import {
  buildLiveDictAreaPinnedParamAreaCanaryRenderView,
  type LiveDictAreaPinnedParamAreaCanaryRenderView,
} from "./groupContainerPinnedParamAreaCanaryRenderView";
import {
  buildLiveDictAreaUnpinnedParamAreaCanaryRenderView,
  type LiveDictAreaUnpinnedParamAreaCanaryRenderView,
} from "./groupContainerUnpinnedParamAreaCanaryRenderView";

export type { LiveDictAreaEdgeStripCanaryRenderView } from "./groupContainerEdgeStripCanaryRenderView";
export type { LiveDictAreaPinnedParamAreaCanaryRenderView } from "./groupContainerPinnedParamAreaCanaryRenderView";
export type { LiveDictAreaUnpinnedParamAreaCanaryRenderView } from "./groupContainerUnpinnedParamAreaCanaryRenderView";

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
