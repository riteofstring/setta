/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { markHtmlSurfaceFramePaintDirty } from "./frame";
import { createGpuPaintNodeElement } from "./frame.test-helper";

describe("HTML surface frame paint dirty tracking", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not dirty visible nodes when a paint event omits changed elements", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const manager = {
      markSurfaceTextureDirty: vi.fn(() => true),
      markSurfacesPainted: vi.fn(),
    };

    const dirtyNodeIds = markHtmlSurfaceFramePaintDirty({
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 8,
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual([]);
    expect(manager.markSurfacesPainted).toHaveBeenCalledWith([]);
    expect(manager.markSurfaceTextureDirty).not.toHaveBeenCalled();
  });

  it("ignores unrelated and canvas-level paint changes", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const canvas = document.createElement("canvas");
    const unrelated = document.createElement("div");
    canvas.dataset.gpuFlowSurface = "true";
    canvas.append(nodeElement);
    const manager = {
      markSurfaceTextureDirty: vi.fn(() => true),
      markSurfacesPainted: vi.fn(),
    };

    const dirtyNodeIds = markHtmlSurfaceFramePaintDirty({
      changedElements: [unrelated, canvas],
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 10,
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual([]);
    expect(manager.markSurfacesPainted).toHaveBeenCalledWith([]);
    expect(manager.markSurfaceTextureDirty).not.toHaveBeenCalled();
  });
});
