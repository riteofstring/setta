import { screenPointFromPointer, stopNativeInteraction } from "./pixi-renderer-helpers";

export function noopCameraStateChange() {}

export function noopReactRenderCount() {
  return 0;
}

export function rendererHandlers(handlers = {}) {
  return {
    onCameraStateChange: handlers.onCameraStateChange ?? noopCameraStateChange,
    onCanvasContextMenu: handlers.onCanvasContextMenu ?? null,
    onEdgeCreate: handlers.onEdgeCreate,
    onNodeDelete: handlers.onNodeDelete,
    onNodeOpen: handlers.onNodeOpen ?? null,
    onNodePositionsChange: handlers.onNodePositionsChange ?? null,
    onNodeSelectionChange: handlers.onNodeSelectionChange ?? null,
    reactRenderCount: handlers.reactRenderCount ?? noopReactRenderCount,
  };
}

export function createDynamicCanvasContextMenuHandler({ canvas, handlers, viewport }) {
  return (event) => {
    if (!handlers.onCanvasContextMenu) {
      return;
    }
    stopNativeInteraction(event);
    const screen = screenPointFromPointer(canvas, event);
    const world = viewport.toWorld(screen);
    handlers.onCanvasContextMenu({
      clientX: event.clientX,
      clientY: event.clientY,
      worldX: Math.round(world.x),
      worldY: Math.round(world.y),
    });
  };
}
