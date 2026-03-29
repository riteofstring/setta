import type { SectionTypeEnum } from "utils/generatedTypes";
import {
  buildLiveDictAreaNodeCanaryPacket,
  type LiveDictAreaNodeCanaryPacket,
} from "./groupContainerNodeCanaryPacket";
import {
  buildLiveDictAreaNodeCanaryRenderer,
  type LiveDictAreaNodeCanaryRenderer,
} from "./groupContainerNodeCanaryRenderer";
import type { LiveDictAreaNodeScenePacket } from "./groupContainerNodeScenePacket";

export type LiveDictAreaNodeCanaryBoundary = LiveDictAreaNodeCanaryRenderer & {
  nodeScenePacket: LiveDictAreaNodeScenePacket;
};

export function buildLiveDictAreaNodeCanaryBoundary({
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
}): LiveDictAreaNodeCanaryBoundary {
  const nodeCanaryPacket = buildLiveDictAreaNodeCanaryPacket({
    bgColor,
    nodeScenePacket,
    positionAndSizeLocked,
    sectionTypeName,
    styleColor,
  });
  const nodeCanaryRenderer = buildLiveDictAreaNodeCanaryRenderer({
    nodeCanaryPacket,
  });

  return {
    ...nodeCanaryRenderer,
    nodeScenePacket,
  };
}

export type { LiveDictAreaNodeCanaryPacket };
