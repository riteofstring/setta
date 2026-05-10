import { describe, expect, it, vi } from "vitest";

import { getGpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import {
  createGpuRetainedContentPageRasterPlan,
  filterGpuRetainedContentDrawCommandsForPage,
  rasterizeGpuRetainedContentPage,
} from "./retainedContentPageRasterizer";
import type {
  GpuRetainedContentDrawCommand,
  GpuRetainedContentScene,
} from "./retainedContentScene";

function emptyScene(
  drawCommands: readonly GpuRetainedContentDrawCommand[] = [],
): GpuRetainedContentScene {
  return {
    contentRect: { height: 200, width: 200, x: 0, y: 0 },
    drawCommands,
    hitRecords: [],
    id: "scene",
    ownerSectionId: "owner",
    portAnchors: [],
    rowHeight: 24,
    rowOrder: [],
    rows: [],
    scrollOffset: { x: 0, y: 0 },
    visibleRange: { endIndex: 0, rowCount: 0, startIndex: 0 },
    viewportRect: { height: 200, width: 200, x: 0, y: 0 },
  };
}

function rowBackgroundCommand(
  id: string,
  rect: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  },
): GpuRetainedContentDrawCommand {
  return {
    dividerRects: [],
    kind: "row-background",
    rect,
    rowId: id,
    state: {
      controlFocused: false,
      disabled: false,
      dragging: false,
      error: false,
      focused: false,
      hovered: false,
      searchFocused: false,
      searchMatched: false,
      selected: false,
    },
  };
}

describe("createGpuRetainedContentPageRasterPlan", () => {
  it("converts a CSS source rect into pixel dimensions and a translated scale transform", () => {
    expect(
      createGpuRetainedContentPageRasterPlan({
        lodScale: 2.5,
        sourceRectCss: { height: 40.2, width: 80.1, x: 12, y: 24 },
      }),
    ).toEqual({
      pixelHeight: 101,
      pixelWidth: 201,
      sourceRectCss: { height: 40.2, width: 80.1, x: 12, y: 24 },
      transform: {
        a: 2.5,
        b: 0,
        c: 0,
        d: 2.5,
        e: -30,
        f: -60,
      },
    });
  });
});

describe("filterGpuRetainedContentDrawCommandsForPage", () => {
  it("keeps only non-scrollbar commands whose draw bounds intersect the page rect", () => {
    const inside = rowBackgroundCommand("inside", {
      height: 20,
      width: 40,
      x: 20,
      y: 20,
    });
    const outside = rowBackgroundCommand("outside", {
      height: 20,
      width: 40,
      x: 140,
      y: 140,
    });
    const scrollbar: GpuRetainedContentDrawCommand = {
      axis: "y",
      kind: "scrollbar",
      rowId: "scrollbar",
      thumbRect: { height: 20, width: 8, x: 96, y: 32 },
      trackRect: { height: 100, width: 8, x: 96, y: 0 },
    };

    expect(
      filterGpuRetainedContentDrawCommandsForPage({
        commands: [inside, outside, scrollbar],
        sourceRectCss: { height: 100, width: 100, x: 0, y: 0 },
      }),
    ).toEqual([inside]);
  });
});

describe("rasterizeGpuRetainedContentPage", () => {
  it("sizes the scratch canvas and draws the page background under the page transform", () => {
    const canvas = { height: 1, width: 1 } as HTMLCanvasElement;
    const ctx = {
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      clip: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: "",
      rect: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      setTransform: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    const result = rasterizeGpuRetainedContentPage({
      canvas,
      ctx,
      lodScale: 2,
      palette: getGpuRetainedContentCanvasPalette(false),
      scene: emptyScene(),
      sourceRectCss: { height: 32, width: 48, x: 10, y: 20 },
      surfaceId: "surface",
    });

    expect(canvas.width).toBe(96);
    expect(canvas.height).toBe(64);
    expect(ctx.setTransform).toHaveBeenNthCalledWith(1, 1, 0, 0, 1, 0, 0);
    expect(ctx.setTransform).toHaveBeenNthCalledWith(2, 2, 0, 0, 2, -20, -40);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 96, 64);
    expect(ctx.rect).toHaveBeenCalledWith(10, 20, 48, 32);
    expect(ctx.fillRect).toHaveBeenCalledWith(10, 20, 48, 32);
    expect(result).toEqual(
      expect.objectContaining({
        drawnCommandCount: 0,
        plan: expect.objectContaining({
          pixelHeight: 64,
          pixelWidth: 96,
        }),
      }),
    );
  });
});
