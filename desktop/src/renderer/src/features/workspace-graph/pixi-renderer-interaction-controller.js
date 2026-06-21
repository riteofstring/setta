export function createWorkflowGraphInteractionController({
  getDrawingEdge,
  getDrawingMarquee,
  getPointerCameraPan,
  nodeDrag,
  trajectoryHitMode = "passive",
}) {
  return {
    activeKind,
    debugSnapshot,
    isDirectManipulationActive,
  };

  function activeKind() {
    if (nodeDrag.active()) {
      return "node_drag";
    }
    if (getDrawingEdge()) {
      return "edge_draw";
    }
    if (getDrawingMarquee()) {
      return "marquee";
    }
    if (getPointerCameraPan()) {
      return "pointer_pan";
    }
    return "";
  }

  function isDirectManipulationActive() {
    return Boolean(nodeDrag.active() || getDrawingEdge() || getDrawingMarquee());
  }

  function debugSnapshot() {
    return {
      activeInteractionKind: activeKind(),
      directManipulationActive: isDirectManipulationActive(),
      pointerCameraPanActive: Boolean(getPointerCameraPan()),
      trajectoryHitMode,
    };
  }
}
