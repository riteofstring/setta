import type { GpuQueueWithElementUpload } from "../htmlInCanvasTypes";
import type {
  TextureResolution,
  TextureResolutionSnapshot,
} from "../textureResolution";
import { textureResolutionMatches } from "../textureResolution";
import type {
  CommittedHtmlSurfaceTextureSnapshot,
  HtmlSurfaceTextureTileRecord,
} from "./textures";
import {
  uploadHtmlSurfaceTextureSnapshot,
  type HtmlSurfaceTextureUploadBudget,
  type SurfaceTextureLayoutResources,
} from "./textureTiles";

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key];
};

export type PendingHtmlSurfaceTextureSnapshot = Mutable<
  Pick<
    CommittedHtmlSurfaceTextureSnapshot,
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
    | "textureContentKey"
    | "textureLayout"
    | "textureSourceRect"
    | "textureView"
    | "tiles"
    | "zoomBucket"
  >
>;

type PendingResolutionTextureHandle = {
  committed: CommittedHtmlSurfaceTextureSnapshot;
  element: Element;
  pendingResolution: TextureResolution | null;
  pendingTextureRecord: PendingHtmlSurfaceTextureSnapshot | null;
  pendingTextureContentKey?:
    | CommittedHtmlSurfaceTextureSnapshot["textureContentKey"]
    | null
    | undefined;
  pendingTextureSourceRect?:
    | CommittedHtmlSurfaceTextureSnapshot["textureSourceRect"]
    | null
    | undefined;
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
  handle,
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
  readonly handle: PendingResolutionTextureHandle;
  readonly uploadProgress: Pick<
    HtmlSurfaceTextureUploadBudget,
    "startedAt" | "uploadedBytes" | "uploadedTextureCount"
  >;
}) {
  const pendingRecord = ensurePendingResolutionRecord({
    createTextureLayoutResources,
    destroyTextureTiles,
    handle,
  });
  const upload = uploadHtmlSurfaceTextureSnapshot(
    queue,
    {
      ...pendingRecord,
      element: handle.element,
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
      handle,
      pendingRecord,
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
  pendingRecord: PendingHtmlSurfaceTextureSnapshot,
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
  handle,
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
  readonly handle: PendingResolutionTextureHandle;
}): PendingHtmlSurfaceTextureSnapshot {
  const resolution = handle.pendingResolution;
  if (!resolution) {
    throw new Error(
      `Setta HTML surface "${handle.committed.surfaceId}" has no pending texture resolution to upload.`,
    );
  }
  const descriptor = resolvePendingTextureDescriptor(handle);
  const existing = handle.pendingTextureRecord;
  if (
    existing &&
    pendingTextureResolutionMatches(existing, resolution) &&
    existing.textureContentKey === descriptor.textureContentKey &&
    textureSourceRectsEqual(
      existing.textureSourceRect,
      descriptor.textureSourceRect,
    )
  ) {
    return existing;
  }
  if (existing) {
    destroyTextureTiles(existing.tiles);
  }

  const layoutResources = createTextureLayoutResources(
    handle.committed.surfaceId,
    resolution,
    {
      dirtyContent: true,
      dirtyResolution: true,
      lastUploadFrame: -1,
    },
  );
  const pendingRecord: PendingHtmlSurfaceTextureSnapshot = {
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
    surfaceId: handle.committed.surfaceId,
    textureBytes: layoutResources.textureBytes,
    textureLayout: layoutResources.textureLayout,
    ...textureContentKeyOption(descriptor.textureContentKey),
    ...textureSourceRectOption(descriptor.textureSourceRect),
    tiles: layoutResources.tiles,
    zoomBucket: resolution.zoomBucket,
  };
  handle.pendingTextureRecord = pendingRecord;
  return pendingRecord;
}

function updatePendingUploadedTiles({
  frame,
  pendingRecord,
  uploadedTileIds,
}: {
  readonly frame: number;
  readonly pendingRecord: PendingHtmlSurfaceTextureSnapshot;
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
  handle,
  pendingRecord,
}: {
  readonly destroyTextureTiles: (
    tiles: readonly HtmlSurfaceTextureTileRecord[],
  ) => void;
  readonly frame: number;
  readonly handle: PendingResolutionTextureHandle;
  readonly pendingRecord: PendingHtmlSurfaceTextureSnapshot;
}) {
  const previousCommitted = handle.committed;
  const previousTiles = previousCommitted.tiles;
  handle.committed = {
    ...previousCommitted,
    ...pendingRecord,
    dirtyContent: false,
    dirtyResolution: false,
    lastUploadFrame: frame,
    ...textureContentKeyOption(
      handle.pendingTextureContentKey === undefined
        ? pendingRecord.textureContentKey
        : handle.pendingTextureContentKey ?? undefined,
    ),
    ...textureSourceRectOption(
      handle.pendingTextureSourceRect === undefined
        ? pendingRecord.textureSourceRect
        : handle.pendingTextureSourceRect ?? undefined,
    ),
  };
  handle.pendingResolution = null;
  handle.pendingTextureRecord = null;
  handle.pendingTextureContentKey = undefined;
  handle.pendingTextureSourceRect = undefined;
  destroyTextureTiles(previousTiles);
}

function resolutionSnapshot(
  record: PendingHtmlSurfaceTextureSnapshot,
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

function textureSourceRectOption(
  textureSourceRect: CommittedHtmlSurfaceTextureSnapshot["textureSourceRect"],
):
  | Pick<PendingHtmlSurfaceTextureSnapshot, "textureSourceRect">
  | Record<string, never> {
  return textureSourceRect ? { textureSourceRect } : {};
}

function textureContentKeyOption(
  textureContentKey: CommittedHtmlSurfaceTextureSnapshot["textureContentKey"],
):
  | Pick<PendingHtmlSurfaceTextureSnapshot, "textureContentKey">
  | Record<string, never> {
  return textureContentKey ? { textureContentKey } : {};
}

function resolvePendingTextureDescriptor(
  handle: PendingResolutionTextureHandle,
): Pick<
  PendingHtmlSurfaceTextureSnapshot,
  "textureContentKey" | "textureSourceRect"
> {
  return {
    textureContentKey:
      handle.pendingTextureContentKey === undefined
        ? handle.committed.textureContentKey
        : handle.pendingTextureContentKey ?? undefined,
    textureSourceRect:
      handle.pendingTextureSourceRect === undefined
        ? handle.committed.textureSourceRect
        : handle.pendingTextureSourceRect ?? undefined,
  };
}

function textureSourceRectsEqual(
  left: CommittedHtmlSurfaceTextureSnapshot["textureSourceRect"],
  right: CommittedHtmlSurfaceTextureSnapshot["textureSourceRect"],
): boolean {
  if (!left || !right) {
    return left === right;
  }
  return (
    left.height === right.height &&
    left.width === right.width &&
    left.x === right.x &&
    left.y === right.y
  );
}
