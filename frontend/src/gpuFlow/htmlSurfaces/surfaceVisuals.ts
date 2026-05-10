import type { GpuRect } from "../viewportMath";
import type { CommittedHtmlSurfaceTextureSnapshot } from "./textures";
import type {
  HtmlSurfaceFlatVisual,
  HtmlSurfaceTiledFlatVisual,
} from "./visualScene";

export type HtmlSurfaceVisualQuad = {
  readonly height: number;
  readonly nodeId: string;
  readonly texture: CommittedHtmlSurfaceTextureSnapshot;
  readonly textureSourceRect?: GpuRect | undefined;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

export type HtmlSurfaceVisualBuildResult = {
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly tiledFlatSurfaces: readonly HtmlSurfaceTiledFlatVisual[];
};

export function buildHtmlSurfaceVisuals(
  quads: readonly HtmlSurfaceVisualQuad[],
): HtmlSurfaceVisualBuildResult {
  const flatSurfaces: HtmlSurfaceFlatVisual[] = [];
  const tiledFlatSurfaces: HtmlSurfaceTiledFlatVisual[] = [];
  for (const quad of quads) {
    if (quad.texture.textureLayout?.kind === "tiled") {
      tiledFlatSurfaces.push({
        kind: "tiled-flat",
        rect: {
          height: quad.height,
          width: quad.width,
          x: quad.x,
          y: quad.y,
        },
        surfaceId: quad.nodeId,
        texture: quad.texture,
        ...(quad.textureSourceRect
          ? { textureSourceRect: quad.textureSourceRect }
          : {}),
        tiles: quad.texture.tiles,
        zIndex: quad.zIndex,
      });
      continue;
    }
    flatSurfaces.push(toFlatHtmlSurfaceVisual(quad));
  }
  return {
    flatSurfaces,
    tiledFlatSurfaces,
  };
}

function toFlatHtmlSurfaceVisual(
  quad: HtmlSurfaceVisualQuad,
): HtmlSurfaceFlatVisual {
  return {
    height: quad.height,
    kind: "flat",
    surfaceId: quad.nodeId,
    texture: quad.texture,
    ...(quad.textureSourceRect
      ? {
          textureCoordinates: toHtmlSurfaceTextureCoordinates({
            sourceRect: quad.textureSourceRect,
            texture: quad.texture,
          }),
        }
      : {}),
    width: quad.width,
    x: quad.x,
    y: quad.y,
    zIndex: quad.zIndex,
  };
}

function toHtmlSurfaceTextureCoordinates({
  sourceRect,
  texture,
}: {
  readonly sourceRect: GpuRect;
  readonly texture: CommittedHtmlSurfaceTextureSnapshot;
}) {
  return {
    u0: clamp01(sourceRect.x / texture.cssWidth),
    u1: clamp01((sourceRect.x + sourceRect.width) / texture.cssWidth),
    v0: clamp01(sourceRect.y / texture.cssHeight),
    v1: clamp01((sourceRect.y + sourceRect.height) / texture.cssHeight),
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
