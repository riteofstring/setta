/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import {
  createGpuNodeInteractionDirtyController,
  findGpuNodeIdForEventTarget,
  isGpuNodeInteractiveEventTarget,
} from "./nodeInteractionDirty";

describe("gpu node interaction dirty tracking", () => {
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
      overlayNodeId: null,
    });

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
    expect(textureManager.markNodeTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 9,
      nodeId: "node-a",
      priority: "visible",
      reason: "scroll",
    });

    detach();
  });

  it("keeps an interactive node overlay-active until its upload catches up", () => {
    const canvas = document.createElement("canvas");
    const nodeElement = createNodeElement("node-a");
    const slider = document.createElement("input");
    slider.type = "range";
    nodeElement.append(slider);
    canvas.append(nodeElement);
    const textureManager = createInteractionTextureManager();
    const states: Array<{
      readonly activeNodeId: string | null;
      readonly overlayNodeId: string | null;
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
    canvas.dispatchEvent(new Event("pointermove", { bubbles: true }));
    controller.completeFrame({
      budgetExhausted: true,
      remainingDirtyNodeIds: ["node-a"],
      uploadedNodeIds: [],
    });

    expect(controller.getOverlayNodeId()).toBe("node-a");
    expect(states.at(-1)).toEqual({
      activeNodeId: "node-a",
      overlayNodeId: "node-a",
    });

    canvas.dispatchEvent(new Event("pointerup", { bubbles: true }));
    controller.completeFrame({
      budgetExhausted: false,
      remainingDirtyNodeIds: [],
      uploadedNodeIds: ["node-a"],
    });

    expect(controller.getActiveNodeId()).toBeNull();
    expect(controller.getOverlayNodeId()).toBeNull();
    expect(textureManager.setNodeTexturePriority).toHaveBeenLastCalledWith(
      "node-a",
      "visible",
    );

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
