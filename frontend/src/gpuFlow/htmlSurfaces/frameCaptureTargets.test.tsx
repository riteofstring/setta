/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { renderHtmlSurfaceFrame } from "./frame";
import {
  canvasSize,
  createFrameRenderer,
  createFrameTextureManager,
  node,
} from "./frame.test-helper";
import { HTML_SURFACE_CAPTURE_TARGET_FOR_ATTRIBUTE } from "./sourceDom";

describe("HTML surface frame capture targets", () => {
  it("captures canvas source hosts while keeping them registered for DOM sync", () => {
    const host = document.createElement("canvas");
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();

    renderHtmlSurfaceFrame({
      canvasSize: canvasSize(),
      elementByNodeId: new Map([["visible", host]]),
      frame: 1,
      marginCssPx: 0,
      nodes: [node("visible", 10, 20, 100, 50, 0)],
      renderer,
      textureManager: manager,
      viewport: [5, -10, 1.5],
    });

    expect(manager.registerSurfaceTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        element: host,
        surfaceId: "visible",
      }),
    );
    expect(host.style.transform).toBe("translate(0px, 0px) scale(1)");
    expect(host.style.height).toBe("50px");
    expect(host.style.width).toBe("100px");
  });

  it("captures sibling texture targets while keeping source hosts registered for DOM sync", () => {
    const surface = document.createElement("canvas");
    const host = document.createElement("div");
    const captureTarget = document.createElement("canvas");
    captureTarget.setAttribute(
      HTML_SURFACE_CAPTURE_TARGET_FOR_ATTRIBUTE,
      "visible",
    );
    surface.append(host, captureTarget);
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();

    renderHtmlSurfaceFrame({
      canvasSize: canvasSize(),
      elementByNodeId: new Map([["visible", host]]),
      frame: 1,
      marginCssPx: 0,
      nodes: [
        {
          ...node("visible", 10, 20, 100, 50, 0),
          textureContentKey: "compact-shell",
          textureCssHeight: 1,
          textureCssWidth: 1,
        },
      ],
      renderer,
      textureManager: manager,
      viewport: [5, -10, 1.5],
    });

    expect(manager.registerSurfaceTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        cssHeight: 1,
        cssWidth: 1,
        element: captureTarget,
        surfaceId: "visible",
        textureContentKey: "compact-shell",
      }),
    );
    expect(host.style.transform).toBe("translate(0px, 0px) scale(1)");
  });
});
