import type { LiveDictAreaNodeCanaryPacket } from "./groupContainerNodeCanaryPacket";
import {
  buildLiveDictAreaEdgeStripCanaryRenderer,
  type LiveDictAreaEdgeStripCanaryRenderer,
} from "./groupContainerEdgeStripCanaryRenderer";
import {
  buildLiveDictAreaPinnedParamAreaCanaryRenderer,
  type LiveDictAreaPinnedParamAreaCanaryRenderer,
} from "./groupContainerPinnedParamAreaCanaryRenderer";
import {
  buildLiveDictAreaUnpinnedParamAreaCanaryRenderer,
  type LiveDictAreaUnpinnedParamAreaCanaryRenderer,
} from "./groupContainerUnpinnedParamAreaCanaryRenderer";
import {
  buildLiveDictAreaNodeCanaryRenderView,
  type LiveDictAreaNodeCanaryRenderBlock,
  type LiveDictAreaNodeCanaryRenderView,
} from "./groupContainerNodeCanaryRenderView";
import {
  buildLiveDictAreaNodeCanaryView,
  type LiveDictAreaNodeCanaryView,
} from "./groupContainerNodeCanaryView";

export type { LiveDictAreaEdgeStripCanaryRenderer } from "./groupContainerEdgeStripCanaryRenderer";
export type { LiveDictAreaPinnedParamAreaCanaryRenderer } from "./groupContainerPinnedParamAreaCanaryRenderer";
export type { LiveDictAreaUnpinnedParamAreaCanaryRenderer } from "./groupContainerUnpinnedParamAreaCanaryRenderer";

export type LiveDictAreaNodeCanaryRendererBlock =
  | LiveDictAreaEdgeStripCanaryRenderer
  | LiveDictAreaPinnedParamAreaCanaryRenderer
  | LiveDictAreaUnpinnedParamAreaCanaryRenderer;

export type LiveDictAreaNodeCanaryRenderer = {
  blocks: LiveDictAreaNodeCanaryRendererBlock[];
  canaryPacket: LiveDictAreaNodeCanaryPacket;
  canaryView: LiveDictAreaNodeCanaryView;
  edgeStrip: LiveDictAreaNodeCanaryRenderView["edgeStrip"];
  edgeStripBlock: LiveDictAreaEdgeStripCanaryRenderer | null;
  maxNestedDepth: LiveDictAreaNodeCanaryRenderView["maxNestedDepth"];
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaCanaryRenderer | null;
  scenePacket: LiveDictAreaNodeCanaryRenderView["scenePacket"];
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaCanaryRenderer | null;
};

export function buildLiveDictAreaNodeCanaryRenderer({
  nodeCanaryPacket,
}: {
  nodeCanaryPacket: LiveDictAreaNodeCanaryPacket;
}): LiveDictAreaNodeCanaryRenderer {
  const canaryView = buildLiveDictAreaNodeCanaryView({
    nodeCanaryPacket,
  });
  const renderView = buildLiveDictAreaNodeCanaryRenderView({
    nodeCanaryView: canaryView,
  });
  const edgeStripBlock = canaryView.edgeStripBlock
    ? buildLiveDictAreaEdgeStripCanaryRenderer({
        canaryView: canaryView.edgeStripBlock,
      })
    : null;
  const pinnedParamAreaBlock = canaryView.pinnedParamAreaBlock
    ? buildLiveDictAreaPinnedParamAreaCanaryRenderer({
        canaryView: canaryView.pinnedParamAreaBlock,
      })
    : null;
  const unpinnedParamAreaBlock = canaryView.unpinnedParamAreaBlock
    ? buildLiveDictAreaUnpinnedParamAreaCanaryRenderer({
        canaryView: canaryView.unpinnedParamAreaBlock,
      })
    : null;

  return {
    blocks: renderView.blocks.flatMap((block) => {
      const rendererBlock = buildNodeCanaryRendererBlock({
        block,
        edgeStripBlock,
        pinnedParamAreaBlock,
        unpinnedParamAreaBlock,
      });

      return rendererBlock ? [rendererBlock] : [];
    }),
    canaryPacket: nodeCanaryPacket,
    canaryView,
    edgeStrip: renderView.edgeStrip,
    edgeStripBlock,
    maxNestedDepth: renderView.maxNestedDepth,
    pinnedParamAreaBlock,
    scenePacket: renderView.scenePacket,
    unpinnedParamAreaBlock,
  };
}

function buildNodeCanaryRendererBlock({
  block,
  edgeStripBlock,
  pinnedParamAreaBlock,
  unpinnedParamAreaBlock,
}: {
  block: LiveDictAreaNodeCanaryRenderBlock;
  edgeStripBlock: LiveDictAreaEdgeStripCanaryRenderer | null;
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaCanaryRenderer | null;
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaCanaryRenderer | null;
}): LiveDictAreaNodeCanaryRendererBlock | null {
  if (block.kind === "edge-strip") {
    return edgeStripBlock;
  }

  if (block.kind === "pinned-param-area") {
    return pinnedParamAreaBlock;
  }

  return unpinnedParamAreaBlock;
}
