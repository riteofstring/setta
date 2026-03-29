import {
  buildLiveDictAreaNodeCanvasPacket,
  type LiveDictAreaNodeCanvasPacket,
} from "./groupContainerNodeCanvasPacket";
import { buildLiveDictAreaNodeDrawPacket } from "./groupContainerNodeDrawPacket";
import {
  buildLiveDictAreaEdgeStripMountPacket,
  type LiveDictAreaEdgeStripMountPacket,
} from "./groupContainerEdgeStripMountPacket";
import {
  buildLiveDictAreaPinnedParamAreaMountPacket,
  type LiveDictAreaPinnedParamAreaMountPacket,
} from "./groupContainerPinnedParamAreaMountPacket";
import type { LiveDictAreaNodeSurfacePacket } from "./groupContainerNodeSurfacePacket";
import {
  buildLiveDictAreaUnpinnedParamAreaMountPacket,
  type LiveDictAreaUnpinnedParamAreaMountPacket,
} from "./groupContainerUnpinnedParamAreaMountPacket";

export type { LiveDictAreaEdgeStripMountPacket } from "./groupContainerEdgeStripMountPacket";
export type { LiveDictAreaPinnedParamAreaMountPacket } from "./groupContainerPinnedParamAreaMountPacket";
export type { LiveDictAreaUnpinnedParamAreaMountPacket } from "./groupContainerUnpinnedParamAreaMountPacket";

export type LiveDictAreaNodeMountPacket = {
  domBlocks: (
    | LiveDictAreaEdgeStripMountPacket
    | LiveDictAreaPinnedParamAreaMountPacket
    | LiveDictAreaUnpinnedParamAreaMountPacket
  )[];
  domEdgeStripBlock: LiveDictAreaEdgeStripMountPacket | null;
  domPinnedParamAreaBlock: LiveDictAreaPinnedParamAreaMountPacket | null;
  domUnpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaMountPacket | null;
  edgeStrip: LiveDictAreaNodeSurfacePacket["edgeStrip"];
  maxNestedDepth: LiveDictAreaNodeSurfacePacket["maxNestedDepth"];
  scenePacket: LiveDictAreaNodeSurfacePacket["scenePacket"];
};

export function buildLiveDictAreaNodeMountPacket({
  nodeSurfacePacket,
}: {
  nodeSurfacePacket: LiveDictAreaNodeSurfacePacket;
}): LiveDictAreaNodeMountPacket {
  const nodeDrawPacket = buildLiveDictAreaNodeDrawPacket({
    nodeSurfacePacket,
  });
  const nodeCanvasPacket = buildLiveDictAreaNodeCanvasPacket({
    nodeDrawPacket,
  });
  const edgeStripBlock = nodeCanvasPacket.domEdgeStripBlock
    ? buildLiveDictAreaEdgeStripMountPacket({
        canvasPacket: nodeCanvasPacket.domEdgeStripBlock,
      })
    : null;
  const pinnedParamAreaBlock = nodeCanvasPacket.domPinnedParamAreaBlock
    ? buildLiveDictAreaPinnedParamAreaMountPacket({
        canvasPacket: nodeCanvasPacket.domPinnedParamAreaBlock,
      })
    : null;
  const unpinnedParamAreaBlock = nodeCanvasPacket.domUnpinnedParamAreaBlock
    ? buildLiveDictAreaUnpinnedParamAreaMountPacket({
        canvasPacket: nodeCanvasPacket.domUnpinnedParamAreaBlock,
      })
    : null;

  return {
    domBlocks: nodeCanvasPacket.domBlocks.flatMap((block) => {
      const mountBlock = buildNodeMountBlock({
        block,
        edgeStripBlock,
        pinnedParamAreaBlock,
        unpinnedParamAreaBlock,
      });

      return mountBlock ? [mountBlock] : [];
    }),
    domEdgeStripBlock: edgeStripBlock,
    domPinnedParamAreaBlock: pinnedParamAreaBlock,
    domUnpinnedParamAreaBlock: unpinnedParamAreaBlock,
    edgeStrip: nodeCanvasPacket.edgeStrip,
    maxNestedDepth: nodeCanvasPacket.maxNestedDepth,
    scenePacket: nodeCanvasPacket.scenePacket,
  };
}

function buildNodeMountBlock({
  block,
  edgeStripBlock,
  pinnedParamAreaBlock,
  unpinnedParamAreaBlock,
}: {
  block: LiveDictAreaNodeCanvasPacket["domBlocks"][number];
  edgeStripBlock: LiveDictAreaEdgeStripMountPacket | null;
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaMountPacket | null;
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaMountPacket | null;
}): LiveDictAreaNodeMountPacket["domBlocks"][number] | null {
  if (block.kind === "edge-strip") {
    return edgeStripBlock;
  }

  if (block.kind === "pinned-param-area") {
    return pinnedParamAreaBlock;
  }

  return unpinnedParamAreaBlock;
}
