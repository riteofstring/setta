import {
  capturePointer,
  isSelectionToggleEvent,
  nodeOpenRequested,
  screenPointFromPointer,
  stopNativeInteraction,
} from "./pixi-renderer-helpers";

export function createWorkflowGraphPointerDownHandler({
  beginActivityChipClick,
  canvas,
  clearLastNodeClick,
  clearSelection,
  frozen,
  graphHandlers,
  hitTestActivityChipAtScreen,
  hitTestNodeAtScreen,
  hitTestPortAtScreen,
  repeatedNodeOpenRequested,
  selectOnlyNode,
  startCameraPanning,
  startEdgeDrawing,
  startMarqueeSelection,
  startNodeDragging,
  toggleNodeSelection,
}) {
  return (event) => {
    if (frozen()) {
      stopNativeInteraction(event);
      return;
    }
    if (event.button !== 0) {
      return;
    }
    const screen = screenPointFromPointer(canvas, event);
    if (
      handleActivityChipPointerDown({
        beginActivityChipClick,
        clearLastNodeClick,
        event,
        graphHandlers,
        hitTestActivityChipAtScreen,
        screen,
      })
    ) {
      return;
    }
    if (
      handleSourcePortPointerDown({
        clearLastNodeClick,
        event,
        hitTestPortAtScreen,
        screen,
        startEdgeDrawing,
      })
    ) {
      return;
    }
    const node = hitTestNodeAtScreen(screen);
    if (node) {
      handleNodePointerDown({
        clearLastNodeClick,
        event,
        graphHandlers,
        node,
        repeatedNodeOpenRequested,
        screen,
        selectOnlyNode,
        startNodeDragging,
        toggleNodeSelection,
      });
      return;
    }
    handleBackgroundPointerDown({
      clearLastNodeClick,
      clearSelection,
      event,
      screen,
      startCameraPanning,
      startMarqueeSelection,
    });
  };
}

function handleActivityChipPointerDown({
  beginActivityChipClick,
  clearLastNodeClick,
  event,
  graphHandlers,
  hitTestActivityChipAtScreen,
  screen,
}) {
  if (!graphHandlers.onActivityChipOpen || !hitTestActivityChipAtScreen) {
    return false;
  }
  const chip = hitTestActivityChipAtScreen(screen);
  if (!chip) {
    return false;
  }
  clearLastNodeClick();
  beginActivityChipClick(chip, screen);
  capturePointer(event);
  stopNativeInteraction(event);
  return true;
}

function handleSourcePortPointerDown({
  clearLastNodeClick,
  event,
  hitTestPortAtScreen,
  screen,
  startEdgeDrawing,
}) {
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

function handleNodePointerDown({
  clearLastNodeClick,
  event,
  graphHandlers,
  node,
  repeatedNodeOpenRequested,
  screen,
  selectOnlyNode,
  startNodeDragging,
  toggleNodeSelection,
}) {
  if (
    nodeOpenRequested(event, graphHandlers.onNodeOpen) ||
    repeatedNodeOpenRequested(node.id, screen)
  ) {
    clearLastNodeClick();
    selectOnlyNode(node.id);
    graphHandlers.onNodeOpen(node.id);
    capturePointer(event);
    stopNativeInteraction(event);
    return;
  }
  if (isSelectionToggleEvent(event)) {
    clearLastNodeClick();
    toggleNodeSelection(node.id);
    capturePointer(event);
    stopNativeInteraction(event);
    return;
  }
  startNodeDragging(node.id, screen);
  capturePointer(event);
  stopNativeInteraction(event);
}

function handleBackgroundPointerDown({
  clearLastNodeClick,
  clearSelection,
  event,
  screen,
  startCameraPanning,
  startMarqueeSelection,
}) {
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
}
