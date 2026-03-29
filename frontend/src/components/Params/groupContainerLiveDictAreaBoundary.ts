import type { SectionTypeEnum } from "utils/generatedTypes";
import {
  buildLiveDictAreaNodeCanaryBoundary,
  type LiveDictAreaNodeCanaryBoundary,
} from "./groupContainerNodeCanaryBoundary";
import { buildLiveDictAreaNodeScenePacket } from "./groupContainerNodeScenePacket";

export type LiveDictAreaBoundaryInput = {
  bgColor: string;
  positionAndSizeLocked: boolean;
  sectionTypeName: SectionTypeEnum;
  styleColor: string | null;
} & Parameters<typeof buildLiveDictAreaNodeScenePacket>[0];

export type LiveDictAreaBoundary = LiveDictAreaNodeCanaryBoundary;

export function buildLiveDictAreaBoundary({
  bgColor,
  positionAndSizeLocked,
  sectionTypeName,
  styleColor,
  ...nodeScenePacketInput
}: LiveDictAreaBoundaryInput): LiveDictAreaBoundary {
  const nodeScenePacket =
    buildLiveDictAreaNodeScenePacket(nodeScenePacketInput);

  return buildLiveDictAreaNodeCanaryBoundary({
    bgColor,
    nodeScenePacket,
    positionAndSizeLocked,
    sectionTypeName,
    styleColor,
  });
}
