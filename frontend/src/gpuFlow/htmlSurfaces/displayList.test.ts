/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import {
  createHtmlSurfaceDisplayList,
  createHtmlSurfaceRetainedOcclusionDiagnostics,
} from "./displayList";
import { textureRecord } from "./frame.helpers.test";
import { createGpuNodeVisualScene } from "./frameVisualScene";
import { buildHtmlSurfaceVisuals } from "./surfaceVisuals";
import type {
  HtmlSurfaceFlatVisual,
  HtmlSurfaceTiledFlatVisual,
} from "./visualScene";

describe("HTML surface display list", () => {
  it("keeps retained content above section textures when storage changes", () => {
    const retainedPage = flatVisual("retained-page", {
      height: 50,
      width: 50,
      x: 25,
      y: 25,
    });
    const singleScene = createGpuNodeVisualScene({
      htmlSurfaceNativeVisuals: undefined,
      htmlSurfaceOverlayVisuals: undefined,
      htmlSurfacePageVisuals: [retainedPage],
      htmlSurfaceVisuals: buildHtmlSurfaceVisuals([
        {
          height: 100,
          nodeId: "section-a",
          texture: textureRecord("section-a"),
          width: 100,
          x: 0,
          y: 0,
          zIndex: 0,
        },
      ]),
    });
    const tiledScene = createGpuNodeVisualScene({
      htmlSurfaceNativeVisuals: undefined,
      htmlSurfaceOverlayVisuals: undefined,
      htmlSurfacePageVisuals: [retainedPage],
      htmlSurfaceVisuals: buildHtmlSurfaceVisuals([
        {
          height: 100,
          nodeId: "section-a",
          texture: tiledTextureRecord("section-a"),
          width: 100,
          x: 0,
          y: 0,
          zIndex: 0,
        },
      ]),
    });

    expect(singleScene.displayList.commands.at(-1)).toMatchObject({
      ownerSurfaceId: "retained-page",
      renderLayer: "retained-content",
      role: "retained-content-page",
      zIndex: 0,
    });
    expect(tiledScene.displayList.commands.at(-1)).toMatchObject({
      ownerSurfaceId: "retained-page",
      renderLayer: "retained-content",
      role: "retained-content-page",
      zIndex: 0,
    });
    expect(
      singleScene.displayList.commands
        .slice(0, -1)
        .every((command) => command.ownerSurfaceId === "section-a"),
    ).toBe(true);
    expect(
      tiledScene.displayList.commands
        .slice(0, -1)
        .every(
          (command) =>
            command.ownerSurfaceId === "section-a" &&
            command.pipelineKind === "tiled-flat",
        ),
    ).toBe(true);
    expect(
      createHtmlSurfaceRetainedOcclusionDiagnostics(singleScene.displayList),
    ).toEqual([]);
    expect(
      createHtmlSurfaceRetainedOcclusionDiagnostics(tiledScene.displayList),
    ).toEqual([]);
  });

  it("preserves command order when batching mixed pipeline kinds", () => {
    const flatA = flatVisual("flat-a");
    const tiled = tiledVisual("tiled-a");
    const flatB = flatVisual("flat-b");

    const displayList = createHtmlSurfaceDisplayList([
      {
        flatSurfaces: [flatA],
        renderLayer: "section-shell",
        role: "section-shell",
      },
      {
        renderLayer: "section-shell",
        role: "section-shell",
        tiledFlatSurfaces: [tiled],
      },
      {
        flatSurfaces: [flatB],
        renderLayer: "section-shell",
        role: "section-shell",
      },
    ]);

    expect(
      displayList.commands.map((command) => command.ownerSurfaceId),
    ).toEqual(["flat-a", "tiled-a", "flat-b"]);
    expect(displayList.batches).toEqual([
      { commandCount: 1, firstCommandIndex: 0, pipelineKind: "flat" },
      { commandCount: 1, firstCommandIndex: 1, pipelineKind: "tiled-flat" },
      { commandCount: 1, firstCommandIndex: 2, pipelineKind: "flat" },
    ]);
  });

  it("reports non-overlay commands that would cover retained content", () => {
    const retained = flatVisual("retained-page", {
      height: 100,
      width: 100,
      x: 0,
      y: 0,
    });
    const covering = flatVisual("covering-section", {
      height: 50,
      width: 50,
      x: 25,
      y: 25,
    });

    const displayList = createHtmlSurfaceDisplayList([
      {
        flatSurfaces: [retained],
        renderLayer: "retained-content",
        role: "retained-content-page",
      },
      {
        flatSurfaces: [covering],
        renderLayer: "global-overlay",
        role: "section-shell",
      },
    ]);

    expect(displayList.commands[0]?.role).toBe("retained-content-page");
    expect(displayList.commands[1]?.role).toBe("section-shell");
    expect(createHtmlSurfaceRetainedOcclusionDiagnostics(displayList)).toEqual([
      expect.objectContaining({
        coveringOwnerSurfaceId: "covering-section",
        retainedOwnerSurfaceId: "retained-page",
      }),
    ]);
  });

  it("does not treat retained scrollbars as occlusion risks", () => {
    const displayList = createHtmlSurfaceDisplayList([
      {
        flatSurfaces: [flatVisual("retained-page")],
        renderLayer: "retained-content",
        role: "retained-content-page",
      },
      {
        flatSurfaces: [flatVisual("scrollbar")],
        renderLayer: "retained-overlay",
        role: "retained-scrollbar",
      },
    ]);

    expect(displayList.commands.map((command) => command.role)).toEqual([
      "retained-content-page",
      "retained-scrollbar",
    ]);
    expect(createHtmlSurfaceRetainedOcclusionDiagnostics(displayList)).toEqual(
      [],
    );
  });
});

function flatVisual(
  surfaceId: string,
  rect: Partial<
    Pick<HtmlSurfaceFlatVisual, "height" | "width" | "x" | "y">
  > = {},
): HtmlSurfaceFlatVisual {
  return {
    height: rect.height ?? 20,
    kind: "flat",
    surfaceId,
    texture: textureRecord(surfaceId),
    width: rect.width ?? 20,
    x: rect.x ?? 0,
    y: rect.y ?? 0,
    zIndex: 0,
  };
}

function tiledVisual(surfaceId: string): HtmlSurfaceTiledFlatVisual {
  const texture = tiledTextureRecord(surfaceId);
  return {
    kind: "tiled-flat",
    rect: { height: 20, width: 20, x: 0, y: 0 },
    surfaceId,
    texture,
    tiles: texture.tiles,
    zIndex: 0,
  };
}

function tiledTextureRecord(surfaceId: string) {
  return textureRecord(surfaceId, {
    textureLayout: {
      columns: 1,
      kind: "tiled",
      maxTilePixelHeight: 64,
      maxTilePixelWidth: 64,
      rows: 1,
      tileCount: 1,
    },
    tiles: [
      {
        cssHeight: 20,
        cssWidth: 20,
        cssX: 0,
        cssY: 0,
        dirtyContent: false,
        dirtyResolution: false,
        lastUploadFrame: 1,
        pixelHeight: 20,
        pixelWidth: 20,
        sampler: {},
        surfaceId,
        texture: {} as GPUTexture,
        textureBytes: 1_600,
        textureView: {},
        tileId: `${surfaceId}:0:0`,
        u0: 0,
        u1: 1,
        v0: 0,
        v1: 1,
      },
    ],
  });
}
