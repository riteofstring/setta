import type {
  HtmlSurfaceTextureRecord,
  HtmlSurfaceTextureTileRecord,
} from "./textures";

export type FlowRect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type SurfaceVertex = {
  readonly u: number;
  readonly v: number;
  readonly x: number;
  readonly y: number;
};

export type HtmlSurfaceTextureCoordinates = {
  readonly u0: number;
  readonly u1: number;
  readonly v0: number;
  readonly v1: number;
};

export type HtmlSurfaceFlatVisual = FlowRect & {
  readonly kind: "flat";
  readonly surfaceId: string;
  readonly texture: HtmlSurfaceTextureRecord;
  readonly textureCoordinates?: HtmlSurfaceTextureCoordinates | undefined;
  readonly zIndex: number;
};

export type HtmlSurfaceTiledFlatVisual = {
  readonly kind: "tiled-flat";
  readonly rect: FlowRect;
  readonly surfaceId: string;
  readonly texture: HtmlSurfaceTextureRecord;
  readonly textureSourceRect?: FlowRect | undefined;
  readonly tiles: readonly HtmlSurfaceTextureTileRecord[];
  readonly zIndex: number;
};

export type HtmlSurfaceMeshVisual = {
  readonly bounds: FlowRect;
  readonly indices: Uint32Array;
  readonly kind: "mesh";
  readonly surfaceId: string;
  readonly texture: HtmlSurfaceTextureRecord;
  readonly vertices: readonly SurfaceVertex[];
  readonly zIndex: number;
};

export type HtmlSurfaceEffectVisual = {
  readonly bounds: FlowRect;
  readonly effectId: string;
  readonly kind: "effect";
  readonly projectorId: string;
  readonly surfaceId: string;
  readonly texture: HtmlSurfaceTextureRecord;
  readonly zIndex: number;
};

export type HtmlSurfaceVisual =
  | HtmlSurfaceFlatVisual
  | HtmlSurfaceTiledFlatVisual
  | HtmlSurfaceMeshVisual
  | HtmlSurfaceEffectVisual;

export type HtmlSurfaceVisualScene = {
  readonly effectSurfaces: readonly HtmlSurfaceEffectVisual[];
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly meshSurfaces: readonly HtmlSurfaceMeshVisual[];
  readonly tiledFlatSurfaces: readonly HtmlSurfaceTiledFlatVisual[];
};

export function createHtmlSurfaceVisualScene({
  effectSurfaces = [],
  flatSurfaces = [],
  meshSurfaces = [],
  tiledFlatSurfaces = [],
}: Partial<HtmlSurfaceVisualScene> = {}): HtmlSurfaceVisualScene {
  return {
    effectSurfaces,
    flatSurfaces,
    meshSurfaces,
    tiledFlatSurfaces,
  };
}
