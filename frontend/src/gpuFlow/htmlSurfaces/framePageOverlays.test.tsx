/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { renderHtmlSurfaceFrame } from "./frame";
import {
  canvasSize,
  createFrameRenderer,
  createFrameTextureManager,
  surfaceOverlay,
  textureRecord,
} from "./frame.test-helper";
import type { CommittedHtmlSurfaceTextureSnapshot } from "./textures";

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

  it("composes tiled page overlays in the late tiled visual layer", () => {
    const pagePreviewElement = document.createElement("div");
    const tooltipElement = document.createElement("div");
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();
    const pagePreviewTexture = createTiledTextureRecord("page-preview");
    const tooltipTexture = textureRecord("tooltip", {
      lastUploadFrame: 7,
    });
    const textures = new Map<string, CommittedHtmlSurfaceTextureSnapshot>([
      [pagePreviewTexture.surfaceId, pagePreviewTexture],
      [tooltipTexture.surfaceId, tooltipTexture],
    ]);
    manager.getCommittedSurfaceTexture.mockImplementation((surfaceId) =>
      textures.get(surfaceId),
    );

    renderHtmlSurfaceFrame({
      canvasSize: canvasSize(),
      elementByNodeId: new Map([
        ["page-preview", pagePreviewElement],
        ["tooltip", tooltipElement],
      ]),
      frame: 1,
      htmlSurfaceOverlays: [
        {
          ...surfaceOverlay("page-preview", 10, 20, 260, 40, 2),
          layer: "page",
        },
        {
          ...surfaceOverlay("tooltip", 10, 20, 120, 40, 3),
          layer: "late",
        },
      ],
      nodes: [],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    const renderInput = renderer.render.mock.calls[0]?.[0];
    expect(
      renderInput?.scene.lateTiledFlatSurfaces.map(
        (surface) => surface.surfaceId,
      ),
    ).toEqual(["page-preview"]);
    expect(
      renderInput?.scene.lateFlatSurfaces.map((surface) => surface.surfaceId),
    ).toEqual(["tooltip"]);
    expect(renderer.render.mock.results[0]?.value.drawnSurfaceIds).toEqual([
      "tooltip",
      "page-preview",
    ]);
  });
});

function createTiledTextureRecord(
  surfaceId: string,
): CommittedHtmlSurfaceTextureSnapshot {
  const texture = textureRecord(surfaceId, {
    cssHeight: 40,
    cssWidth: 260,
    lastUploadFrame: 7,
    textureLayout: {
      columns: 2,
      kind: "tiled",
      maxTilePixelHeight: 128,
      maxTilePixelWidth: 128,
      rows: 1,
      tileCount: 2,
    },
    tiles: [
      {
        cssHeight: 40,
        cssWidth: 128,
        cssX: 0,
        cssY: 0,
        dirtyContent: false,
        dirtyResolution: false,
        lastUploadFrame: 7,
        pixelHeight: 40,
        pixelWidth: 128,
        sampler: {},
        surfaceId,
        texture: {} as GPUTexture,
        textureBytes: 20_480,
        textureView: {},
        tileId: `${surfaceId}:0:0`,
        u0: 0,
        u1: 1,
        v0: 0,
        v1: 1,
      },
      {
        cssHeight: 40,
        cssWidth: 132,
        cssX: 128,
        cssY: 0,
        dirtyContent: false,
        dirtyResolution: false,
        lastUploadFrame: 7,
        pixelHeight: 40,
        pixelWidth: 132,
        sampler: {},
        surfaceId,
        texture: {} as GPUTexture,
        textureBytes: 21_120,
        textureView: {},
        tileId: `${surfaceId}:1:0`,
        u0: 0,
        u1: 1,
        v0: 0,
        v1: 1,
      },
    ],
  });
  return texture;
}
