import {
  DirtyNodeQueue,
  type DirtyNodeMark,
  type DirtyNodeState,
  type NodeTexturePriority,
} from "./dirtyTracking";
import type { GpuFlowRuntime } from "./gpuDevice";
import type {
  GpuQueueWithElementUpload,
  HtmlInCanvasCanvas,
} from "./htmlInCanvasTypes";
import {
  chooseTextureResolution,
  textureResolutionMatches,
  type TextureResolution,
  type TextureResolutionSnapshot,
} from "./textureResolution";

export type NodeTextureRecord = {
  readonly clampedByMaxTexture: boolean;
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly dirtyContent: boolean;
  readonly dirtyResolution: boolean;
  readonly lastUploadFrame: number;
  readonly maxTextureDimension2D: number;
  readonly nodeId: string;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly priority: NodeTexturePriority;
  readonly requestedScale: number;
  readonly resolutionScale: number;
  readonly sampler: GPUSampler;
  readonly texture: GPUTexture;
  readonly textureView: GPUTextureView;
  readonly zoomBucket: number;
};

type RegisterNodeTextureInput = {
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly deferResolution?: boolean | undefined;
  readonly devicePixelRatio: number;
  readonly element: Element;
  readonly frame?: number | undefined;
  readonly nodeId: string;
  readonly priority?: NodeTexturePriority | undefined;
  readonly zoom: number;
};

type MarkNodeTextureDirtyInput = Pick<
  DirtyNodeMark,
  "content" | "frame" | "priority" | "reason" | "resolution"
> & {
  readonly nodeId: string;
  readonly requestPaint?: boolean | undefined;
};

export type UploadDirtyNodeTexturesOptions = {
  readonly deferPassiveUploads?: boolean | undefined;
  readonly deferNodeIds?: ReadonlySet<string> | readonly string[] | undefined;
  readonly deferResolutionOnly?: boolean | undefined;
  readonly frame: number;
  readonly maxDurationMs?: number | undefined;
  readonly maxUploads?: number | undefined;
  readonly now?: (() => number) | undefined;
};

type ResolvedUploadDirtyNodeTexturesOptions = {
  readonly deferNodeIds: ReadonlySet<string>;
  readonly deferPassiveUploads: boolean;
  readonly deferResolutionOnly: boolean;
  readonly frame: number;
  readonly maxDurationMs: number;
  readonly maxUploads: number;
  readonly now: () => number;
};

type UploadDirtyNodeTexturesResult = {
  readonly budgetExhausted: boolean;
  readonly remainingDirtyNodeIds: readonly string[];
  readonly skippedNodeIds: readonly string[];
  readonly uploaded: readonly NodeTextureRecord[];
};

type NodeTextureManagerOptions = {
  readonly canvas?: HtmlInCanvasCanvas | undefined;
  readonly format?: GPUTextureFormat | undefined;
  readonly maxTextureDimension2D?: number | undefined;
  readonly textureUsage?: GPUTextureUsageFlags | undefined;
};

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key];
};

type NodeTextureEntry = Mutable<NodeTextureRecord> & {
  element: Element;
  pendingResolution: TextureResolution | null;
};

type TextureResources = Pick<
  NodeTextureEntry,
  "sampler" | "texture" | "textureView"
>;

const DEFAULT_NODE_TEXTURE_FORMAT = "rgba8unorm";

export class NodeTextureManager {
  private readonly canvas: HtmlInCanvasCanvas | null;
  private readonly device: GPUDevice;
  private readonly dirtyQueue = new DirtyNodeQueue();
  private readonly format: GPUTextureFormat;
  private readonly maxTextureDimension2D: number;
  private readonly records = new Map<string, NodeTextureEntry>();
  private readonly textureUsage: GPUTextureUsageFlags;

  constructor(device: GPUDevice, options: NodeTextureManagerOptions = {}) {
    this.canvas = options.canvas ?? null;
    this.device = device;
    this.format = options.format ?? DEFAULT_NODE_TEXTURE_FORMAT;
    this.maxTextureDimension2D =
      options.maxTextureDimension2D ?? device.limits.maxTextureDimension2D;
    this.textureUsage = options.textureUsage ?? getNodeTextureUsage();
  }

  destroy() {
    for (const record of this.records.values()) {
      record.texture.destroy?.();
    }
    this.records.clear();
    this.dirtyQueue.clearAll();
  }

  destroyNodeTexture(nodeId: string) {
    const record = this.records.get(nodeId);
    if (!record) {
      return;
    }
    record.texture.destroy?.();
    this.records.delete(nodeId);
    this.dirtyQueue.clear(nodeId);
  }

  getDirtyNodes(): DirtyNodeState[] {
    return this.dirtyQueue.orderedDirtyNodes();
  }

  getNodeTexture(nodeId: string): NodeTextureRecord | undefined {
    return this.records.get(nodeId);
  }

  markNodeTextureDirty(input: MarkNodeTextureDirtyInput) {
    const dirtyFlags = resolveDirtyFlags(input);
    const record = this.records.get(input.nodeId);
    if (record) {
      record.dirtyContent = record.dirtyContent || dirtyFlags.content;
      record.dirtyResolution = record.dirtyResolution || dirtyFlags.resolution;
      record.priority = input.priority ?? record.priority;
    }

    this.dirtyQueue.markDirty({
      content: dirtyFlags.content,
      frame: input.frame,
      nodeId: input.nodeId,
      priority: input.priority ?? record?.priority,
      reason: input.reason,
      resolution: dirtyFlags.resolution,
    });
    if (input.requestPaint !== false) {
      this.canvas?.requestPaint();
    }
  }

  registerNodeTexture(input: RegisterNodeTextureInput): NodeTextureRecord {
    const resolution = chooseTextureResolution({
      cssHeight: input.cssHeight,
      cssWidth: input.cssWidth,
      devicePixelRatio: input.devicePixelRatio,
      maxTextureDimension2D: this.maxTextureDimension2D,
      zoom: input.zoom,
    });
    const existing = this.records.get(input.nodeId);
    if (!existing) {
      const resources = this.createTextureResources(input.nodeId, resolution);
      const record: NodeTextureEntry = {
        ...resources,
        clampedByMaxTexture: resolution.clampedByMaxTexture,
        cssHeight: resolution.cssHeight,
        cssWidth: resolution.cssWidth,
        dirtyContent: true,
        dirtyResolution: true,
        element: input.element,
        lastUploadFrame: -1,
        maxTextureDimension2D: resolution.maxTextureDimension2D,
        nodeId: input.nodeId,
        pendingResolution: null,
        pixelHeight: resolution.pixelHeight,
        pixelWidth: resolution.pixelWidth,
        priority: input.priority ?? "visible",
        requestedScale: resolution.requestedScale,
        resolutionScale: resolution.resolutionScale,
        zoomBucket: resolution.zoomBucket,
      };
      this.records.set(input.nodeId, record);
      this.markNodeTextureDirty({
        content: true,
        frame: input.frame,
        nodeId: input.nodeId,
        priority: record.priority,
        reason: "first-visible",
        resolution: true,
      });
      return record;
    }

    existing.element = input.element;
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
      this.markNodeTextureDirty({
        frame: input.frame,
        nodeId: input.nodeId,
        priority: existing.priority,
        reason: "resolution",
        resolution: true,
      });
    }
    if (dimensionChanged) {
      this.markNodeTextureDirty({
        content: true,
        frame: input.frame,
        nodeId: input.nodeId,
        priority: existing.priority,
        reason: "dimension",
      });
    }

    return existing;
  }

  setNodeTexturePriority(nodeId: string, priority: NodeTexturePriority) {
    const record = this.records.get(nodeId);
    if (record) {
      record.priority = priority;
    }
    this.dirtyQueue.setPriority(nodeId, priority);
  }

  uploadDirtyNodeTextures({
    deferNodeIds,
    deferPassiveUploads = false,
    deferResolutionOnly = false,
    frame,
    maxDurationMs = Number.POSITIVE_INFINITY,
    maxUploads = Number.POSITIVE_INFINITY,
    now = getNow,
  }: UploadDirtyNodeTexturesOptions): UploadDirtyNodeTexturesResult {
    const uploadOptions = {
      deferNodeIds: normalizeNodeIdSet(deferNodeIds),
      deferPassiveUploads,
      deferResolutionOnly,
      frame,
      maxDurationMs,
      maxUploads,
      now,
    };
    const { skippedNodeIds, uploaded } =
      this.uploadQueuedDirtyNodeTextures(uploadOptions);
    const remainingDirtyNodes = this.dirtyQueue.orderedDirtyNodes();
    const uploadableRemainingDirtyNodes = this.uploadableDirtyNodes(
      remainingDirtyNodes,
      uploadOptions,
    );
    const remainingDirtyNodeIds = remainingDirtyNodes.map(
      (node) => node.nodeId,
    );

    return {
      budgetExhausted: uploadableRemainingDirtyNodes.length > 0,
      remainingDirtyNodeIds,
      skippedNodeIds,
      uploaded,
    };
  }

  private uploadQueuedDirtyNodeTextures(
    options: ResolvedUploadDirtyNodeTexturesOptions,
  ): {
    readonly skippedNodeIds: string[];
    readonly uploaded: NodeTextureRecord[];
  } {
    const startedAt = options.now();
    const uploaded: NodeTextureRecord[] = [];
    const skippedNodeIds: string[] = [];

    for (const dirtyNode of this.dirtyQueue.orderedDirtyNodes()) {
      if (shouldStopUploadLoop({ options, startedAt, uploaded })) {
        break;
      }
      const outcome = this.uploadDirtyNodeIfAllowed(dirtyNode, options);
      if (outcome === "deferred") {
        continue;
      }
      if (outcome === "missing") {
        skippedNodeIds.push(dirtyNode.nodeId);
        continue;
      }
      uploaded.push(outcome);
    }

    return { skippedNodeIds, uploaded };
  }

  private uploadDirtyNodeIfAllowed(
    dirtyNode: DirtyNodeState,
    options: ResolvedUploadDirtyNodeTexturesOptions,
  ): NodeTextureRecord | "deferred" | "missing" {
    const record = this.records.get(dirtyNode.nodeId);
    if (!record) {
      this.dirtyQueue.clear(dirtyNode.nodeId);
      return "missing";
    }
    if (this.shouldDeferDirtyNodeUpload(dirtyNode, record, options)) {
      return "deferred";
    }

    this.uploadRecord(record, options.frame);
    this.dirtyQueue.clear(record.nodeId);
    return record;
  }

  private uploadableDirtyNodes(
    dirtyNodes: readonly DirtyNodeState[],
    options: ResolvedUploadDirtyNodeTexturesOptions,
  ): readonly DirtyNodeState[] {
    if (
      options.deferNodeIds.size === 0 &&
      !options.deferPassiveUploads &&
      !options.deferResolutionOnly
    ) {
      return dirtyNodes;
    }
    return dirtyNodes.filter((node) => {
      const record = this.records.get(node.nodeId);
      return !this.shouldDeferDirtyNodeUpload(node, record, options);
    });
  }

  private shouldDeferDirtyNodeUpload(
    dirtyNode: DirtyNodeState,
    record: NodeTextureRecord | undefined,
    options: ResolvedUploadDirtyNodeTexturesOptions,
  ): boolean {
    return shouldDeferDirtyNodeUpload(dirtyNode, record, {
      deferNodeIds: options.deferNodeIds,
      deferPassiveUploads: options.deferPassiveUploads,
      deferResolutionOnly:
        options.deferResolutionOnly && isResolutionOnlyDirtyNode(dirtyNode),
    });
  }

  private createTextureResources(
    nodeId: string,
    resolution: TextureResolution,
  ): TextureResources {
    const texture = this.device.createTexture({
      format: this.format,
      label: `setta-gpu-node-${nodeId}`,
      size: {
        height: resolution.pixelHeight,
        width: resolution.pixelWidth,
      },
      usage: this.textureUsage,
    });
    const textureView = texture.createView({
      label: `setta-gpu-node-${nodeId}-view`,
    });
    const sampler = this.device.createSampler({
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
    });
    return { sampler, texture, textureView };
  }

  private uploadRecord(record: NodeTextureEntry, frame: number) {
    if (record.pendingResolution) {
      this.applyPendingResolution(record);
    }
    const queue = this.device.queue as GpuQueueWithElementUpload;
    if (typeof queue.copyElementImageToTexture !== "function") {
      throw new Error(
        "Setta GPU flow requires GPUQueue.copyElementImageToTexture for node texture upload.",
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
  }

  private applyPendingResolution(record: NodeTextureEntry) {
    const resolution = record.pendingResolution;
    if (!resolution) {
      return;
    }

    const previousTexture = record.texture;
    const resources = this.createTextureResources(record.nodeId, resolution);
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
    record.zoomBucket = resolution.zoomBucket;
    previousTexture.destroy?.();
  }
}

export function createNodeTextureManager(
  runtime: Pick<GpuFlowRuntime, "canvas" | "device" | "maxTextureDimension2D">,
  options: Omit<
    NodeTextureManagerOptions,
    "canvas" | "maxTextureDimension2D"
  > = {},
): NodeTextureManager {
  return new NodeTextureManager(runtime.device, {
    ...options,
    canvas: runtime.canvas,
    maxTextureDimension2D: runtime.maxTextureDimension2D,
  });
}

function getNodeTextureUsage(): GPUTextureUsageFlags {
  const usage = globalThis.GPUTextureUsage;
  if (!usage) {
    throw new Error("Setta GPU flow requires GPUTextureUsage constants.");
  }
  return usage.TEXTURE_BINDING | usage.COPY_DST | usage.RENDER_ATTACHMENT;
}

function getNow(): number {
  return globalThis.performance.now();
}

function shouldStopUploadLoop({
  options,
  startedAt,
  uploaded,
}: {
  readonly options: Pick<
    ResolvedUploadDirtyNodeTexturesOptions,
    "maxDurationMs" | "maxUploads" | "now"
  >;
  readonly startedAt: number;
  readonly uploaded: readonly NodeTextureRecord[];
}): boolean {
  if (uploaded.length >= options.maxUploads) {
    return true;
  }
  return (
    uploaded.length > 0 && options.now() - startedAt >= options.maxDurationMs
  );
}

function resolutionSnapshot(
  record: NodeTextureEntry,
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

function isResolutionOnlyDirtyNode(
  dirtyNode: Pick<DirtyNodeState, "dirtyContent" | "dirtyResolution">,
): boolean {
  return dirtyNode.dirtyResolution && !dirtyNode.dirtyContent;
}

function shouldDeferDirtyNodeUpload(
  dirtyNode: Pick<
    DirtyNodeState,
    "dirtyContent" | "dirtyResolution" | "priority"
  > & { readonly nodeId?: string | undefined },
  record: Pick<NodeTextureRecord, "lastUploadFrame"> | undefined,
  {
    deferNodeIds,
    deferPassiveUploads,
    deferResolutionOnly,
  }: {
    readonly deferNodeIds?: ReadonlySet<string> | undefined;
    readonly deferPassiveUploads: boolean;
    readonly deferResolutionOnly: boolean;
  },
): boolean {
  if (dirtyNode.nodeId && deferNodeIds?.has(dirtyNode.nodeId)) {
    return true;
  }
  if (!record || record.lastUploadFrame < 0) {
    return false;
  }
  if (dirtyNode.priority === "interactive") {
    return false;
  }
  return deferPassiveUploads || deferResolutionOnly;
}

function normalizeNodeIdSet(
  nodeIds: ReadonlySet<string> | readonly string[] | undefined,
): ReadonlySet<string> {
  if (!nodeIds) {
    return new Set();
  }
  if (nodeIds instanceof Set) {
    return nodeIds;
  }
  return new Set(nodeIds);
}
