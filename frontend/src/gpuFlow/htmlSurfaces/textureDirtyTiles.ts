import type {
  HtmlSurfaceTextureLayout,
  HtmlSurfaceTextureRecord,
  HtmlSurfaceTextureTileRecord,
} from "./textures";
import {
  resolveTextureSourceRectUploadRegion,
  type HtmlSurfaceTextureSourceRect,
} from "./textureSourceRectUpload";

export type HtmlSurfaceDirtyRect = HtmlSurfaceTextureSourceRect;

type MutableTextureDirtyRecord = {
  dirtyContent: boolean;
  dirtyResolution: boolean;
  textureLayout: HtmlSurfaceTextureLayout;
  tiles: readonly HtmlSurfaceTextureTileRecord[];
};

export function markTextureRecordDirty(
  record: MutableTextureDirtyRecord,
  dirtyFlags: { readonly content: boolean; readonly resolution: boolean },
  sourceRect: HtmlSurfaceDirtyRect | undefined,
): boolean {
  const dirtyTileIds = resolveDirtyTextureTileIds(
    record,
    dirtyFlags,
    sourceRect,
  );
  if (dirtyTileIds.size === 0) {
    return record.dirtyContent || record.dirtyResolution;
  }

  record.tiles = record.tiles.map((tile) =>
    dirtyTileIds.has(tile.tileId)
      ? {
          ...tile,
          dirtyContent: tile.dirtyContent || dirtyFlags.content,
          dirtyResolution: tile.dirtyResolution || dirtyFlags.resolution,
        }
      : tile,
  );
  record.dirtyContent = record.tiles.some((tile) => tile.dirtyContent);
  record.dirtyResolution = record.tiles.some((tile) => tile.dirtyResolution);
  return record.dirtyContent || record.dirtyResolution;
}

export function estimateDirtyTextureUploadBytes(
  record: DirtyTextureRecord | undefined,
  sourceRect?: HtmlSurfaceDirtyRect | undefined,
): number {
  if (!record) {
    return 0;
  }
  const dirtyTiles = dirtyTextureTiles(record);
  if (dirtyTiles.length === 0) {
    return record.dirtyContent || record.dirtyResolution
      ? record.textureBytes
      : 0;
  }
  return estimateDirtyTextureTileBytes(record, dirtyTiles, sourceRect);
}

export function dirtyTextureTileSummary(
  record: DirtyTextureRecord | undefined,
  sourceRect?: HtmlSurfaceDirtyRect | undefined,
): {
  readonly dirtyTileBytes: number;
  readonly dirtyTileIds: readonly string[];
} {
  const dirtyTiles = dirtyTextureTiles(record);
  return {
    dirtyTileBytes: estimateDirtyTextureTileBytes(
      record,
      dirtyTiles,
      sourceRect,
    ),
    dirtyTileIds: dirtyTiles.map((tile) => tile.tileId),
  };
}

export function dirtyTextureTiles(
  record: DirtyTextureRecord | undefined,
): readonly HtmlSurfaceTextureTileRecord[] {
  if (!record || (!record.dirtyContent && !record.dirtyResolution)) {
    return [];
  }
  const dirtyTiles = record.tiles.filter(
    (tile) => tile.dirtyContent || tile.dirtyResolution,
  );
  return dirtyTiles.length > 0 ? dirtyTiles : record.tiles;
}

type DirtyTextureRecord = Pick<
  HtmlSurfaceTextureRecord,
  | "dirtyContent"
  | "dirtyResolution"
  | "lastUploadFrame"
  | "textureBytes"
  | "textureLayout"
  | "tiles"
> &
  Partial<
    Pick<
      HtmlSurfaceTextureRecord,
      "cssHeight" | "cssWidth" | "pixelHeight" | "pixelWidth"
    >
  >;

function estimateDirtyTextureTileBytes(
  record: DirtyTextureRecord | undefined,
  dirtyTiles: readonly HtmlSurfaceTextureTileRecord[],
  sourceRect: HtmlSurfaceDirtyRect | undefined,
): number {
  if (dirtyTiles.length === 0) {
    return 0;
  }
  if (
    record &&
    sourceRect &&
    record.textureLayout.kind === "single" &&
    record.dirtyContent &&
    !record.dirtyResolution &&
    record.lastUploadFrame >= 0 &&
    hasTextureSourceRectUploadDimensions(record)
  ) {
    return resolveTextureSourceRectUploadRegion(record, sourceRect).byteLength;
  }
  return dirtyTiles.reduce((bytes, tile) => bytes + tile.textureBytes, 0);
}

function hasTextureSourceRectUploadDimensions(
  record: DirtyTextureRecord,
): record is DirtyTextureRecord &
  Required<
    Pick<
      HtmlSurfaceTextureRecord,
      "cssHeight" | "cssWidth" | "pixelHeight" | "pixelWidth"
    >
  > {
  return (
    record.cssHeight !== undefined &&
    record.cssWidth !== undefined &&
    record.pixelHeight !== undefined &&
    record.pixelWidth !== undefined
  );
}

function resolveDirtyTextureTileIds(
  record: Pick<MutableTextureDirtyRecord, "textureLayout" | "tiles">,
  dirtyFlags: { readonly resolution: boolean },
  sourceRect: HtmlSurfaceDirtyRect | undefined,
): ReadonlySet<string> {
  if (dirtyFlags.resolution || record.textureLayout.kind === "single") {
    return allTileIds(record.tiles);
  }
  if (!sourceRect) {
    return allTileIds(record.tiles);
  }

  const rect = normalizeDirtySourceRect(sourceRect);
  const dirtyTileIds = new Set<string>();
  for (const tile of record.tiles) {
    if (sourceRectIntersectsTile(rect, tile)) {
      dirtyTileIds.add(tile.tileId);
    }
  }
  return dirtyTileIds;
}

function allTileIds(
  tiles: readonly Pick<HtmlSurfaceTextureTileRecord, "tileId">[],
): ReadonlySet<string> {
  return new Set(tiles.map((tile) => tile.tileId));
}

function normalizeDirtySourceRect(
  sourceRect: HtmlSurfaceDirtyRect,
): HtmlSurfaceDirtyRect {
  if (!isFinitePositiveSourceRect(sourceRect)) {
    throw new Error(
      "Setta GPU flow HTML surface tile dirty marks require a finite positive source rect.",
    );
  }
  return sourceRect;
}

function isFinitePositiveSourceRect({
  height,
  width,
  x,
  y,
}: HtmlSurfaceDirtyRect): boolean {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  );
}

function sourceRectIntersectsTile(
  sourceRect: HtmlSurfaceDirtyRect,
  tile: Pick<
    HtmlSurfaceTextureTileRecord,
    "cssHeight" | "cssWidth" | "cssX" | "cssY"
  >,
): boolean {
  return (
    sourceRect.x < tile.cssX + tile.cssWidth &&
    sourceRect.x + sourceRect.width > tile.cssX &&
    sourceRect.y < tile.cssY + tile.cssHeight &&
    sourceRect.y + sourceRect.height > tile.cssY
  );
}
