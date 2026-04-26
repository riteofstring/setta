import { describe, expect, it } from "vitest";
import { getCanvasFlowSizeFromResizeEntry } from "./canvasFlowSizing";

describe("getCanvasFlowSizeFromResizeEntry", () => {
  it("keeps the layoutsubtree canvas backing store in CSS pixels", () => {
    const entry = {
      contentRect: {
        width: 1200.4,
        height: 600.2,
      },
      devicePixelContentBoxSize: [
        {
          inlineSize: 2401,
          blockSize: 1200,
        },
      ],
    } as unknown as ResizeObserverEntry;

    expect(getCanvasFlowSizeFromResizeEntry(entry)).toEqual({
      cssWidth: 1200.4,
      cssHeight: 600.2,
      pixelWidth: 1200,
      pixelHeight: 600,
      pixelRatio: 1,
    });
  });
});
