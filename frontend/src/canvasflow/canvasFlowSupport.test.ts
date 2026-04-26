/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertHtmlInCanvasSupport,
  assertHtmlInCanvasWebglSupport,
} from "./canvasFlowSupport";

describe("canvasFlowSupport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates the 2d context only for the 2d support path", () => {
    const canvas = createCanvasWithRequestPaint();
    const context2d = { drawElementImage: vi.fn() };
    const getContext = vi
      .spyOn(canvas, "getContext")
      .mockImplementation((contextId) =>
        contextId === "2d"
          ? (context2d as unknown as CanvasRenderingContext2D)
          : null,
      );

    expect(assertHtmlInCanvasSupport(canvas)).toBe(context2d);
    expect(getContext).toHaveBeenCalledWith("2d");
  });

  it("creates a WebGL context without probing 2d for the WebGL support path", () => {
    const canvas = createCanvasWithRequestPaint();
    const gl = { texElementImage2D: vi.fn() };
    const getContext = vi
      .spyOn(canvas, "getContext")
      .mockImplementation((contextId) =>
        contextId === "webgl" ? (gl as unknown as WebGLRenderingContext) : null,
      );

    expect(assertHtmlInCanvasWebglSupport(canvas)).toBe(gl);
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(getContext.mock.calls[0]?.[0]).toBe("webgl");
  });
});

function createCanvasWithRequestPaint() {
  const canvas = document.createElement("canvas") as HTMLCanvasElement & {
    requestPaint: () => void;
  };
  canvas.requestPaint = vi.fn();
  return canvas;
}
