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

export type HtmlSurfaceTexturePriority = NodeTexturePriority;

export type DirtyHtmlSurfaceTextureState = Omit<DirtyNodeState, "nodeId"> & {
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

export type HtmlSurfaceTextureLayout = {
  readonly kind: "single";
  readonly tileCount: 1;
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
  readonly requestPaint?: boolean | undefined;
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

type UploadDirtyHtmlSurfaceTexturesResult = {
  readonly budgetExhausted: boolean;
  readonly remainingDirtySurfaceIds: readonly string[];
  readonly skippedSurfaceIds: readonly string[];
  readonly skippedUploadBytes: number;
  readonly uploaded: readonly HtmlSurfaceTextureRecord[];
  readonly uploadedBytes: number;
};

export type HtmlSurfaceTextureMemorySnapshot = {
  readonly allocatedBytes: number;
  readonly largestTextureBytes: number;
  readonly textureCount: number;
  readonly visibleBytes: number;
  readonly visibleTextureCount: number;
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
};

type TextureResources = Pick<
  HtmlSurfaceTextureEntry,
  "sampler" | "texture" | "textureView"
>;

type DirtyHtmlSurfaceUploadOutcome =
  | HtmlSurfaceTextureRecord
  | "deferred"
  | "missing"
  | "paint-unavailable";

const DEFAULT_HTML_SURFACE_TEXTURE_FORMAT = "rgba8unorm";
const DEFAULT_HTML_SURFACE_TEXTURE_MEMORY_BUDGET_BYTES = 384 * 1024 * 1024;

export class HtmlSurfaceTextureManager {
  private readonly canvas: HtmlInCanvasCanvas | null;
  private readonly device: GPUDevice;
  private readonly dirtyQueue = new DirtyNodeQueue();
  private readonly format: GPUTextureFormat;
  private readonly maxTextureBytes: number;
  private readonly maxTextureDimension2D: number;
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
    this.textureUsage = options.textureUsage ?? getHtmlSurfaceTextureUsage();
  }

  destroy() {
    for (const record of this.records.values()) {
      destroyTextureRecord(record);
    }
    this.records.clear();
    this.dirtyQueue.clearAll();
  }

  destroySurfaceTexture(surfaceId: string) {
    const record = this.records.get(surfaceId);
    if (!record) {
      return;
    }
    destroyTextureRecord(record);
    this.records.delete(surfaceId);
    this.dirtyQueue.clear(surfaceId);
  }

  getDirtySurfaces(): DirtyHtmlSurfaceTextureState[] {
    return this.dirtyQueue.orderedDirtyNodes().map(toDirtySurfaceState);
  }

  getSurfaceTexture(surfaceId: string): HtmlSurfaceTextureRecord | undefined {
    return this.records.get(surfaceId);
  }

  getMemorySnapshot({
    visibleSurfaceIds,
  }: Pick<
    EvictHtmlSurfaceTexturesOptions,
    "visibleSurfaceIds"
  > = {}): HtmlSurfaceTextureMemorySnapshot {
    const visibleIds = normalizeSurfaceIdSet(visibleSurfaceIds);
    let allocatedBytes = 0;
    let largestTextureBytes = 0;
    let visibleBytes = 0;
    let visibleTextureCount = 0;

    for (const record of this.records.values()) {
      allocatedBytes += record.textureBytes;
      largestTextureBytes = Math.max(largestTextureBytes, record.textureBytes);
      if (visibleIds.has(record.surfaceId)) {
        visibleBytes += record.textureBytes;
        visibleTextureCount += 1;
      }
    }

    return {
      allocatedBytes,
      largestTextureBytes,
      textureCount: this.records.size,
      visibleBytes,
      visibleTextureCount,
    };
  }

  markSurfaceTextureDirty(input: MarkHtmlSurfaceTextureDirtyInput) {
    const dirtyFlags = resolveDirtyFlags(input);
    const record = this.records.get(input.surfaceId);
    if (record) {
      record.dirtyContent = record.dirtyContent || dirtyFlags.content;
      record.dirtyResolution = record.dirtyResolution || dirtyFlags.resolution;
      record.priority = input.priority ?? record.priority;
    }

    this.dirtyQueue.markDirty({
      content: dirtyFlags.content,
      frame: input.frame,
      nodeId: input.surfaceId,
      priority: input.priority ?? record?.priority,
      reason: input.reason,
      resolution: dirtyFlags.resolution,
    });
    if (input.requestPaint !== false) {
      this.canvas?.requestPaint();
    }
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
    const resources = this.createTextureResources(input.surfaceId, resolution);
    const textureBytes = estimateTextureMemoryBytes({
      format: this.format,
      pixelHeight: resolution.pixelHeight,
      pixelWidth: resolution.pixelWidth,
    });
    const tiles = [
      createSingleSurfaceTextureTile({
        dirtyContent: true,
        dirtyResolution: true,
        lastUploadFrame: -1,
        resolution,
        resources,
        surfaceId: input.surfaceId,
        textureBytes,
      }),
    ];
    const record: HtmlSurfaceTextureEntry = {
      ...resources,
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
      pixelHeight: resolution.pixelHeight,
      pixelWidth: resolution.pixelWidth,
      priority: input.priority ?? "visible",
      requestedScale: resolution.requestedScale,
      resolutionScale: resolution.resolutionScale,
      surfaceId: input.surfaceId,
      textureBytes,
      textureLayout: { kind: "single", tileCount: 1 },
      tiles,
      zoomBucket: resolution.zoomBucket,
    };
    this.records.set(input.surfaceId, record);
    this.markSurfaceTextureDirty({
      content: true,
      frame: input.frame,
      priority: record.priority,
      reason: "first-visible",
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

    const dimensionChanged =
      existing.cssHeight !== resolution.cssHeight ||
      existing.cssWidth !== resolution.cssWidth;
    existing.cssHeight = resolution.cssHeight;
    existing.cssWidth = resolution.cssWidth;

    const resolutionChanged = !textureResolutionMatches(
      resolutionSnapshot(existing),
      resolution,
    );
    if (resolutionChanged && !input.deferResolution) {
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
    if (dimensionChanged) {
      this.markSurfaceTextureDirty({
        content: true,
        frame: input.frame,
        priority: existing.priority,
        reason: "dimension",
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
    const uploadOptions = {
      deferPassiveUploads,
      deferResolutionOnly,
      deferSurfaceIds: normalizeSurfaceIdSet(deferSurfaceIds),
      frame,
      maxBytes,
      maxDurationMs,
      maxUploads,
      now,
    };
    const { paintUnavailableSurfaceIds, skippedSurfaceIds, uploaded } =
      this.uploadQueuedDirtySurfaceTextures(uploadOptions);
    const remainingDirtySurfaces = this.dirtyQueue.orderedDirtyNodes();
    const uploadableRemainingDirtySurfaces = this.uploadableDirtySurfaces(
      remainingDirtySurfaces,
      uploadOptions,
    ).filter((surface) => !paintUnavailableSurfaceIds.has(surface.nodeId));
    const remainingDirtySurfaceIds = remainingDirtySurfaces.map(
      (surface) => surface.nodeId,
    );
    const uploadedBytes = uploaded.reduce(
      (bytes, record) => bytes + record.textureBytes,
      0,
    );
    const skippedUploadBytes = estimateDirtySurfaceUploadBytes(
      remainingDirtySurfaces,
      this.records,
    );

    return {
      budgetExhausted: uploadableRemainingDirtySurfaces.length > 0,
      remainingDirtySurfaceIds,
      skippedSurfaceIds,
      skippedUploadBytes,
      uploaded,
      uploadedBytes,
    };
  }

  private uploadQueuedDirtySurfaceTextures(
    options: ResolvedUploadDirtyHtmlSurfaceTexturesOptions,
  ): {
    readonly paintUnavailableSurfaceIds: ReadonlySet<string>;
    readonly skippedSurfaceIds: string[];
    readonly uploaded: HtmlSurfaceTextureRecord[];
  } {
    const startedAt = options.now();
    const paintUnavailableSurfaceIds = new Set<string>();
    const uploaded: HtmlSurfaceTextureRecord[] = [];
    const skippedSurfaceIds: string[] = [];
    let uploadedBytes = 0;

    for (const dirtySurface of this.dirtyQueue.orderedDirtyNodes()) {
      if (
        shouldStopUploadLoop({
          options,
          startedAt,
          uploaded,
          uploadedBytes,
        })
      ) {
        break;
      }
      const outcome = this.uploadDirtySurfaceIfAllowed(dirtySurface, options);
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
      uploadedBytes += outcome.textureBytes;
    }

    return { paintUnavailableSurfaceIds, skippedSurfaceIds, uploaded };
  }

  private uploadDirtySurfaceIfAllowed(
    dirtySurface: DirtyNodeState,
    options: ResolvedUploadDirtyHtmlSurfaceTexturesOptions,
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
      this.uploadRecord(record, options.frame);
    } catch (error: unknown) {
      if (isMissingElementPaintRecordError(error)) {
        this.canvas?.requestPaint();
        return "paint-unavailable";
      }
      throw error;
    }
    this.dirtyQueue.clear(record.surfaceId);
    return record;
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
    resolution: TextureResolution,
  ): TextureResources {
    const texture = this.device.createTexture({
      format: this.format,
      label: `setta-html-surface-${surfaceId}`,
      size: {
        height: resolution.pixelHeight,
        width: resolution.pixelWidth,
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

  private uploadRecord(record: HtmlSurfaceTextureEntry, frame: number) {
    if (record.pendingResolution) {
      this.applyPendingResolution(record);
    }
    const queue = this.device.queue as GpuQueueWithElementUpload;
    if (typeof queue.copyElementImageToTexture !== "function") {
      throw new Error(
        "Setta GPU flow requires GPUQueue.copyElementImageToTexture for HTML surface texture upload.",
      );
    }
    queue.copyElementImageToTexture(
      record.element,
      record.pixelWidth,
      record.pixelHeight,
      {
        texture: record.texture,
      },
    );
    record.dirtyContent = false;
    record.dirtyResolution = false;
    record.lastUploadFrame = frame;
    record.tiles = record.tiles.map((tile) => ({
      ...tile,
      dirtyContent: false,
      dirtyResolution: false,
      lastUploadFrame: frame,
    }));
  }

  private applyPendingResolution(record: HtmlSurfaceTextureEntry) {
    const resolution = record.pendingResolution;
    if (!resolution) {
      return;
    }

    const previousTiles = record.tiles;
    const resources = this.createTextureResources(record.surfaceId, resolution);
    const textureBytes = estimateTextureMemoryBytes({
      format: this.format,
      pixelHeight: resolution.pixelHeight,
      pixelWidth: resolution.pixelWidth,
    });
    record.texture = resources.texture;
    record.textureView = resources.textureView;
    record.sampler = resources.sampler;
    record.clampedByMaxTexture = resolution.clampedByMaxTexture;
    record.maxTextureDimension2D = resolution.maxTextureDimension2D;
    record.pendingResolution = null;
    record.pixelHeight = resolution.pixelHeight;
    record.pixelWidth = resolution.pixelWidth;
    record.requestedScale = resolution.requestedScale;
    record.resolutionScale = resolution.resolutionScale;
    record.textureBytes = textureBytes;
    record.textureLayout = { kind: "single", tileCount: 1 };
    record.tiles = [
      createSingleSurfaceTextureTile({
        dirtyContent: true,
        dirtyResolution: true,
        lastUploadFrame: -1,
        resolution,
        resources,
        surfaceId: record.surfaceId,
        textureBytes,
      }),
    ];
    record.zoomBucket = resolution.zoomBucket;
    destroyTextureTiles(previousTiles);
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

function createSingleSurfaceTextureTile({
  dirtyContent,
  dirtyResolution,
  lastUploadFrame,
  resolution,
  resources,
  surfaceId,
  textureBytes,
}: {
  readonly dirtyContent: boolean;
  readonly dirtyResolution: boolean;
  readonly lastUploadFrame: number;
  readonly resolution: TextureResolution;
  readonly resources: TextureResources;
  readonly surfaceId: string;
  readonly textureBytes: number;
}): HtmlSurfaceTextureTileRecord {
  return {
    ...resources,
    cssHeight: resolution.cssHeight,
    cssWidth: resolution.cssWidth,
    cssX: 0,
    cssY: 0,
    dirtyContent,
    dirtyResolution,
    lastUploadFrame,
    pixelHeight: resolution.pixelHeight,
    pixelWidth: resolution.pixelWidth,
    surfaceId,
    textureBytes,
    tileId: `${surfaceId}:0:0`,
    u0: 0,
    u1: 1,
    v0: 0,
    v1: 1,
  };
}

function destroyTextureRecord(record: HtmlSurfaceTextureRecord) {
  destroyTextureTiles(record.tiles);
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
  records: ReadonlyMap<string, HtmlSurfaceTextureRecord>,
): number {
  let skippedBytes = 0;
  for (const dirtySurface of dirtySurfaces) {
    skippedBytes += records.get(dirtySurface.nodeId)?.textureBytes ?? 0;
  }
  return skippedBytes;
}

function toDirtySurfaceState({
  nodeId,
  ...state
}: DirtyNodeState): DirtyHtmlSurfaceTextureState {
  return {
    ...state,
    surfaceId: nodeId,
  };
}

function getHtmlSurfaceTextureUsage(): GPUTextureUsageFlags {
  const usage = globalThis.GPUTextureUsage;
  if (!usage) {
    throw new Error("Setta GPU flow requires GPUTextureUsage constants.");
  }
  return usage.TEXTURE_BINDING | usage.COPY_DST | usage.RENDER_ATTACHMENT;
}

function normalizeTextureBudgetBytes(budgetBytes: number | undefined): number {
  const resolvedBudgetBytes =
    budgetBytes ?? DEFAULT_HTML_SURFACE_TEXTURE_MEMORY_BUDGET_BYTES;
  if (Number.isNaN(resolvedBudgetBytes) || resolvedBudgetBytes <= 0) {
    throw new Error(
      "Setta GPU flow HTML surface texture memory budget must be greater than zero bytes.",
    );
  }
  return resolvedBudgetBytes;
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

function compareSurfaceIds(left: string, right: string): number {
  return left.localeCompare(right);
}

function isMissingElementPaintRecordError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    error.name === "InvalidStateError" &&
    error.message.includes("No cached paint record for element")
  );
}

function getNow(): number {
  return globalThis.performance.now();
}

function shouldStopUploadLoop({
  options,
  startedAt,
  uploaded,
  uploadedBytes,
}: {
  readonly options: Pick<
    ResolvedUploadDirtyHtmlSurfaceTexturesOptions,
    "maxBytes" | "maxDurationMs" | "maxUploads" | "now"
  >;
  readonly startedAt: number;
  readonly uploaded: readonly HtmlSurfaceTextureRecord[];
  readonly uploadedBytes: number;
}): boolean {
  if (uploaded.length >= options.maxUploads) {
    return true;
  }
  if (uploaded.length > 0 && uploadedBytes >= options.maxBytes) {
    return true;
  }
  return (
    uploaded.length > 0 && options.now() - startedAt >= options.maxDurationMs
  );
}

function resolutionSnapshot(
  record: HtmlSurfaceTextureEntry,
): TextureResolutionSnapshot {
  return {
    pixelHeight: record.pixelHeight,
    pixelWidth: record.pixelWidth,
    resolutionScale: record.resolutionScale,
    zoomBucket: record.zoomBucket,
  };
}

function resolveDirtyFlags(
  input: Pick<DirtyNodeMark, "content" | "resolution">,
): { readonly content: boolean; readonly resolution: boolean } {
  return {
    content: input.content ?? (input.resolution === undefined ? true : false),
    resolution: input.resolution ?? false,
  };
}

function isResolutionOnlyDirtySurface(
  dirtyNode: Pick<DirtyNodeState, "dirtyContent" | "dirtyResolution">,
): boolean {
  return dirtyNode.dirtyResolution && !dirtyNode.dirtyContent;
}

function shouldDeferDirtySurfaceUpload(
  dirtySurface: Pick<
    DirtyNodeState,
    "dirtyContent" | "dirtyResolution" | "priority"
  > & { readonly nodeId?: string | undefined },
  record: Pick<HtmlSurfaceTextureRecord, "lastUploadFrame"> | undefined,
  {
    deferSurfaceIds,
    deferPassiveUploads,
    deferResolutionOnly,
  }: {
    readonly deferSurfaceIds?: ReadonlySet<string> | undefined;
    readonly deferPassiveUploads: boolean;
    readonly deferResolutionOnly: boolean;
  },
): boolean {
  if (dirtySurface.nodeId && deferSurfaceIds?.has(dirtySurface.nodeId)) {
    return true;
  }
  if (!record || record.lastUploadFrame < 0) {
    return false;
  }
  if (dirtySurface.priority === "interactive") {
    return false;
  }
  return deferPassiveUploads || deferResolutionOnly;
}

function normalizeSurfaceIdSet(
  surfaceIds: ReadonlySet<string> | readonly string[] | undefined,
): ReadonlySet<string> {
  if (!surfaceIds) {
    return new Set();
  }
  if (surfaceIds instanceof Set) {
    return surfaceIds;
  }
  return new Set(surfaceIds);
}
