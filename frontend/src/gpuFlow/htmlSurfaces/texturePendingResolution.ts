import type { GpuQueueWithElementUpload } from "../htmlInCanvasTypes";
import type {
  TextureResolution,
  TextureResolutionSnapshot,
} from "../textureResolution";
import { textureResolutionMatches } from "../textureResolution";
import type {
  HtmlSurfaceTextureRecord,
  HtmlSurfaceTextureTileRecord,
} from "./textures";
import {
  uploadHtmlSurfaceTextureRecord,
  type HtmlSurfaceTextureUploadBudget,
  type SurfaceTextureLayoutResources,
} from "./textureTiles";

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key];
};

export type PendingHtmlSurfaceTextureRecord = Mutable<
  Pick<
    HtmlSurfaceTextureRecord,
    | "clampedByMaxTexture"
    | "cssHeight"
    | "cssWidth"
    | "dirtyContent"
    | "dirtyResolution"
    | "lastUploadFrame"
    | "maxTextureDimension2D"
    | "pixelHeight"
    | "pixelWidth"
    | "requestedScale"
    | "resolutionScale"
    | "sampler"
    | "surfaceId"
    | "texture"
    | "textureBytes"
    | "textureLayout"
    | "textureView"
    | "tiles"
    | "zoomBucket"
  >
>;

type PendingResolutionTextureEntry = Mutable<
  Pick<
    HtmlSurfaceTextureRecord,
    | "clampedByMaxTexture"
    | "cssHeight"
    | "cssWidth"
    | "dirtyContent"
    | "dirtyResolution"
    | "lastUploadFrame"
    | "maxTextureDimension2D"
    | "pixelHeight"
    | "pixelWidth"
    | "requestedScale"
    | "resolutionScale"
    | "sampler"
    | "surfaceId"
    | "texture"
    | "textureBytes"
    | "textureLayout"
    | "textureView"
    | "tiles"
    | "zoomBucket"
  >
> & {
  element: Element;
  pendingResolution: TextureResolution | null;
  pendingTextureRecord: PendingHtmlSurfaceTextureRecord | null;
};

type TextureUploadBudgetOptions = Pick<
  HtmlSurfaceTextureUploadBudget,
  "maxBytes" | "maxDurationMs" | "maxUploads" | "now"
>;

export function uploadPendingResolutionRecord({
  createTextureLayoutResources,
  destroyTextureTiles,
  frame,
  options,
  queue,
  record,
  uploadProgress,
}: {
  readonly createTextureLayoutResources: (
    surfaceId: string,
    resolution: TextureResolution,
    dirtyState: Pick<
      HtmlSurfaceTextureTileRecord,
      "dirtyContent" | "dirtyResolution" | "lastUploadFrame"
    >,
  ) => SurfaceTextureLayoutResources;
  readonly destroyTextureTiles: (
    tiles: readonly HtmlSurfaceTextureTileRecord[],
  ) => void;
  readonly frame: number;
  readonly options: TextureUploadBudgetOptions;
  readonly queue: GpuQueueWithElementUpload;
  readonly record: PendingResolutionTextureEntry;
  readonly uploadProgress: Pick<
    HtmlSurfaceTextureUploadBudget,
    "startedAt" | "uploadedBytes" | "uploadedTextureCount"
  >;
}) {
  const pendingRecord = ensurePendingResolutionRecord({
    createTextureLayoutResources,
    destroyTextureTiles,
    record,
  });
  const upload = uploadHtmlSurfaceTextureRecord(
    queue,
    {
      ...pendingRecord,
      element: record.element,
    },
    createTextureUploadBudget(options, uploadProgress),
  );
  if (upload.uploadedTextureCount === 0) {
    return upload;
  }
  updatePendingUploadedTiles({
    frame,
    pendingRecord,
    uploadedTileIds: upload.uploadedTileIds,
  });
  if (upload.complete) {
    commitPendingResolutionRecord({
      destroyTextureTiles,
      frame,
      pendingRecord,
      record,
    });
  }
  return upload;
}

export function createTextureUploadBudget(
  options: TextureUploadBudgetOptions,
  uploadProgress: Pick<
    HtmlSurfaceTextureUploadBudget,
    "startedAt" | "uploadedBytes" | "uploadedTextureCount"
  >,
): HtmlSurfaceTextureUploadBudget {
  return {
    maxBytes: options.maxBytes,
    maxDurationMs: options.maxDurationMs,
    maxUploads: options.maxUploads,
    now: options.now,
    ...uploadProgress,
  };
}

export function pendingTextureResolutionMatches(
  pendingRecord: PendingHtmlSurfaceTextureRecord,
  resolution: TextureResolutionSnapshot,
): boolean {
  return textureResolutionMatches(
    resolutionSnapshot(pendingRecord),
    resolution,
  );
}

function ensurePendingResolutionRecord({
  createTextureLayoutResources,
  destroyTextureTiles,
  record,
}: {
  readonly createTextureLayoutResources: (
    surfaceId: string,
    resolution: TextureResolution,
    dirtyState: Pick<
      HtmlSurfaceTextureTileRecord,
      "dirtyContent" | "dirtyResolution" | "lastUploadFrame"
    >,
  ) => SurfaceTextureLayoutResources;
  readonly destroyTextureTiles: (
    tiles: readonly HtmlSurfaceTextureTileRecord[],
  ) => void;
  readonly record: PendingResolutionTextureEntry;
}): PendingHtmlSurfaceTextureRecord {
  const resolution = record.pendingResolution;
  if (!resolution) {
    throw new Error(
      `Setta HTML surface "${record.surfaceId}" has no pending texture resolution to upload.`,
    );
  }
  const existing = record.pendingTextureRecord;
  if (existing && pendingTextureResolutionMatches(existing, resolution)) {
    return existing;
  }
  if (existing) {
    destroyTextureTiles(existing.tiles);
  }

  const layoutResources = createTextureLayoutResources(
    record.surfaceId,
    resolution,
    {
      dirtyContent: true,
      dirtyResolution: true,
      lastUploadFrame: -1,
    },
  );
  const pendingRecord: PendingHtmlSurfaceTextureRecord = {
    ...layoutResources.primaryResources,
    clampedByMaxTexture: resolution.clampedByMaxTexture,
    cssHeight: resolution.cssHeight,
    cssWidth: resolution.cssWidth,
    dirtyContent: true,
    dirtyResolution: true,
    lastUploadFrame: -1,
    maxTextureDimension2D: resolution.maxTextureDimension2D,
    pixelHeight: resolution.pixelHeight,
    pixelWidth: resolution.pixelWidth,
    requestedScale: resolution.requestedScale,
    resolutionScale: resolution.resolutionScale,
    surfaceId: record.surfaceId,
    textureBytes: layoutResources.textureBytes,
    textureLayout: layoutResources.textureLayout,
    tiles: layoutResources.tiles,
    zoomBucket: resolution.zoomBucket,
  };
  record.pendingTextureRecord = pendingRecord;
  return pendingRecord;
}

function updatePendingUploadedTiles({
  frame,
  pendingRecord,
  uploadedTileIds,
}: {
  readonly frame: number;
  readonly pendingRecord: PendingHtmlSurfaceTextureRecord;
  readonly uploadedTileIds: readonly string[];
}) {
  const uploadedIds = new Set(uploadedTileIds);
  pendingRecord.lastUploadFrame = frame;
  pendingRecord.tiles = pendingRecord.tiles.map((tile) => ({
    ...tile,
    dirtyContent: uploadedIds.has(tile.tileId) ? false : tile.dirtyContent,
    dirtyResolution: uploadedIds.has(tile.tileId)
      ? false
      : tile.dirtyResolution,
    lastUploadFrame: uploadedIds.has(tile.tileId)
      ? frame
      : tile.lastUploadFrame,
  }));
  pendingRecord.dirtyContent = pendingRecord.tiles.some(
    (tile) => tile.dirtyContent,
  );
  pendingRecord.dirtyResolution = pendingRecord.tiles.some(
    (tile) => tile.dirtyResolution,
  );
}

function commitPendingResolutionRecord({
  destroyTextureTiles,
  frame,
  pendingRecord,
  record,
}: {
  readonly destroyTextureTiles: (
    tiles: readonly HtmlSurfaceTextureTileRecord[],
  ) => void;
  readonly frame: number;
  readonly pendingRecord: PendingHtmlSurfaceTextureRecord;
  readonly record: PendingResolutionTextureEntry;
}) {
  const previousTiles = record.tiles;
  record.texture = pendingRecord.texture;
  record.textureView = pendingRecord.textureView;
  record.sampler = pendingRecord.sampler;
  record.clampedByMaxTexture = pendingRecord.clampedByMaxTexture;
  record.cssHeight = pendingRecord.cssHeight;
  record.cssWidth = pendingRecord.cssWidth;
  record.dirtyContent = false;
  record.dirtyResolution = false;
  record.lastUploadFrame = frame;
  record.maxTextureDimension2D = pendingRecord.maxTextureDimension2D;
  record.pendingResolution = null;
  record.pendingTextureRecord = null;
  record.pixelHeight = pendingRecord.pixelHeight;
  record.pixelWidth = pendingRecord.pixelWidth;
  record.requestedScale = pendingRecord.requestedScale;
  record.resolutionScale = pendingRecord.resolutionScale;
  record.textureBytes = pendingRecord.textureBytes;
  record.textureLayout = pendingRecord.textureLayout;
  record.tiles = pendingRecord.tiles;
  record.zoomBucket = pendingRecord.zoomBucket;
  destroyTextureTiles(previousTiles);
}

function resolutionSnapshot(
  record: PendingHtmlSurfaceTextureRecord,
): TextureResolutionSnapshot {
  return {
    cssHeight: record.cssHeight,
    cssWidth: record.cssWidth,
    pixelHeight: record.pixelHeight,
    pixelWidth: record.pixelWidth,
    resolutionScale: record.resolutionScale,
    zoomBucket: record.zoomBucket,
  };
}
