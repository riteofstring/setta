/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { markHtmlSurfaceFramePaintDirty } from "./frame";
import { createGpuPaintNodeElement } from "./frame.test-helper";
import { HTML_SURFACE_EXPLICIT_DIRTY_SOURCE_ATTRIBUTE } from "./sourceDom";

describe("HTML surface frame paint dirty helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("ignores direct node-wrapper paints caused by viewport transform sync", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const child = document.createElement("input");
    nodeElement.append(child);
    const manager = {
      markSurfaceTextureDirty: vi.fn(() => true),
      markSurfacesPainted: vi.fn(),
    };

    const dirtyNodeIds = markHtmlSurfaceFramePaintDirty({
      changedElements: [nodeElement, child],
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 9,
      ignoreDirectNodeIds: new Set(["node-a"]),
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual(["node-a"]);
    expect(manager.markSurfacesPainted).toHaveBeenCalledWith(["node-a"]);
    expect(manager.markSurfaceTextureDirty).toHaveBeenCalledTimes(1);
    expect(manager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 9,
      reason: "paint",
      requestPaint: false,
      surfaceId: "node-a",
    });
  });

  it("does not dirty transform-only node-wrapper paints", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const manager = {
      markSurfaceTextureDirty: vi.fn(() => true),
      markSurfacesPainted: vi.fn(),
    };

    const dirtyNodeIds = markHtmlSurfaceFramePaintDirty({
      changedElements: [nodeElement],
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 9,
      ignoreDirectNodeIds: ["node-a"],
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual([]);
    expect(manager.markSurfacesPainted).toHaveBeenCalledWith(["node-a"]);
    expect(manager.markSurfaceTextureDirty).not.toHaveBeenCalled();
  });

  it("tracks explicit dirty source paints without marking them dirty again", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    nodeElement.setAttribute(
      HTML_SURFACE_EXPLICIT_DIRTY_SOURCE_ATTRIBUTE,
      "true",
    );
    const manager = {
      markSurfaceTextureDirty: vi.fn(() => true),
      markSurfacesPainted: vi.fn(),
    };

    const dirtyNodeIds = markHtmlSurfaceFramePaintDirty({
      changedElements: [nodeElement],
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 9,
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual([]);
    expect(manager.markSurfacesPainted).toHaveBeenCalledWith(["node-a"]);
    expect(manager.markSurfaceTextureDirty).not.toHaveBeenCalled();
  });

  it("treats paint events without changed elements as painting registered sources", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const manager = {
      markSurfaceTextureDirty: vi.fn(() => true),
      markSurfacesPainted: vi.fn(),
    };

    const dirtyNodeIds = markHtmlSurfaceFramePaintDirty({
      changedElements: [],
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 9,
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual([]);
    expect(manager.markSurfacesPainted).toHaveBeenCalledWith(
      expect.any(Object),
    );
    expect([...manager.markSurfacesPainted.mock.calls[0]![0]]).toEqual([
      "node-a",
    ]);
    expect(manager.markSurfaceTextureDirty).not.toHaveBeenCalled();
  });

  it("uses the narrow ancestor fallback only for a single registered node subtree", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const wrapper = document.createElement("div");
    wrapper.append(nodeElement);
    const manager = {
      markSurfaceTextureDirty: vi.fn(() => true),
      markSurfacesPainted: vi.fn(),
    };

    const dirtyNodeIds = markHtmlSurfaceFramePaintDirty({
      changedElements: [wrapper],
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 9,
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual(["node-a"]);
    expect(manager.markSurfacesPainted).toHaveBeenCalledWith(["node-a"]);
    expect(manager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 9,
      reason: "paint",
      requestPaint: false,
      surfaceId: "node-a",
    });
  });
});
