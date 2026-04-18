import type { Node } from "../types";
import {
  buildSectionShellBackdropScene,
  paintSectionShellBackdrop,
} from "./sectionShellBackdrop";
import { describe, expect, it, vi } from "vitest";

type MockCanvasContext = CanvasRenderingContext2D & {
  beginPath: ReturnType<typeof vi.fn>;
  clip: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  rect: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  roundRect: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
};

function createNode(overrides: Partial<Node> & Pick<Node, "id">): Node {
  return {
    height: 60,
    position: { x: 10, y: 20 },
    tempZIndex: 0,
    width: 120,
    zIndex: 0,
    ...overrides,
  };
}

function createMockCanvasContext(): MockCanvasContext {
  return {
    beginPath: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: "#000000",
    lineTo: vi.fn(),
    lineWidth: 1,
    moveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    roundRect: vi.fn(),
    save: vi.fn(),
    shadowBlur: 0,
    shadowColor: "transparent",
    shadowOffsetY: 0,
    stroke: vi.fn(),
    strokeStyle: "#000000",
  } as unknown as MockCanvasContext;
}

describe("sectionShellBackdrop", () => {
  it("carries canary header chrome metadata into the retained scene", () => {
    const scene = buildSectionShellBackdropScene([
      createNode({
        id: "settings-section__callableSectionDefault",
        height: 80,
      }),
    ], {
      getFrameVisual: () => ({
        fill: "#f5f7fb",
        headerDivider: "#d4dae5",
        headerFill: "#fcfdff",
        headerHeight: 120,
        stroke: "#ffffff",
      }),
    });

    expect(scene.frames).toEqual([
      expect.objectContaining({
        fill: "#f5f7fb",
        headerDivider: "#d4dae5",
        headerFill: "#fcfdff",
        headerHeight: 80,
        stroke: "#ffffff",
      }),
    ]);
  });

  it("paints a clipped header band and divider before the outer stroke", () => {
    const context = createMockCanvasContext();

    paintSectionShellBackdrop(
      context,
      {
        bounds: {
          height: 80,
          width: 120,
          x: 10,
          y: 20,
        },
        frames: [
          {
            fill: "#f5f7fb",
            headerDivider: "#d4dae5",
            headerFill: "#fcfdff",
            headerHeight: 24,
            height: 80,
            id: "settings-section__callableSectionDefault",
            stroke: "#ffffff",
            width: 120,
            x: 10,
            y: 20,
            zIndex: 0,
          },
        ],
      },
      {
        cornerRadius: 16,
        darkMode: false,
        padding: 24,
      },
    );

    expect(context.save).toHaveBeenCalledTimes(1);
    expect(context.clip).toHaveBeenCalledTimes(1);
    expect(context.fillRect).toHaveBeenCalledWith(24, 24, 120, 24);
    expect(context.moveTo).toHaveBeenCalledWith(40, 48);
    expect(context.lineTo).toHaveBeenCalledWith(128, 48);
    expect(context.stroke).toHaveBeenCalledTimes(2);
    expect(context.roundRect).toHaveBeenNthCalledWith(1, 24, 24, 120, 80, 16);
    expect(context.roundRect).toHaveBeenNthCalledWith(2, 24, 24, 120, 80, 16);
  });
});
