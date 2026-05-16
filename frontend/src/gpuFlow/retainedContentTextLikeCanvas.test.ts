import { describe, expect, it, vi } from "vitest";

import { getGpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import { drawGpuRetainedContentTextLikeControl } from "./retainedContentTextLikeCanvas";

describe("retained content text-like canvas", () => {
  it("draws inactive row-text editor value pixels from the descriptor", () => {
    const ctx = createCanvasContextRecorder();
    const palette = getGpuRetainedContentCanvasPalette(true);

    drawGpuRetainedContentTextLikeControl({
      control: textLikeControl("sample"),
      ctx,
      palette,
      rect: { height: 28, width: 180, x: 0, y: 0 },
      state: undefined,
    });

    expect(ctx.fillText).toHaveBeenCalledWith(
      "sample",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(ctx.moveTo).not.toHaveBeenCalled();
    expect(ctx.lineTo).not.toHaveBeenCalled();
  });

  it("draws row-text focus chrome around readable editor value pixels", () => {
    const ctx = createCanvasContextRecorder();
    const palette = getGpuRetainedContentCanvasPalette(true);

    drawGpuRetainedContentTextLikeControl({
      control: textLikeControl("sample"),
      ctx,
      palette,
      rect: { height: 28, width: 180, x: 0, y: 0 },
      state: {
        controlFocused: true,
        disabled: false,
        dragging: false,
        error: false,
        focused: false,
        hovered: false,
        nativeControlActive: false,
        nativeLabelActive: false,
        searchFocused: false,
        searchMatched: false,
        selected: false,
      },
    });

    expect(ctx.fillText).toHaveBeenCalledWith(
      "sample",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it("draws boxed chrome and readable editor value pixels", () => {
    const ctx = createCanvasContextRecorder();
    const palette = getGpuRetainedContentCanvasPalette(false);

    drawGpuRetainedContentTextLikeControl({
      control: textLikeControl("sample"),
      ctx,
      palette,
      rect: { height: 28, width: 140, x: 0, y: 0 },
      state: undefined,
    });

    expect(ctx.fillText).toHaveBeenCalledWith(
      "sample",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });
});

function textLikeControl(displayValue: string) {
  return {
    defaultDisplayValue: "",
    displayValue,
    editorKind: "text" as const,
    kind: "text-like" as const,
    policy: {
      editorKind: "text" as const,
      language: "python",
      linePolicy: "single-line" as const,
      maxVisibleLines: 1,
      minVisibleLines: 1,
      wrapLines: false,
    },
    rendererFamily: "text",
    commitPolicy: "native-island" as const,
  };
}

type MockCanvasContext = CanvasRenderingContext2D & {
  readonly beginPath: ReturnType<typeof vi.fn>;
  readonly clip: ReturnType<typeof vi.fn>;
  readonly closePath: ReturnType<typeof vi.fn>;
  readonly fill: ReturnType<typeof vi.fn>;
  readonly fillText: ReturnType<typeof vi.fn>;
  readonly lineTo: ReturnType<typeof vi.fn>;
  readonly measureText: ReturnType<typeof vi.fn>;
  readonly moveTo: ReturnType<typeof vi.fn>;
  readonly quadraticCurveTo: ReturnType<typeof vi.fn>;
  readonly rect: ReturnType<typeof vi.fn>;
  readonly restore: ReturnType<typeof vi.fn>;
  readonly save: ReturnType<typeof vi.fn>;
  readonly stroke: ReturnType<typeof vi.fn>;
};

function createCanvasContextRecorder({
  textWidth = (text: string) => text.length * 6,
}: {
  readonly textWidth?: (text: string) => number;
} = {}): MockCanvasContext {
  return {
    beginPath: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillStyle: "",
    fillText: vi.fn(),
    font: "",
    lineTo: vi.fn(),
    lineWidth: 0,
    measureText: vi.fn((text: string) => ({ width: textWidth(text) })),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: "",
    textAlign: "start",
    textBaseline: "alphabetic",
  } as unknown as MockCanvasContext;
}
