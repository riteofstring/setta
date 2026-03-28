import type { SectionTypeEnum } from "utils/generatedTypes";
import {
  buildLiveDictAreaEdgeStripCanaryPacket,
  type LiveDictAreaEdgeStripCanaryPacket,
} from "./groupContainerEdgeStripCanaryPacket";
import {
  buildLiveDictAreaPinnedParamAreaCanaryPacket,
  type LiveDictAreaPinnedParamAreaCanaryPacket,
} from "./groupContainerPinnedParamAreaCanaryPacket";
import {
  buildLiveDictAreaUnpinnedParamAreaCanaryPacket,
  type LiveDictAreaUnpinnedParamAreaCanaryPacket,
} from "./groupContainerUnpinnedParamAreaCanaryPacket";
import {
  buildLiveDictAreaNodeDomPacket,
  type LiveDictAreaNodeDomPacket,
} from "./groupContainerNodeDomPacket";
import type { LiveDictAreaNodeScenePacket } from "./groupContainerNodeScenePacket";
import { buildLiveDictAreaNodeSurfacePacket } from "./groupContainerNodeSurfacePacket";
import type { LiveDictAreaSceneParamAreaPacket } from "./groupContainerScenePackets";

export type {
  LiveDictAreaEdgeStripDomPacket,
  LiveDictAreaPinnedParamAreaDomPacket,
} from "./groupContainerNodeDomPacket";
export type { LiveDictAreaEdgeStripCanaryPacket } from "./groupContainerEdgeStripCanaryPacket";
export type { LiveDictAreaPinnedParamAreaCanaryPacket } from "./groupContainerPinnedParamAreaCanaryPacket";
export type { LiveDictAreaUnpinnedParamAreaCanaryPacket } from "./groupContainerUnpinnedParamAreaCanaryPacket";

export type LiveDictAreaNodeCanaryPacket = {
  blocks: (
    | LiveDictAreaEdgeStripCanaryPacket
    | LiveDictAreaPinnedParamAreaCanaryPacket
    | LiveDictAreaUnpinnedParamAreaCanaryPacket
  )[];
  edgeStrip: LiveDictAreaNodeDomPacket["edgeStrip"];
  edgeStripBlock: LiveDictAreaEdgeStripCanaryPacket | null;
  maxNestedDepth: LiveDictAreaNodeDomPacket["maxNestedDepth"];
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaCanaryPacket | null;
  scenePacket: LiveDictAreaNodeDomPacket["scenePacket"];
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaCanaryPacket | null;
};

export function buildLiveDictAreaNodeCanaryPacket({
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
}): LiveDictAreaNodeCanaryPacket {
  const nodeSurfacePacket = buildLiveDictAreaNodeSurfacePacket({
    bgColor,
    nodeScenePacket,
    positionAndSizeLocked,
    sectionTypeName,
    styleColor,
  });
  const nodeDomPacket = buildLiveDictAreaNodeDomPacket({
    nodeSurfacePacket,
  });
  const edgeStripBlock = nodeDomPacket.domEdgeStripBlock
    ? buildLiveDictAreaEdgeStripCanaryPacket({
        domPacket: nodeDomPacket.domEdgeStripBlock,
        scenePacket: nodeDomPacket.edgeStrip,
      })
    : null;
  const pinnedParamAreaBlock = nodeDomPacket.domPinnedParamAreaBlock
    ? buildLiveDictAreaPinnedParamAreaCanaryPacket({
        domPacket: nodeDomPacket.domPinnedParamAreaBlock,
        scenePacket: getRequiredSceneParamArea({
          nodeDomPacket,
          paramAreaId: "pinned",
        }),
      })
    : null;
  const unpinnedParamAreaBlock = nodeDomPacket.domUnpinnedParamAreaBlock
    ? buildLiveDictAreaUnpinnedParamAreaCanaryPacket({
        domPacket: nodeDomPacket.domUnpinnedParamAreaBlock,
        scenePacket: getRequiredSceneParamArea({
          nodeDomPacket,
          paramAreaId: "unpinned",
        }),
      })
    : null;

  return {
    blocks: nodeDomPacket.domBlocks.flatMap((block) => {
      const canaryBlock = buildNodeCanaryBlock({
        block,
        edgeStripBlock,
        pinnedParamAreaBlock,
        unpinnedParamAreaBlock,
      });

      return canaryBlock ? [canaryBlock] : [];
    }),
    edgeStrip: nodeDomPacket.edgeStrip,
    edgeStripBlock,
    maxNestedDepth: nodeDomPacket.maxNestedDepth,
    pinnedParamAreaBlock,
    scenePacket: nodeDomPacket.scenePacket,
    unpinnedParamAreaBlock,
  };
}

function getRequiredSceneParamArea({
  nodeDomPacket,
  paramAreaId,
}: {
  nodeDomPacket: LiveDictAreaNodeDomPacket;
  paramAreaId: LiveDictAreaSceneParamAreaPacket["id"];
}): LiveDictAreaSceneParamAreaPacket {
  const sceneParamArea = nodeDomPacket.scenePacket.paramAreas.find(
    (paramArea) => paramArea.id === paramAreaId,
  );

  if (!sceneParamArea) {
    throw new Error(
      `Expected ${paramAreaId} scene packet for dict-area DOM canary block`,
    );
  }

  return sceneParamArea;
}

function buildNodeCanaryBlock({
  block,
  edgeStripBlock,
  pinnedParamAreaBlock,
  unpinnedParamAreaBlock,
}: {
  block: LiveDictAreaNodeDomPacket["domBlocks"][number];
  edgeStripBlock: LiveDictAreaEdgeStripCanaryPacket | null;
  pinnedParamAreaBlock: LiveDictAreaPinnedParamAreaCanaryPacket | null;
  unpinnedParamAreaBlock: LiveDictAreaUnpinnedParamAreaCanaryPacket | null;
}): LiveDictAreaNodeCanaryPacket["blocks"][number] | null {
  if (block.kind === "edge-strip") {
    return edgeStripBlock;
  }

  if (block.kind === "pinned-param-area") {
    return pinnedParamAreaBlock;
  }

  return unpinnedParamAreaBlock;
}
