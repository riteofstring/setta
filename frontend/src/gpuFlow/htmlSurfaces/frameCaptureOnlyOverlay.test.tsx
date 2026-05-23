/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { prepareHtmlSurfaceOverlayTextures } from "./frame";
import {
  canvasSize,
  createFrameTextureManager,
  surfaceOverlay,
} from "./frame.test-helper";
import { HTML_SURFACE_CAPTURE_ONLY_SOURCE_ATTRIBUTE } from "./sourceDom";

describe("HTML surface capture-only overlays", () => {
  it("does not paint-defer completed capture-only overlay re-registration", () => {
    const snapshot = document.createElement("div");
    snapshot.setAttribute(HTML_SURFACE_CAPTURE_ONLY_SOURCE_ATTRIBUTE, "true");
    const elements = new Map([["snapshot-a", snapshot]]);
    const manager = createFrameTextureManager();

    prepareHtmlSurfaceOverlayTextures({
      canvasSize: canvasSize(),
      elementByNodeId: elements,
      frame: 7,
      htmlSurfaceOverlays: [
        {
          ...surfaceOverlay("snapshot-a", 20, 30, 120, 24, 1),
          actorKind: "dom-control",
          layer: "page",
          textureContentKey: "snapshot-key",
          textureCssHeight: 24,
          textureCssWidth: 180,
          textureSourceRect: { height: 24, width: 120, x: 0, y: 0 },
        },
      ],
      marginCssPx: 0,
      textureManager: manager,
      viewport: [0, 0, 1],
    });
    manager.registerSurfaceTexture.mockClear();

    prepareHtmlSurfaceOverlayTextures({
      canvasSize: canvasSize(),
      elementByNodeId: elements,
      frame: 8,
      htmlSurfaceOverlays: [
        {
          ...surfaceOverlay("snapshot-a", 20, 30, 120, 24, 1),
          actorKind: "dom-control",
          layer: "page",
          textureContentKey: "snapshot-key-2",
          textureCssHeight: 24,
          textureCssWidth: 180,
          textureSourceRect: { height: 24, width: 120, x: 0, y: 0 },
        },
      ],
      marginCssPx: 0,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(manager.registerSurfaceTexture).toHaveBeenCalledWith(
      expect.not.objectContaining({
        deferUploadUntilPaint: true,
      }),
    );
  });
});
