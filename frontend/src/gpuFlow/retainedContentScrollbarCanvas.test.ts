import { describe, expect, it, vi } from "vitest";

import { getGpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import { drawGpuRetainedContentScrollbar } from "./retainedContentScrollbarCanvas";

describe("retained content scrollbar canvas", () => {
  it("draws explicit hover and active states", () => {
    const { ctx, fills } = createCanvasContextStub();

    drawGpuRetainedContentScrollbar({
      command: {
        axis: "y",
        kind: "scrollbar",
        rowId: "scene-a",
        state: {
          activePart: "track",
          hoveredPart: "thumb",
        },
        thumbRect: { height: 24, width: 8, x: 150, y: 20 },
        trackRect: { height: 76, width: 8, x: 150, y: 2 },
      },
      ctx,
      palette: getGpuRetainedContentCanvasPalette(false),
    });

    expect(fills).toEqual([
      {
        fillStyle: "rgba(15, 23, 42, 0.18)",
        globalAlpha: 1,
      },
      {
        fillStyle: "rgba(51, 65, 85, 0.62)",
        globalAlpha: 1,
      },
    ]);
  });
});

function createCanvasContextStub(): {
  readonly ctx: CanvasRenderingContext2D;
  readonly fills: Array<{
    readonly fillStyle: string | CanvasGradient | CanvasPattern;
    readonly globalAlpha: number;
  }>;
} {
  let fillStyle: string | CanvasGradient | CanvasPattern = "#000000";
  let globalAlpha = 1;
  const fills: Array<{
    readonly fillStyle: string | CanvasGradient | CanvasPattern;
    readonly globalAlpha: number;
  }> = [];
  const ctx = {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(() => {
      fills.push({ fillStyle, globalAlpha });
    }),
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      fillStyle = value;
    },
    get globalAlpha() {
      return globalAlpha;
    },
    set globalAlpha(value: number) {
      globalAlpha = value;
    },
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fills };
}
