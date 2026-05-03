import type { Node } from "gpuFlow/flowTypes";
import type { GpuFlowLayoutNode } from "gpuFlow/layoutStore";

export function getProjectGpuLayoutNodesFromNodeInternals(state: {
  readonly x: ReadonlyMap<string, Node>;
}): readonly GpuFlowLayoutNode[] {
  return Array.from(state.x.values(), getProjectGpuLayoutNode);
}

export function getProjectGpuLayoutNode(node: Node): GpuFlowLayoutNode {
  return {
    height: node.height,
    nodeId: node.id,
    tempZIndex: node.tempZIndex,
    width: node.width,
    x: node.position.x,
    y: node.position.y,
    zIndex: node.zIndex,
  };
}
