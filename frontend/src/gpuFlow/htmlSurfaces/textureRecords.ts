import type { DirtyNodeState, NodeTexturePriority } from "../dirtyTracking";
import type {
  TextureResolution,
  TextureResolutionSnapshot,
} from "../textureResolution";
import {
  dirtyTextureTileSummary,
  estimateDirtyTextureUploadBytes,
  markTextureRecordDirty,
  type HtmlSurfaceDirtyRect,
} from "./textureDirtyTiles";
import { compareSurfaceIds } from "./textureManagerHelpers";
import type { PendingHtmlSurfaceTextureSnapshot } from "./texturePendingResolution";

export type HtmlSurfaceTexturePriority = NodeTexturePriority;

export type DirtyHtmlSurfaceTextureState = Omit<DirtyNodeState, "nodeId"> & {
  readonly dirtyTileBytes: number;
  readonly dirtyTileIds: readonly string[];
  readonly surfaceId: string;
};

export type HtmlSurfaceTextureTileRecord = {
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly cssX: number;
  readonly cssY: number;
  readonly dirtyContent: boolean;
  readonly dirtyResolution: boolean;
  readonly lastUploadFrame: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly sampler: GPUSampler;
  readonly surfaceId: string;
  readonly texture: GPUTexture;
  readonly textureBytes: number;
  readonly textureView: GPUTextureView;
  readonly tileId: string;
  readonly u0: number;
  readonly u1: number;
  readonly v0: number;
  readonly v1: number;
};

export type HtmlSurfaceTextureLayout =
  | {
      readonly kind: "single";
      readonly tileCount: 1;
    }
  | {
      readonly columns: number;
      readonly kind: "tiled";
      readonly maxTilePixelHeight: number;
      readonly maxTilePixelWidth: number;
      readonly rows: number;
      readonly tileCount: number;
    };

export type CommittedHtmlSurfaceTextureSnapshot = {
  readonly clampedByMaxTexture: boolean;
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly dirtyContent: boolean;
  readonly dirtyResolution: boolean;
  readonly lastUploadFrame: number;
  readonly lastVisibleFrame: number;
  readonly maxTextureDimension2D: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly priority: HtmlSurfaceTexturePriority;
  readonly requestedScale: number;
  readonly resolutionScale: number;
  readonly sampler: GPUSampler;
  readonly surfaceId: string;
  readonly textureBytes: number;
  readonly texture: GPUTexture;
  readonly textureContentKey?: string | undefined;
  readonly textureView: GPUTextureView;
  readonly textureLayout: HtmlSurfaceTextureLayout;
  readonly textureSourceRect?: HtmlSurfaceDirtyRect | undefined;
  readonly tiles: readonly HtmlSurfaceTextureTileRecord[];
  readonly zoomBucket: number;
};

export type HtmlSurfaceTextureMemorySnapshot = {
  readonly allocatedBytes: number;
  readonly largestTextureBytes: number;
  readonly textureCount: number;
  readonly visibleBytes: number;
  readonly visibleTextureCount: number;
};

type HtmlSurfaceTextureSnapshotDiagnostic = {
  readonly clampedByMaxTexture: boolean;
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly dirtyContent: boolean;
  readonly dirtyResolution: boolean;
  readonly lastUploadFrame: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly requestedScale: number;
  readonly resolutionScale: number;
  readonly textureBytes: number;
  readonly textureContentKey?: string | undefined;
  readonly textureLayoutKind: HtmlSurfaceTextureLayout["kind"];
  readonly textureSourceRect?: HtmlSurfaceDirtyRect | undefined;
  readonly tileCount: number;
  readonly zoomBucket: number;
};

type HtmlSurfaceTextureResolutionDiagnostic = {
  readonly clampedByMaxTexture: boolean;
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly maxTextureDimension2D: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly requestedScale: number;
  readonly resolutionScale: number;
  readonly zoomBucket: number;
};

export type HtmlSurfaceTextureLifecycleDiagnostic = {
  readonly committed: HtmlSurfaceTextureSnapshotDiagnostic;
  readonly pending: HtmlSurfaceTextureSnapshotDiagnostic | null;
  readonly pendingResolution: HtmlSurfaceTextureResolutionDiagnostic | null;
  readonly priority: HtmlSurfaceTexturePriority;
  readonly surfaceId: string;
};

export type EvictHtmlSurfaceTexturesOptions = {
  readonly budgetBytes?: number | undefined;
  readonly protectedSurfaceIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly reason?: string | undefined;
  readonly visibleSurfaceIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
};

export type HtmlSurfaceTextureEvictionResult = {
  readonly budgetBytes: number;
  readonly evictedBytes: number;
  readonly evictedSurfaceIds: readonly string[];
  readonly memory: HtmlSurfaceTextureMemorySnapshot;
  readonly memoryBefore: HtmlSurfaceTextureMemorySnapshot;
  readonly overBudgetBytes: number;
  readonly protectedSurfaceIds: readonly string[];
  readonly reason: string;
};

export type HtmlSurfaceTextureHandle = {
  committed: CommittedHtmlSurfaceTextureSnapshot;
  element: Element;
  pendingResolution: TextureResolution | null;
  pendingTextureRecord: PendingHtmlSurfaceTextureSnapshot | null;
  pendingTextureContentKey?: string | null | undefined;
  pendingTextureSourceRect?: HtmlSurfaceDirtyRect | null | undefined;
};

export function destroyTextureRecord(handle: HtmlSurfaceTextureHandle) {
  destroyTextureTiles(handle.committed.tiles);
  if (handle.pendingTextureRecord) {
    destroyTextureTiles(handle.pendingTextureRecord.tiles);
  }
}

export function destroyTextureTiles(
  tiles: readonly HtmlSurfaceTextureTileRecord[],
) {
  const destroyedTextures = new Set<GPUTexture>();
  for (const tile of tiles) {
    if (destroyedTextures.has(tile.texture)) {
      continue;
    }
    tile.texture.destroy?.();
    destroyedTextures.add(tile.texture);
  }
}

export function estimateDirtySurfaceUploadBytes(
  dirtySurfaces: readonly DirtyNodeState[],
  records: ReadonlyMap<string, HtmlSurfaceTextureHandle>,
): number {
  let skippedBytes = 0;
  for (const dirtySurface of dirtySurfaces) {
    const handle = records.get(dirtySurface.nodeId);
    skippedBytes += estimateDirtyTextureUploadBytes(
      handle?.pendingTextureRecord ?? handle?.committed,
      dirtySurface.sourceRect,
    );
  }
  return skippedBytes;
}

export function toSurfaceTextureMemoryRecord(handle: HtmlSurfaceTextureHandle) {
  return {
    pendingTextureRecord: handle.pendingTextureRecord,
    surfaceId: handle.committed.surfaceId,
    textureBytes: handle.committed.textureBytes,
  };
}

export function commitPendingTextureSourceRect(
  handle: HtmlSurfaceTextureHandle,
) {
  if (
    handle.pendingTextureSourceRect === undefined &&
    handle.pendingTextureContentKey === undefined
  ) {
    return;
  }
  updateCommittedSurfaceTextureSnapshot(handle, {
    textureContentKey:
      handle.pendingTextureContentKey === undefined
        ? handle.committed.textureContentKey
        : handle.pendingTextureContentKey ?? undefined,
    textureSourceRect:
      handle.pendingTextureSourceRect === undefined
        ? handle.committed.textureSourceRect
        : handle.pendingTextureSourceRect ?? undefined,
  });
  handle.pendingTextureContentKey = undefined;
  handle.pendingTextureSourceRect = undefined;
}

export function textureSourceRectsEqual(
  left: HtmlSurfaceDirtyRect | undefined,
  right: HtmlSurfaceDirtyRect | undefined,
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

export function textureContentKeysEqual(
  left: string | undefined,
  right: string | undefined,
): boolean {
  return left === right;
}

export function resolveTargetTextureContentKey(
  handle: HtmlSurfaceTextureHandle,
): string | undefined {
  return handle.pendingTextureContentKey === undefined
    ? handle.committed.textureContentKey
    : handle.pendingTextureContentKey ?? undefined;
}

export function textureResolutionFromSnapshot(
  snapshot: CommittedHtmlSurfaceTextureSnapshot,
): TextureResolution {
  return {
    clampedByMaxTexture: snapshot.clampedByMaxTexture,
    cssHeight: snapshot.cssHeight,
    cssWidth: snapshot.cssWidth,
    devicePixelRatio:
      snapshot.zoomBucket > 0
        ? snapshot.requestedScale / snapshot.zoomBucket
        : snapshot.requestedScale,
    maxTextureDimension2D: snapshot.maxTextureDimension2D,
    pixelHeight: snapshot.pixelHeight,
    pixelWidth: snapshot.pixelWidth,
    requestedScale: snapshot.requestedScale,
    resolutionScale: snapshot.resolutionScale,
    zoom: snapshot.zoomBucket,
    zoomBucket: snapshot.zoomBucket,
  };
}

export function updateCommittedSurfaceTextureSnapshot(
  handle: HtmlSurfaceTextureHandle,
  updates: Partial<CommittedHtmlSurfaceTextureSnapshot>,
) {
  handle.committed = {
    ...handle.committed,
    ...updates,
  };
}

export function markExistingSurfaceTextureRecordDirty(
  handle: HtmlSurfaceTextureHandle,
  dirtyFlags: { readonly content: boolean; readonly resolution: boolean },
  input: {
    readonly priority?: HtmlSurfaceTexturePriority | undefined;
    readonly sourceRect?: HtmlSurfaceDirtyRect | undefined;
  },
): boolean {
  const dirtyCommitted = { ...handle.committed };
  const shouldQueueDirtySurface = markTextureRecordDirty(
    dirtyCommitted,
    dirtyFlags,
    input.sourceRect,
  );
  if (shouldQueueDirtySurface) {
    handle.committed = dirtyCommitted;
  }
  if (handle.pendingTextureRecord && dirtyFlags.content) {
    // Pending resolution textures already start resolution-dirty. Repeated
    // registration during zoom must not restart partially uploaded tiles.
    markTextureRecordDirty(
      handle.pendingTextureRecord,
      dirtyFlags,
      input.sourceRect,
    );
  }
  updateCommittedSurfaceTextureSnapshot(handle, {
    priority: input.priority ?? handle.committed.priority,
  });
  return shouldQueueDirtySurface;
}

export function toDirtySurfaceState(
  { nodeId, ...state }: DirtyNodeState,
  record: HtmlSurfaceTextureHandle | undefined,
): DirtyHtmlSurfaceTextureState {
  const dirtyTileSummary = dirtyTextureTileSummary(
    record?.pendingTextureRecord ?? record?.committed,
    state.sourceRect,
  );
  return {
    ...state,
    ...dirtyTileSummary,
    surfaceId: nodeId,
  };
}

export function compareEvictableSurfaceTextureRecords(
  left: HtmlSurfaceTextureHandle,
  right: HtmlSurfaceTextureHandle,
): number {
  return (
    left.committed.lastVisibleFrame - right.committed.lastVisibleFrame ||
    left.committed.lastUploadFrame - right.committed.lastUploadFrame ||
    compareSurfaceIds(left.committed.surfaceId, right.committed.surfaceId)
  );
}

export function compareSurfaceTextureRecords(
  left: HtmlSurfaceTextureHandle,
  right: HtmlSurfaceTextureHandle,
): number {
  return compareSurfaceIds(left.committed.surfaceId, right.committed.surfaceId);
}

export function toSurfaceTextureSnapshotDiagnostic(
  record:
    | CommittedHtmlSurfaceTextureSnapshot
    | PendingHtmlSurfaceTextureSnapshot,
): HtmlSurfaceTextureSnapshotDiagnostic {
  return {
    clampedByMaxTexture: record.clampedByMaxTexture,
    cssHeight: record.cssHeight,
    cssWidth: record.cssWidth,
    dirtyContent: record.dirtyContent,
    dirtyResolution: record.dirtyResolution,
    lastUploadFrame: record.lastUploadFrame,
    pixelHeight: record.pixelHeight,
    pixelWidth: record.pixelWidth,
    requestedScale: record.requestedScale,
    resolutionScale: record.resolutionScale,
    textureBytes: record.textureBytes,
    ...(record.textureContentKey
      ? { textureContentKey: record.textureContentKey }
      : {}),
    textureLayoutKind: record.textureLayout.kind,
    ...(record.textureSourceRect
      ? { textureSourceRect: record.textureSourceRect }
      : {}),
    tileCount: record.textureLayout.tileCount,
    zoomBucket: record.zoomBucket,
  };
}

export function toSurfaceTextureResolutionDiagnostic(
  resolution: TextureResolution,
): HtmlSurfaceTextureResolutionDiagnostic {
  return {
    clampedByMaxTexture: resolution.clampedByMaxTexture,
    cssHeight: resolution.cssHeight,
    cssWidth: resolution.cssWidth,
    maxTextureDimension2D: resolution.maxTextureDimension2D,
    pixelHeight: resolution.pixelHeight,
    pixelWidth: resolution.pixelWidth,
    requestedScale: resolution.requestedScale,
    resolutionScale: resolution.resolutionScale,
    zoomBucket: resolution.zoomBucket,
  };
}

export function resolutionSnapshot(
  handle: HtmlSurfaceTextureHandle,
): TextureResolutionSnapshot {
  const record = handle.committed;
  return {
    cssHeight: record.cssHeight,
    cssWidth: record.cssWidth,
    pixelHeight: record.pixelHeight,
    pixelWidth: record.pixelWidth,
    resolutionScale: record.resolutionScale,
    zoomBucket: record.zoomBucket,
  };
}
