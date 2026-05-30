/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { createGpuNodeTargetDescriptor } from "./activeNodeTargeting";
import { createGpuNodeInteractionDirtyController } from "./nodeInteractionDirty";

describe("gpu node pointer handoff dirty tracking", () => {
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
