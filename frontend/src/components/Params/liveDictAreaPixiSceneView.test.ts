import { describe, expect, it } from "vitest";
import { LIVE_DICT_AREA_PIXI_LAYOUT } from "./liveDictAreaPixiLayout";
import {
  getLiveDictAreaPixiLogicalCanvasWidth,
  getLiveDictAreaPixiRenderResolution,
} from "./liveDictAreaPixiSceneView";

describe("getLiveDictAreaPixiLogicalCanvasWidth", () => {
  it("keeps the scene layout width in logical flow space", () => {
    expect(getLiveDictAreaPixiLogicalCanvasWidth(512.8)).toBe(512);
    expect(getLiveDictAreaPixiLogicalCanvasWidth(0)).toBe(
      LIVE_DICT_AREA_PIXI_LAYOUT.canvasMinWidth,
    );
  });
});

describe("getLiveDictAreaPixiRenderResolution", () => {
  it("scales the Pixi render resolution with viewport zoom and device pixel ratio", () => {
    expect(
      getLiveDictAreaPixiRenderResolution({
        devicePixelRatio: 2,
        viewportZoom: 1,
      }),
    ).toBe(2);
    expect(
      getLiveDictAreaPixiRenderResolution({
        devicePixelRatio: 2,
        viewportZoom: 1.5,
      }),
    ).toBe(3);
    expect(
      getLiveDictAreaPixiRenderResolution({
        devicePixelRatio: 2,
        viewportZoom: 0.1,
      }),
    ).toBe(0.2);
  });

  it("falls back to sane defaults for invalid metrics", () => {
    expect(
      getLiveDictAreaPixiRenderResolution({
        devicePixelRatio: Number.NaN,
        viewportZoom: 0,
      }),
    ).toBe(1);
  });
});
