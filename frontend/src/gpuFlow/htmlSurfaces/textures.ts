import {
  DirtyNodeQueue,
  type DirtyNodeMark,
  type DirtyNodeState,
} from "../dirtyTracking";
import type { GpuFlowRuntime } from "../gpuDevice";
import type {
  GpuQueueWithElementUpload,
  HtmlInCanvasCanvas,
} from "../htmlInCanvasTypes";
import {
  assertGpuFlowSurfaceTextureReleaseToken,
  type GpuFlowSurfaceTextureReleaseResult,
  type GpuFlowSurfaceTextureReleaseToken,
} from "../surfaceTextureReleaseAuthority";
import {
  chooseTextureResolution,
  type TextureResolution,
} from "../textureResolution";
import {
  dirtyTextureTileSummary,
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
  uploadPendingResolutionRecord,
} from "./texturePendingResolution";
import {
  commitPendingTextureSourceRect,
  compareEvictableSurfaceTextureRecords,
  compareSurfaceTextureRecords,
  destroyTextureRecord,
  destroyTextureTiles,
  estimateDirtySurfaceUploadBytes,
  markExistingSurfaceTextureRecordDirty,
  toDirtySurfaceState,
  toSurfaceTextureMemoryRecord,
  toSurfaceTextureResolutionDiagnostic,
  toSurfaceTextureSnapshotDiagnostic,
  updateCommittedSurfaceTextureSnapshot,
  type CommittedHtmlSurfaceTextureSnapshot,
  type DirtyHtmlSurfaceTextureState,
  type EvictHtmlSurfaceTexturesOptions,
  type HtmlSurfaceTextureEvictionResult,
  type HtmlSurfaceTextureHandle,
  type HtmlSurfaceTextureLifecycleDiagnostic,
  type HtmlSurfaceTextureMemorySnapshot,
  type HtmlSurfaceTexturePriority,
  type HtmlSurfaceTextureTileRecord,
} from "./textureRecords";
import {
  preparePendingContentTextureUpdate,
  preparePendingResolutionTextureUpdate,
  resolveRegisteredSurfaceTextureUpdate,
  type RegisteredSurfaceTextureUpdateKind,
} from "./textureRegistrationUpdates";
import {
  createSurfaceTextureLayoutResources,
  normalizeTextureTileDimension,
  uploadHtmlSurfaceTextureSnapshot,
  type HtmlSurfaceTextureResources,
  type HtmlSurfaceTextureUploadBudget,
  type HtmlSurfaceTextureUploadResult,
  type SurfaceTextureLayoutResources,
} from "./textureTiles";
import {
  createHtmlSurfaceTextureUploadDiagnostic,
  createHtmlSurfaceTextureUploadWorkSummary,
  type DirtyHtmlSurfaceUploadOutcome,
  type HtmlSurfaceTextureUploadDiagnostic,
  type HtmlSurfaceTextureUploadWorkSummary,
  type UploadDirtyHtmlSurfaceTexturesResult,
} from "./textureUploadDiagnostics";

export type {
  CommittedHtmlSurfaceTextureSnapshot,
  HtmlSurfaceTextureLifecycleDiagnostic,
  HtmlSurfaceTextureMemorySnapshot,
  HtmlSurfaceTextureTileRecord,
} from "./textureRecords";
export type {
  HtmlSurfaceTextureUploadDiagnostic,
  HtmlSurfaceTextureUploadWorkSummary,
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
  readonly textureContentKey?: string | undefined;
  readonly textureSourceRect?: HtmlSurfaceDirtyRect | undefined;
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
type HtmlSurfaceTextureManagerOptions = {
  readonly canvas?: HtmlInCanvasCanvas | undefined;
  readonly format?: GPUTextureFormat | undefined;
  readonly maxTextureTileDimension2D?: number | undefined;
  readonly maxTextureBytes?: number | undefined;
  readonly maxTextureDimension2D?: number | undefined;
  readonly textureUsage?: GPUTextureUsageFlags | undefined;
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
  private readonly pendingProtectedSurfaceTextureReleaseIds = new Set<string>();
  private readonly paintDeferral = new HtmlSurfaceTexturePaintDeferral();
  private protectedSurfaceTextureIds = new Set<string>();
  private readonly records = new Map<string, HtmlSurfaceTextureHandle>();
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
    this.pendingProtectedSurfaceTextureReleaseIds.clear();
    this.paintDeferral.clear();
    this.protectedSurfaceTextureIds.clear();
  }
  destroySurfaceTexture(
    token: GpuFlowSurfaceTextureReleaseToken,
    surfaceId: string,
  ): GpuFlowSurfaceTextureReleaseResult {
    assertGpuFlowSurfaceTextureReleaseToken({ surfaceId, token });
    if (this.protectedSurfaceTextureIds.has(surfaceId)) {
      this.pendingProtectedSurfaceTextureReleaseIds.add(surfaceId);
      this.dirtyQueue.clear(surfaceId);
      this.paintDeferral.deleteSurface(surfaceId);
      return Object.freeze({
        kind: "deferred-protected" as const,
        surfaceId,
      });
    }
    return this.destroySurfaceTextureRecord(surfaceId);
  }
  private destroySurfaceTextureRecord(
    surfaceId: string,
  ): GpuFlowSurfaceTextureReleaseResult {
    const record = this.records.get(surfaceId);
    if (!record) {
      return Object.freeze({
        kind: "not-found" as const,
        surfaceId,
      });
    }
    destroyTextureRecord(record);
    this.records.delete(surfaceId);
    this.dirtyQueue.clear(surfaceId);
    this.paintDeferral.deleteSurface(surfaceId);
    return Object.freeze({
      kind: "released" as const,
      surfaceId,
    });
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
  getCommittedSurfaceTexture(
    surfaceId: string,
  ): CommittedHtmlSurfaceTextureSnapshot | undefined {
    return this.records.get(surfaceId)?.committed;
  }

  getSurfaceTextureLifecycleDiagnostics(
    surfaceIds?: Iterable<string> | undefined,
  ): HtmlSurfaceTextureLifecycleDiagnostic[] {
    const records =
      surfaceIds === undefined
        ? [...this.records.values()].sort(compareSurfaceTextureRecords)
        : [...surfaceIds]
            .map((surfaceId) => this.records.get(surfaceId))
            .filter((record): record is HtmlSurfaceTextureHandle =>
              Boolean(record),
            );

    return records.map((handle) => ({
      committed: toSurfaceTextureSnapshotDiagnostic(handle.committed),
      pending: handle.pendingTextureRecord
        ? toSurfaceTextureSnapshotDiagnostic(handle.pendingTextureRecord)
        : null,
      pendingResolution: handle.pendingResolution
        ? toSurfaceTextureResolutionDiagnostic(handle.pendingResolution)
        : null,
      priority: handle.committed.priority,
      surfaceId: handle.committed.surfaceId,
    }));
  }

  getMemorySnapshot({
    visibleSurfaceIds,
  }: Pick<
    EvictHtmlSurfaceTexturesOptions,
    "visibleSurfaceIds"
  > = {}): HtmlSurfaceTextureMemorySnapshot {
    return createHtmlSurfaceTextureMemorySnapshot(
      [...this.records.values()].map(toSurfaceTextureMemoryRecord),
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
        priority: input.priority ?? record?.committed.priority,
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
  ): CommittedHtmlSurfaceTextureSnapshot {
    this.pendingProtectedSurfaceTextureReleaseIds.delete(input.surfaceId);
    const existing = this.records.get(input.surfaceId);
    const resolution = chooseTextureResolution({
      cssHeight: input.cssHeight,
      cssWidth: input.cssWidth,
      currentZoomBucket:
        existing?.pendingResolution?.zoomBucket ??
        existing?.committed.zoomBucket,
      devicePixelRatio: input.devicePixelRatio,
      maxTextureDimension2D: this.maxTextureDimension2D,
      zoom: input.zoom,
    });
    if (!existing) {
      return this.registerNewSurfaceTexture(input, resolution);
    }

    return this.updateRegisteredSurfaceTexture(existing, input, resolution);
  }

  private registerNewSurfaceTexture(
    input: RegisterHtmlSurfaceTextureInput,
    resolution: TextureResolution,
  ): CommittedHtmlSurfaceTextureSnapshot {
    const layoutResources = this.createTextureLayoutResources(
      input.surfaceId,
      resolution,
      {
        dirtyContent: true,
        dirtyResolution: true,
        lastUploadFrame: -1,
      },
    );
    const committed: CommittedHtmlSurfaceTextureSnapshot = {
      ...layoutResources.primaryResources,
      clampedByMaxTexture: resolution.clampedByMaxTexture,
      cssHeight: resolution.cssHeight,
      cssWidth: resolution.cssWidth,
      dirtyContent: true,
      dirtyResolution: true,
      lastUploadFrame: -1,
      lastVisibleFrame: input.frame ?? 0,
      maxTextureDimension2D: resolution.maxTextureDimension2D,
      pixelHeight: resolution.pixelHeight,
      pixelWidth: resolution.pixelWidth,
      priority: input.priority ?? "visible",
      requestedScale: resolution.requestedScale,
      resolutionScale: resolution.resolutionScale,
      surfaceId: input.surfaceId,
      textureBytes: layoutResources.textureBytes,
      ...(input.textureContentKey
        ? { textureContentKey: input.textureContentKey }
        : {}),
      textureLayout: layoutResources.textureLayout,
      ...(input.textureSourceRect
        ? { textureSourceRect: input.textureSourceRect }
        : {}),
      tiles: layoutResources.tiles,
      zoomBucket: resolution.zoomBucket,
    };
    const handle: HtmlSurfaceTextureHandle = {
      committed,
      element: input.element,
      pendingResolution: null,
      pendingTextureRecord: null,
    };
    this.records.set(input.surfaceId, handle);
    const deferInitialPaint =
      input.deferResolution && committed.priority !== "interactive";
    this.markSurfaceTextureDirty({
      content: true,
      frame: input.frame,
      priority: committed.priority,
      reason: "first-visible",
      requestPaint: !deferInitialPaint,
      resolution: true,
      surfaceId: input.surfaceId,
    });
    return handle.committed;
  }

  private updateRegisteredSurfaceTexture(
    existing: HtmlSurfaceTextureHandle,
    input: RegisterHtmlSurfaceTextureInput,
    resolution: TextureResolution,
  ): CommittedHtmlSurfaceTextureSnapshot {
    existing.element = input.element;
    updateCommittedSurfaceTextureSnapshot(existing, {
      lastVisibleFrame: input.frame ?? existing.committed.lastVisibleFrame,
      priority: input.priority ?? existing.committed.priority,
    });

    this.applyRegisteredSurfaceTextureUpdate(
      existing,
      input,
      resolution,
      resolveRegisteredSurfaceTextureUpdate(existing, input, resolution),
    );

    return existing.committed;
  }

  private applyRegisteredSurfaceTextureUpdate(
    existing: HtmlSurfaceTextureHandle,
    input: RegisterHtmlSurfaceTextureInput,
    resolution: TextureResolution,
    updateKind: RegisteredSurfaceTextureUpdateKind,
  ) {
    if (updateKind === "resolution") {
      preparePendingResolutionTextureUpdate(existing, input, resolution);
      this.markSurfaceTextureDirty({
        frame: input.frame,
        priority: existing.committed.priority,
        reason: "resolution",
        resolution: true,
        surfaceId: input.surfaceId,
      });
      return;
    }
    if (updateKind === "source-rect") {
      updateCommittedSurfaceTextureSnapshot(existing, {
        textureContentKey: input.textureContentKey,
        textureSourceRect: input.textureSourceRect,
      });
      return;
    }
    if (updateKind === "content") {
      preparePendingContentTextureUpdate(existing, input);
      this.markSurfaceTextureDirty({
        content: true,
        frame: input.frame,
        priority: existing.committed.priority,
        reason: "scroll",
        surfaceId: input.surfaceId,
      });
    }
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
    this.updateProtectedSurfaceTextures(protectedIds);
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
        evictedSurfaceIds.push(record.committed.surfaceId);
        evictedBytes += record.committed.textureBytes;
        allocatedBytes -= record.committed.textureBytes;
        this.destroySurfaceTextureRecord(record.committed.surfaceId);
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
      updateCommittedSurfaceTextureSnapshot(record, { priority });
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
    const initialDirtySurfaces = this.dirtyQueue.orderedDirtyNodes();
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
      deferredSurfaceIds,
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
    const workSummary = createHtmlSurfaceTextureUploadWorkSummary({
      initialDirtySurfaces,
      paintUnavailableSurfaceCount: paintUnavailableSurfaceIds.size,
      remainingDirtySurfaces,
      skippedSurfaceCount: skippedSurfaceIds.length,
      uploadableRemainingDirtySurfaces,
      uploadedSurfaceCount: uploaded.length,
    });

    return {
      budgetExhausted: uploadableRemainingDirtySurfaces.length > 0,
      diagnostics,
      deferredSurfaceIds,
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
    readonly deferredSurfaceIds: string[];
    readonly paintUnavailableSurfaceIds: ReadonlySet<string>;
    readonly skippedSurfaceIds: string[];
    readonly uploadedBytes: number;
    readonly uploaded: Array<{
      readonly record: CommittedHtmlSurfaceTextureSnapshot;
      readonly upload: HtmlSurfaceTextureUploadResult;
    }>;
  } {
    const startedAt = options.now();
    const paintUnavailableSurfaceIds = new Set<string>();
    const uploaded: Array<{
      readonly record: CommittedHtmlSurfaceTextureSnapshot;
      readonly upload: HtmlSurfaceTextureUploadResult;
    }> = [];
    const diagnostics: HtmlSurfaceTextureUploadDiagnostic[] = [];
    const deferredSurfaceIds: string[] = [];
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
        deferredSurfaceIds.push(dirtySurface.nodeId);
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
      deferredSurfaceIds,
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
    const handle = this.records.get(dirtySurface.nodeId);
    if (!handle) {
      this.dirtyQueue.clear(dirtySurface.nodeId);
      return "missing";
    }
    if (this.shouldDeferDirtySurfaceUpload(dirtySurface, handle, options)) {
      return "deferred";
    }

    try {
      return this.uploadDirtyTextureRecord(
        dirtySurface,
        handle,
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
    handle: HtmlSurfaceTextureHandle,
    options: ResolvedUploadDirtyHtmlSurfaceTexturesOptions,
    uploadProgress: Pick<
      HtmlSurfaceTextureUploadBudget,
      "startedAt" | "uploadedBytes" | "uploadedTextureCount"
    >,
  ): DirtyHtmlSurfaceUploadOutcome {
    const dirtyTileSummary = dirtyTextureTileSummary(
      handle.pendingTextureRecord ?? handle.committed,
      dirtySurface.sourceRect,
    );
    const uploadStartedAt = options.now();
    const upload = this.uploadRecord(
      handle,
      options,
      uploadProgress,
      dirtySurface.sourceRect,
    );
    const durationMs = options.now() - uploadStartedAt;
    if (upload.uploadedTextureCount === 0) {
      if (!handle.committed.dirtyContent && !handle.committed.dirtyResolution) {
        this.dirtyQueue.clear(handle.committed.surfaceId);
      }
      return "deferred";
    }
    if (upload.complete) {
      commitPendingTextureSourceRect(handle);
      this.dirtyQueue.clear(handle.committed.surfaceId);
    }
    return {
      dirtyTileBytes: dirtyTileSummary.dirtyTileBytes,
      dirtyTileCount: dirtyTileSummary.dirtyTileIds.length,
      durationMs,
      record: handle.committed,
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
    handle: HtmlSurfaceTextureHandle | undefined,
    options: ResolvedUploadDirtyHtmlSurfaceTexturesOptions,
  ): boolean {
    return shouldDeferDirtySurfaceUpload(dirtyNode, handle?.committed, {
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
    handle: HtmlSurfaceTextureHandle,
    options: ResolvedUploadDirtyHtmlSurfaceTexturesOptions,
    uploadProgress: Pick<
      HtmlSurfaceTextureUploadBudget,
      "startedAt" | "uploadedBytes" | "uploadedTextureCount"
    >,
    dirtySourceRect?: HtmlSurfaceDirtyRect | undefined,
  ): HtmlSurfaceTextureUploadResult {
    if (handle.pendingResolution) {
      return this.uploadPendingResolutionTextureRecord(
        handle,
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
    const committed = handle.committed;
    const hadCompleteTexture = committed.lastUploadFrame >= 0;
    const upload = uploadHtmlSurfaceTextureSnapshot(
      queue,
      { ...committed, element: handle.element },
      uploadBudget,
      dirtySourceRect,
    );
    if (upload.uploadedTextureCount === 0) {
      return upload;
    }
    const uploadedTileIds = new Set(upload.uploadedTileIds);
    const tiles = committed.tiles.map((tile) => ({
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
    updateCommittedSurfaceTextureSnapshot(handle, {
      dirtyContent: tiles.some((tile) => tile.dirtyContent),
      dirtyResolution: tiles.some((tile) => tile.dirtyResolution),
      lastUploadFrame:
        hadCompleteTexture || upload.complete
          ? options.frame
          : committed.lastUploadFrame,
      tiles,
    });
    return upload;
  }

  private uploadPendingResolutionTextureRecord(
    handle: HtmlSurfaceTextureHandle,
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
      handle,
      options,
      queue,
      uploadProgress,
    });
  }

  private updateProtectedSurfaceTextures(
    protectedSurfaceIds: ReadonlySet<string>,
  ): void {
    this.protectedSurfaceTextureIds = new Set(protectedSurfaceIds);
    this.releasePendingUnprotectedSurfaceTextures();
  }

  private releasePendingUnprotectedSurfaceTextures(): void {
    for (const surfaceId of this.pendingProtectedSurfaceTextureReleaseIds) {
      if (this.protectedSurfaceTextureIds.has(surfaceId)) {
        continue;
      }
      this.pendingProtectedSurfaceTextureReleaseIds.delete(surfaceId);
      this.destroySurfaceTextureRecord(surfaceId);
    }
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
      if (record.committed.priority === "interactive") {
        protectedIds.add(record.committed.surfaceId);
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
  ): HtmlSurfaceTextureHandle[] {
    return [...this.records.values()]
      .filter((record) => !protectedSurfaceIds.has(record.committed.surfaceId))
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
