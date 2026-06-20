import {
  capturePointer,
  edgeDeleteRequested,
  isSelectionToggleEvent,
  nodeDeleteRequested,
  nodeOpenRequested,
  screenPointFromPointer,
  stopNativeInteraction,
} from "./pixi-renderer-helpers";

export function createWorkflowGraphPointerDownHandler({
  canvas,
  clearLastNodeClick,
  clearSelection,
  edgeInteractions,
  handlers,
  hitTestNodeAtScreen,
  hitTestPortAtScreen,
  repeatedNodeOpenRequested,
  selectOnlyNode,
  setSelectedNodeIds,
  startCameraPanning,
  startEdgeDrawing,
  startMarqueeSelection,
  startNodeDragging,
  toggleNodeSelection,
}) {
  return (event) => {
    if (event.button !== 0) {
      return;
    }
    const screen = screenPointFromPointer(canvas, event);
    if (
      startEdgeDrawingAtScreen(screen, event) ||
      startNodeInteractionAtScreen(screen, event) ||
      selectEdgeAtScreen(screen, event)
    ) {
      return;
    }
    if (event.shiftKey) {
      clearLastNodeClick();
      startMarqueeSelection(screen);
      capturePointer(event);
      stopNativeInteraction(event);
      return;
    }
    if (isSelectionToggleEvent(event)) {
      stopNativeInteraction(event);
      return;
    }
    clearSelection();
    clearLastNodeClick();
    startCameraPanning(screen);
    capturePointer(event);
    stopNativeInteraction(event);
  };

  function startEdgeDrawingAtScreen(screen, event) {
    const sourcePort = hitTestPortAtScreen(screen, {
      excludeNodeId: null,
      role: "source",
    });
    if (!sourcePort) {
      return false;
    }
    clearLastNodeClick();
    startEdgeDrawing(sourcePort.nodeId, sourcePort.portId);
    capturePointer(event);
    stopNativeInteraction(event);
    return true;
  }

  function startNodeInteractionAtScreen(screen, event) {
    const node = hitTestNodeAtScreen(screen);
    if (!node) {
      return false;
    }
    if (
      nodeOpenRequested(event, handlers.onNodeOpen) ||
      repeatedNodeOpenRequested(node.id, screen)
    ) {
      clearLastNodeClick();
      selectOnlyNode(node.id);
      handlers.onNodeOpen(node.id);
      capturePointer(event);
      stopNativeInteraction(event);
      return true;
    }
    if (isSelectionToggleEvent(event)) {
      clearLastNodeClick();
      toggleNodeSelection(node.id);
      capturePointer(event);
      stopNativeInteraction(event);
      return true;
    }
    startNodeDragging(node.id, screen);
    capturePointer(event);
    stopNativeInteraction(event);
    return true;
  }

  function selectEdgeAtScreen(screen, event) {
    const edge = edgeInteractions.hitTestAtScreen(screen);
    if (!edge) {
      return false;
    }
    clearLastNodeClick();
    const clearNodeSelection = () => setSelectedNodeIds([]);
    if (isSelectionToggleEvent(event)) {
      edgeInteractions.toggle(edge.id, clearNodeSelection);
    } else {
      edgeInteractions.selectOnly(edge.id, clearNodeSelection);
    }
    stopNativeInteraction(event);
    return true;
  }
}

export function createWorkflowGraphKeyDownHandler({
  cancelMarqueeSelection,
  clearSelection,
  edgeInteractions,
  finishEdgeDrawing,
  handlers,
  isDrawingEdge,
  isDrawingMarquee,
  isDraggingNode,
  isPanningCamera,
  selectedNodeIds,
}) {
  return (event) => {
    if (handleDeleteKeyDown(event) || handleEscapeKeyDown(event)) {
      return;
    }
  };

  function handleDeleteKeyDown(event) {
    if (edgeDeleteRequested(event, handlers.onEdgeDelete, edgeInteractions.selectedEdgeIds)) {
      handlers.onEdgeDelete([...edgeInteractions.selectedEdgeIds]);
      stopNativeInteraction(event);
      return true;
    }
    if (nodeDeleteRequested(event, handlers.onNodeDelete, selectedNodeIds)) {
      handlers.onNodeDelete([...selectedNodeIds]);
      stopNativeInteraction(event);
      return true;
    }
    return false;
  }

  function handleEscapeKeyDown(event) {
    if (event.key !== "Escape") {
      return false;
    }
    if (isDrawingEdge()) {
      finishEdgeDrawing();
      stopNativeInteraction(event);
      return true;
    }
    if (isDrawingMarquee()) {
      cancelMarqueeSelection();
      stopNativeInteraction(event);
      return true;
    }
    if (isDraggingNode() || isPanningCamera()) {
      return true;
    }
    if (selectedNodeIds.size > 0 || edgeInteractions.selectedEdgeIds.size > 0) {
      clearSelection();
      stopNativeInteraction(event);
    }
    return true;
  }
}
