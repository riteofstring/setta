// @vitest-environment jsdom

import { useEdgeHandleRegistry } from "state/stores/layoutInteractionStores";
import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { scheduleEdgeHandlePositionUpdate } from "./edgeHandlePositionScheduler";
import { recomputeEdgeHandlePositions } from "./edgeHandlePositionState";
import { registerEdgeHandle } from "./edgeHandleRegistration";

function setElementRect(element: HTMLElement, rect: DOMRect): void {
  element.getBoundingClientRect = () => rect;
}

describe("edgeHandlePositionState", () => {
  beforeEach(() => {
    resetProjectStores();
    hoistedEdgeHandleViewport.screenToFlowPosition.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("recomputes stored positions from the latest handle geometry", () => {
    // Edge redraws should pick up the newest DOM handle positions after layout changes.
    const sourceElement = document.createElement("div");
    const targetElement = document.createElement("div");
    setElementRect(sourceElement, new DOMRect(0, 0, 10, 10));
    setElementRect(targetElement, new DOMRect(30, 10, 10, 10));

    registerEdgeHandle({
      sectionId: "section-a",
      portId: "port-a",
      type: "source",
      side: "right",
      element: sourceElement,
    });
    registerEdgeHandle({
      sectionId: "section-b",
      portId: "port-b",
      type: "target",
      side: "left",
      element: targetElement,
    });

    setElementRect(sourceElement, new DOMRect(20, 40, 10, 10));
    setElementRect(targetElement, new DOMRect(60, 80, 10, 10));

    recomputeEdgeHandlePositions();

    expect(useEdgeHandleRegistry.getState().positions).toMatchObject({
      "section-a:port-a:source": {
        x: 25,
        y: 45,
      },
      "section-b:port-b:target": {
        x: 65,
        y: 85,
      },
    });
  });

  it("batches scheduled section updates into one animation frame and scopes them by section", () => {
    // Section moves should coalesce into one position refresh without touching unrelated handles.
    let scheduledFrame: FrameRequestCallback | null = null;
    const requestAnimationFrameMock = vi.fn(
      (callback: FrameRequestCallback) => {
        scheduledFrame = callback;
        return 1;
      },
    );
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrameMock);
    vi.stubGlobal("cancelAnimationFrame", (_id: number) => undefined);

    const sectionAElement = document.createElement("div");
    const sectionBElement = document.createElement("div");
    const sectionCElement = document.createElement("div");
    setElementRect(sectionAElement, new DOMRect(0, 0, 10, 10));
    setElementRect(sectionBElement, new DOMRect(20, 0, 10, 10));
    setElementRect(sectionCElement, new DOMRect(40, 0, 10, 10));

    registerEdgeHandle({
      sectionId: "section-a",
      portId: "port-a",
      type: "source",
      side: "right",
      element: sectionAElement,
    });
    registerEdgeHandle({
      sectionId: "section-b",
      portId: "port-b",
      type: "source",
      side: "right",
      element: sectionBElement,
    });
    registerEdgeHandle({
      sectionId: "section-c",
      portId: "port-c",
      type: "source",
      side: "right",
      element: sectionCElement,
    });

    setElementRect(sectionAElement, new DOMRect(100, 0, 10, 10));
    setElementRect(sectionBElement, new DOMRect(200, 0, 10, 10));
    setElementRect(sectionCElement, new DOMRect(300, 0, 10, 10));

    scheduleEdgeHandlePositionUpdate(["section-a"]);
    scheduleEdgeHandlePositionUpdate(["section-b", "section-a"]);

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);
    expect(useEdgeHandleRegistry.getState().positions).toMatchObject({
      "section-a:port-a:source": { x: 5 },
      "section-b:port-b:source": { x: 25 },
      "section-c:port-c:source": { x: 45 },
    });

    scheduledFrame?.(16);

    expect(useEdgeHandleRegistry.getState().positions).toMatchObject({
      "section-a:port-a:source": { x: 105 },
      "section-b:port-b:source": { x: 205 },
      "section-c:port-c:source": { x: 45 },
    });
  });
});
