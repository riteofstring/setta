import type { DictAreaBlockFrameMountPacket } from "./groupContainerBlockFramePackets";
import type {
  LiveDictAreaPinnedParamAreaBlockView,
  LiveDictAreaSceneBlocksView,
  LiveDictAreaSceneEdgeStripBlockView,
  LiveDictAreaUnpinnedParamAreaBlockView,
} from "./groupContainerSceneBlockView";

export type LiveDictAreaEdgeStripRendererPacket = {
  blockId: "edges";
  estimatedHeight: number;
  inputPortCount: number;
  kind: "edge-strip";
  mount: DictAreaBlockFrameMountPacket;
  outputPortCount: number;
  portRowCount: number;
  title: "Edges";
};

export type LiveDictAreaPinnedParamAreaRendererPacket = {
  blockId: "pinned";
  grow: boolean;
  kind: "pinned-param-area";
  listKey: "pinned";
  maxNestedDepth: number;
  minHeight: number | null;
  mount: DictAreaBlockFrameMountPacket;
  requiredParamIdsToPaths: Record<string, string[]>;
  rowCount: number;
  rows: LiveDictAreaPinnedParamAreaBlockView["framePacket"]["rows"];
  shouldApplyMinHeight: boolean;
  shouldRoundBottom: boolean;
  title: string;
  topLevelParamIds: string[];
};

export type LiveDictAreaUnpinnedParamAreaRendererPacket = {
  blockId: "unpinned";
  grow: boolean;
  kind: "unpinned-param-area";
  listKey: "unpinned";
  maxNestedDepth: number;
  minHeight: number | null;
  mount: DictAreaBlockFrameMountPacket;
  requiredParamIdsToPaths: Record<string, string[]>;
  rowCount: number;
  rows: LiveDictAreaUnpinnedParamAreaBlockView["framePacket"]["rows"];
  shouldApplyMinHeight: boolean;
  shouldRoundBottom: boolean;
  title: string;
  topLevelParamIds: string[];
};

export type LiveDictAreaSceneRendererPacket =
  | LiveDictAreaEdgeStripRendererPacket
  | LiveDictAreaPinnedParamAreaRendererPacket
  | LiveDictAreaUnpinnedParamAreaRendererPacket;

export type LiveDictAreaSceneRendererPackets = {
  blocks: LiveDictAreaSceneRendererPacket[];
  edgeStripBlock: LiveDictAreaEdgeStripRendererPacket | null;
  maxNestedDepth: {
    pinned: number;
    unpinned: number;
  };
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaRendererPacket | null;
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaRendererPacket | null;
};

export function buildLiveDictAreaSceneRendererPackets({
  sceneBlockView,
}: {
  sceneBlockView: LiveDictAreaSceneBlocksView;
}): LiveDictAreaSceneRendererPackets {
  const blocks = sceneBlockView.blocks.map(buildSceneRendererPacket);

  return {
    blocks,
    edgeStripBlock: blocks.find((block) => block.kind === "edge-strip") ?? null,
    maxNestedDepth: sceneBlockView.maxNestedDepth,
    pinnedParamAreaBlock:
      blocks.find((block) => block.kind === "pinned-param-area") ?? null,
    unpinnedParamAreaBlock:
      blocks.find((block) => block.kind === "unpinned-param-area") ?? null,
  };
}

function buildSceneRendererPacket(
  block:
    | LiveDictAreaSceneEdgeStripBlockView
    | LiveDictAreaPinnedParamAreaBlockView
    | LiveDictAreaUnpinnedParamAreaBlockView,
): LiveDictAreaSceneRendererPacket {
  if (block.kind === "edge-strip") {
    return {
      blockId: block.blockId,
      estimatedHeight: block.framePacket.estimatedHeight,
      inputPortCount: block.framePacket.inputPortCount,
      kind: "edge-strip",
      mount: block.mount,
      outputPortCount: block.framePacket.outputPortCount,
      portRowCount: block.framePacket.portRowCount,
      title: block.framePacket.title,
    };
  }

  if (block.kind === "pinned-param-area") {
    return buildPinnedParamAreaRendererPacket(block);
  }

  return buildUnpinnedParamAreaRendererPacket(block);
}

function buildPinnedParamAreaRendererPacket(
  block: LiveDictAreaPinnedParamAreaBlockView,
): LiveDictAreaPinnedParamAreaRendererPacket {
  return {
    blockId: block.blockId,
    grow: block.framePacket.grow,
    kind: "pinned-param-area",
    listKey: block.framePacket.listKey,
    maxNestedDepth: block.framePacket.maxNestedDepth,
    minHeight: block.framePacket.minHeight,
    mount: block.mount,
    requiredParamIdsToPaths: block.framePacket.requiredParamIdsToPaths,
    rowCount: block.framePacket.rowCount,
    rows: block.framePacket.rows,
    shouldApplyMinHeight: block.framePacket.shouldApplyMinHeight,
    shouldRoundBottom: block.framePacket.shouldRoundBottom,
    title: block.framePacket.title,
    topLevelParamIds: block.framePacket.topLevelParamIds,
  };
}

function buildUnpinnedParamAreaRendererPacket(
  block: LiveDictAreaUnpinnedParamAreaBlockView,
): LiveDictAreaUnpinnedParamAreaRendererPacket {
  return {
    blockId: block.blockId,
    grow: block.framePacket.grow,
    kind: "unpinned-param-area",
    listKey: block.framePacket.listKey,
    maxNestedDepth: block.framePacket.maxNestedDepth,
    minHeight: block.framePacket.minHeight,
    mount: block.mount,
    requiredParamIdsToPaths: block.framePacket.requiredParamIdsToPaths,
    rowCount: block.framePacket.rowCount,
    rows: block.framePacket.rows,
    shouldApplyMinHeight: block.framePacket.shouldApplyMinHeight,
    shouldRoundBottom: block.framePacket.shouldRoundBottom,
    title: block.framePacket.title,
    topLevelParamIds: block.framePacket.topLevelParamIds,
  };
}
