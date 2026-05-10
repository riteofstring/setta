/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { renderHtmlSurfaceFrame } from "./frame";
import {
  canvasSize,
  createFrameRenderer,
  createFrameTextureManager,
  surfaceOverlay,
  textureRecord,
} from "./frame.helpers.test";

describe("HTML surface page overlays", () => {
  it("composes page overlays with retained page visuals before late overlays", () => {
    const pagePreviewElement = document.createElement("div");
    const tooltipElement = document.createElement("div");
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();
    const retainedPageTexture = textureRecord("retained-page");

    renderHtmlSurfaceFrame({
      canvasSize: canvasSize(),
      elementByNodeId: new Map([
        ["page-preview", pagePreviewElement],
        ["tooltip", tooltipElement],
      ]),
      frame: 1,
      htmlSurfaceOverlays: [
        {
          ...surfaceOverlay("page-preview", 10, 20, 120, 40, 2),
          layer: "page",
        },
        {
          ...surfaceOverlay("tooltip", 10, 20, 120, 40, 3),
          layer: "late",
        },
      ],
      htmlSurfacePageVisuals: [
        {
          height: 40,
          kind: "flat",
          surfaceId: "retained-page",
          texture: retainedPageTexture,
          width: 120,
          x: 10,
          y: 20,
          zIndex: 1,
        },
      ],
      nodes: [],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    const renderInput = renderer.render.mock.calls[0]?.[0];
    expect(
      renderInput?.scene.lateFlatSurfaces.map((surface) => surface.surfaceId),
    ).toEqual(["retained-page", "page-preview", "tooltip"]);
    expect(renderInput?.scene.flatSurfaces).toEqual([]);
  });
});
