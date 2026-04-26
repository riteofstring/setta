/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import {
  CanvasFlowHtmlTextureCache,
  estimateCanvasFlowTextureBytes,
} from "./canvasFlowHtmlTextureCache";
import type {
  CanvasFlowNodeDrawRecord,
  CanvasFlowWebglRenderingContext,
} from "./canvasFlowTypes";

describe("CanvasFlowHtmlTextureCache", () => {
  it("uploads dirty visible entries once and reuses clean textures", () => {
    const { gl } = createMockGl();
    const cache = new CanvasFlowHtmlTextureCache({ gl });
    const element = document.createElement("div");
    const node = createNode("a", 100, 50);

    const firstStats = cache.uploadDirtyVisible({
      frameNumber: 1,
      resolveElement: () => element,
      visibleNodeIds: new Set(["a"]),
      visibleNodes: [node],
    });
    const secondStats = cache.uploadDirtyVisible({
      frameNumber: 2,
      resolveElement: () => element,
      visibleNodeIds: new Set(["a"]),
      visibleNodes: [node],
    });

    expect(firstStats.uploadCount).toBe(1);
    expect(firstStats.createdEntries).toBe(1);
    expect(firstStats.estimatedBytes).toBe(20_000);
    expect(secondStats.uploadCount).toBe(0);
    expect(gl.texElementImage2D).toHaveBeenCalledTimes(1);
    expect(cache.getEntry("a")?.dirty).toBe(false);

    cache.markDirty(new Set(["a"]));
    const thirdStats = cache.uploadDirtyVisible({
      frameNumber: 3,
      resolveElement: () => element,
      visibleNodeIds: new Set(["a"]),
      visibleNodes: [node],
    });

    expect(thirdStats.uploadCount).toBe(1);
    expect(gl.texElementImage2D).toHaveBeenCalledTimes(2);
  });

  it("recreates entries when node dimensions change", () => {
    const { gl, textures } = createMockGl();
    const cache = new CanvasFlowHtmlTextureCache({ gl });
    const element = document.createElement("div");

    cache.uploadDirtyVisible({
      frameNumber: 1,
      resolveElement: () => element,
      visibleNodeIds: new Set(["a"]),
      visibleNodes: [createNode("a", 10, 10)],
    });
    const stats = cache.uploadDirtyVisible({
      frameNumber: 2,
      resolveElement: () => element,
      visibleNodeIds: new Set(["a"]),
      visibleNodes: [createNode("a", 20, 10)],
    });

    expect(stats.resizedEntries).toBe(1);
    expect(stats.uploadCount).toBe(1);
    expect(cache.getEntry("a")?.estimatedBytes).toBe(800);
    expect(gl.deleteTexture).toHaveBeenCalledWith(textures[0]);
  });

  it("evicts least recently used non-visible entries over the memory cap", () => {
    const { gl, textures } = createMockGl();
    const cache = new CanvasFlowHtmlTextureCache({
      gl,
      memoryLimitBytes: 800,
    });
    const element = document.createElement("div");

    cache.uploadDirtyVisible({
      frameNumber: 1,
      resolveElement: () => element,
      visibleNodeIds: new Set(["a"]),
      visibleNodes: [createNode("a", 10, 10)],
    });
    cache.uploadDirtyVisible({
      frameNumber: 2,
      resolveElement: () => element,
      visibleNodeIds: new Set(["b"]),
      visibleNodes: [createNode("b", 10, 10)],
    });
    const stats = cache.uploadDirtyVisible({
      frameNumber: 3,
      resolveElement: () => element,
      visibleNodeIds: new Set(["c"]),
      visibleNodes: [createNode("c", 10, 10)],
    });

    expect(stats.evictions).toBe(1);
    expect(cache.getEntry("a")).toBeNull();
    expect(cache.getEntry("b")).not.toBeNull();
    expect(cache.getEntry("c")).not.toBeNull();
    expect(gl.deleteTexture).toHaveBeenCalledWith(textures[0]);
  });

  it("releases unmounted entries deterministically", () => {
    const { gl, textures } = createMockGl();
    const cache = new CanvasFlowHtmlTextureCache({ gl });
    const element = document.createElement("div");

    cache.uploadDirtyVisible({
      frameNumber: 1,
      resolveElement: () => element,
      visibleNodeIds: new Set(["a", "b"]),
      visibleNodes: [createNode("a", 10, 10), createNode("b", 10, 10)],
    });

    expect(cache.releaseUnmounted(new Set(["b"]))).toBe(1);
    expect(cache.getEntry("a")).toBeNull();
    expect(cache.getEntry("b")).not.toBeNull();
    expect(gl.deleteTexture).toHaveBeenCalledWith(textures[0]);
  });

  it("estimates texture bytes from CSS dimensions", () => {
    expect(estimateCanvasFlowTextureBytes(createNode("a", 10.2, 4.1))).toBe(
      220,
    );
  });
});

function createNode(
  id: string,
  width: number,
  height: number,
): CanvasFlowNodeDrawRecord {
  return {
    height,
    id,
    width,
    x: 0,
    y: 0,
    zIndex: 0,
  };
}

function createMockGl() {
  const textures: WebGLTexture[] = [];
  const gl = {
    CLAMP_TO_EDGE: 33_071,
    LINEAR: 9_729,
    RGBA: 6_408,
    TEXTURE_2D: 3_553,
    TEXTURE_MAG_FILTER: 10_240,
    TEXTURE_MIN_FILTER: 10_241,
    TEXTURE_WRAP_S: 10_242,
    TEXTURE_WRAP_T: 10_243,
    UNSIGNED_BYTE: 5_121,
    bindTexture: vi.fn(),
    createTexture: vi.fn(() => {
      const texture = { id: textures.length + 1 } as unknown as WebGLTexture;
      textures.push(texture);
      return texture;
    }),
    deleteTexture: vi.fn(),
    texElementImage2D: vi.fn(),
    texParameteri: vi.fn(),
  } as unknown as CanvasFlowWebglRenderingContext;
  return { gl, textures };
}
