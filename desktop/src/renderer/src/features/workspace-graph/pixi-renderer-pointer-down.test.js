import { describe, expect, test, vi } from "vitest";

import { createWorkflowGraphPointerDownHandler } from "./pixi-renderer-pointer-down";

describe("workflow graph pointer-down activity chip routing", () => {
  test("routes a chip hit into the chip click interaction and skips node handling", () => {
    const chip = { markerId: "marker_command", nodeId: "work", type: "marker" };
    const handlers = harness({ chip });

    handlers.pointerDown(pointerEvent());

    expect(handlers.beginActivityChipClick).toHaveBeenCalledWith(chip, { x: 24, y: 36 });
    expect(handlers.hitTestNodeAtScreen).not.toHaveBeenCalled();
    expect(handlers.startNodeDragging).not.toHaveBeenCalled();
    expect(handlers.startCameraPanning).not.toHaveBeenCalled();
  });

  test("falls through to node handling when no chip is hit", () => {
    const node = { id: "work" };
    const handlers = harness({ chip: null, node });

    handlers.pointerDown(pointerEvent());

    expect(handlers.beginActivityChipClick).not.toHaveBeenCalled();
    expect(handlers.startNodeDragging).toHaveBeenCalledWith("work", { x: 24, y: 36 });
  });

  test("skips chip hit-testing when no chip handler is wired", () => {
    const handlers = harness({
      chip: { nodeId: "work", type: "marker" },
      onActivityChipOpen: null,
    });

    handlers.pointerDown(pointerEvent());

    expect(handlers.hitTestActivityChipAtScreen).not.toHaveBeenCalled();
    expect(handlers.beginActivityChipClick).not.toHaveBeenCalled();
    expect(handlers.startCameraPanning).toHaveBeenCalled();
  });
});

function harness({ chip = null, node = null, onActivityChipOpen = () => {} } = {}) {
  const spies = {
    beginActivityChipClick: vi.fn(),
    clearLastNodeClick: vi.fn(),
    clearSelection: vi.fn(),
    hitTestActivityChipAtScreen: vi.fn(() => chip),
    hitTestNodeAtScreen: vi.fn(() => node),
    hitTestPortAtScreen: vi.fn(() => null),
    repeatedNodeOpenRequested: vi.fn(() => false),
    selectOnlyNode: vi.fn(),
    startCameraPanning: vi.fn(),
    startEdgeDrawing: vi.fn(),
    startMarqueeSelection: vi.fn(),
    startNodeDragging: vi.fn(),
    toggleNodeSelection: vi.fn(),
  };
  const pointerDown = createWorkflowGraphPointerDownHandler({
    ...spies,
    canvas: fakeCanvas(),
    frozen: () => false,
    graphHandlers: { onActivityChipOpen, onNodeOpen: null },
  });
  return { ...spies, pointerDown };
}

function pointerEvent() {
  return {
    button: 0,
    clientX: 24,
    clientY: 36,
    ctrlKey: false,
    detail: 1,
    metaKey: false,
    preventDefault: () => {},
    shiftKey: false,
    stopImmediatePropagation: () => {},
    stopPropagation: () => {},
  };
}

function fakeCanvas() {
  return {
    clientHeight: 0,
    clientWidth: 0,
    getBoundingClientRect: () => ({ height: 0, left: 0, top: 0, width: 0 }),
  };
}
