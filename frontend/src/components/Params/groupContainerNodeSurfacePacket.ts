import type { SectionTypeEnum } from "utils/generatedTypes";
import type { LiveDictAreaEdgeStripVisualPacket } from "./groupContainerEdgeStripVisualPacket";
import type { LiveDictAreaNodeScenePacket } from "./groupContainerNodeScenePacket";
import type { LiveDictAreaPinnedParamAreaVisualPacket } from "./groupContainerPinnedParamAreaVisualPacket";
import type { LiveDictAreaUnpinnedParamAreaVisualPacket } from "./groupContainerUnpinnedParamAreaVisualPacket";

export type LiveDictAreaEdgeStripSurfacePacket = {
  bgColor: string;
  kind: "edge-strip";
  positionAndSizeLocked: boolean;
  styleColor: string | null;
  visualPacket: LiveDictAreaEdgeStripVisualPacket;
};

export type LiveDictAreaPinnedParamAreaSurfacePacket = {
  kind: "pinned-param-area";
  positionAndSizeLocked: boolean;
  sectionTypeName: SectionTypeEnum;
  styleColor: string | null;
  visualPacket: LiveDictAreaPinnedParamAreaVisualPacket;
};

export type LiveDictAreaUnpinnedParamAreaSurfacePacket = {
  kind: "unpinned-param-area";
  styleColor: string | null;
  visualPacket: LiveDictAreaUnpinnedParamAreaVisualPacket;
};

export type LiveDictAreaNodeSurfaceBlock =
  | LiveDictAreaEdgeStripSurfacePacket
  | LiveDictAreaPinnedParamAreaSurfacePacket
  | LiveDictAreaUnpinnedParamAreaSurfacePacket;

export type LiveDictAreaNodeSurfacePacket = {
  blocks: LiveDictAreaNodeSurfaceBlock[];
  edgeStrip: LiveDictAreaNodeScenePacket["edgeStrip"];
  edgeStripBlock: LiveDictAreaEdgeStripSurfacePacket | null;
  maxNestedDepth: LiveDictAreaNodeScenePacket["visualPacket"]["maxNestedDepth"];
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaSurfacePacket | null;
  scenePacket: LiveDictAreaNodeScenePacket["scenePacket"];
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaSurfacePacket | null;
};

export function buildLiveDictAreaNodeSurfacePacket({
  bgColor,
  nodeScenePacket,
  positionAndSizeLocked,
  sectionTypeName,
  styleColor,
}: {
  bgColor: string;
  nodeScenePacket: LiveDictAreaNodeScenePacket;
  positionAndSizeLocked: boolean;
  sectionTypeName: SectionTypeEnum;
  styleColor: string | null;
}): LiveDictAreaNodeSurfacePacket {
  const edgeStripBlock = nodeScenePacket.visualPacket.edgeStripBlock
    ? {
        bgColor,
        kind: "edge-strip" as const,
        positionAndSizeLocked,
        styleColor,
        visualPacket: nodeScenePacket.visualPacket.edgeStripBlock,
      }
    : null;
  const pinnedParamAreaBlock = nodeScenePacket.visualPacket.pinnedParamAreaBlock
    ? {
        kind: "pinned-param-area" as const,
        positionAndSizeLocked,
        sectionTypeName,
        styleColor,
        visualPacket: nodeScenePacket.visualPacket.pinnedParamAreaBlock,
      }
    : null;
  const unpinnedParamAreaBlock =
    nodeScenePacket.visualPacket.unpinnedParamAreaBlock
      ? {
          kind: "unpinned-param-area" as const,
          styleColor,
          visualPacket: nodeScenePacket.visualPacket.unpinnedParamAreaBlock,
        }
      : null;

  return {
    blocks: nodeScenePacket.visualPacket.blocks.flatMap((block) => {
      const surfaceBlock = buildNodeSurfaceBlock({
        block,
        edgeStripBlock,
        pinnedParamAreaBlock,
        unpinnedParamAreaBlock,
      });

      return surfaceBlock ? [surfaceBlock] : [];
    }),
    edgeStrip: nodeScenePacket.edgeStrip,
    edgeStripBlock,
    maxNestedDepth: nodeScenePacket.visualPacket.maxNestedDepth,
    pinnedParamAreaBlock,
    scenePacket: nodeScenePacket.scenePacket,
    unpinnedParamAreaBlock,
  };
}

function buildNodeSurfaceBlock({
  block,
  edgeStripBlock,
  pinnedParamAreaBlock,
  unpinnedParamAreaBlock,
}: {
  block: LiveDictAreaNodeScenePacket["visualPacket"]["blocks"][number];
  edgeStripBlock: LiveDictAreaEdgeStripSurfacePacket | null;
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaSurfacePacket | null;
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaSurfacePacket | null;
}): LiveDictAreaNodeSurfaceBlock | null {
  if (block.kind === "edge-strip") {
    return edgeStripBlock;
  }

  if (block.kind === "pinned-param-area") {
    return pinnedParamAreaBlock;
  }

  return unpinnedParamAreaBlock;
}
