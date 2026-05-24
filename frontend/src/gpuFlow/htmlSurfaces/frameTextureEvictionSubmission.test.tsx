/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { renderHtmlSurfaceFrame } from "./frame";
import {
  canvasSize,
  createFrameTextureManager,
  node,
} from "./frame.test-helper";

describe("HTML surface frame texture eviction submission", () => {
  it("defers texture eviction until submitted for deferred canvas frames", () => {
    const manager = createFrameTextureManager();
    const renderResult = {
      drawnEdgeIds: [],
      drawnSurfaceIds: [],
      edgeVertexCount: 0,
      vertexCount: 0,
    };
    const renderer = {
      prepare: vi.fn(() => ({
        result: renderResult,
        submit: vi.fn(),
      })),
      render: vi.fn(() => renderResult),
    };

    const frame = renderHtmlSurfaceFrame({
      activeNodeId: "node-a",
      canvasSize: canvasSize(),
      canvasSubmissionMode: "deferred",
      elementByNodeId: new Map([["node-a", document.createElement("div")]]),
      frame: 1,
      nodes: [node("node-a", 10, 20, 100, 50, 0)],
      protectedTextureSurfaceIds: ["snapshot-a"],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(manager.evictSurfaceTextures).not.toHaveBeenCalled();
    expect(manager.prepareSurfaceTextureEviction).toHaveBeenCalledTimes(1);
    expect(manager.prepareSurfaceTextureEviction).toHaveBeenCalledWith({
      protectedSurfaceIds: expect.any(Set),
      reason: "html-surface-frame-pending-presentation",
      visibleSurfaceIds: expect.any(Set),
    });
    expect(frame.textureEvictionSubmission).not.toBeNull();
    expect(frame.evictedTextureBytes).toBe(0);
    expect(frame.evictedTextureNodeIds).toEqual([]);

    frame.textureEvictionSubmission?.submit();

    expect(manager.evictSurfaceTextures).toHaveBeenCalledTimes(1);
    expect(manager.evictSurfaceTextures).toHaveBeenCalledWith({
      protectedSurfaceIds: expect.any(Set),
      reason: "html-surface-frame",
      visibleSurfaceIds: expect.any(Set),
    });
    const evictionInput = manager.evictSurfaceTextures.mock.calls[0]?.[0];
    expect([...(evictionInput?.protectedSurfaceIds ?? [])]).toEqual([
      "node-a",
      "snapshot-a",
    ]);
  });

  it("rejects duplicate deferred texture eviction submissions", () => {
    const manager = createFrameTextureManager();
    const renderResult = {
      drawnEdgeIds: [],
      drawnSurfaceIds: [],
      edgeVertexCount: 0,
      vertexCount: 0,
    };
    const renderer = {
      prepare: vi.fn(() => ({
        result: renderResult,
        submit: vi.fn(),
      })),
      render: vi.fn(() => renderResult),
    };

    const frame = renderHtmlSurfaceFrame({
      activeNodeId: "node-a",
      canvasSize: canvasSize(),
      canvasSubmissionMode: "deferred",
      elementByNodeId: new Map([["node-a", document.createElement("div")]]),
      frame: 1,
      nodes: [node("node-a", 10, 20, 100, 50, 0)],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    frame.textureEvictionSubmission?.submit();

    expect(() => frame.textureEvictionSubmission?.submit()).toThrow(
      "HTML surface texture eviction submission cannot be submitted more than once.",
    );
  });
});
