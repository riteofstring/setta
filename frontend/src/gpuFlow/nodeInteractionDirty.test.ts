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
    expect(textureManager.setNodeTexturePriority).toHaveBeenCalledWith(
      "node-a",
      "interactive",
    );
    expect(textureManager.markNodeTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 1,
      nodeId: "node-a",
      priority: "interactive",
      reason: "input",
    });
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
    expect(onStateChange).toHaveBeenCalledWith({
      activeNodeId: "node-a",
    });

    detach();
  });

  it("hands off a canvas-origin pointerdown to the activated live control", async () => {
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
    const activatePointerHandoffNode = vi.fn(() => nodeElement);
    const pointerDowns: boolean[] = [];
    const mouseDowns: boolean[] = [];
    const clicks: boolean[] = [];
    switchButton.addEventListener("pointerdown", () => {
      pointerDowns.push(activatePointerHandoffNode.mock.calls.length > 0);
    });
    switchButton.addEventListener("mousedown", () => {
      mouseDowns.push(true);
    });
    switchButton.addEventListener("click", () => {
      clicks.push(true);
    });
    let frame = 0;
    const controller = createGpuNodeInteractionDirtyController({
      activatePointerHandoffNode,
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
    expect(activatePointerHandoffNode).toHaveBeenCalledWith("node-a");
    expect(pointerDowns).toEqual([true]);
    expect(mouseDowns).toEqual([]);
    expect(controller.getActiveNodeId()).toBe("node-a");
    expect(textureManager.markNodeTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 1,
      nodeId: "node-a",
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
    const activatePointerHandoffNode = vi.fn(() => nodeElement);
    const clicks: boolean[] = [];
    switchButton.addEventListener("click", () => {
      clicks.push(true);
    });
    let frame = 0;
    const controller = createGpuNodeInteractionDirtyController({
      activatePointerHandoffNode,
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
    expect(activatePointerHandoffNode).toHaveBeenCalledWith("node-a");
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
    const activatePointerHandoffNode = vi.fn(() => nodeElement);
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
      activatePointerHandoffNode,
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
    expect(textureManager.markNodeTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 9,
      nodeId: "node-a",
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

    expect(textureManager.markNodeTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 10,
      nodeId: "node-a",
      priority: "visible",
      reason: "scroll",
      requestPaint: false,
    });

    detach();
  });

  it("keeps an interactive node live until its upload catches up", () => {
    vi.useFakeTimers();
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
      activeSettleDelayMs: 100,
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

    expect(controller.getLiveNodeId()).toBe("node-a");
    expect(states.at(-1)).toEqual({
      activeNodeId: "node-a",
    });

    document.dispatchEvent(new Event("pointerup", { bubbles: true }));
    expect(controller.getLiveNodeId()).toBe("node-a");
    vi.advanceTimersByTime(99);
    expect(controller.getLiveNodeId()).toBe("node-a");
    vi.advanceTimersByTime(1);
    expect(controller.getLiveNodeId()).toBeNull();
    controller.completeFrame({
      budgetExhausted: false,
      remainingDirtyNodeIds: [],
      uploadedNodeIds: ["node-a"],
    });

    expect(controller.getActiveNodeId()).toBeNull();
    expect(textureManager.setNodeTexturePriority).toHaveBeenLastCalledWith(
      "node-a",
      "visible",
    );

    detach();
  });

  it("keeps focused text controls live after pointer release until blur", () => {
    vi.useFakeTimers();
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const input = document.createElement("input");
    input.type = "text";
    nodeElement.append(input);
    canvas.append(nodeElement);
    document.body.append(canvas);
    const textureManager = createInteractionTextureManager();
    const controller = createGpuNodeInteractionDirtyController({
      activeSettleDelayMs: 50,
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
    expect(controller.getLiveNodeId()).toBe("node-a");

    vi.advanceTimersByTime(500);

    expect(controller.getActiveNodeId()).toBe("node-a");
    expect(controller.getLiveNodeId()).toBe("node-a");

    input.blur();
    expect(controller.getLiveNodeId()).toBe("node-a");
    vi.advanceTimersByTime(50);

    expect(controller.getLiveNodeId()).toBeNull();
    controller.completeFrame({
      budgetExhausted: false,
      remainingDirtyNodeIds: [],
      uploadedNodeIds: ["node-a"],
    });
    expect(controller.getActiveNodeId()).toBeNull();

    detach();
    canvas.remove();
  });

  it("does not re-dirty an active control during the settle delay", () => {
    vi.useFakeTimers();
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
      activeSettleDelayMs: 50,
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

    expect(textureManager.markNodeTextureDirty).toHaveBeenLastCalledWith({
      content: true,
      frame: 1,
      nodeId: "node-a",
      priority: "interactive",
      reason: "pointer",
    });
    expect(requestFrame).toHaveBeenLastCalledWith("texture-upload");
    expect(controller.getActiveNodeId()).toBe("node-a");
    expect(textureManager.markNodeTextureDirty).toHaveBeenCalledTimes(1);

    detach();
  });

  it("requests one frame when active settle expires without marking dirty again", () => {
    vi.useFakeTimers();
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
      activeSettleDelayMs: 50,
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
    expect(controller.getLiveNodeId()).toBe("node-a");
    expect(textureManager.markNodeTextureDirty).toHaveBeenCalledTimes(2);
    expect(requestFrame).toHaveBeenCalledTimes(2);

    controller.completeFrame({
      budgetExhausted: false,
      remainingDirtyNodeIds: ["node-a"],
      uploadedNodeIds: [],
    });
    expect(textureManager.markNodeTextureDirty).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(50);

    expect(controller.getLiveNodeId()).toBeNull();
    expect(textureManager.markNodeTextureDirty).toHaveBeenCalledTimes(2);
    expect(requestFrame).toHaveBeenCalledTimes(3);
    expect(requestFrame).toHaveBeenLastCalledWith("texture-upload");

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
    expect(textureManager.markNodeTextureDirty).toHaveBeenCalledTimes(1);
    expect(textureManager.markNodeTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 4,
      nodeId: "node-a",
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

    expect(textureManager.markNodeTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 12,
      nodeId: "node-a",
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
    expect(textureManager.markNodeTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 21,
      nodeId: "node-a",
      priority: "visible",
      reason: "input",
    });
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");

    dispatchGpuFlowNodeDirtyEvent(editor, {
      priority: "interactive",
      reason: "selection",
    });

    expect(controller.getActiveNodeId()).toBe("node-a");
    expect(textureManager.setNodeTexturePriority).toHaveBeenCalledWith(
      "node-a",
      "interactive",
    );
    expect(textureManager.markNodeTextureDirty).toHaveBeenLastCalledWith({
      content: true,
      frame: 21,
      nodeId: "node-a",
      priority: "interactive",
      reason: "selection",
    });

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
      activeSettleDelayMs: 0,
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
    expect(textureManager.setNodeTexturePriority).toHaveBeenLastCalledWith(
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
    markNodeTextureDirty: vi.fn(),
    setNodeTexturePriority: vi.fn(),
  };
}

function createPointerEvent(
  type: string,
  init: {
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
    buttons: { value: type === "pointerup" ? 0 : 1 },
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
