import type { GpuNodeLayout } from "../htmlSurfaces/frame";

export function resolveGpuFlowRenderableNodes({
  sceneNodes,
  storeNodes,
}: {
  readonly sceneNodes: readonly GpuNodeLayout[] | undefined;
  readonly storeNodes: readonly GpuNodeLayout[] | undefined;
}): readonly GpuNodeLayout[] | undefined {
  if (!sceneNodes) {
    return storeNodes;
  }
  if (!storeNodes) {
    return sceneNodes;
  }
  if (storeNodes.length !== sceneNodes.length) {
    return sceneNodes;
  }

  const sceneNodeIds = new Set(sceneNodes.map((node) => node.nodeId));
  for (const node of storeNodes) {
    if (!sceneNodeIds.has(node.nodeId)) {
      return sceneNodes;
    }
  }
  return storeNodes;
}
