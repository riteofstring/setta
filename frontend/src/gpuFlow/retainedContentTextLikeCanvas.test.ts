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
    expect(ctx.fillText).toHaveBeenCalledWith("sample", 14, 17);
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
    expect(ctx.fillText).toHaveBeenCalledWith("false", 14, 17);
  });

  it("ellipsizes long single-line text previews instead of canvas-squeezing them", () => {
    const ctx = createCanvasContextRecorder({
      textWidth: (text) => text.length * 10,
    });
    const palette = getGpuRetainedContentCanvasPalette(true);

    drawGpuRetainedContentTextLikeControl({
      control: {
        defaultDisplayValue: "",
        displayValue: "abcdef",
        editorKind: "text",
        kind: "text-like",
        rendererFamily: "text",
        commitPolicy: "native-island",
      },
      ctx,
      palette,
      rect: { height: 28, width: 60, x: 0, y: 0 },
      state: undefined,
    });

    expect(ctx.fillText).toHaveBeenCalledWith("ab\u2026", 14, 17);
    expect(ctx.fillText.mock.calls[0]).toHaveLength(3);
  });

  it("wraps textarea previews by measured width and clips them to the control rect", () => {
    const ctx = createCanvasContextRecorder({
      textWidth: (text) => text.length * 6,
    });
    const palette = getGpuRetainedContentCanvasPalette(true);

    drawGpuRetainedContentTextLikeControl({
      control: {
        defaultDisplayValue: "",
        displayValue: "alpha beta gamma",
        editorKind: "textarea",
        kind: "text-like",
        rendererFamily: "textarea",
        commitPolicy: "native-island",
      },
      ctx,
      palette,
      rect: { height: 42, width: 74, x: 0, y: 0 },
      state: undefined,
    });

    expect(ctx.save).toHaveBeenCalledOnce();
    expect(ctx.rect).toHaveBeenCalledWith(14, 0, 46, 42);
    expect(ctx.clip).toHaveBeenCalledOnce();
    expect(ctx.fillText).toHaveBeenNthCalledWith(1, "alpha", 14, 11);
    expect(ctx.fillText).toHaveBeenNthCalledWith(2, "beta", 14, 25);
    expect(ctx.fillText).toHaveBeenNthCalledWith(3, "gamma", 14, 39);
    expect(ctx.fillText.mock.calls.every((call) => call.length === 3)).toBe(
      true,
    );
    expect(ctx.restore).toHaveBeenCalledOnce();
  });

  it("preserves textarea newlines and ellipsizes only the final visible line", () => {
    const ctx = createCanvasContextRecorder({
      textWidth: (text) => text.length * 6,
    });
    const palette = getGpuRetainedContentCanvasPalette(true);

    drawGpuRetainedContentTextLikeControl({
      control: {
        defaultDisplayValue: "",
        displayValue: "alpha\nbeta\ngamma",
        editorKind: "textarea",
        kind: "text-like",
        rendererFamily: "textarea",
        commitPolicy: "native-island",
      },
      ctx,
      palette,
      rect: { height: 28, width: 140, x: 0, y: 0 },
      state: undefined,
    });

    expect(ctx.fillText).toHaveBeenNthCalledWith(1, "alpha", 14, 11);
    expect(ctx.fillText).toHaveBeenNthCalledWith(2, "beta\u2026", 14, 25);
    expect(ctx.fillText).toHaveBeenCalledTimes(2);
  });
});

type MockCanvasContext = CanvasRenderingContext2D & {
  readonly beginPath: ReturnType<typeof vi.fn>;
  readonly clip: ReturnType<typeof vi.fn>;
  readonly fill: ReturnType<typeof vi.fn>;
  readonly fillText: ReturnType<typeof vi.fn>;
  readonly lineTo: ReturnType<typeof vi.fn>;
  readonly measureText: ReturnType<typeof vi.fn>;
  readonly moveTo: ReturnType<typeof vi.fn>;
  readonly rect: ReturnType<typeof vi.fn>;
  readonly restore: ReturnType<typeof vi.fn>;
  readonly save: ReturnType<typeof vi.fn>;
};

function createCanvasContextRecorder({
  textWidth = (text: string) => text.length * 6,
}: {
  readonly textWidth?: (text: string) => number;
} = {}): MockCanvasContext {
  return {
    beginPath: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    fillStyle: "",
    fillText: vi.fn(),
    font: "",
    lineTo: vi.fn(),
    lineWidth: 0,
    measureText: vi.fn((text: string) => ({ width: textWidth(text) })),
    moveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: "",
    textAlign: "start",
    textBaseline: "alphabetic",
  } as unknown as MockCanvasContext;
}
