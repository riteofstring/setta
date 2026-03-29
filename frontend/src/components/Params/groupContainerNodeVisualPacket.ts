import {
  buildLiveDictAreaEdgeStripVisualPacket,
  type LiveDictAreaEdgeStripPortInput,
  type LiveDictAreaEdgeStripVisualPacket,
} from "./groupContainerEdgeStripVisualPacket";
import {
  buildLiveDictAreaPinnedParamAreaVisualPacket,
  type LiveDictAreaPinnedParamAreaVisualPacket,
} from "./groupContainerPinnedParamAreaVisualPacket";
import {
  buildLiveDictAreaUnpinnedParamAreaVisualPacket,
  type LiveDictAreaUnpinnedParamAreaVisualPacket,
} from "./groupContainerUnpinnedParamAreaVisualPacket";
import type {
  LiveDictAreaSceneRendererPacket,
  LiveDictAreaSceneRendererPackets,
} from "./groupContainerSceneRendererPackets";

export type LiveDictAreaSceneVisualPacket =
  | LiveDictAreaEdgeStripVisualPacket
  | LiveDictAreaPinnedParamAreaVisualPacket
  | LiveDictAreaUnpinnedParamAreaVisualPacket;

export type LiveDictAreaNodeVisualPacket = {
  blocks: LiveDictAreaSceneVisualPacket[];
  edgeStripBlock: LiveDictAreaEdgeStripVisualPacket | null;
  maxNestedDepth: {
    pinned: number;
    unpinned: number;
  };
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaVisualPacket | null;
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaVisualPacket | null;
};

export function buildLiveDictAreaNodeVisualPacket({
  edgeStrip,
  rendererPackets,
}: {
  edgeStrip: {
    canConnect: boolean;
    inputPorts: LiveDictAreaEdgeStripPortInput[];
    isSelectingParams: boolean;
    outputPorts: LiveDictAreaEdgeStripPortInput[];
    selectedParamIds: string[];
  };
  rendererPackets: LiveDictAreaSceneRendererPackets;
}): LiveDictAreaNodeVisualPacket {
  const edgeStripBlock = rendererPackets.edgeStripBlock
    ? buildLiveDictAreaEdgeStripVisualPacket({
        canConnect: edgeStrip.canConnect,
        inputPorts: edgeStrip.inputPorts,
        isSelectingParams: edgeStrip.isSelectingParams,
        outputPorts: edgeStrip.outputPorts,
        rendererPacket: rendererPackets.edgeStripBlock,
        selectedParamIds: edgeStrip.selectedParamIds,
        shouldRoundBottom:
          rendererPackets.pinnedParamAreaBlock === null &&
          rendererPackets.unpinnedParamAreaBlock === null,
      })
    : null;
  const pinnedParamAreaBlock = rendererPackets.pinnedParamAreaBlock
    ? buildLiveDictAreaPinnedParamAreaVisualPacket({
        rendererPacket: rendererPackets.pinnedParamAreaBlock,
      })
    : null;
  const unpinnedParamAreaBlock = rendererPackets.unpinnedParamAreaBlock
    ? buildLiveDictAreaUnpinnedParamAreaVisualPacket({
        rendererPacket: rendererPackets.unpinnedParamAreaBlock,
      })
    : null;

  return {
    blocks: rendererPackets.blocks.flatMap((block) => {
      const visualPacket = buildSceneVisualPacket({
        block,
        edgeStripBlock,
        pinnedParamAreaBlock,
        unpinnedParamAreaBlock,
      });

      return visualPacket ? [visualPacket] : [];
    }),
    edgeStripBlock,
    maxNestedDepth: rendererPackets.maxNestedDepth,
    pinnedParamAreaBlock,
    unpinnedParamAreaBlock,
  };
}

function buildSceneVisualPacket({
  block,
  edgeStripBlock,
  pinnedParamAreaBlock,
  unpinnedParamAreaBlock,
}: {
  block: LiveDictAreaSceneRendererPacket;
  edgeStripBlock: LiveDictAreaEdgeStripVisualPacket | null;
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaVisualPacket | null;
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaVisualPacket | null;
}): LiveDictAreaSceneVisualPacket | null {
  if (block.kind === "edge-strip") {
    return edgeStripBlock;
  }

  if (block.kind === "pinned-param-area") {
    return pinnedParamAreaBlock;
  }

  return unpinnedParamAreaBlock;
}
