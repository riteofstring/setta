import type { Node } from "forks/xyflow/core/types";
import type { SettingsGraphSubstrateCanarySceneSnapshot } from "./settingsGraphSubstrateCanarySceneSnapshot";

export function syncSettingsGraphSubstrateCanaryNodes(
  nodeInternals: Map<string, Node>,
  sceneSnapshot: SettingsGraphSubstrateCanarySceneSnapshot,
): Map<string, Node> {
  let nextNodeInternals: Map<string, Node> | null = null;

  for (const section of sceneSnapshot.sections) {
    const currentNode = nodeInternals.get(section.sectionId);
    const width =
      section.resolvedSize?.width ?? currentNode?.width ?? section.width;
    const height =
      section.resolvedSize?.height ?? currentNode?.height ?? section.height;
    const position = section.renderedPosition;
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
