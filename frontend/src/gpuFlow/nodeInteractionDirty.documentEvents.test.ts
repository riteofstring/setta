/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { dispatchGpuFlowNodeDirtyEvent } from "./nodeDirtyEvents";
import { createGpuNodeInteractionDirtyController } from "./nodeInteractionDirty";
import {
  createInteractionTextureManager,
  createNodeElement,
} from "./nodeInteractionDirty.testHelpers";

describe("gpu node interaction dirty tracking document events", () => {
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
});
