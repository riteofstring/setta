// @vitest-environment jsdom

import { useEdgeHandleRegistry } from "state/stores/layoutInteractionStores";
import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoistedEdgeHandleViewport = vi.hoisted(() => ({
  screenToFlowPosition: vi.fn(
    (point: { x: number; y: number }, _ignoreGrid?: boolean) => point,
  ),
}));

vi.mock("forks/xyflow/core/hooks/useViewportHelper", () => ({
  screenToFlowPosition: (
    point: { x: number; y: number },
    ignoreGrid?: boolean,
  ) => hoistedEdgeHandleViewport.screenToFlowPosition(point, ignoreGrid),
}));

import {
  registerEdgeHandle,
  registerEdgeHandlesWithSharedElement,
  unregisterEdgeHandle,
} from "./edgeHandleRegistration";

function setElementRect(element: HTMLElement, rect: DOMRect): void {
  element.getBoundingClientRect = () => rect;
}

describe("edgeHandleRegistration", () => {
  beforeEach(() => {
    resetProjectStores();
    hoistedEdgeHandleViewport.screenToFlowPosition.mockClear();
  });

  it("registers a single handle and stores its initial flow-space position", () => {
    // A mounted handle should immediately be available to edge renderers.
    const handleElement = document.createElement("div");
    setElementRect(handleElement, new DOMRect(10, 20, 8, 12));

    const key = registerEdgeHandle({
      sectionId: "section-a",
      portId: "port-a",
      type: "source",
      side: "right",
      element: handleElement,
    });

    expect(key).toBe("section-a:port-a:source");
    expect(useEdgeHandleRegistry.getState().handles[key]).toEqual({
      sectionId: "section-a",
      portId: "port-a",
      type: "source",
      side: "right",
      element: handleElement,
    });
    expect(useEdgeHandleRegistry.getState().positions[key]).toEqual({
      sectionId: "section-a",
      portId: "port-a",
      type: "source",
      side: "right",
      x: 14,
      y: 26,
    });
  });

  it("registers minimized shared handles in one batch and unregisters them cleanly", () => {
    // Minimized sections should expose one shared hit target per side without losing per-port keys.
    const sharedElement = document.createElement("div");
    setElementRect(sharedElement, new DOMRect(100, 40, 20, 20));

    registerEdgeHandlesWithSharedElement({
      sectionId: "section-a",
      portIds: ["port-a", "port-b"],
      type: "target",
      side: "left",
      element: sharedElement,
    });

    expect(useEdgeHandleRegistry.getState().positions).toMatchObject({
      "section-a:port-a:target": {
        sectionId: "section-a",
        portId: "port-a",
        type: "target",
        side: "left",
        x: 110,
        y: 50,
      },
      "section-a:port-b:target": {
        sectionId: "section-a",
        portId: "port-b",
        type: "target",
        side: "left",
        x: 110,
        y: 50,
      },
    });

    unregisterEdgeHandle("section-a", "port-a", "target");

    expect(useEdgeHandleRegistry.getState().handles).not.toHaveProperty(
      "section-a:port-a:target",
    );
    expect(useEdgeHandleRegistry.getState().positions).not.toHaveProperty(
      "section-a:port-a:target",
    );
    expect(useEdgeHandleRegistry.getState().handles).toHaveProperty(
      "section-a:port-b:target",
    );
  });
});
