import { describe, expect, it, vi } from "vitest";

import { getGpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import { drawGpuRetainedContentTextLikeControl } from "./retainedContentTextLikeCanvas";

describe("retained content text-like canvas", () => {
  it("uses the dark retained row text treatment instead of a light field", () => {
    const ctx = createCanvasContextRecorder();
    const palette = getGpuRetainedContentCanvasPalette(true);

    drawGpuRetainedContentTextLikeControl({
      control: {
        defaultDisplayValue: "",
        displayValue: "sample",
        editorKind: "text",
        kind: "text-like",
        rendererFamily: "text",
        commitPolicy: "native-island",
      },
      ctx,
      palette,
      rect: { height: 28, width: 180, x: 0, y: 0 },
      state: undefined,
    });

    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.moveTo).not.toHaveBeenCalled();
    expect(ctx.lineTo).not.toHaveBeenCalled();
    expect(ctx.fillStyle).toBe(palette.textLikeText);
    expect(ctx.font).toContain("12px ui-monospace");
    expect(ctx.fillText).toHaveBeenCalledWith("sample", 14, 17, 152);
  });

  it("uses plain retained text color for inactive primitive values", () => {
    const ctx = createCanvasContextRecorder();
    const palette = getGpuRetainedContentCanvasPalette(true);

    drawGpuRetainedContentTextLikeControl({
      control: {
        defaultDisplayValue: "",
        displayValue: "false",
        editorKind: "text",
        kind: "text-like",
        rendererFamily: "text",
        commitPolicy: "native-island",
      },
      ctx,
      palette,
      rect: { height: 28, width: 180, x: 0, y: 0 },
      state: undefined,
    });

    expect(ctx.fillStyle).toBe(palette.textLikeText);
    expect(ctx.font).toContain("12px ui-monospace");
    expect(ctx.fillText).toHaveBeenCalledWith("false", 14, 17, 152);
  });
});

type MockCanvasContext = CanvasRenderingContext2D & {
  readonly fill: ReturnType<typeof vi.fn>;
  readonly fillText: ReturnType<typeof vi.fn>;
  readonly lineTo: ReturnType<typeof vi.fn>;
  readonly moveTo: ReturnType<typeof vi.fn>;
};

function createCanvasContextRecorder(): MockCanvasContext {
  return {
    beginPath: vi.fn(),
    fill: vi.fn(),
    fillStyle: "",
    fillText: vi.fn(),
    font: "",
    lineTo: vi.fn(),
    lineWidth: 0,
    moveTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: "",
    textAlign: "start",
    textBaseline: "alphabetic",
  } as unknown as MockCanvasContext;
}
