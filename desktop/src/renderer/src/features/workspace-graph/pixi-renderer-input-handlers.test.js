import { describe, expect, test, vi } from "vitest";

import { createWorkflowGraphPointerDownHandler } from "./pixi-renderer-input-handlers";

describe("workflow graph pointer input", () => {
  test("does not start background camera pan when a retained activity sprite is hit", () => {
    const clearLastNodeClick = vi.fn();
    const startCameraPanning = vi.fn();
    const event = pointerDownEvent();
    const handler = createWorkflowGraphPointerDownHandler({
      canvas: canvas(),
      clearLastNodeClick,
      clearSelection: vi.fn(),
      edgeInteractions: { hitTestAtScreen: () => null },
      handlers: { onNodeOpen: null },
      hitTestActivitySpriteAtScreen: () => ({ spriteId: "sprite_review" }),
      hitTestNodeAtScreen: () => null,
      hitTestPortAtScreen: () => null,
      repeatedNodeOpenRequested: () => false,
      selectOnlyNode: vi.fn(),
      setSelectedNodeIds: vi.fn(),
      startCameraPanning,
      startEdgeDrawing: vi.fn(),
      startMarqueeSelection: vi.fn(),
      startNodeDragging: vi.fn(),
      toggleNodeSelection: vi.fn(),
    });

    handler(event);

    expect(clearLastNodeClick).toHaveBeenCalledTimes(1);
    expect(startCameraPanning).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
  });
});

function canvas() {
  return {
    getBoundingClientRect: () => ({ left: 10, top: 20 }),
  };
}

function pointerDownEvent() {
  return {
    button: 0,
    clientX: 42,
    clientY: 66,
    ctrlKey: false,
    currentTarget: null,
    detail: 1,
    metaKey: false,
    pointerId: 1,
    preventDefault: vi.fn(),
    shiftKey: false,
    stopImmediatePropagation: vi.fn(),
    stopPropagation: vi.fn(),
  };
}
