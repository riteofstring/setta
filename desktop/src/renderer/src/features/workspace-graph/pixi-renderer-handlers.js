import { screenPointFromPointer, stopNativeInteraction } from "./pixi-renderer-helpers";

export function noopCameraStateChange() {}

export function noopReactRenderCount() {
  return 0;
}

const defaultRendererHandlers = {
  onActivitySpriteClick: null,
  onCameraStateChange: noopCameraStateChange,
  onCanvasContextMenu: null,
  onEdgeCreate: undefined,
  onEdgeDelete: undefined,
  onEdgeSelectionChange: null,
  onNodeDelete: undefined,
  onNodeOpen: null,
  onNodePositionsChange: null,
  onNodeSelectionChange: null,
  reactRenderCount: noopReactRenderCount,
};

export function rendererHandlers(handlers = {}) {
  return {
    ...defaultRendererHandlers,
    ...definedRendererHandlers(handlers),
  };
}

function definedRendererHandlers(handlers) {
  return Object.fromEntries(Object.entries(handlers).filter(([, value]) => value !== undefined));
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
