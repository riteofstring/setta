/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { textureRecord } from "./frame.test-helper";
import { buildHtmlSurfaceVisuals } from "./surfaceVisuals";

describe("HTML surface visuals", () => {
  it("maps retained source rects to flat visual texture coordinates", () => {
    const texture = textureRecord("retained-a", {
      cssHeight: 200,
      cssWidth: 100,
    });

    expect(
      buildHtmlSurfaceVisuals([
        {
          height: 50,
          nodeId: "retained-a",
          texture,
          textureSourceRect: { height: 50, width: 80, x: 10, y: 40 },
          width: 80,
          x: 20,
          y: 30,
          zIndex: 3,
        },
      ]).flatSurfaces,
    ).toEqual([
      {
        height: 50,
        kind: "flat",
        surfaceId: "retained-a",
        texture,
        textureCoordinates: { u0: 0.1, u1: 0.9, v0: 0.2, v1: 0.45 },
        width: 80,
        x: 20,
        y: 30,
        zIndex: 3,
      },
    ]);
  });

  it("routes tiled texture records into the tiled-flat visual bucket", () => {
    const texture = textureRecord("large-node", {
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
          cssHeight: 100,
          cssWidth: 128,
          cssX: 0,
          cssY: 0,
          dirtyContent: false,
          dirtyResolution: false,
          lastUploadFrame: 1,
          pixelHeight: 100,
          pixelWidth: 128,
          sampler: {},
          surfaceId: "large-node",
          texture: {} as GPUTexture,
          textureBytes: 51_200,
          textureView: {},
          tileId: "large-node:0:0",
          u0: 0,
          u1: 0.5,
          v0: 0,
          v1: 1,
        },
        {
          cssHeight: 100,
          cssWidth: 72,
          cssX: 128,
          cssY: 0,
          dirtyContent: false,
          dirtyResolution: false,
          lastUploadFrame: 1,
          pixelHeight: 100,
          pixelWidth: 72,
          sampler: {},
          surfaceId: "large-node",
          texture: {} as GPUTexture,
          textureBytes: 28_800,
          textureView: {},
          tileId: "large-node:1:0",
          u0: 0.5,
          u1: 1,
          v0: 0,
          v1: 1,
        },
      ],
    });

    expect(
      buildHtmlSurfaceVisuals([
        {
          height: 100,
          nodeId: "large-node",
          texture,
          width: 200,
          x: 10,
          y: 20,
          zIndex: 3,
        },
      ]),
    ).toEqual({
      flatSurfaces: [],
      tiledFlatSurfaces: [
        {
          kind: "tiled-flat",
          rect: { height: 100, width: 200, x: 10, y: 20 },
          surfaceId: "large-node",
          texture,
          tiles: texture.tiles,
          zIndex: 3,
        },
      ],
    });
  });
});
