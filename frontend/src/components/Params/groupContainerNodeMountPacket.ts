import {
  buildLiveDictAreaNodeCanvasPacket,
  type LiveDictAreaEdgeStripCanvasPacket,
  type LiveDictAreaPinnedParamAreaCanvasPacket,
  type LiveDictAreaUnpinnedParamAreaCanvasPacket,
} from "./groupContainerNodeCanvasPacket";
import { buildLiveDictAreaNodeDrawPacket } from "./groupContainerNodeDrawPacket";
import type { LiveDictAreaNodeSurfacePacket } from "./groupContainerNodeSurfacePacket";

export type LiveDictAreaEdgeStripMountPacket =
  LiveDictAreaEdgeStripCanvasPacket;
export type LiveDictAreaPinnedParamAreaMountPacket =
  LiveDictAreaPinnedParamAreaCanvasPacket;
export type LiveDictAreaUnpinnedParamAreaMountPacket =
  LiveDictAreaUnpinnedParamAreaCanvasPacket;

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

  return {
    domBlocks: nodeCanvasPacket.domBlocks,
    domEdgeStripBlock: nodeCanvasPacket.domEdgeStripBlock,
    domPinnedParamAreaBlock: nodeCanvasPacket.domPinnedParamAreaBlock,
    domUnpinnedParamAreaBlock: nodeCanvasPacket.domUnpinnedParamAreaBlock,
    edgeStrip: nodeCanvasPacket.edgeStrip,
    maxNestedDepth: nodeCanvasPacket.maxNestedDepth,
    scenePacket: nodeCanvasPacket.scenePacket,
  };
}
