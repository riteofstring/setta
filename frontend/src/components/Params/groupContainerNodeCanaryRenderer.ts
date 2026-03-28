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

export type LiveDictAreaNodeCanaryRendererBlock =
  | LiveDictAreaEdgeStripCanaryRenderer
  | LiveDictAreaPinnedParamAreaCanaryRenderer
  | Exclude<
      LiveDictAreaNodeCanaryRenderBlock,
      { kind: "edge-strip" | "pinned-param-area" }
    >;

export type LiveDictAreaNodeCanaryRenderer = {
  blocks: LiveDictAreaNodeCanaryRendererBlock[];
  canaryPacket: LiveDictAreaNodeCanaryPacket;
  canaryView: LiveDictAreaNodeCanaryView;
  edgeStrip: LiveDictAreaNodeCanaryRenderView["edgeStrip"];
  edgeStripBlock: LiveDictAreaEdgeStripCanaryRenderer | null;
  maxNestedDepth: LiveDictAreaNodeCanaryRenderView["maxNestedDepth"];
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaCanaryRenderer | null;
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
  const pinnedParamAreaBlock = canaryView.pinnedParamAreaBlock
    ? buildLiveDictAreaPinnedParamAreaCanaryRenderer({
        canaryView: canaryView.pinnedParamAreaBlock,
      })
    : null;

  return {
    blocks: renderView.blocks.flatMap((block) => {
      const rendererBlock = buildNodeCanaryRendererBlock({
        block,
        edgeStripBlock,
        pinnedParamAreaBlock,
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
    unpinnedParamAreaBlock: renderView.unpinnedParamAreaBlock,
  };
}

function buildNodeCanaryRendererBlock({
  block,
  edgeStripBlock,
  pinnedParamAreaBlock,
}: {
  block: LiveDictAreaNodeCanaryRenderBlock;
  edgeStripBlock: LiveDictAreaEdgeStripCanaryRenderer | null;
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaCanaryRenderer | null;
}): LiveDictAreaNodeCanaryRendererBlock | null {
  if (block.kind === "edge-strip") {
    return edgeStripBlock;
  }

  if (block.kind === "pinned-param-area") {
    return pinnedParamAreaBlock;
  }

  return block;
}
