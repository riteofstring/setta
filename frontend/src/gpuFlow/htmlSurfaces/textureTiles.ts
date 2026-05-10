import type { GpuQueueWithElementUpload } from "../htmlInCanvasTypes";
import type { TextureResolution } from "../textureResolution";
import type {
  CommittedHtmlSurfaceTextureSnapshot,
  HtmlSurfaceTextureLayout,
  HtmlSurfaceTextureTileRecord,
} from "./textures";
import {
  resolveTextureSourceRectUploadRegion,
  type HtmlSurfaceTextureSourceRect,
} from "./textureSourceRectUpload";

export type HtmlSurfaceTextureResources = Pick<
  CommittedHtmlSurfaceTextureSnapshot,
  "sampler" | "texture" | "textureView"
>;

export type SurfaceTextureLayoutResources = {
  readonly primaryResources: HtmlSurfaceTextureResources;
  readonly textureBytes: number;
  readonly textureLayout: HtmlSurfaceTextureLayout;
  readonly tiles: readonly HtmlSurfaceTextureTileRecord[];
};

type CreateSurfaceTextureLayoutResourcesInput = {
  readonly createTextureResources: (
    surfaceId: string,
    dimensions: Pick<TextureResolution, "pixelHeight" | "pixelWidth">,
  ) => HtmlSurfaceTextureResources;
  readonly dirtyState: Pick<
    HtmlSurfaceTextureTileRecord,
    "dirtyContent" | "dirtyResolution" | "lastUploadFrame"
  >;
  readonly format: GPUTextureFormat;
  readonly maxTextureTileDimension2D: number;
  readonly resolution: TextureResolution;
  readonly surfaceId: string;
};

type UploadHtmlSurfaceTextureSnapshotInput = Pick<
  CommittedHtmlSurfaceTextureSnapshot,
  | "cssHeight"
  | "cssWidth"
  | "dirtyContent"
  | "dirtyResolution"
  | "lastUploadFrame"
  | "pixelHeight"
  | "pixelWidth"
  | "texture"
  | "textureBytes"
  | "textureLayout"
  | "tiles"
> & {
  readonly element: Element;
};

export type HtmlSurfaceTextureUploadBudget = {
  readonly maxBytes: number;
  readonly maxDurationMs: number;
  readonly maxUploads: number;
  readonly now: () => number;
  readonly startedAt: number;
  readonly uploadedBytes: number;
  readonly uploadedTextureCount: number;
};

export type HtmlSurfaceTextureUploadResult = {
  readonly complete: boolean;
  readonly uploadedBytes: number;
  readonly uploadedTextureCount: number;
  readonly uploadedTileIds: readonly string[];
};

const DEFAULT_HTML_SURFACE_TEXTURE_TILE_DIMENSION_PX = 2048;
export const DEFAULT_HTML_SURFACE_TEXTURE_UPLOAD_BUDGET_BYTES =
  DEFAULT_HTML_SURFACE_TEXTURE_TILE_DIMENSION_PX *
  DEFAULT_HTML_SURFACE_TEXTURE_TILE_DIMENSION_PX *
  4;

export function createSurfaceTextureLayoutResources({
  createTextureResources,
  dirtyState,
  format,
  maxTextureTileDimension2D,
  resolution,
  surfaceId,
}: CreateSurfaceTextureLayoutResourcesInput): SurfaceTextureLayoutResources {
  const columnCount = Math.ceil(
    resolution.pixelWidth / maxTextureTileDimension2D,
  );
  const rowCount = Math.ceil(
    resolution.pixelHeight / maxTextureTileDimension2D,
  );
  if (columnCount <= 1 && rowCount <= 1) {
    return createSingleTextureLayoutResources({
      createTextureResources,
      dirtyState,
      format,
      resolution,
      surfaceId,
    });
  }
  return createTiledTextureLayoutResources({
    columnCount,
    createTextureResources,
    dirtyState,
    format,
    maxTextureTileDimension2D,
    resolution,
    rowCount,
    surfaceId,
  });
}

export function uploadHtmlSurfaceTextureSnapshot(
  queue: GpuQueueWithElementUpload,
  record: UploadHtmlSurfaceTextureSnapshotInput,
  budget?: HtmlSurfaceTextureUploadBudget | undefined,
  dirtySourceRect?: HtmlSurfaceTextureSourceRect | undefined,
): HtmlSurfaceTextureUploadResult {
  const dirtyTiles = dirtyTextureTiles(record);
  let uploadedBytes = 0;
  let uploadedTextureCount = 0;
  const uploadedTileIds: string[] = [];

  for (const tile of dirtyTiles) {
    if (
      shouldStopTextureUpload({
        budget,
        uploadedBytes,
        uploadedTextureCount,
      })
    ) {
      break;
    }

    const upload = uploadHtmlSurfaceTextureTile({
      dirtySourceRect,
      queue,
      record,
      tile,
    });
    if (!upload) {
      continue;
    }

    uploadedBytes += upload.uploadedBytes;
    uploadedTextureCount += 1;
    uploadedTileIds.push(upload.tileId);
  }

  return {
    complete: uploadedTileIds.length === dirtyTiles.length,
    uploadedBytes,
    uploadedTextureCount,
    uploadedTileIds,
  };
}

type UploadedTextureTile = {
  readonly tileId: string;
  readonly uploadedBytes: number;
};

function uploadHtmlSurfaceTextureTile({
  dirtySourceRect,
  queue,
  record,
  tile,
}: {
  readonly dirtySourceRect: HtmlSurfaceTextureSourceRect | undefined;
  readonly queue: GpuQueueWithElementUpload;
  readonly record: UploadHtmlSurfaceTextureSnapshotInput;
  readonly tile: HtmlSurfaceTextureTileRecord;
}): UploadedTextureTile | null {
  if (record.textureLayout.kind === "single") {
    return uploadSingleHtmlSurfaceTextureTile({
      dirtySourceRect,
      queue,
      record,
      tile,
    });
  }
  if (canUploadTiledTextureSourceRect(record, dirtySourceRect)) {
    return uploadTiledHtmlSurfaceTextureSourceRect({
      dirtySourceRect,
      queue,
      record,
      tile,
    });
  }
  uploadFullTiledHtmlSurfaceTextureTile({ queue, record, tile });
  return {
    tileId: tile.tileId,
    uploadedBytes: tile.textureBytes,
  };
}

function uploadSingleHtmlSurfaceTextureTile({
  dirtySourceRect,
  queue,
  record,
  tile,
}: {
  readonly dirtySourceRect: HtmlSurfaceTextureSourceRect | undefined;
  readonly queue: GpuQueueWithElementUpload;
  readonly record: UploadHtmlSurfaceTextureSnapshotInput;
  readonly tile: HtmlSurfaceTextureTileRecord;
}): UploadedTextureTile {
  if (canUploadSingleTextureSourceRect(record, dirtySourceRect)) {
    const region = resolveTextureSourceRectUploadRegion(
      record,
      dirtySourceRect,
    );
    queue.copyElementImageToTexture?.(
      record.element,
      region.sourceX,
      region.sourceY,
      region.sourceWidth,
      region.sourceHeight,
      region.pixelWidth,
      region.pixelHeight,
      {
        origin: {
          x: region.destinationX,
          y: region.destinationY,
        },
        texture: record.texture,
      },
    );
    return {
      tileId: tile.tileId,
      uploadedBytes: region.byteLength,
    };
  }

  queue.copyElementImageToTexture?.(
    record.element,
    record.pixelWidth,
    record.pixelHeight,
    {
      texture: record.texture,
    },
  );
  return {
    tileId: tile.tileId,
    uploadedBytes: tile.textureBytes,
  };
}

function uploadTiledHtmlSurfaceTextureSourceRect({
  dirtySourceRect,
  queue,
  record,
  tile,
}: {
  readonly dirtySourceRect: HtmlSurfaceTextureSourceRect;
  readonly queue: GpuQueueWithElementUpload;
  readonly record: UploadHtmlSurfaceTextureSnapshotInput;
  readonly tile: HtmlSurfaceTextureTileRecord;
}): UploadedTextureTile | null {
  const region = resolveTiledTextureSourceRectUploadRegion(
    tile,
    dirtySourceRect,
  );
  if (!region) {
    return null;
  }
  queue.copyElementImageToTexture?.(
    record.element,
    region.sourceX,
    region.sourceY,
    region.sourceWidth,
    region.sourceHeight,
    region.pixelWidth,
    region.pixelHeight,
    {
      origin: {
        x: region.destinationX,
        y: region.destinationY,
      },
      texture: tile.texture,
    },
  );
  return {
    tileId: tile.tileId,
    uploadedBytes: region.byteLength,
  };
}

function uploadFullTiledHtmlSurfaceTextureTile({
  queue,
  record,
  tile,
}: {
  readonly queue: GpuQueueWithElementUpload;
  readonly record: UploadHtmlSurfaceTextureSnapshotInput;
  readonly tile: HtmlSurfaceTextureTileRecord;
}): void {
  queue.copyElementImageToTexture?.(
    record.element,
    tile.cssX,
    tile.cssY,
    tile.cssWidth,
    tile.cssHeight,
    tile.pixelWidth,
    tile.pixelHeight,
    {
      texture: tile.texture,
    },
  );
}

function canUploadSingleTextureSourceRect(
  record: UploadHtmlSurfaceTextureSnapshotInput,
  dirtySourceRect: HtmlSurfaceTextureSourceRect | undefined,
): dirtySourceRect is HtmlSurfaceTextureSourceRect {
  return (
    dirtySourceRect !== undefined &&
    record.textureLayout.kind === "single" &&
    record.dirtyContent &&
    !record.dirtyResolution &&
    record.lastUploadFrame >= 0
  );
}

function canUploadTiledTextureSourceRect(
  record: UploadHtmlSurfaceTextureSnapshotInput,
  dirtySourceRect: HtmlSurfaceTextureSourceRect | undefined,
): dirtySourceRect is HtmlSurfaceTextureSourceRect {
  return (
    dirtySourceRect !== undefined &&
    record.textureLayout.kind === "tiled" &&
    record.dirtyContent &&
    !record.dirtyResolution &&
    record.lastUploadFrame >= 0
  );
}

function resolveTiledTextureSourceRectUploadRegion(
  tile: HtmlSurfaceTextureTileRecord,
  sourceRect: HtmlSurfaceTextureSourceRect,
) {
  const intersection = intersectTextureSourceRects(sourceRect, {
    height: tile.cssHeight,
    width: tile.cssWidth,
    x: tile.cssX,
    y: tile.cssY,
  });
  if (!intersection) {
    return null;
  }
  const region = resolveTextureSourceRectUploadRegion(tile, {
    height: intersection.height,
    width: intersection.width,
    x: intersection.x - tile.cssX,
    y: intersection.y - tile.cssY,
  });
  return {
    ...region,
    sourceX: tile.cssX + region.sourceX,
    sourceY: tile.cssY + region.sourceY,
  };
}

function intersectTextureSourceRects(
  left: HtmlSurfaceTextureSourceRect,
  right: HtmlSurfaceTextureSourceRect,
): HtmlSurfaceTextureSourceRect | null {
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
  return width > 0 && height > 0 ? { height, width, x, y } : null;
}

export function normalizeTextureTileDimension({
  maxTextureDimension2D,
  maxTextureTileDimension2D,
}: {
  readonly maxTextureDimension2D: number;
  readonly maxTextureTileDimension2D: number | undefined;
}): number {
  const resolvedDimension =
    maxTextureTileDimension2D ??
    Math.min(
      maxTextureDimension2D,
      DEFAULT_HTML_SURFACE_TEXTURE_TILE_DIMENSION_PX,
    );
  if (
    Number.isNaN(resolvedDimension) ||
    resolvedDimension <= 0 ||
    resolvedDimension > maxTextureDimension2D
  ) {
    throw new Error(
      "Setta GPU flow HTML surface texture tile dimension must be greater than zero and no larger than maxTextureDimension2D.",
    );
  }
  return Math.floor(resolvedDimension);
}

function createSingleTextureLayoutResources({
  createTextureResources,
  dirtyState,
  format,
  resolution,
  surfaceId,
}: Omit<
  CreateSurfaceTextureLayoutResourcesInput,
  "maxTextureTileDimension2D"
>): SurfaceTextureLayoutResources {
  const resources = createTextureResources(surfaceId, resolution);
  const textureBytes = estimateTextureMemoryBytes({
    format,
    pixelHeight: resolution.pixelHeight,
    pixelWidth: resolution.pixelWidth,
  });
  const tiles = [
    createSurfaceTextureTile({
      ...dirtyState,
      cssHeight: resolution.cssHeight,
      cssWidth: resolution.cssWidth,
      cssX: 0,
      cssY: 0,
      pixelHeight: resolution.pixelHeight,
      pixelWidth: resolution.pixelWidth,
      resources,
      surfaceId,
      textureBytes,
      tileId: `${surfaceId}:0:0`,
      u0: 0,
      u1: 1,
      v0: 0,
      v1: 1,
    }),
  ];
  return {
    primaryResources: resources,
    textureBytes,
    textureLayout: { kind: "single", tileCount: 1 },
    tiles,
  };
}

function createTiledTextureLayoutResources({
  columnCount,
  createTextureResources,
  dirtyState,
  format,
  maxTextureTileDimension2D,
  resolution,
  rowCount,
  surfaceId,
}: CreateSurfaceTextureLayoutResourcesInput & {
  readonly columnCount: number;
  readonly rowCount: number;
}): SurfaceTextureLayoutResources {
  const tiles: HtmlSurfaceTextureTileRecord[] = [];
  let textureBytes = 0;
  for (let row = 0; row < rowCount; row += 1) {
    const rowGeometry = resolveTileAxisGeometry({
      axisPixelSize: resolution.pixelHeight,
      axisCssSize: resolution.cssHeight,
      index: row,
      maxTextureTileDimension2D,
      tileCount: rowCount,
    });
    for (let column = 0; column < columnCount; column += 1) {
      const columnGeometry = resolveTileAxisGeometry({
        axisPixelSize: resolution.pixelWidth,
        axisCssSize: resolution.cssWidth,
        index: column,
        maxTextureTileDimension2D,
        tileCount: columnCount,
      });
      const tileTextureBytes = estimateTextureMemoryBytes({
        format,
        pixelHeight: rowGeometry.pixelSize,
        pixelWidth: columnGeometry.pixelSize,
      });
      const tileId = `${surfaceId}:${column}:${row}`;
      const resources = createTextureResources(tileId, {
        pixelHeight: rowGeometry.pixelSize,
        pixelWidth: columnGeometry.pixelSize,
      });
      textureBytes += tileTextureBytes;
      tiles.push(
        createSurfaceTextureTile({
          ...dirtyState,
          cssHeight: rowGeometry.cssSize,
          cssWidth: columnGeometry.cssSize,
          cssX: columnGeometry.cssOffset,
          cssY: rowGeometry.cssOffset,
          pixelHeight: rowGeometry.pixelSize,
          pixelWidth: columnGeometry.pixelSize,
          resources,
          surfaceId,
          textureBytes: tileTextureBytes,
          tileId,
          u0: columnGeometry.cssOffset / resolution.cssWidth,
          u1:
            (columnGeometry.cssOffset + columnGeometry.cssSize) /
            resolution.cssWidth,
          v0: rowGeometry.cssOffset / resolution.cssHeight,
          v1:
            (rowGeometry.cssOffset + rowGeometry.cssSize) /
            resolution.cssHeight,
        }),
      );
    }
  }
  const primaryTile = tiles[0];
  if (!primaryTile) {
    throw new Error(
      `Setta HTML surface "${surfaceId}" could not create texture tiles.`,
    );
  }
  return {
    primaryResources: {
      sampler: primaryTile.sampler,
      texture: primaryTile.texture,
      textureView: primaryTile.textureView,
    },
    textureBytes,
    textureLayout: {
      columns: columnCount,
      kind: "tiled",
      maxTilePixelHeight: maxTextureTileDimension2D,
      maxTilePixelWidth: maxTextureTileDimension2D,
      rows: rowCount,
      tileCount: tiles.length,
    },
    tiles,
  };
}

function resolveTileAxisGeometry({
  axisCssSize,
  axisPixelSize,
  index,
  maxTextureTileDimension2D,
  tileCount,
}: {
  readonly axisCssSize: number;
  readonly axisPixelSize: number;
  readonly index: number;
  readonly maxTextureTileDimension2D: number;
  readonly tileCount: number;
}): {
  readonly cssOffset: number;
  readonly cssSize: number;
  readonly pixelSize: number;
} {
  const pixelOffset = index * maxTextureTileDimension2D;
  const pixelSize = Math.min(
    maxTextureTileDimension2D,
    axisPixelSize - pixelOffset,
  );
  const cssOffset = (pixelOffset / axisPixelSize) * axisCssSize;
  return {
    cssOffset,
    cssSize:
      index === tileCount - 1
        ? axisCssSize - cssOffset
        : (pixelSize / axisPixelSize) * axisCssSize,
    pixelSize,
  };
}

function createSurfaceTextureTile({
  cssHeight,
  cssWidth,
  cssX,
  cssY,
  dirtyContent,
  dirtyResolution,
  lastUploadFrame,
  pixelHeight,
  pixelWidth,
  resources,
  surfaceId,
  textureBytes,
  tileId,
  u0,
  u1,
  v0,
  v1,
}: Omit<HtmlSurfaceTextureTileRecord, "sampler" | "texture" | "textureView"> & {
  readonly resources: HtmlSurfaceTextureResources;
}): HtmlSurfaceTextureTileRecord {
  return {
    ...resources,
    cssHeight,
    cssWidth,
    cssX,
    cssY,
    dirtyContent,
    dirtyResolution,
    lastUploadFrame,
    pixelHeight,
    pixelWidth,
    surfaceId,
    textureBytes,
    tileId,
    u0,
    u1,
    v0,
    v1,
  };
}

function dirtyTextureTiles({
  dirtyContent,
  dirtyResolution,
  tiles,
}: Pick<
  UploadHtmlSurfaceTextureSnapshotInput,
  "dirtyContent" | "dirtyResolution" | "tiles"
>): readonly HtmlSurfaceTextureTileRecord[] {
  if (!dirtyContent && !dirtyResolution) {
    return [];
  }
  const dirtyTiles = tiles.filter(
    (tile) => tile.dirtyContent || tile.dirtyResolution,
  );
  return dirtyTiles.length > 0 ? dirtyTiles : tiles;
}

function shouldStopTextureUpload({
  budget,
  uploadedBytes,
  uploadedTextureCount,
}: {
  readonly budget: HtmlSurfaceTextureUploadBudget | undefined;
  readonly uploadedBytes: number;
  readonly uploadedTextureCount: number;
}): boolean {
  if (!budget) {
    return false;
  }
  const totalUploadedTextureCount =
    budget.uploadedTextureCount + uploadedTextureCount;
  if (totalUploadedTextureCount >= budget.maxUploads) {
    return true;
  }
  if (
    totalUploadedTextureCount > 0 &&
    budget.uploadedBytes + uploadedBytes >= budget.maxBytes
  ) {
    return true;
  }
  return (
    totalUploadedTextureCount > 0 &&
    budget.now() - budget.startedAt >= budget.maxDurationMs
  );
}

function estimateTextureMemoryBytes({
  format,
  pixelHeight,
  pixelWidth,
}: {
  readonly format: GPUTextureFormat;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
}): number {
  return pixelWidth * pixelHeight * bytesPerPixel(format);
}

function bytesPerPixel(format: GPUTextureFormat): number {
  switch (format) {
    case "bgra8unorm":
    case "bgra8unorm-srgb":
    case "rgba8unorm":
    case "rgba8unorm-srgb":
      return 4;
    default:
      throw new Error(
        `Setta GPU flow HTML surface texture memory accounting does not support ${format}.`,
      );
  }
}
