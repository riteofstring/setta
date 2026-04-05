import type { Node } from "forks/xyflow/core/types";
import type { SettingsGraphSubstrateCanarySceneSnapshot } from "./settingsGraphSubstrateCanarySceneSnapshot";

export function syncSettingsGraphSubstrateCanaryNodes(
  nodeInternals: Map<string, Node>,
  sceneSnapshot: SettingsGraphSubstrateCanarySceneSnapshot,
): Map<string, Node> {
  let nextNodeInternals: Map<string, Node> | null = null;

  for (const section of sceneSnapshot.sections) {
    const currentNode = nodeInternals.get(section.sectionId);
    const width = section.resolvedSize?.width ?? section.width;
    const height = section.resolvedSize?.height ?? section.height;
    const position = section.renderedPosition;
    if (
      currentNode &&
      currentNode.position.x === position.x &&
      currentNode.position.y === position.y &&
      currentNode.width === width &&
      currentNode.height === height &&
      currentNode.zIndex === section.zIndex &&
      currentNode.tempZIndex === section.tempZIndex
    ) {
      continue;
    }

    if (!nextNodeInternals) {
      nextNodeInternals = new Map(nodeInternals);
    }

    const nextNode: Node = {
      id: section.sectionId,
      position,
      width,
      height,
      zIndex: section.zIndex,
      tempZIndex: section.tempZIndex,
      ...(currentNode?.type ? { type: currentNode.type } : {}),
      ...(currentNode?.style ? { style: currentNode.style } : {}),
    };

    nextNodeInternals.set(section.sectionId, nextNode);
  }

  return nextNodeInternals ?? nodeInternals;
}
