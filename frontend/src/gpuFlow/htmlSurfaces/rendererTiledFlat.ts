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
import type {
  FlowRect,
  HtmlSurfaceTextureCoordinates,
  HtmlSurfaceTiledFlatVisual,
} from "./visualScene";

export type TiledFlatSurfaceDrawTile = {
  readonly height: number;
  readonly surfaceId: string;
  readonly textureCoordinates?: HtmlSurfaceTextureCoordinates | undefined;
  readonly texture: HtmlSurfaceTextureTileRecord;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

type HtmlSurfaceTiledFlatPassOptions = {
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
    for (const tile of surface.tiles) {
      const drawTile = createTiledFlatSurfaceDrawTile(surface, tile);
      if (drawTile) {
        tiles.push(drawTile);
      }
    }
  }
  return tiles;
}

function createTiledFlatSurfaceDrawTile(
  surface: HtmlSurfaceTiledFlatVisual,
  tile: HtmlSurfaceTextureTileRecord,
): TiledFlatSurfaceDrawTile | null {
  if (!surface.textureSourceRect) {
    return {
      height: tile.cssHeight,
      surfaceId: tile.tileId,
      texture: tile,
      width: tile.cssWidth,
      x: surface.rect.x + tile.cssX,
      y: surface.rect.y + tile.cssY,
      zIndex: surface.zIndex,
    };
  }
  const sourceRect = surface.textureSourceRect;
  if (sourceRect.width <= 0 || sourceRect.height <= 0) {
    return null;
  }
  const tileRect = {
    height: tile.cssHeight,
    width: tile.cssWidth,
    x: tile.cssX,
    y: tile.cssY,
  };
  const intersection = intersectFlowRects(sourceRect, tileRect);
  if (intersection.width <= 0 || intersection.height <= 0) {
    return null;
  }
  const scaleX = surface.rect.width / sourceRect.width;
  const scaleY = surface.rect.height / sourceRect.height;
  return {
    height: intersection.height * scaleY,
    surfaceId: tile.tileId,
    texture: tile,
    textureCoordinates: {
      u0: clampUnit((intersection.x - tile.cssX) / tile.cssWidth),
      u1: clampUnit(
        (intersection.x + intersection.width - tile.cssX) / tile.cssWidth,
      ),
      v0: clampUnit((intersection.y - tile.cssY) / tile.cssHeight),
      v1: clampUnit(
        (intersection.y + intersection.height - tile.cssY) / tile.cssHeight,
      ),
    },
    width: intersection.width * scaleX,
    x: surface.rect.x + (intersection.x - sourceRect.x) * scaleX,
    y: surface.rect.y + (intersection.y - sourceRect.y) * scaleY,
    zIndex: surface.zIndex,
  };
}

function intersectFlowRects(left: FlowRect, right: FlowRect): FlowRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - x,
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - y,
  );
  return { height, width, x, y };
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}
