import {
  DirtyNodeQueue,
  type DirtyNodeMark,
  type DirtyNodeState,
  type NodeTexturePriority,
} from "../dirtyTracking";
import type { GpuFlowRuntime } from "../gpuDevice";
import type {
  GpuQueueWithElementUpload,
  HtmlInCanvasCanvas,
} from "../htmlInCanvasTypes";
import {
  chooseTextureResolution,
  textureResolutionMatches,
  type TextureResolution,
  type TextureResolutionSnapshot,
} from "../textureResolution";
import {
  dirtyTextureTileSummary,
  estimateDirtyTextureUploadBytes,
  markTextureRecordDirty,
  type HtmlSurfaceDirtyRect,
} from "./textureDirtyTiles";
import {
  compareSurfaceIds,
  getHtmlSurfaceTextureUsage,
  getNow,
  isMissingElementPaintRecordError,
  isResolutionOnlyDirtySurface,
  normalizeSurfaceIdSet,
  normalizeTextureBudgetBytes,
  resolveDirtyFlags,
  shouldDeferDirtySurfaceUpload,
  shouldStopUploadLoop,
} from "./textureManagerHelpers";
import { createHtmlSurfaceTextureMemorySnapshot } from "./textureMemorySnapshot";
import { HtmlSurfaceTexturePaintDeferral } from "./texturePaintDeferral";
import {
  createTextureUploadBudget,
  pendingTextureResolutionMatches,
  uploadPendingResolutionRecord,
  type PendingHtmlSurfaceTextureRecord,
} from "./texturePendingResolution";
import {
  createSurfaceTextureLayoutResources,
  normalizeTextureTileDimension,
  uploadHtmlSurfaceTextureRecord,
  type HtmlSurfaceTextureResources,
  type HtmlSurfaceTextureUploadBudget,
  type HtmlSurfaceTextureUploadResult,
  type SurfaceTextureLayoutResources,
} from "./textureTiles";
import {
  createHtmlSurfaceTextureUploadDiagnostic,
  type DirtyHtmlSurfaceUploadOutcome,
  type HtmlSurfaceTextureUploadDiagnostic,
  type HtmlSurfaceTextureUploadNoWorkReason,
  type HtmlSurfaceTextureUploadWorkSummary,
  type UploadDirtyHtmlSurfaceTexturesResult,
} from "./textureUploadDiagnostics";
type HtmlSurfaceTexturePriority = NodeTexturePriority;
export type {
  HtmlSurfaceTextureUploadDiagnostic,
  HtmlSurfaceTextureUploadWorkSummary,
};
type DirtyHtmlSurfaceTextureState = Omit<DirtyNodeState, "nodeId"> & {
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
export type HtmlSurfaceTextureRecord = {
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
  readonly textureView: GPUTextureView;
  readonly textureLayout: HtmlSurfaceTextureLayout;
  readonly tiles: readonly HtmlSurfaceTextureTileRecord[];
  readonly zoomBucket: number;
};
type RegisterHtmlSurfaceTextureInput = {
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly deferResolution?: boolean | undefined;
  readonly devicePixelRatio: number;
  readonly element: Element;
  readonly frame?: number | undefined;
  readonly priority?: HtmlSurfaceTexturePriority | undefined;
  readonly surfaceId: string;
  readonly zoom: number;
};
type MarkHtmlSurfaceTextureDirtyInput = Pick<
  DirtyNodeMark,
  "content" | "frame" | "priority" | "reason" | "resolution"
> & {
  readonly deferUploadUntilPaint?: boolean | undefined;
  readonly requestPaint?: boolean | undefined;
  readonly sourceRect?: HtmlSurfaceDirtyRect | undefined;
  readonly surfaceId: string;
};
export type UploadDirtyHtmlSurfaceTexturesOptions = {
  readonly deferPassiveUploads?: boolean | undefined;
  readonly deferResolutionOnly?: boolean | undefined;
  readonly deferSurfaceIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly frame: number;
  readonly maxBytes?: number | undefined;
  readonly maxDurationMs?: number | undefined;
  readonly maxUploads?: number | undefined;
  readonly now?: (() => number) | undefined;
};
type ResolvedUploadDirtyHtmlSurfaceTexturesOptions = {
  readonly deferPassiveUploads: boolean;
  readonly deferResolutionOnly: boolean;
  readonly deferSurfaceIds: ReadonlySet<string>;
  readonly frame: number;
  readonly maxBytes: number;
  readonly maxDurationMs: number;
  readonly maxUploads: number;
  readonly now: () => number;
};
export type HtmlSurfaceTextureMemorySnapshot = {
  readonly allocatedBytes: number;
  readonly largestTextureBytes: number;
  readonly textureCount: number;
  readonly visibleBytes: number;
  readonly visibleTextureCount: number;
};
export type HtmlSurfaceTextureSnapshotDiagnostic = {
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
  readonly textureLayoutKind: HtmlSurfaceTextureLayout["kind"];
  readonly tileCount: number;
  readonly zoomBucket: number;
};
export type HtmlSurfaceTextureResolutionDiagnostic = {
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
type EvictHtmlSurfaceTexturesOptions = {
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
type HtmlSurfaceTextureEvictionResult = {
  readonly budgetBytes: number;
  readonly evictedBytes: number;
  readonly evictedSurfaceIds: readonly string[];
  readonly memory: HtmlSurfaceTextureMemorySnapshot;
  readonly memoryBefore: HtmlSurfaceTextureMemorySnapshot;
  readonly overBudgetBytes: number;
  readonly protectedSurfaceIds: readonly string[];
  readonly reason: string;
};
type HtmlSurfaceTextureManagerOptions = {
  readonly canvas?: HtmlInCanvasCanvas | undefined;
  readonly format?: GPUTextureFormat | undefined;
  readonly maxTextureTileDimension2D?: number | undefined;
  readonly maxTextureBytes?: number | undefined;
  readonly maxTextureDimension2D?: number | undefined;
  readonly textureUsage?: GPUTextureUsageFlags | undefined;
};
type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key];
};
type HtmlSurfaceTextureEntry = Mutable<HtmlSurfaceTextureRecord> & {
  element: Element;
  pendingResolution: TextureResolution | null;
  pendingTextureRecord: PendingHtmlSurfaceTextureRecord | null;
};
const DEFAULT_HTML_SURFACE_TEXTURE_FORMAT = "rgba8unorm";

export class HtmlSurfaceTextureManager {
  private readonly canvas: HtmlInCanvasCanvas | null;
  private readonly device: GPUDevice;
  private readonly dirtyQueue = new DirtyNodeQueue();
  private readonly format: GPUTextureFormat;
  private readonly maxTextureBytes: number;
  private readonly maxTextureDimension2D: number;
  private readonly maxTextureTileDimension2D: number;
  private readonly paintDeferral = new HtmlSurfaceTexturePaintDeferral();
  private readonly records = new Map<string, HtmlSurfaceTextureEntry>();
  private readonly textureUsage: GPUTextureUsageFlags;

  constructor(
    device: GPUDevice,
    options: HtmlSurfaceTextureManagerOptions = {},
  ) {
    this.canvas = options.canvas ?? null;
    this.device = device;
    this.format = options.format ?? DEFAULT_HTML_SURFACE_TEXTURE_FORMAT;
    this.maxTextureBytes = normalizeTextureBudgetBytes(options.maxTextureBytes);
    this.maxTextureDimension2D =
      options.maxTextureDimension2D ?? device.limits.maxTextureDimension2D;
    this.maxTextureTileDimension2D = normalizeTextureTileDimension({
      maxTextureDimension2D: this.maxTextureDimension2D,
      maxTextureTileDimension2D: options.maxTextureTileDimension2D,
    });
    this.textureUsage = options.textureUsage ?? getHtmlSurfaceTextureUsage();
  }
  destroy() {
    for (const record of this.records.values()) {
      destroyTextureRecord(record);
    }
    this.records.clear();
    this.dirtyQueue.clearAll();
    this.paintDeferral.clear();
  }
  destroySurfaceTexture(surfaceId: string) {
    const record = this.records.get(surfaceId);
    if (!record) {
      return;
    }
    destroyTextureRecord(record);
    this.records.delete(surfaceId);
    this.dirtyQueue.clear(surfaceId);
    this.paintDeferral.deleteSurface(surfaceId);
  }
  getDirtySurfaces(): DirtyHtmlSurfaceTextureState[] {
    return this.dirtyQueue
      .orderedDirtyNodes()
      .map((dirtySurface) =>
        toDirtySurfaceState(
          dirtySurface,
          this.records.get(dirtySurface.nodeId),
        ),
      );
  }
  getSurfaceTexture(surfaceId: string): HtmlSurfaceTextureRecord | undefined {
    return this.records.get(surfaceId);
  }

  getSurfaceTextureLifecycleDiagnostics(
    surfaceIds?: Iterable<string> | undefined,
  ): HtmlSurfaceTextureLifecycleDiagnostic[] {
    const records =
      surfaceIds === undefined
        ? [...this.records.values()].sort(compareSurfaceTextureRecords)
        : [...surfaceIds]
            .map((surfaceId) => this.records.get(surfaceId))
            .filter((record): record is HtmlSurfaceTextureEntry =>
              Boolean(record),
            );

    return records.map((record) => ({
      committed: toSurfaceTextureSnapshotDiagnostic(record),
      pending: record.pendingTextureRecord
        ? toSurfaceTextureSnapshotDiagnostic(record.pendingTextureRecord)
        : null,
      pendingResolution: record.pendingResolution
        ? toSurfaceTextureResolutionDiagnostic(record.pendingResolution)
        : null,
      priority: record.priority,
      surfaceId: record.surfaceId,
    }));
  }

  getMemorySnapshot({
    visibleSurfaceIds,
  }: Pick<
    EvictHtmlSurfaceTexturesOptions,
    "visibleSurfaceIds"
  > = {}): HtmlSurfaceTextureMemorySnapshot {
    return createHtmlSurfaceTextureMemorySnapshot(
      this.records.values(),
      normalizeSurfaceIdSet(visibleSurfaceIds),
    );
  }

  markSurfaceTextureDirty(input: MarkHtmlSurfaceTextureDirtyInput): boolean {
    const dirtyFlags = resolveDirtyFlags(input);
    const record = this.records.get(input.surfaceId);
    const shouldQueueDirtySurface = record
      ? markExistingSurfaceTextureRecordDirty(record, dirtyFlags, input)
      : true;

    if (shouldQueueDirtySurface) {
      this.paintDeferral.markDirty(input);
      this.dirtyQueue.markDirty({
        content: dirtyFlags.content,
        frame: input.frame,
        nodeId: input.surfaceId,
        priority: input.priority ?? record?.priority,
        reason: input.reason,
        resolution: dirtyFlags.resolution,
        ...(input.sourceRect ? { sourceRect: input.sourceRect } : {}),
      });
    }
    if (shouldQueueDirtySurface && input.requestPaint !== false) {
      this.canvas?.requestPaint();
    }
    return shouldQueueDirtySurface;
  }

  markSurfacesPainted(surfaceIds: Iterable<string>) {
    this.paintDeferral.markSurfacesPainted(surfaceIds);
  }

  registerSurfaceTexture(
    input: RegisterHtmlSurfaceTextureInput,
  ): HtmlSurfaceTextureRecord {
    const resolution = chooseTextureResolution({
      cssHeight: input.cssHeight,
      cssWidth: input.cssWidth,
      devicePixelRatio: input.devicePixelRatio,
      maxTextureDimension2D: this.maxTextureDimension2D,
      zoom: input.zoom,
    });
    const existing = this.records.get(input.surfaceId);
    if (!existing) {
      return this.registerNewSurfaceTexture(input, resolution);
    }

    return this.updateRegisteredSurfaceTexture(existing, input, resolution);
  }

  private registerNewSurfaceTexture(
    input: RegisterHtmlSurfaceTextureInput,
    resolution: TextureResolution,
  ): HtmlSurfaceTextureRecord {
    const layoutResources = this.createTextureLayoutResources(
      input.surfaceId,
      resolution,
      {
        dirtyContent: true,
        dirtyResolution: true,
        lastUploadFrame: -1,
      },
    );
    const record: HtmlSurfaceTextureEntry = {
      ...layoutResources.primaryResources,
      clampedByMaxTexture: resolution.clampedByMaxTexture,
      cssHeight: resolution.cssHeight,
      cssWidth: resolution.cssWidth,
      dirtyContent: true,
      dirtyResolution: true,
      element: input.element,
      lastUploadFrame: -1,
      lastVisibleFrame: input.frame ?? 0,
      maxTextureDimension2D: resolution.maxTextureDimension2D,
      pendingResolution: null,
      pendingTextureRecord: null,
      pixelHeight: resolution.pixelHeight,
      pixelWidth: resolution.pixelWidth,
      priority: input.priority ?? "visible",
      requestedScale: resolution.requestedScale,
      resolutionScale: resolution.resolutionScale,
      surfaceId: input.surfaceId,
      textureBytes: layoutResources.textureBytes,
      textureLayout: layoutResources.textureLayout,
      tiles: layoutResources.tiles,
      zoomBucket: resolution.zoomBucket,
    };
    this.records.set(input.surfaceId, record);
    const deferInitialPaint =
      input.deferResolution && record.priority !== "interactive";
    this.markSurfaceTextureDirty({
      content: true,
      frame: input.frame,
      priority: record.priority,
      reason: "first-visible",
      requestPaint: !deferInitialPaint,
      resolution: true,
      surfaceId: input.surfaceId,
    });
    return record;
  }

  private updateRegisteredSurfaceTexture(
    existing: HtmlSurfaceTextureEntry,
    input: RegisterHtmlSurfaceTextureInput,
    resolution: TextureResolution,
  ): HtmlSurfaceTextureRecord {
    existing.element = input.element;
    existing.lastVisibleFrame = input.frame ?? existing.lastVisibleFrame;
    existing.priority = input.priority ?? existing.priority;

    const resolutionChanged = !textureResolutionMatches(
      resolutionSnapshot(existing),
      resolution,
    );
    if (resolutionChanged && !input.deferResolution) {
      if (
        existing.pendingTextureRecord &&
        !pendingTextureResolutionMatches(
          existing.pendingTextureRecord,
          resolution,
        )
      ) {
        destroyTextureTiles(existing.pendingTextureRecord.tiles);
        existing.pendingTextureRecord = null;
      }
      existing.pendingResolution = resolution;
      existing.dirtyResolution = true;
      this.markSurfaceTextureDirty({
        frame: input.frame,
        priority: existing.priority,
        reason: "resolution",
        resolution: true,
        surfaceId: input.surfaceId,
      });
    }

    return existing;
  }

  evictSurfaceTextures({
    budgetBytes = this.maxTextureBytes,
    protectedSurfaceIds,
    reason = "memory-budget",
    visibleSurfaceIds,
  }: EvictHtmlSurfaceTexturesOptions = {}): HtmlSurfaceTextureEvictionResult {
    const visibleIds = normalizeSurfaceIdSet(visibleSurfaceIds);
    const resolvedBudgetBytes = normalizeTextureBudgetBytes(budgetBytes);
    const protectedIds = this.resolveProtectedTextureSurfaceIds({
      protectedSurfaceIds,
      visibleSurfaceIds: visibleIds,
    });
    const memoryBefore = this.getMemorySnapshot({
      visibleSurfaceIds: visibleIds,
    });
    let allocatedBytes = memoryBefore.allocatedBytes;
    const evictedSurfaceIds: string[] = [];
    let evictedBytes = 0;

    if (allocatedBytes > resolvedBudgetBytes) {
      for (const record of this.evictableRecords(protectedIds)) {
        if (allocatedBytes <= resolvedBudgetBytes) {
          break;
        }
        evictedSurfaceIds.push(record.surfaceId);
        evictedBytes += record.textureBytes;
        allocatedBytes -= record.textureBytes;
        this.destroySurfaceTexture(record.surfaceId);
      }
    }

    const memory = this.getMemorySnapshot({
      visibleSurfaceIds: visibleIds,
    });
    return {
      budgetBytes: resolvedBudgetBytes,
      evictedBytes,
      evictedSurfaceIds,
      memory,
      memoryBefore,
      overBudgetBytes: Math.max(0, memory.allocatedBytes - resolvedBudgetBytes),
      protectedSurfaceIds: [...protectedIds].sort(compareSurfaceIds),
      reason,
    };
  }

  setSurfaceTexturePriority(
    surfaceId: string,
    priority: HtmlSurfaceTexturePriority,
  ) {
    const record = this.records.get(surfaceId);
    if (record) {
      record.priority = priority;
    }
    this.dirtyQueue.setPriority(surfaceId, priority);
  }

  uploadDirtySurfaceTextures({
    deferPassiveUploads = false,
    deferResolutionOnly = false,
    deferSurfaceIds,
    frame,
    maxBytes = Number.POSITIVE_INFINITY,
    maxDurationMs = Number.POSITIVE_INFINITY,
    maxUploads = Number.POSITIVE_INFINITY,
    now = getNow,
  }: UploadDirtyHtmlSurfaceTexturesOptions): UploadDirtyHtmlSurfaceTexturesResult {
    const normalizedDeferSurfaceIds =
      this.paintDeferral.resolveDeferredSurfaceIds(
        normalizeSurfaceIdSet(deferSurfaceIds),
      );
    const initialDirtySurfaceCount = this.dirtyQueue.orderedDirtyNodes().length;
    const uploadOptions = {
      deferPassiveUploads,
      deferResolutionOnly,
      deferSurfaceIds: normalizedDeferSurfaceIds,
      frame,
      maxBytes,
      maxDurationMs,
      maxUploads,
      now,
    };
    const {
      paintUnavailableSurfaceIds,
      diagnostics,
      skippedSurfaceIds,
      uploaded,
      uploadedBytes,
    } = this.uploadQueuedDirtySurfaceTextures(uploadOptions);
    this.paintDeferral.clearSurfaceIds([
      ...uploaded.map(({ record }) => record.surfaceId),
      ...skippedSurfaceIds,
    ]);
    const remainingDirtySurfaces = this.dirtyQueue.orderedDirtyNodes();
    const uploadableRemainingDirtySurfaces = this.uploadableDirtySurfaces(
      remainingDirtySurfaces,
      uploadOptions,
    ).filter((surface) => !paintUnavailableSurfaceIds.has(surface.nodeId));
    const remainingDirtySurfaceIds = remainingDirtySurfaces.map(
      (surface) => surface.nodeId,
    );
    const skippedUploadBytes = estimateDirtySurfaceUploadBytes(
      remainingDirtySurfaces,
      this.records,
    );
    const workSummary = createTextureUploadWorkSummary({
      initialDirtySurfaceCount,
      paintUnavailableSurfaceCount: paintUnavailableSurfaceIds.size,
      remainingDirtySurfaceCount: remainingDirtySurfaces.length,
      skippedSurfaceCount: skippedSurfaceIds.length,
      uploadableRemainingDirtySurfaceCount:
        uploadableRemainingDirtySurfaces.length,
      uploadedSurfaceCount: uploaded.length,
    });

    return {
      budgetExhausted: uploadableRemainingDirtySurfaces.length > 0,
      diagnostics,
      remainingDirtySurfaceIds,
      skippedSurfaceIds,
      skippedUploadBytes,
      uploaded: uploaded.map((outcome) => outcome.record),
      uploadedBytes,
      workSummary,
    };
  }

  private uploadQueuedDirtySurfaceTextures(
    options: ResolvedUploadDirtyHtmlSurfaceTexturesOptions,
  ): {
    readonly diagnostics: readonly HtmlSurfaceTextureUploadDiagnostic[];
    readonly paintUnavailableSurfaceIds: ReadonlySet<string>;
    readonly skippedSurfaceIds: string[];
    readonly uploadedBytes: number;
    readonly uploaded: Array<{
      readonly record: HtmlSurfaceTextureRecord;
      readonly upload: HtmlSurfaceTextureUploadResult;
    }>;
  } {
    const startedAt = options.now();
    const paintUnavailableSurfaceIds = new Set<string>();
    const uploaded: Array<{
      readonly record: HtmlSurfaceTextureRecord;
      readonly upload: HtmlSurfaceTextureUploadResult;
    }> = [];
    const diagnostics: HtmlSurfaceTextureUploadDiagnostic[] = [];
    const skippedSurfaceIds: string[] = [];
    let uploadedBytes = 0;
    let uploadedTextureCount = 0;

    for (const dirtySurface of this.dirtyQueue.orderedDirtyNodes()) {
      if (
        shouldStopUploadLoop({
          options,
          startedAt,
          uploadedBytes,
          uploadedTextureCount,
        })
      ) {
        break;
      }
      const outcome = this.uploadDirtySurfaceIfAllowed(dirtySurface, options, {
        startedAt,
        uploadedBytes,
        uploadedTextureCount,
      });
      if (outcome === "deferred") {
        continue;
      }
      if (outcome === "paint-unavailable") {
        paintUnavailableSurfaceIds.add(dirtySurface.nodeId);
        continue;
      }
      if (outcome === "missing") {
        skippedSurfaceIds.push(dirtySurface.nodeId);
        continue;
      }
      uploaded.push(outcome);
      diagnostics.push(
        createHtmlSurfaceTextureUploadDiagnostic({
          dirtySurface,
          dirtyTileBytes: outcome.dirtyTileBytes,
          dirtyTileCount: outcome.dirtyTileCount,
          durationMs: outcome.durationMs,
          record: outcome.record,
          upload: outcome.upload,
        }),
      );
      uploadedBytes += outcome.upload.uploadedBytes;
      uploadedTextureCount += outcome.upload.uploadedTextureCount;
    }

    return {
      paintUnavailableSurfaceIds,
      diagnostics,
      skippedSurfaceIds,
      uploaded,
      uploadedBytes,
    };
  }

  private uploadDirtySurfaceIfAllowed(
    dirtySurface: DirtyNodeState,
    options: ResolvedUploadDirtyHtmlSurfaceTexturesOptions,
    uploadProgress: Pick<
      HtmlSurfaceTextureUploadBudget,
      "startedAt" | "uploadedBytes" | "uploadedTextureCount"
    >,
  ): DirtyHtmlSurfaceUploadOutcome {
    const record = this.records.get(dirtySurface.nodeId);
    if (!record) {
      this.dirtyQueue.clear(dirtySurface.nodeId);
      return "missing";
    }
    if (this.shouldDeferDirtySurfaceUpload(dirtySurface, record, options)) {
      return "deferred";
    }

    try {
      return this.uploadDirtyTextureRecord(
        dirtySurface,
        record,
        options,
        uploadProgress,
      );
    } catch (error: unknown) {
      if (isMissingElementPaintRecordError(error)) {
        this.canvas?.requestPaint();
        return "paint-unavailable";
      }
      throw error;
    }
  }

  private uploadDirtyTextureRecord(
    dirtySurface: DirtyNodeState,
    record: HtmlSurfaceTextureEntry,
    options: ResolvedUploadDirtyHtmlSurfaceTexturesOptions,
    uploadProgress: Pick<
      HtmlSurfaceTextureUploadBudget,
      "startedAt" | "uploadedBytes" | "uploadedTextureCount"
    >,
  ): DirtyHtmlSurfaceUploadOutcome {
    const dirtyTileSummary = dirtyTextureTileSummary(
      record.pendingTextureRecord ?? record,
      dirtySurface.sourceRect,
    );
    const uploadStartedAt = options.now();
    const upload = this.uploadRecord(
      record,
      options,
      uploadProgress,
      dirtySurface.sourceRect,
    );
    const durationMs = options.now() - uploadStartedAt;
    if (upload.uploadedTextureCount === 0) {
      if (!record.dirtyContent && !record.dirtyResolution) {
        this.dirtyQueue.clear(record.surfaceId);
      }
      return "deferred";
    }
    if (upload.complete) {
      this.dirtyQueue.clear(record.surfaceId);
    }
    return {
      dirtyTileBytes: dirtyTileSummary.dirtyTileBytes,
      dirtyTileCount: dirtyTileSummary.dirtyTileIds.length,
      durationMs,
      record,
      upload,
    };
  }

  private uploadableDirtySurfaces(
    dirtySurfaces: readonly DirtyNodeState[],
    options: ResolvedUploadDirtyHtmlSurfaceTexturesOptions,
  ): readonly DirtyNodeState[] {
    if (
      options.deferSurfaceIds.size === 0 &&
      !options.deferPassiveUploads &&
      !options.deferResolutionOnly
    ) {
      return dirtySurfaces;
    }
    return dirtySurfaces.filter((surface) => {
      const record = this.records.get(surface.nodeId);
      return !this.shouldDeferDirtySurfaceUpload(surface, record, options);
    });
  }

  private shouldDeferDirtySurfaceUpload(
    dirtyNode: DirtyNodeState,
    record: HtmlSurfaceTextureRecord | undefined,
    options: ResolvedUploadDirtyHtmlSurfaceTexturesOptions,
  ): boolean {
    return shouldDeferDirtySurfaceUpload(dirtyNode, record, {
      deferPassiveUploads: options.deferPassiveUploads,
      deferSurfaceIds: options.deferSurfaceIds,
      deferResolutionOnly:
        options.deferResolutionOnly && isResolutionOnlyDirtySurface(dirtyNode),
    });
  }

  private createTextureResources(
    surfaceId: string,
    {
      pixelHeight,
      pixelWidth,
    }: Pick<TextureResolution, "pixelHeight" | "pixelWidth">,
  ): HtmlSurfaceTextureResources {
    const texture = this.device.createTexture({
      format: this.format,
      label: `setta-html-surface-${surfaceId}`,
      size: {
        height: pixelHeight,
        width: pixelWidth,
      },
      usage: this.textureUsage,
    });
    const textureView = texture.createView({
      label: `setta-html-surface-${surfaceId}-view`,
    });
    const sampler = this.device.createSampler({
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
    });
    return { sampler, texture, textureView };
  }

  private createTextureLayoutResources(
    surfaceId: string,
    resolution: TextureResolution,
    dirtyState: Pick<
      HtmlSurfaceTextureTileRecord,
      "dirtyContent" | "dirtyResolution" | "lastUploadFrame"
    >,
  ): SurfaceTextureLayoutResources {
    return createSurfaceTextureLayoutResources({
      createTextureResources: this.createTextureResources.bind(this),
      dirtyState,
      format: this.format,
      maxTextureTileDimension2D: this.maxTextureTileDimension2D,
      resolution,
      surfaceId,
    });
  }

  private uploadRecord(
    record: HtmlSurfaceTextureEntry,
    options: ResolvedUploadDirtyHtmlSurfaceTexturesOptions,
    uploadProgress: Pick<
      HtmlSurfaceTextureUploadBudget,
      "startedAt" | "uploadedBytes" | "uploadedTextureCount"
    >,
    dirtySourceRect?: HtmlSurfaceDirtyRect | undefined,
  ): HtmlSurfaceTextureUploadResult {
    if (record.pendingResolution) {
      return this.uploadPendingResolutionTextureRecord(
        record,
        options,
        uploadProgress,
      );
    }
    const queue = this.device.queue as GpuQueueWithElementUpload;
    if (typeof queue.copyElementImageToTexture !== "function") {
      throw new Error(
        "Setta GPU flow requires GPUQueue.copyElementImageToTexture for HTML surface texture upload.",
      );
    }
    const uploadBudget = createTextureUploadBudget(options, uploadProgress);
    const hadCompleteTexture = record.lastUploadFrame >= 0;
    const upload = uploadHtmlSurfaceTextureRecord(
      queue,
      record,
      uploadBudget,
      dirtySourceRect,
    );
    if (upload.uploadedTextureCount === 0) {
      return upload;
    }
    const uploadedTileIds = new Set(upload.uploadedTileIds);
    if (hadCompleteTexture || upload.complete) {
      record.lastUploadFrame = options.frame;
    }
    record.tiles = record.tiles.map((tile) => ({
      ...tile,
      dirtyContent: uploadedTileIds.has(tile.tileId)
        ? false
        : tile.dirtyContent,
      dirtyResolution: uploadedTileIds.has(tile.tileId)
        ? false
        : tile.dirtyResolution,
      lastUploadFrame: uploadedTileIds.has(tile.tileId)
        ? options.frame
        : tile.lastUploadFrame,
    }));
    record.dirtyContent = record.tiles.some((tile) => tile.dirtyContent);
    record.dirtyResolution = record.tiles.some((tile) => tile.dirtyResolution);
    return upload;
  }

  private uploadPendingResolutionTextureRecord(
    record: HtmlSurfaceTextureEntry,
    options: ResolvedUploadDirtyHtmlSurfaceTexturesOptions,
    uploadProgress: Pick<
      HtmlSurfaceTextureUploadBudget,
      "startedAt" | "uploadedBytes" | "uploadedTextureCount"
    >,
  ): HtmlSurfaceTextureUploadResult {
    const queue = this.device.queue as GpuQueueWithElementUpload;
    if (typeof queue.copyElementImageToTexture !== "function") {
      throw new Error(
        "Setta GPU flow requires GPUQueue.copyElementImageToTexture for HTML surface texture upload.",
      );
    }
    return uploadPendingResolutionRecord({
      createTextureLayoutResources:
        this.createTextureLayoutResources.bind(this),
      destroyTextureTiles,
      frame: options.frame,
      options,
      queue,
      record,
      uploadProgress,
    });
  }

  private resolveProtectedTextureSurfaceIds({
    protectedSurfaceIds,
    visibleSurfaceIds,
  }: {
    readonly protectedSurfaceIds:
      | ReadonlySet<string>
      | readonly string[]
      | undefined;
    readonly visibleSurfaceIds: ReadonlySet<string>;
  }): Set<string> {
    const protectedIds = new Set([
      ...visibleSurfaceIds,
      ...normalizeSurfaceIdSet(protectedSurfaceIds),
    ]);
    for (const record of this.records.values()) {
      if (record.priority === "interactive") {
        protectedIds.add(record.surfaceId);
      }
    }
    for (const dirtySurface of this.dirtyQueue.orderedDirtyNodes()) {
      if (dirtySurface.priority === "interactive") {
        protectedIds.add(dirtySurface.nodeId);
      }
    }
    return protectedIds;
  }

  private evictableRecords(
    protectedSurfaceIds: ReadonlySet<string>,
  ): HtmlSurfaceTextureEntry[] {
    return [...this.records.values()]
      .filter((record) => !protectedSurfaceIds.has(record.surfaceId))
      .sort(compareEvictableSurfaceTextureRecords);
  }
}

export function createHtmlSurfaceTextureManager(
  runtime: Pick<GpuFlowRuntime, "canvas" | "device" | "maxTextureDimension2D">,
  options: Omit<
    HtmlSurfaceTextureManagerOptions,
    "canvas" | "maxTextureDimension2D"
  > = {},
): HtmlSurfaceTextureManager {
  return new HtmlSurfaceTextureManager(runtime.device, {
    ...options,
    canvas: runtime.canvas,
    maxTextureDimension2D: runtime.maxTextureDimension2D,
  });
}

function destroyTextureRecord(record: HtmlSurfaceTextureRecord) {
  destroyTextureTiles(record.tiles);
  const pendingTextureRecord =
    "pendingTextureRecord" in record
      ? (record.pendingTextureRecord as PendingHtmlSurfaceTextureRecord | null)
      : null;
  if (pendingTextureRecord) {
    destroyTextureTiles(pendingTextureRecord.tiles);
  }
}

function destroyTextureTiles(tiles: readonly HtmlSurfaceTextureTileRecord[]) {
  const destroyedTextures = new Set<GPUTexture>();
  for (const tile of tiles) {
    if (destroyedTextures.has(tile.texture)) {
      continue;
    }
    tile.texture.destroy?.();
    destroyedTextures.add(tile.texture);
  }
}

function estimateDirtySurfaceUploadBytes(
  dirtySurfaces: readonly DirtyNodeState[],
  records: ReadonlyMap<string, HtmlSurfaceTextureEntry>,
): number {
  let skippedBytes = 0;
  for (const dirtySurface of dirtySurfaces) {
    const record = records.get(dirtySurface.nodeId);
    skippedBytes += estimateDirtyTextureUploadBytes(
      record?.pendingTextureRecord ?? record,
      dirtySurface.sourceRect,
    );
  }
  return skippedBytes;
}

function createTextureUploadWorkSummary({
  initialDirtySurfaceCount,
  paintUnavailableSurfaceCount,
  remainingDirtySurfaceCount,
  skippedSurfaceCount,
  uploadableRemainingDirtySurfaceCount,
  uploadedSurfaceCount,
}: Omit<
  HtmlSurfaceTextureUploadWorkSummary,
  "deferredSurfaceCount" | "noUploadReason"
>): HtmlSurfaceTextureUploadWorkSummary {
  const deferredSurfaceCount = Math.max(
    0,
    remainingDirtySurfaceCount -
      uploadableRemainingDirtySurfaceCount -
      paintUnavailableSurfaceCount,
  );
  const noUploadReason = resolveTextureUploadNoWorkReason({
    deferredSurfaceCount,
    initialDirtySurfaceCount,
    paintUnavailableSurfaceCount,
    skippedSurfaceCount,
    uploadableRemainingDirtySurfaceCount,
    uploadedSurfaceCount,
  });

  return {
    deferredSurfaceCount,
    initialDirtySurfaceCount,
    noUploadReason,
    paintUnavailableSurfaceCount,
    remainingDirtySurfaceCount,
    skippedSurfaceCount,
    uploadableRemainingDirtySurfaceCount,
    uploadedSurfaceCount,
  };
}

function resolveTextureUploadNoWorkReason({
  deferredSurfaceCount,
  initialDirtySurfaceCount,
  paintUnavailableSurfaceCount,
  skippedSurfaceCount,
  uploadableRemainingDirtySurfaceCount,
  uploadedSurfaceCount,
}: Pick<
  HtmlSurfaceTextureUploadWorkSummary,
  | "deferredSurfaceCount"
  | "initialDirtySurfaceCount"
  | "paintUnavailableSurfaceCount"
  | "skippedSurfaceCount"
  | "uploadableRemainingDirtySurfaceCount"
  | "uploadedSurfaceCount"
>): HtmlSurfaceTextureUploadNoWorkReason {
  if (uploadedSurfaceCount > 0) {
    return null;
  }
  if (initialDirtySurfaceCount === 0) {
    return "no-dirty-surfaces";
  }
  if (paintUnavailableSurfaceCount > 0) {
    return "paint-unavailable";
  }
  if (uploadableRemainingDirtySurfaceCount > 0) {
    return "budget-exhausted";
  }
  if (deferredSurfaceCount > 0) {
    return "all-work-deferred";
  }
  if (skippedSurfaceCount > 0) {
    return "skipped";
  }
  return null;
}

function markExistingSurfaceTextureRecordDirty(
  record: HtmlSurfaceTextureEntry,
  dirtyFlags: { readonly content: boolean; readonly resolution: boolean },
  input: Pick<MarkHtmlSurfaceTextureDirtyInput, "priority" | "sourceRect">,
): boolean {
  const shouldQueueDirtySurface = markTextureRecordDirty(
    record,
    dirtyFlags,
    input.sourceRect,
  );
  if (record.pendingTextureRecord && dirtyFlags.content) {
    // Pending resolution textures already start resolution-dirty. Repeated
    // registration during zoom must not restart partially uploaded tiles.
    markTextureRecordDirty(
      record.pendingTextureRecord,
      dirtyFlags,
      input.sourceRect,
    );
  }
  record.priority = input.priority ?? record.priority;
  return shouldQueueDirtySurface;
}

function toDirtySurfaceState(
  { nodeId, ...state }: DirtyNodeState,
  record: HtmlSurfaceTextureEntry | undefined,
): DirtyHtmlSurfaceTextureState {
  const dirtyTileSummary = dirtyTextureTileSummary(
    record?.pendingTextureRecord ?? record,
    state.sourceRect,
  );
  return {
    ...state,
    ...dirtyTileSummary,
    surfaceId: nodeId,
  };
}

function compareEvictableSurfaceTextureRecords(
  left: HtmlSurfaceTextureEntry,
  right: HtmlSurfaceTextureEntry,
): number {
  return (
    left.lastVisibleFrame - right.lastVisibleFrame ||
    left.lastUploadFrame - right.lastUploadFrame ||
    compareSurfaceIds(left.surfaceId, right.surfaceId)
  );
}

function compareSurfaceTextureRecords(
  left: HtmlSurfaceTextureEntry,
  right: HtmlSurfaceTextureEntry,
): number {
  return compareSurfaceIds(left.surfaceId, right.surfaceId);
}

function toSurfaceTextureSnapshotDiagnostic(
  record: HtmlSurfaceTextureRecord | PendingHtmlSurfaceTextureRecord,
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
    textureLayoutKind: record.textureLayout.kind,
    tileCount: record.textureLayout.tileCount,
    zoomBucket: record.zoomBucket,
  };
}

function toSurfaceTextureResolutionDiagnostic(
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

function resolutionSnapshot(
  record: HtmlSurfaceTextureEntry,
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
