import type { Node } from "forks/xyflow/core/types";
import type { Position } from "utils/generatedTypes";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";

type SectionPositionOverride = {
  sectionId: string;
  position: Position;
} | null;

export function syncSettingsGraphSubstrateCanaryNodes(
  nodeInternals: Map<string, Node>,
  sections: Array<GraphSubstrateCanarySection>,
  observedElementSizes: Record<string, { width: number; height: number }>,
  sectionPositionOverride: SectionPositionOverride,
): Map<string, Node> {
  let nextNodeInternals: Map<string, Node> | null = null;

  for (const section of sections) {
    const currentNode = nodeInternals.get(section.sectionId);
    const observedSize = observedElementSizes[section.sectionId];
    const width = observedSize?.width ?? currentNode?.width ?? section.width;
    const height =
      observedSize?.height ?? currentNode?.height ?? section.height;
    const position = getSyncedSectionPosition(section, sectionPositionOverride);
    if (
      currentNode &&
      currentNode.position.x === position.x &&
      currentNode.position.y === position.y &&
      currentNode.width === width &&
      currentNode.height === height &&
      currentNode.zIndex === section.zIndex
    ) {
      continue;
    }

    if (!nextNodeInternals) {
      nextNodeInternals = new Map(nodeInternals);
    }

    nextNodeInternals.set(section.sectionId, {
      id: section.sectionId,
      position,
      width,
      height,
      zIndex: section.zIndex,
      tempZIndex: currentNode?.tempZIndex ?? section.zIndex,
      type: currentNode?.type,
      style: currentNode?.style,
    });
  }

  return nextNodeInternals ?? nodeInternals;
}

function getSyncedSectionPosition(
  section: GraphSubstrateCanarySection,
  sectionPositionOverride: SectionPositionOverride,
) {
  if (sectionPositionOverride?.sectionId === section.sectionId) {
    return sectionPositionOverride.position;
  }
  return section.position;
}
