import { describe, expect, it } from "vitest";
import type { CanvasFlowNodeTextureEntry } from "./canvasFlowTypes";
import { getCanvasFlowTextureDrawState } from "./canvasFlowWebglRenderer";

describe("getCanvasFlowTextureDrawState", () => {
  it("draws clean cached textures as cache hits", () => {
    const entry = createTextureEntry(false);

    expect(getCanvasFlowTextureDrawState(entry)).toEqual({
      cacheHit: true,
      entry,
      missing: false,
    });
  });

  it("keeps drawing dirty cached textures while a replacement upload is pending", () => {
    const entry = createTextureEntry(true);

    expect(getCanvasFlowTextureDrawState(entry)).toEqual({
      cacheHit: false,
      entry,
      missing: false,
    });
  });

  it("marks absent textures as missing and non-renderable", () => {
    expect(getCanvasFlowTextureDrawState(null)).toEqual({
      cacheHit: false,
      entry: null,
      missing: true,
    });
  });
});

function createTextureEntry(dirty: boolean): CanvasFlowNodeTextureEntry {
  return {
    cssHeight: 40,
    cssWidth: 80,
    dirty,
    estimatedBytes: 12_800,
    lastUsedFrame: 1,
    nodeId: "node-a",
    texture: {} as WebGLTexture,
    uploadCount: 1,
  };
}
