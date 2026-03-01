// @vitest-environment jsdom

import { HandlePosition, type HandleType } from "forks/xyflow/core/types";
import { useReactFlow } from "forks/xyflow/core/store";
import initialState from "forks/xyflow/core/store/initialState";
import { useEdgeHandleRegistry, useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeEdgeHandleKey,
  registerEdgeHandle,
  registerEdgeHandlesWithSharedElement,
  scheduleEdgeHandlePositionUpdate,
} from "./edgeHandles";

type RectSpec = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function createMutableRectElement(initialRect: RectSpec) {
  let currentRect = initialRect;
  const element = document.createElement("div");
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      new DOMRect(
        currentRect.left,
        currentRect.top,
        currentRect.width,
        currentRect.height,
      ),
  });
  return {
    element,
    setRect: (nextRect: RectSpec) => {
      currentRect = nextRect;
    },
  };
}

function expectStoredPosition({
  sectionId,
  portId,
  type,
  side,
  x,
  y,
}: {
  sectionId: string;
  portId: string;
  type: HandleType;
  side: HandlePosition;
  x: number;
  y: number;
}) {
  const key = makeEdgeHandleKey(sectionId, portId, type);
  expect(useEdgeHandleRegistry.getState().positions[key]).toEqual({
    sectionId,
    portId,
    type,
    side,
    x,
    y,
  });
}

describe("edgeHandles actions", () => {
  beforeEach(() => {
    resetProjectStores();
    useReactFlow.setState({ ...initialState });
    useSettings.setState(createSettingsState());
  });

  afterEach(() => {
    resetProjectStores();
    useReactFlow.setState({ ...initialState });
    vi.restoreAllMocks();
  });

  it("stores a position immediately when a handle is registered", () => {
    // Preserve UX guarantee: a newly mounted handle is immediately connectable.
    const { element } = createMutableRectElement({
      left: 10,
      top: 20,
      width: 6,
      height: 8,
    });

    const key = registerEdgeHandle({
      sectionId: "section-1",
      portId: "out-1",
      type: "source",
      side: HandlePosition.Right,
      element,
    });

    expect(useEdgeHandleRegistry.getState().handles[key]?.element).toBe(element);
    expectStoredPosition({
      sectionId: "section-1",
      portId: "out-1",
      type: "source",
      side: HandlePosition.Right,
      x: 13,
      y: 24,
    });
  });

  it("keeps shared-element ports synchronized to the same handle center", () => {
    // Preserve UX guarantee: multi-port handles stay visually aligned.
    const { element, setRect } = createMutableRectElement({
      left: 100,
      top: 200,
      width: 10,
      height: 4,
    });

    registerEdgeHandlesWithSharedElement({
      sectionId: "section-shared",
      portIds: ["out-a", "out-b"],
      type: "source",
      side: HandlePosition.Right,
      element,
    });

    expectStoredPosition({
      sectionId: "section-shared",
      portId: "out-a",
      type: "source",
      side: HandlePosition.Right,
      x: 105,
      y: 202,
    });
    expectStoredPosition({
      sectionId: "section-shared",
      portId: "out-b",
      type: "source",
      side: HandlePosition.Right,
      x: 105,
      y: 202,
    });

    setRect({ left: 120, top: 210, width: 8, height: 10 });
    registerEdgeHandlesWithSharedElement({
      sectionId: "section-shared",
      portIds: ["out-a", "out-b"],
      type: "source",
      side: HandlePosition.Right,
      element,
    });

    expectStoredPosition({
      sectionId: "section-shared",
      portId: "out-a",
      type: "source",
      side: HandlePosition.Right,
      x: 124,
      y: 215,
    });
    expectStoredPosition({
      sectionId: "section-shared",
      portId: "out-b",
      type: "source",
      side: HandlePosition.Right,
      x: 124,
      y: 215,
    });
  });

  it("updates only the requested section handles when scheduling position recompute", () => {
    // Preserve UX guarantee: unrelated sections do not jump when another section moves.
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});

    const sourceHandle = createMutableRectElement({
      left: 0,
      top: 0,
      width: 10,
      height: 10,
    });
    const targetHandle = createMutableRectElement({
      left: 50,
      top: 50,
      width: 10,
      height: 10,
    });

    registerEdgeHandle({
      sectionId: "section-a",
      portId: "out-a",
      type: "source",
      side: HandlePosition.Right,
      element: sourceHandle.element,
    });
    registerEdgeHandle({
      sectionId: "section-b",
      portId: "out-b",
      type: "source",
      side: HandlePosition.Right,
      element: targetHandle.element,
    });

    sourceHandle.setRect({ left: 20, top: 20, width: 10, height: 10 });
    targetHandle.setRect({ left: 90, top: 90, width: 10, height: 10 });

    scheduleEdgeHandlePositionUpdate(["section-a"]);

    expectStoredPosition({
      sectionId: "section-a",
      portId: "out-a",
      type: "source",
      side: HandlePosition.Right,
      x: 25,
      y: 25,
    });
    expectStoredPosition({
      sectionId: "section-b",
      portId: "out-b",
      type: "source",
      side: HandlePosition.Right,
      x: 55,
      y: 55,
    });
  });
});
