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
  const sceneNodeById = new Map(sceneNodes.map((node) => [node.nodeId, node]));
  return storeNodes.map((storeNode) => {
    const sceneNode = sceneNodeById.get(storeNode.nodeId);
    if (!sceneNode) {
      return storeNode;
    }
    return mergeGpuFlowSceneNodeTextureMetadata({
      sceneNode,
      storeNode,
    });
  });
}

function mergeGpuFlowSceneNodeTextureMetadata({
  sceneNode,
  storeNode,
}: {
  readonly sceneNode: GpuNodeLayout;
  readonly storeNode: GpuNodeLayout;
}): GpuNodeLayout {
  const baseNode = { ...storeNode };
  delete baseNode.textureContentKey;
  delete baseNode.textureCssHeight;
  delete baseNode.textureCssWidth;
  delete baseNode.textureSourceRect;
  delete baseNode.actorKind;
  return {
    ...baseNode,
    ...(sceneNode.actorKind === undefined
      ? {}
      : { actorKind: sceneNode.actorKind }),
    ...(sceneNode.textureContentKey === undefined
      ? {}
      : { textureContentKey: sceneNode.textureContentKey }),
    ...(sceneNode.textureCssHeight === undefined
      ? {}
      : { textureCssHeight: sceneNode.textureCssHeight }),
    ...(sceneNode.textureCssWidth === undefined
      ? {}
      : { textureCssWidth: sceneNode.textureCssWidth }),
    ...(sceneNode.textureSourceRect === undefined
      ? {}
      : { textureSourceRect: sceneNode.textureSourceRect }),
  };
}
