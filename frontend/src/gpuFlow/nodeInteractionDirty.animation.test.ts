/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { dispatchGpuFlowNodeDirtyEvent } from "./nodeDirtyEvents";
import { createGpuNodeInteractionDirtyController } from "./nodeInteractionDirty";
import {
  createAnimationClock,
  createInteractionTextureManager,
  createNodeElement,
  setRect,
} from "./nodeInteractionDirty.testHelpers";

describe("gpu node interaction animation dirty tracking", () => {
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
