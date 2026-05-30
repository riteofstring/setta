/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { createGpuNodeTargetDescriptor } from "./activeNodeTargeting";
import { createGpuNodeInteractionDirtyController } from "./nodeInteractionDirty";

describe("gpu node wheel handoff", () => {
  it("marks the texture dirty after applying the scroll offset", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const scroller = document.createElement("div");
    scroller.className = "nowheel";
    scroller.style.overflowY = "auto";
    setScrollMetrics(scroller, {
      clientHeight: 100,
      clientWidth: 200,
      scrollHeight: 400,
      scrollWidth: 200,
    });
    nodeElement.append(scroller);
    canvas.append(nodeElement);
    setRect(scroller, 20, 30, 200, 100);

    const descriptor = createGpuNodeTargetDescriptor(nodeElement, scroller);
    if (!descriptor) {
      throw new Error("Expected a wheel handoff target descriptor.");
    }

    const scrollTopAtDirtyMark: number[] = [];
    const textureManager = {
      markSurfaceTextureDirty: vi.fn(() => {
        scrollTopAtDirtyMark.push(scroller.scrollTop);
      }),
      setSurfaceTexturePriority: vi.fn(),
    };
    let frame = 0;
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => {
        frame += 1;
        return frame;
      },
      requestFrame: vi.fn(),
      resolveWheelHandoffTarget: () => ({
        descriptor,
        nodeId: "node-a",
      }),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 25,
      clientY: 35,
      deltaY: 80,
    });
    canvas.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(true);
    expect(scroller.scrollTop).toBe(80);
    expect(scrollTopAtDirtyMark).toEqual([80]);

    detach();
  });

  it("keeps the projected wheel target until a successful scroll is uploaded", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const scroller = document.createElement("div");
    scroller.className = "nowheel";
    scroller.style.overflowY = "auto";
    setScrollMetrics(scroller, {
      clientHeight: 100,
      clientWidth: 200,
      scrollHeight: 400,
      scrollWidth: 200,
    });
    nodeElement.append(scroller);
    canvas.append(nodeElement);
    document.body.append(canvas);
    setRect(scroller, 20, 30, 200, 100);
    const descriptor = createGpuNodeTargetDescriptor(nodeElement, scroller);
    if (!descriptor) {
      throw new Error("Expected a wheel handoff target descriptor.");
    }
    const textureManager = createInteractionTextureManager();
    const clearProjectedInteraction = vi.fn();
    const onStateChange = vi.fn(({ activeNodeId }) => {
      if (!activeNodeId) {
        clearProjectedInteraction();
      }
    });
    const requestFrame = vi.fn();
    let frame = 0;
    const controller = createGpuNodeInteractionDirtyController({
      clearProjectedInteraction,
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => {
        frame += 1;
        return frame;
      },
      onStateChange,
      requestFrame,
      resolveWheelHandoffTarget: () => ({
        descriptor,
        nodeId: "node-a",
      }),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 25,
      clientY: 35,
      deltaY: 80,
    });
    canvas.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(true);
    expect(scroller.scrollTop).toBe(80);
    expect(clearProjectedInteraction).not.toHaveBeenCalled();
    expect(controller.getActiveNodeId()).toBe("node-a");
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 1,
      surfaceId: "node-a",
      priority: "interactive",
      reason: "scroll",
    });
    controller.completeFrame({
      budgetExhausted: false,
      remainingDirtyNodeIds: [],
      uploadedNodeIds: ["node-a"],
    });
    expect(controller.getActiveNodeId()).toBeNull();
    expect(clearProjectedInteraction).toHaveBeenCalledTimes(1);

    detach();
    canvas.remove();
  });

  it("uses the live wheel target found during hit testing", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const staleTarget = document.createElement("button");
    nodeElement.append(staleTarget);
    const staleDescriptor = createGpuNodeTargetDescriptor(
      nodeElement,
      staleTarget,
    );
    if (!staleDescriptor) {
      throw new Error("Expected a stale wheel handoff target descriptor.");
    }
    staleTarget.remove();

    const scroller = document.createElement("div");
    scroller.className = "nowheel";
    scroller.style.overflowY = "auto";
    setScrollMetrics(scroller, {
      clientHeight: 100,
      clientWidth: 200,
      scrollHeight: 400,
      scrollWidth: 200,
    });
    nodeElement.append(scroller);
    canvas.append(nodeElement);
    setRect(scroller, 20, 30, 200, 100);

    const textureManager = {
      markSurfaceTextureDirty: vi.fn(),
      setSurfaceTexturePriority: vi.fn(),
    };
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 1,
      requestFrame: vi.fn(),
      resolveWheelHandoffTarget: () => ({
        descriptor: staleDescriptor,
        nodeId: "node-a",
        target: scroller,
      }),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 25,
      clientY: 35,
      deltaY: 80,
    });
    canvas.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(true);
    expect(scroller.scrollTop).toBe(80);
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledTimes(1);

    detach();
  });

  it("continues wheel scrolling from the last handed off offset", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const scroller = document.createElement("div");
    scroller.className = "nowheel";
    scroller.style.overflowY = "auto";
    setScrollMetrics(scroller, {
      clientHeight: 100,
      clientWidth: 200,
      scrollHeight: 400,
      scrollWidth: 200,
    });
    nodeElement.append(scroller);
    canvas.append(nodeElement);
    setRect(scroller, 20, 30, 200, 100);

    const descriptor = createGpuNodeTargetDescriptor(nodeElement, scroller);
    if (!descriptor) {
      throw new Error("Expected a wheel handoff target descriptor.");
    }

    const textureManager = {
      markSurfaceTextureDirty: vi.fn(),
      setSurfaceTexturePriority: vi.fn(),
    };
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 1,
      requestFrame: vi.fn(),
      resolveWheelHandoffTarget: () => ({
        descriptor,
        nodeId: "node-a",
        target: scroller,
      }),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    canvas.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: 25,
        clientY: 35,
        deltaY: 80,
      }),
    );
    scroller.scrollTop = 0;
    canvas.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: 25,
        clientY: 35,
        deltaY: 80,
      }),
    );

    expect(scroller.scrollTop).toBe(160);

    detach();
  });

  it("clears the projected wheel target when the target cannot scroll", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const scroller = document.createElement("div");
    scroller.className = "nowheel";
    scroller.style.overflowY = "auto";
    setScrollMetrics(scroller, {
      clientHeight: 100,
      clientWidth: 200,
      scrollHeight: 400,
      scrollWidth: 200,
    });
    scroller.scrollTop = 300;
    nodeElement.append(scroller);
    canvas.append(nodeElement);
    setRect(scroller, 20, 30, 200, 100);

    const descriptor = createGpuNodeTargetDescriptor(nodeElement, scroller);
    if (!descriptor) {
      throw new Error("Expected a wheel handoff target descriptor.");
    }

    const clearProjectedInteraction = vi.fn();
    const textureManager = {
      markSurfaceTextureDirty: vi.fn(),
      setSurfaceTexturePriority: vi.fn(),
    };
    const controller = createGpuNodeInteractionDirtyController({
      clearProjectedInteraction,
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 1,
      requestFrame: vi.fn(),
      resolveWheelHandoffTarget: () => ({
        descriptor,
        nodeId: "node-a",
        target: scroller,
      }),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 25,
      clientY: 35,
      deltaY: 80,
    });
    canvas.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(true);
    expect(scroller.scrollTop).toBe(300);
    expect(controller.getActiveNodeId()).toBeNull();
    expect(clearProjectedInteraction).toHaveBeenCalledWith("node-a");
    expect(textureManager.markSurfaceTextureDirty).not.toHaveBeenCalled();

    detach();
  });

  it("marks passive internal scrolls without promoting the node", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const scroller = document.createElement("div");
    nodeElement.append(scroller);
    canvas.append(nodeElement);
    const textureManager = createInteractionTextureManager();
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 9,
      requestFrame: vi.fn(),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas);

    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));

    expect(controller.getActiveNodeId()).toBeNull();
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 9,
      surfaceId: "node-a",
      priority: "visible",
      reason: "scroll",
    });

    detach();
  });

  it("marks passive interaction dirty without requesting paint while viewport movement is active", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const scroller = document.createElement("div");
    nodeElement.append(scroller);
    canvas.append(nodeElement);
    const textureManager = createInteractionTextureManager();
    const controller = createGpuNodeInteractionDirtyController({
      deferPassiveDirty: () => true,
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 10,
      requestFrame: vi.fn(),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas);

    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));

    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 10,
      surfaceId: "node-a",
      priority: "visible",
      reason: "scroll",
      requestPaint: false,
    });

    detach();
  });
});

function createNodeElement(nodeId: string): HTMLElement {
  const element = document.createElement("div");
  element.dataset.gpuFlowNode = "true";
  element.dataset.id = nodeId;
  return element;
}

function createInteractionTextureManager() {
  return {
    markSurfaceTextureDirty: vi.fn(),
    setSurfaceTexturePriority: vi.fn(),
  };
}

function setRect(
  element: Element,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  element.getBoundingClientRect = () =>
    ({
      bottom: top + height,
      height,
      left,
      right: left + width,
      top,
      width,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

function setScrollMetrics(
  element: HTMLElement,
  metrics: {
    readonly clientHeight: number;
    readonly clientWidth: number;
    readonly scrollHeight: number;
    readonly scrollWidth: number;
  },
) {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: metrics.clientHeight },
    clientWidth: { configurable: true, value: metrics.clientWidth },
    scrollHeight: { configurable: true, value: metrics.scrollHeight },
    scrollWidth: { configurable: true, value: metrics.scrollWidth },
  });
}
