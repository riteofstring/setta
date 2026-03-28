import type { LiveDictAreaNodeCanaryPacket } from "./groupContainerNodeCanaryPacket";
import {
  buildLiveDictAreaEdgeStripCanaryRenderer,
  type LiveDictAreaEdgeStripCanaryRenderer,
} from "./groupContainerEdgeStripCanaryRenderer";
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

export type LiveDictAreaNodeCanaryRendererBlock =
  | LiveDictAreaEdgeStripCanaryRenderer
  | Exclude<LiveDictAreaNodeCanaryRenderBlock, { kind: "edge-strip" }>;

export type LiveDictAreaNodeCanaryRenderer = {
  blocks: LiveDictAreaNodeCanaryRendererBlock[];
  canaryPacket: LiveDictAreaNodeCanaryPacket;
  canaryView: LiveDictAreaNodeCanaryView;
  edgeStrip: LiveDictAreaNodeCanaryRenderView["edgeStrip"];
  edgeStripBlock: LiveDictAreaEdgeStripCanaryRenderer | null;
  maxNestedDepth: LiveDictAreaNodeCanaryRenderView["maxNestedDepth"];
  pinnedParamAreaBlock: LiveDictAreaNodeCanaryRenderView["pinnedParamAreaBlock"];
  scenePacket: LiveDictAreaNodeCanaryRenderView["scenePacket"];
  unpinnedParamAreaBlock: LiveDictAreaNodeCanaryRenderView["unpinnedParamAreaBlock"];
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

  return {
    blocks: renderView.blocks.flatMap((block) => {
      const rendererBlock = buildNodeCanaryRendererBlock({
        block,
        edgeStripBlock,
      });

      return rendererBlock ? [rendererBlock] : [];
    }),
    canaryPacket: nodeCanaryPacket,
    canaryView,
    edgeStrip: renderView.edgeStrip,
    edgeStripBlock,
    maxNestedDepth: renderView.maxNestedDepth,
    pinnedParamAreaBlock: renderView.pinnedParamAreaBlock,
    scenePacket: renderView.scenePacket,
    unpinnedParamAreaBlock: renderView.unpinnedParamAreaBlock,
  };
}

function buildNodeCanaryRendererBlock({
  block,
  edgeStripBlock,
}: {
  block: LiveDictAreaNodeCanaryRenderBlock;
  edgeStripBlock: LiveDictAreaEdgeStripCanaryRenderer | null;
}): LiveDictAreaNodeCanaryRendererBlock | null {
  if (block.kind === "edge-strip") {
    return edgeStripBlock;
  }

  return block;
}
