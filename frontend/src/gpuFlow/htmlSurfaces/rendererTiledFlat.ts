import {
  alignToFourBytes,
  buildFlatSurfaceVertexData,
  captureFlatSurfaceGeometry,
  isFlatSurfaceVertexCacheValid,
} from "../gpuPipelines/bufferAndShaders";
import {
  FLAT_SURFACE_VERTEX_BYTES,
  VERTICES_PER_QUAD,
  type FlatSurfaceDrawResources,
  type FlatSurfaceVertexCache,
  type HtmlSurfaceRenderRuntime,
} from "../gpuPipelines/pipelineTypes";
import type { HtmlSurfaceTextureTileRecord } from "./textures";
import type { HtmlSurfaceTiledFlatVisual } from "./visualScene";

export type TiledFlatSurfaceDrawTile = {
  readonly height: number;
  readonly surfaceId: string;
  readonly texture: HtmlSurfaceTextureTileRecord;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

export type HtmlSurfaceTiledFlatPassOptions = {
  readonly getFlatSurfacePipeline: () => GPURenderPipeline;
  readonly getTextureBindGroup: (
    tile: TiledFlatSurfaceDrawTile,
  ) => GPUBindGroup;
  readonly runtime: HtmlSurfaceRenderRuntime;
};

export class HtmlSurfaceTiledFlatPass {
  private readonly getFlatSurfacePipeline: () => GPURenderPipeline;
  private readonly getTextureBindGroup: (
    tile: TiledFlatSurfaceDrawTile,
  ) => GPUBindGroup;
  private readonly runtime: HtmlSurfaceRenderRuntime;
  private uploadedVertexCache: FlatSurfaceVertexCache | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private vertexBufferByteCapacity = 0;
  private vertexCache: FlatSurfaceVertexCache | null = null;

  constructor({
    getFlatSurfacePipeline,
    getTextureBindGroup,
    runtime,
  }: HtmlSurfaceTiledFlatPassOptions) {
    this.getFlatSurfacePipeline = getFlatSurfacePipeline;
    this.getTextureBindGroup = getTextureBindGroup;
    this.runtime = runtime;
  }

  destroy() {
    this.vertexBuffer?.destroy?.();
    this.uploadedVertexCache = null;
    this.vertexBuffer = null;
    this.vertexBufferByteCapacity = 0;
    this.vertexCache = null;
  }

  prepare(
    tiledFlatSurfaceTiles: readonly TiledFlatSurfaceDrawTile[],
  ): FlatSurfaceDrawResources | null {
    if (tiledFlatSurfaceTiles.length === 0) {
      return null;
    }
    const cache = this.resolveVertexCache(tiledFlatSurfaceTiles);
    return {
      pipeline: this.getFlatSurfacePipeline(),
      vertexBuffer: this.ensureVertexBuffer(cache.vertexData.byteLength),
    };
  }

  write(
    tiledFlatSurfaceDraw: FlatSurfaceDrawResources | null,
    tiledFlatSurfaceTiles: readonly TiledFlatSurfaceDrawTile[],
  ) {
    if (!tiledFlatSurfaceDraw) {
      this.uploadedVertexCache = null;
      return;
    }
    const vertexCache = this.resolveVertexCache(tiledFlatSurfaceTiles);
    if (this.uploadedVertexCache === vertexCache) {
      return;
    }
    this.runtime.device.queue.writeBuffer(
      tiledFlatSurfaceDraw.vertexBuffer,
      0,
      vertexCache.vertexData,
    );
    this.uploadedVertexCache = vertexCache;
  }

  draw({
    cameraBindGroup,
    pass,
    tiledFlatSurfaceDraw,
    tiledFlatSurfaceTiles,
  }: {
    readonly cameraBindGroup: GPUBindGroup;
    readonly pass: GPURenderPassEncoder;
    readonly tiledFlatSurfaceDraw: FlatSurfaceDrawResources | null;
    readonly tiledFlatSurfaceTiles: readonly TiledFlatSurfaceDrawTile[];
  }) {
    if (!tiledFlatSurfaceDraw) {
      return;
    }
    pass.setPipeline(tiledFlatSurfaceDraw.pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setVertexBuffer(0, tiledFlatSurfaceDraw.vertexBuffer);
    tiledFlatSurfaceTiles.forEach((tile, index) => {
      pass.setBindGroup(1, this.getTextureBindGroup(tile));
      pass.draw(VERTICES_PER_QUAD, 1, index * VERTICES_PER_QUAD, 0);
    });
  }

  getVertexCount(
    tiledFlatSurfaceTiles: readonly TiledFlatSurfaceDrawTile[],
  ): number {
    return tiledFlatSurfaceTiles.length * VERTICES_PER_QUAD;
  }

  private ensureVertexBuffer(byteLength: number): GPUBuffer {
    if (this.vertexBuffer && this.vertexBufferByteCapacity >= byteLength) {
      return this.vertexBuffer;
    }
    this.vertexBuffer?.destroy?.();
    const size = Math.max(
      FLAT_SURFACE_VERTEX_BYTES,
      alignToFourBytes(byteLength),
    );
    this.vertexBuffer = this.runtime.device.createBuffer({
      label: "setta-html-surface-tiled-flat-vertices",
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
    });
    this.vertexBufferByteCapacity = size;
    this.uploadedVertexCache = null;
    return this.vertexBuffer;
  }

  private resolveVertexCache(
    tiledFlatSurfaceTiles: readonly TiledFlatSurfaceDrawTile[],
  ): FlatSurfaceVertexCache {
    if (
      isFlatSurfaceVertexCacheValid(this.vertexCache, tiledFlatSurfaceTiles)
    ) {
      return this.vertexCache;
    }
    const vertexCache = {
      geometry: captureFlatSurfaceGeometry(tiledFlatSurfaceTiles),
      vertexData: buildFlatSurfaceVertexData(tiledFlatSurfaceTiles),
    };
    this.vertexCache = vertexCache;
    return vertexCache;
  }
}

export function createTiledFlatSurfaceDrawTiles(
  surfaces: readonly HtmlSurfaceTiledFlatVisual[],
): readonly TiledFlatSurfaceDrawTile[] {
  const tiles: TiledFlatSurfaceDrawTile[] = [];
  for (const surface of surfaces) {
    const scaleX = resolveTiledFlatSurfaceScale(
      surface.rect.width,
      surface.texture.cssWidth,
    );
    const scaleY = resolveTiledFlatSurfaceScale(
      surface.rect.height,
      surface.texture.cssHeight,
    );
    for (const tile of surface.tiles) {
      tiles.push({
        height: tile.cssHeight * scaleY,
        surfaceId: tile.tileId,
        texture: tile,
        width: tile.cssWidth * scaleX,
        x: surface.rect.x + tile.cssX * scaleX,
        y: surface.rect.y + tile.cssY * scaleY,
        zIndex: surface.zIndex,
      });
    }
  }
  return tiles;
}

function resolveTiledFlatSurfaceScale(
  visualSize: number,
  textureCssSize: number,
): number {
  return textureCssSize > 0 ? visualSize / textureCssSize : 1;
}
