/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import {
  createGpuNodeDomTransformSyncCache,
  renderHtmlSurfaceFrame,
} from "./frame";
import {
  canvasSize,
  createFrameRenderer,
  createGpuTextureMock,
  installTextureUsage,
  node,
} from "./frame.test-helper";
import { HtmlSurfaceTextureManager } from "./textures";

describe("HTML surface frame DOM transform submission", () => {
  it("prepares DOM transforms without mutating source hosts until submitted", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);
    const renderer = createFrameRenderer();
    const element = document.createElement("div");
    const elements = new Map([["node-a", element]]);
    const nodes = [node("node-a", 10, 20, 100, 50, 0)];
    const domTransformCache = createGpuNodeDomTransformSyncCache();

    const frame = renderHtmlSurfaceFrame({
      canvasSize: canvasSize(),
      domTransformCache,
      domTransformSubmissionMode: "deferred",
      elementByNodeId: elements,
      frame: 1,
      nodes,
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(frame.domTransformUpdatedNodeIds).toEqual(["node-a"]);
    expect(frame.domTransformSubmission).not.toBeNull();
    expect(element.style.transform).toBe("");
    expect(element.style.width).toBe("");
    expect(domTransformCache.previousVisibleNodeIds.size).toBe(0);

    frame.domTransformSubmission?.submit();

    expect(element.style.transform).toBe("translate(0px, 0px) scale(1)");
    expect(element.style.width).toBe("100px");
    expect([...domTransformCache.previousVisibleNodeIds]).toEqual(["node-a"]);
  });

  it("defaults DOM transform submission to deferred with deferred canvas submission", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);
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
    const element = document.createElement("div");
    const elements = new Map([["node-a", element]]);
    const domTransformCache = createGpuNodeDomTransformSyncCache();

    const frame = renderHtmlSurfaceFrame({
      canvasSize: canvasSize(),
      canvasSubmissionMode: "deferred",
      domTransformCache,
      elementByNodeId: elements,
      frame: 1,
      nodes: [node("node-a", 10, 20, 100, 50, 0)],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(renderer.prepare).toHaveBeenCalledTimes(1);
    expect(frame.canvasSubmission).not.toBeNull();
    expect(frame.domTransformSubmission).not.toBeNull();
    expect(element.style.transform).toBe("");
    expect(domTransformCache.previousVisibleNodeIds.size).toBe(0);

    frame.domTransformSubmission?.submit();

    expect(element.style.transform).toBe("translate(0px, 0px) scale(1)");
    expect([...domTransformCache.previousVisibleNodeIds]).toEqual(["node-a"]);
  });
});
