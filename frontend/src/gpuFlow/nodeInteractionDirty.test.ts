/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createGpuNodeTargetDescriptor } from "./activeNodeTargeting";
import { dispatchGpuFlowNodeDirtyEvent } from "./nodeDirtyEvents";
import {
  createGpuNodeInteractionDirtyController,
  findGpuNodeIdForEventTarget,
  isGpuNodeInteractiveEventTarget,
} from "./nodeInteractionDirty";

describe("gpu node interaction dirty tracking", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves node ids through the direct gpu node wrapper", () => {
    const nodeElement = createNodeElement("node-a");
    const input = document.createElement("input");
    nodeElement.append(input);

    expect(
      findGpuNodeIdForEventTarget(input, new Map([["node-a", nodeElement]])),
    ).toBe("node-a");
    expect(isGpuNodeInteractiveEventTarget(input)).toBe(true);
  });

  it("does not resolve unregistered node wrappers by stale metadata", () => {
    const nodeElement = createNodeElement("node-a");
    const input = document.createElement("input");
    nodeElement.append(input);

    expect(findGpuNodeIdForEventTarget(input, new Map())).toBeNull();
  });

  it("marks input changes with interactive priority and requests texture work", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const input = document.createElement("input");
    nodeElement.append(input);
    canvas.append(nodeElement);
    const textureManager = createInteractionTextureManager();
    const requestFrame = vi.fn();
    const onStateChange = vi.fn();
    let frame = 0;
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => {
        frame += 1;
        return frame;
      },
      onStateChange,
      requestFrame,
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas);

    input.dispatchEvent(new Event("input", { bubbles: true }));

    expect(controller.getActiveNodeId()).toBe("node-a");
    expect(textureManager.setSurfaceTexturePriority).toHaveBeenCalledWith(
      "node-a",
      "interactive",
    );
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 1,
      surfaceId: "node-a",
      priority: "interactive",
      reason: "input",
    });
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
    expect(onStateChange).toHaveBeenCalledWith({
      activeNodeId: "node-a",
    });

    detach();
  });

  it("hands off a canvas-origin pointerdown to the projected source control", async () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const switchButton = document.createElement("button");
    switchButton.dataset.gpuFlowControl = "enabled";
    nodeElement.append(switchButton);
    canvas.append(nodeElement);
    document.body.append(canvas);
    setRect(switchButton, 20, 30, 50, 24);
    const descriptor = createGpuNodeTargetDescriptor(nodeElement, switchButton);
    if (!descriptor) {
      throw new Error("Expected a handoff target descriptor");
    }
    const textureManager = createInteractionTextureManager();
    const requestFrame = vi.fn();
    const pointerDowns: boolean[] = [];
    const mouseDowns: boolean[] = [];
    const clicks: boolean[] = [];
    switchButton.addEventListener("pointerdown", () => {
      pointerDowns.push(true);
    });
    switchButton.addEventListener("mousedown", () => {
      mouseDowns.push(true);
    });
    switchButton.addEventListener("click", () => {
      clicks.push(true);
    });
    let frame = 0;
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => {
        frame += 1;
        return frame;
      },
      requestFrame,
      resolvePointerHandoffTarget: () => ({
        descriptor,
        nodeId: "node-a",
      }),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    const pointerDown = createPointerEvent("pointerdown", {
      clientX: 25,
      clientY: 35,
      pointerId: 7,
    });
    canvas.dispatchEvent(pointerDown);

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(pointerDowns).toEqual([true]);
    expect(mouseDowns).toEqual([]);
    expect(controller.getActiveNodeId()).toBe("node-a");
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 1,
      surfaceId: "node-a",
      priority: "interactive",
      reason: "pointer",
    });

    document.dispatchEvent(
      createPointerEvent("pointerup", {
        clientX: 25,
        clientY: 35,
        pointerId: 7,
      }),
    );
    await Promise.resolve();

    expect(clicks).toEqual([true]);

    detach();
    canvas.remove();
  });

  it("hands off a passive node wrapper pointerdown by coordinates", async () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const switchButton = document.createElement("button");
    switchButton.dataset.gpuFlowControl = "enabled";
    nodeElement.append(switchButton);
    canvas.append(nodeElement);
    document.body.append(canvas);
    setRect(switchButton, 20, 30, 50, 24);
    const descriptor = createGpuNodeTargetDescriptor(nodeElement, switchButton);
    if (!descriptor) {
      throw new Error("Expected a handoff target descriptor");
    }
    const textureManager = createInteractionTextureManager();
    const requestFrame = vi.fn();
    const clicks: boolean[] = [];
    switchButton.addEventListener("click", () => {
      clicks.push(true);
    });
    let frame = 0;
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => {
        frame += 1;
        return frame;
      },
      requestFrame,
      resolvePointerHandoffTarget: () => ({
        descriptor,
        nodeId: "node-a",
      }),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    const pointerDown = createPointerEvent("pointerdown", {
      clientX: 25,
      clientY: 35,
      pointerId: 9,
    });
    nodeElement.dispatchEvent(pointerDown);

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(controller.getActiveNodeId()).toBe("node-a");

    document.dispatchEvent(
      createPointerEvent("pointerup", {
        clientX: 25,
        clientY: 35,
        pointerId: 9,
      }),
    );
    await Promise.resolve();

    expect(clicks).toEqual([true]);

    detach();
    canvas.remove();
  });

  it("forwards pointer handoff target rects to tiled texture dirty ownership", async () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const switchButton = document.createElement("button");
    switchButton.dataset.gpuFlowControl = "enabled";
    nodeElement.append(switchButton);
    canvas.append(nodeElement);
    document.body.append(canvas);
    setRect(nodeElement, 100, 200, 320, 240);
    setRect(switchButton, 140, 260, 36, 20);
    const descriptor = createGpuNodeTargetDescriptor(nodeElement, switchButton);
    if (!descriptor) {
      throw new Error("Expected a handoff target descriptor");
    }
    const textureManager = createInteractionTextureManager();
    let frame = 0;
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => {
        frame += 1;
        return frame;
      },
      requestFrame: vi.fn(),
      resolvePointerHandoffTarget: () => ({
        descriptor,
        nodeId: "node-a",
      }),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    canvas.dispatchEvent(
      createPointerEvent("pointerdown", {
        clientX: 145,
        clientY: 265,
        pointerId: 13,
      }),
    );
    document.dispatchEvent(
      createPointerEvent("pointerup", {
        clientX: 145,
        clientY: 265,
        pointerId: 13,
      }),
    );
    await Promise.resolve();

    expect(textureManager.markSurfaceTextureDirty).toHaveBeenNthCalledWith(1, {
      content: true,
      frame: 1,
      priority: "interactive",
      reason: "pointer",
      sourceRect: {
        height: 20,
        width: 36,
        x: 40,
        y: 60,
      },
      surfaceId: "node-a",
    });
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenNthCalledWith(2, {
      content: true,
      frame: 2,
      priority: "interactive",
      reason: "pointer",
      sourceRect: {
        height: 20,
        width: 36,
        x: 40,
        y: 60,
      },
      surfaceId: "node-a",
    });

    detach();
    canvas.remove();
  });

  it("activates resize handles on hover without broad control hover handoff", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const resizeHandle = document.createElement("div");
    resizeHandle.className =
      "section-resize-handle section-resize-handle-bottom-right";
    nodeElement.append(resizeHandle);
    canvas.append(nodeElement);
    document.body.append(canvas);
    setRect(resizeHandle, 20, 30, 16, 16);
    const descriptor = createGpuNodeTargetDescriptor(nodeElement, resizeHandle);
    if (!descriptor) {
      throw new Error("Expected a resize handoff target descriptor");
    }
    const textureManager = createInteractionTextureManager();
    const clearProjectedInteraction = vi.fn();
    const requestFrame = vi.fn();
    const resolvePointerHandoffTarget = vi.fn(() => ({
      descriptor,
      nodeId: "node-a",
    }));
    let frame = 0;
    const controller = createGpuNodeInteractionDirtyController({
      clearProjectedInteraction,
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => {
        frame += 1;
        return frame;
      },
      requestFrame,
      resolvePointerHandoffTarget,
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    canvas.dispatchEvent(
      createPointerEvent("pointermove", {
        buttons: 0,
        clientX: 25,
        clientY: 35,
        pointerId: 3,
      }),
    );

    expect(controller.getActiveNodeId()).toBe("node-a");
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 1,
      surfaceId: "node-a",
      priority: "interactive",
      reason: "pointer",
    });

    canvas.dispatchEvent(
      createPointerEvent("pointermove", {
        buttons: 0,
        clientX: 26,
        clientY: 36,
        pointerId: 3,
      }),
    );
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledTimes(1);

    const button = document.createElement("button");
    button.dataset.gpuFlowControl = "regular-control";
    nodeElement.replaceChildren(button);
    const buttonDescriptor = createGpuNodeTargetDescriptor(nodeElement, button);
    if (!buttonDescriptor) {
      throw new Error("Expected a control handoff target descriptor");
    }
    resolvePointerHandoffTarget.mockReturnValue({
      descriptor: buttonDescriptor,
      nodeId: "node-a",
    });
    canvas.dispatchEvent(
      createPointerEvent("pointermove", {
        buttons: 0,
        clientX: 80,
        clientY: 80,
        pointerId: 3,
      }),
    );

    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledTimes(2);
    expect(clearProjectedInteraction).toHaveBeenCalledWith("node-a");
    expect(
      resolvePointerHandoffTarget.mock.calls.map(([, options]) => options),
    ).toEqual([
      { projectSource: false },
      { projectSource: true },
      { projectSource: false },
      { projectSource: true },
      { projectSource: false },
    ]);
    controller.completeFrame({
      budgetExhausted: false,
      remainingDirtyNodeIds: [],
      uploadedNodeIds: ["node-a"],
    });
    expect(controller.getActiveNodeId()).toBeNull();

    detach();
    canvas.remove();
  });

  it("mirrors virtual handoff target cursors without projecting hover sources", () => {
    const canvas = document.createElement("div");
    const nodeElement = createNodeElement("node-a");
    const button = document.createElement("button");
    const input = document.createElement("input");
    button.style.cursor = "pointer";
    nodeElement.append(button, input);
    canvas.append(nodeElement);
    document.body.append(canvas);
    const buttonDescriptor = createGpuNodeTargetDescriptor(
      nodeElement,
      button,
    );
    const inputDescriptor = createGpuNodeTargetDescriptor(nodeElement, input);
    if (!buttonDescriptor || !inputDescriptor) {
      throw new Error("Expected handoff target descriptors");
    }
    const textureManager = createInteractionTextureManager();
    const resolvePointerHandoffTarget = vi.fn(() => ({
      descriptor: buttonDescriptor,
      nodeId: "node-a",
    }));
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 1,
      requestFrame: vi.fn(),
      resolvePointerHandoffTarget,
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    canvas.dispatchEvent(
      createPointerEvent("pointermove", {
        buttons: 0,
        clientX: 80,
        clientY: 80,
        pointerId: 3,
      }),
    );
    expect(canvas.style.cursor).toBe("pointer");

    resolvePointerHandoffTarget.mockReturnValue({
      descriptor: inputDescriptor,
      nodeId: "node-a",
    });
    canvas.dispatchEvent(
      createPointerEvent("pointermove", {
        buttons: 0,
        clientX: 90,
        clientY: 90,
        pointerId: 3,
      }),
    );
    expect(canvas.style.cursor).toBe("text");

    resolvePointerHandoffTarget.mockReturnValue(null);
    canvas.dispatchEvent(
      createPointerEvent("pointermove", {
        buttons: 0,
        clientX: 100,
        clientY: 100,
        pointerId: 3,
      }),
    );
    expect(canvas.style.cursor).toBe("");
    expect(
      resolvePointerHandoffTarget.mock.calls.map(([, options]) => options),
    ).toEqual([
      { projectSource: false },
      { projectSource: false },
      { projectSource: false },
    ]);

    detach();
    canvas.remove();
  });

  it("ignores native resize handles from passive capture sources", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    nodeElement.classList.add("setta-gpu-flow__html-source");
    nodeElement.dataset.gpuFlowHtmlSource = "true";
    nodeElement.dataset.gpuFlowInteractive = "false";
    const resizeHandle = document.createElement("div");
    resizeHandle.className =
      "section-resize-handle section-resize-handle-bottom-right";
    nodeElement.append(resizeHandle);
    canvas.append(nodeElement);
    document.body.append(canvas);
    const textureManager = createInteractionTextureManager();
    const requestFrame = vi.fn();
    const resolvePointerHandoffTarget = vi.fn(() => null);
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 1,
      requestFrame,
      resolvePointerHandoffTarget,
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    resizeHandle.dispatchEvent(
      createPointerEvent("pointerdown", {
        clientX: 25,
        clientY: 35,
        pointerId: 17,
      }),
    );

    expect(resolvePointerHandoffTarget).toHaveBeenCalledTimes(1);
    expect(controller.getActiveNodeId()).toBeNull();
    expect(textureManager.markSurfaceTextureDirty).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();

    detach();
    canvas.remove();
  });

  it("ignores native resize handles from active unprojected capture sources", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    nodeElement.classList.add("setta-gpu-flow__html-source");
    nodeElement.dataset.gpuFlowHtmlSource = "true";
    nodeElement.dataset.gpuFlowInteractive = "true";
    const resizeHandle = document.createElement("div");
    resizeHandle.className =
      "section-resize-handle section-resize-handle-bottom-right";
    nodeElement.append(resizeHandle);
    canvas.append(nodeElement);
    document.body.append(canvas);
    const textureManager = createInteractionTextureManager();
    const requestFrame = vi.fn();
    const resolvePointerHandoffTarget = vi.fn(() => null);
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 1,
      requestFrame,
      resolvePointerHandoffTarget,
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    resizeHandle.dispatchEvent(
      createPointerEvent("pointerdown", {
        clientX: 25,
        clientY: 35,
        pointerId: 17,
      }),
    );

    expect(resolvePointerHandoffTarget).toHaveBeenCalledTimes(1);
    expect(controller.getActiveNodeId()).toBeNull();
    expect(textureManager.markSurfaceTextureDirty).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();

    detach();
    canvas.remove();
  });

  it("allows native resize handles from projected capture sources", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    nodeElement.classList.add("setta-gpu-flow__html-source");
    nodeElement.dataset.gpuFlowHtmlSource = "true";
    nodeElement.dataset.gpuFlowInteractive = "false";
    nodeElement.setAttribute("data-gpu-flow-projected-interaction", "true");
    const resizeHandle = document.createElement("div");
    resizeHandle.className =
      "section-resize-handle section-resize-handle-bottom-right";
    nodeElement.append(resizeHandle);
    canvas.append(nodeElement);
    document.body.append(canvas);
    const textureManager = createInteractionTextureManager();
    const requestFrame = vi.fn();
    const resolvePointerHandoffTarget = vi.fn(() => null);
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 1,
      requestFrame,
      resolvePointerHandoffTarget,
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    resizeHandle.dispatchEvent(
      createPointerEvent("pointerdown", {
        clientX: 25,
        clientY: 35,
        pointerId: 18,
      }),
    );

    expect(resolvePointerHandoffTarget).not.toHaveBeenCalled();
    expect(controller.getActiveNodeId()).toBe("node-a");
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 1,
      priority: "interactive",
      reason: "pointer",
      surfaceId: "node-a",
    });
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");

    detach();
    canvas.remove();
  });

  it("replays mousedown for controls that activate on mouse capture", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const editorShell = document.createElement("div");
    editorShell.dataset.gpuFlowActivation = "mousedown";
    editorShell.dataset.gpuFlowControl = "editor";
    nodeElement.append(editorShell);
    canvas.append(nodeElement);
    document.body.append(canvas);
    setRect(editorShell, 20, 30, 100, 24);
    const descriptor = createGpuNodeTargetDescriptor(nodeElement, editorShell);
    if (!descriptor) {
      throw new Error("Expected a handoff target descriptor");
    }
    const textureManager = createInteractionTextureManager();
    const mouseDowns: Array<{
      readonly clientX: number;
      readonly clientY: number;
    }> = [];
    editorShell.addEventListener("mousedown", (event) => {
      mouseDowns.push({
        clientX: event.clientX,
        clientY: event.clientY,
      });
    });
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 1,
      requestFrame: vi.fn(),
      resolvePointerHandoffTarget: () => ({
        descriptor,
        nodeId: "node-a",
      }),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    canvas.dispatchEvent(
      createPointerEvent("pointerdown", {
        clientX: 25,
        clientY: 35,
        pointerId: 11,
      }),
    );

    expect(mouseDowns).toEqual([
      {
        clientX: 25,
        clientY: 35,
      },
    ]);

    detach();
    canvas.remove();
  });

  it("hands off a first wheel event to a passive native scroll region", () => {
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
      throw new Error("Expected a wheel handoff target descriptor");
    }
    const textureManager = createInteractionTextureManager();
    const clearProjectedInteraction = vi.fn();
    const requestFrame = vi.fn();
    let frame = 0;
    const controller = createGpuNodeInteractionDirtyController({
      clearProjectedInteraction,
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => {
        frame += 1;
        return frame;
      },
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
    expect(clearProjectedInteraction).toHaveBeenCalledWith("node-a");
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

    detach();
    canvas.remove();
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

  it("keeps an interactive node active until its upload catches up", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const slider = document.createElement("input");
    slider.type = "range";
    nodeElement.append(slider);
    canvas.append(nodeElement);
    const textureManager = createInteractionTextureManager();
    const states: Array<{
      readonly activeNodeId: string | null;
    }> = [];
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 1,
      onStateChange: (state) => states.push(state),
      requestFrame: vi.fn(),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas);

    slider.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    document.dispatchEvent(new Event("pointermove", { bubbles: true }));
    controller.completeFrame({
      budgetExhausted: true,
      remainingDirtyNodeIds: ["node-a"],
      uploadedNodeIds: [],
    });

    expect(controller.getActiveNodeId()).toBe("node-a");
    expect(states.at(-1)).toEqual({
      activeNodeId: "node-a",
    });

    document.dispatchEvent(new Event("pointerup", { bubbles: true }));
    expect(controller.getActiveNodeId()).toBe("node-a");
    controller.completeFrame({
      budgetExhausted: false,
      remainingDirtyNodeIds: [],
      uploadedNodeIds: ["node-a"],
    });

    expect(controller.getActiveNodeId()).toBeNull();
    expect(textureManager.setSurfaceTexturePriority).toHaveBeenLastCalledWith(
      "node-a",
      "visible",
    );

    detach();
  });

  it("keeps focused text controls active after pointer release and restores on blur", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const input = document.createElement("input");
    input.type = "text";
    nodeElement.append(input);
    canvas.append(nodeElement);
    document.body.append(canvas);
    const textureManager = createInteractionTextureManager();
    const clearProjectedInteraction = vi.fn();
    const controller = createGpuNodeInteractionDirtyController({
      clearProjectedInteraction,
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 1,
      requestFrame: vi.fn(),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    input.focus();
    input.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    document.dispatchEvent(new Event("pointerup", { bubbles: true }));

    expect(document.activeElement).toBe(input);
    expect(controller.getActiveNodeId()).toBe("node-a");
    expect(clearProjectedInteraction).toHaveBeenCalledWith("node-a");

    expect(controller.getActiveNodeId()).toBe("node-a");

    input.blur();
    expect(controller.getActiveNodeId()).toBe("node-a");
    controller.completeFrame({
      budgetExhausted: false,
      remainingDirtyNodeIds: [],
      uploadedNodeIds: ["node-a"],
    });
    expect(controller.getActiveNodeId()).toBeNull();

    detach();
    canvas.remove();
  });

  it("does not let active scroll events cancel a focused control blur release", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const textarea = document.createElement("textarea");
    nodeElement.append(textarea);
    canvas.append(nodeElement);
    document.body.append(canvas);
    const textureManager = createInteractionTextureManager();
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 1,
      requestFrame: vi.fn(),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    textarea.focus();
    textarea.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    document.dispatchEvent(new Event("pointerup", { bubbles: true }));
    textarea.dispatchEvent(new Event("scroll", { bubbles: true }));

    expect(controller.getActiveNodeId()).toBe("node-a");

    textarea.blur();
    textarea.dispatchEvent(new Event("scroll", { bubbles: true }));

    expect(controller.getActiveNodeId()).toBe("node-a");
    controller.completeFrame({
      budgetExhausted: false,
      remainingDirtyNodeIds: [],
      uploadedNodeIds: ["node-a"],
    });
    expect(controller.getActiveNodeId()).toBeNull();

    detach();
    canvas.remove();
  });

  it("releases an input-only interaction once no pointer or focus owner remains", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const slider = document.createElement("input");
    slider.type = "range";
    nodeElement.append(slider);
    canvas.append(nodeElement);
    const textureManager = createInteractionTextureManager();
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 1,
      requestFrame: vi.fn(),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas);

    slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(controller.getActiveNodeId()).toBe("node-a");

    controller.completeFrame({
      budgetExhausted: false,
      remainingDirtyNodeIds: [],
      uploadedNodeIds: ["node-a"],
    });

    expect(controller.getActiveNodeId()).toBeNull();

    detach();
  });

  it("does not re-dirty an active pointer control during upload completion", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const switchInput = document.createElement("button");
    switchInput.setAttribute("role", "switch");
    nodeElement.append(switchInput);
    canvas.append(nodeElement);
    const textureManager = createInteractionTextureManager();
    const requestFrame = vi.fn();
    let frame = 0;
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => {
        frame += 1;
        return frame;
      },
      requestFrame,
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas);

    switchInput.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    controller.completeFrame({
      budgetExhausted: false,
      remainingDirtyNodeIds: [],
      uploadedNodeIds: ["node-a"],
    });

    expect(textureManager.markSurfaceTextureDirty).toHaveBeenLastCalledWith({
      content: true,
      frame: 1,
      surfaceId: "node-a",
      priority: "interactive",
      reason: "pointer",
    });
    expect(requestFrame).toHaveBeenLastCalledWith("texture-upload");
    expect(controller.getActiveNodeId()).toBe("node-a");
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledTimes(1);

    detach();
  });

  it("keeps a released pointer interaction active until an upload frame includes it", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const switchInput = document.createElement("button");
    switchInput.setAttribute("role", "switch");
    nodeElement.append(switchInput);
    canvas.append(nodeElement);
    const textureManager = createInteractionTextureManager();
    const requestFrame = vi.fn();
    let frame = 0;
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => {
        frame += 1;
        return frame;
      },
      requestFrame,
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas);

    switchInput.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    document.dispatchEvent(new Event("pointerup", { bubbles: true }));
    expect(controller.getActiveNodeId()).toBe("node-a");
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledTimes(2);
    expect(requestFrame).toHaveBeenCalledTimes(2);

    controller.completeFrame({
      budgetExhausted: false,
      remainingDirtyNodeIds: ["node-a"],
      uploadedNodeIds: [],
    });
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledTimes(2);
    expect(controller.getActiveNodeId()).toBe("node-a");
    controller.completeFrame({
      budgetExhausted: false,
      remainingDirtyNodeIds: [],
      uploadedNodeIds: ["node-a"],
    });
    expect(controller.getActiveNodeId()).toBeNull();

    detach();
  });

  it("does not dirty focused nodes for document pointer moves without an active pointer interaction", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const input = document.createElement("input");
    nodeElement.append(input);
    canvas.append(nodeElement);
    const textureManager = createInteractionTextureManager();
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 4,
      requestFrame: vi.fn(),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    document.dispatchEvent(new Event("pointermove", { bubbles: true }));

    expect(controller.getActiveNodeId()).toBe("node-a");
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledTimes(1);
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 4,
      surfaceId: "node-a",
      priority: "interactive",
      reason: "focus",
    });

    detach();
  });

  it("marks focused selection changes for the owning node", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const input = document.createElement("input");
    nodeElement.append(input);
    canvas.append(nodeElement);
    document.body.append(canvas);
    const textureManager = createInteractionTextureManager();
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 12,
      requestFrame: vi.fn(),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    input.focus();
    document.dispatchEvent(new Event("selectionchange"));

    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 12,
      surfaceId: "node-a",
      priority: "interactive",
      reason: "selection",
    });

    detach();
    canvas.remove();
  });

  it("marks custom CodeMirror and terminal dirty events for only the owning node", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    nodeElement.append(editor);
    canvas.append(nodeElement);
    const textureManager = createInteractionTextureManager();
    const requestFrame = vi.fn();
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 21,
      requestFrame,
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas);

    dispatchGpuFlowNodeDirtyEvent(editor, {
      priority: "visible",
      reason: "input",
    });

    expect(controller.getActiveNodeId()).toBeNull();
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 21,
      surfaceId: "node-a",
      priority: "visible",
      reason: "input",
    });
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");

    dispatchGpuFlowNodeDirtyEvent(editor, {
      priority: "interactive",
      reason: "selection",
    });

    expect(controller.getActiveNodeId()).toBe("node-a");
    expect(textureManager.setSurfaceTexturePriority).toHaveBeenCalledWith(
      "node-a",
      "interactive",
    );
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenLastCalledWith({
      content: true,
      frame: 21,
      surfaceId: "node-a",
      priority: "interactive",
      reason: "selection",
    });

    detach();
  });

  it("keeps custom dirty events from passive capture sources", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    nodeElement.classList.add("setta-gpu-flow__html-source");
    nodeElement.dataset.gpuFlowHtmlSource = "true";
    nodeElement.dataset.gpuFlowInteractive = "false";
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    nodeElement.append(editor);
    canvas.append(nodeElement);
    const textureManager = createInteractionTextureManager();
    const requestFrame = vi.fn();
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 24,
      requestFrame,
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas);

    dispatchGpuFlowNodeDirtyEvent(editor, {
      priority: "visible",
      reason: "input",
    });

    expect(controller.getActiveNodeId()).toBeNull();
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 24,
      priority: "visible",
      reason: "input",
      surfaceId: "node-a",
    });
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");

    detach();
  });

  it("captures transition frames for an animated source before releasing it", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const switchThumb = document.createElement("span");
    switchThumb.dataset.gpuFlowControl = "animated-switch-thumb";
    nodeElement.append(switchThumb);
    canvas.append(nodeElement);
    const textureManager = createInteractionTextureManager();
    const requestFrame = vi.fn();
    const clock = createAnimationClock();
    let frame = 0;
    const controller = createGpuNodeInteractionDirtyController({
      cancelAnimationFrame: clock.cancelAnimationFrame,
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => {
        frame += 1;
        return frame;
      },
      now: clock.now,
      requestAnimationFrame: clock.requestAnimationFrame,
      requestFrame,
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas);

    switchThumb.dispatchEvent(new Event("transitionstart", { bubbles: true }));
    clock.flushNextFrame();
    switchThumb.dispatchEvent(new Event("transitionend", { bubbles: true }));
    clock.flushNextFrame();

    expect(controller.getActiveNodeId()).toBe("node-a");
    expect(textureManager.setSurfaceTexturePriority).toHaveBeenLastCalledWith(
      "node-a",
      "interactive",
    );
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledTimes(4);
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenNthCalledWith(1, {
      content: true,
      frame: 1,
      surfaceId: "node-a",
      priority: "interactive",
      reason: "animation",
    });
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenNthCalledWith(4, {
      content: true,
      frame: 4,
      surfaceId: "node-a",
      priority: "interactive",
      reason: "animation",
    });
    expect(requestFrame).not.toHaveBeenCalled();

    controller.completeFrame({
      budgetExhausted: false,
      remainingDirtyNodeIds: [],
      uploadedNodeIds: ["node-a"],
    });

    expect(controller.getActiveNodeId()).toBeNull();
    expect(textureManager.setSurfaceTexturePriority).toHaveBeenLastCalledWith(
      "node-a",
      "visible",
    );

    detach();
  });

  it("forwards animation target rects to tiled texture dirty ownership", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const switchThumb = document.createElement("span");
    switchThumb.dataset.gpuFlowControl = "animated-switch-thumb";
    nodeElement.append(switchThumb);
    canvas.append(nodeElement);
    setRect(nodeElement, 100, 200, 320, 240);
    setRect(switchThumb, 140, 260, 36, 20);
    const textureManager = createInteractionTextureManager();
    let frame = 0;
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => {
        frame += 1;
        return frame;
      },
      requestFrame: vi.fn(),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas);

    switchThumb.dispatchEvent(new Event("transitionstart", { bubbles: true }));

    expect(textureManager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 1,
      priority: "interactive",
      reason: "animation",
      sourceRect: {
        height: 20,
        width: 36,
        x: 40,
        y: 60,
      },
      surfaceId: "node-a",
    });

    detach();
  });

  it("starts animation capture from source-owned animated dirty events", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    nodeElement.append(editor);
    canvas.append(nodeElement);
    const textureManager = createInteractionTextureManager();
    const clock = createAnimationClock();
    let frame = 0;
    const requestFrame = vi.fn();
    const controller = createGpuNodeInteractionDirtyController({
      cancelAnimationFrame: clock.cancelAnimationFrame,
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => {
        frame += 1;
        return frame;
      },
      now: clock.now,
      requestAnimationFrame: clock.requestAnimationFrame,
      requestFrame,
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas);

    dispatchGpuFlowNodeDirtyEvent(editor, {
      animated: true,
      priority: "visible",
      reason: "input",
    });
    clock.flushNextFrame();

    expect(controller.getActiveNodeId()).toBe("node-a");
    expect(textureManager.setSurfaceTexturePriority).toHaveBeenCalledWith(
      "node-a",
      "interactive",
    );
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenNthCalledWith(1, {
      content: true,
      frame: 1,
      surfaceId: "node-a",
      priority: "interactive",
      reason: "input",
    });
    expect(textureManager.markSurfaceTextureDirty).toHaveBeenNthCalledWith(2, {
      content: true,
      frame: 2,
      surfaceId: "node-a",
      priority: "interactive",
      reason: "input",
    });
    expect(requestFrame).not.toHaveBeenCalled();

    detach();
  });

  it("does not reopen a released interactive node for visible custom dirty events", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    nodeElement.append(editor);
    canvas.append(nodeElement);
    const textureManager = createInteractionTextureManager();
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map([["node-a", nodeElement]]),
      getFrame: () => 33,
      requestFrame: vi.fn(),
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas);

    dispatchGpuFlowNodeDirtyEvent(editor, {
      priority: "interactive",
      reason: "input",
    });
    editor.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    dispatchGpuFlowNodeDirtyEvent(editor, {
      priority: "visible",
      reason: "focus",
    });
    controller.completeFrame({
      budgetExhausted: false,
      remainingDirtyNodeIds: [],
      uploadedNodeIds: ["node-a"],
    });

    expect(controller.getActiveNodeId()).toBeNull();
    expect(textureManager.setSurfaceTexturePriority).toHaveBeenLastCalledWith(
      "node-a",
      "visible",
    );

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

function createAnimationClock() {
  let nowMs = 0;
  let nextFrameId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    cancelAnimationFrame: vi.fn((frameId: number) => {
      callbacks.delete(frameId);
    }),
    flushNextFrame() {
      const [frameId, callback] = callbacks.entries().next().value ?? [];
      if (!frameId || !callback) {
        throw new Error("Expected a pending animation frame.");
      }
      callbacks.delete(frameId);
      nowMs += 16;
      callback(nowMs);
    },
    now: () => nowMs,
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      callbacks.set(frameId, callback);
      return frameId;
    }),
  };
}

function createPointerEvent(
  type: string,
  init: {
    readonly buttons?: number | undefined;
    readonly clientX: number;
    readonly clientY: number;
    readonly pointerId: number;
  },
): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  }) as PointerEvent;
  Object.defineProperties(event, {
    button: { value: 0 },
    buttons: { value: init.buttons ?? (type === "pointerup" ? 0 : 1) },
    height: { value: 1 },
    isPrimary: { value: true },
    pointerId: { value: init.pointerId },
    pointerType: { value: "mouse" },
    pressure: { value: type === "pointerup" ? 0 : 0.5 },
    tangentialPressure: { value: 0 },
    tiltX: { value: 0 },
    tiltY: { value: 0 },
    twist: { value: 0 },
    width: { value: 1 },
  });
  return event;
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
