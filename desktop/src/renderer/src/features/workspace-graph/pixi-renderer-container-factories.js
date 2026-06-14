import { interactivePortsForNode } from "./pixi-renderer-helpers";
import { createWorkflowGraphNodeContainer } from "./pixi-renderer-node-container";
import { createWorkflowGraphPortContainer } from "./pixi-renderer-port-container";

export function createRendererContainerFactories({
  drawingEdgeActive,
  nodeActivityMarkers,
  nodeBodies,
  nodeDiagnosticMarkers,
  nodeGeometry,
  nodeOutlines,
  nodeShadows,
  onNodePointerOut,
  onNodePointerOver,
  portHitRadius,
  portVisuals,
  portVisualStates,
  setPortVisualState,
}) {
  function portContainer(node, port) {
    return createWorkflowGraphPortContainer({
      drawingEdgeActive,
      node,
      port,
      portHitRadiusScreen: portHitRadius,
      portVisuals,
      portVisualStates,
      setPortVisualState,
    });
  }

  return {
    nodeContainer: (node) =>
      createWorkflowGraphNodeContainer({
        node,
        nodeActivityMarkers,
        nodeBodies,
        nodeDiagnosticMarkers,
        nodeGeometry,
        nodeOutlines,
        nodeShadows,
        onPointerOut: onNodePointerOut,
        onPointerOver: () => onNodePointerOver(node.id),
        portContainers: interactivePortsForNode(node).map((port) => portContainer(node, port)),
      }),
  };
}
