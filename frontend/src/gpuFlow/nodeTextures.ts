import type { GpuFlowRuntime } from "./gpuDevice";
import {
  DirtyNodeQueue,
  type DirtyNodeMark,
  type DirtyNodeState,
  type NodeTexturePriority,
} from "./dirtyTracking";
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

export type RegisterNodeTextureInput = {
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly devicePixelRatio: number;
  readonly element: Element;
  readonly frame?: number | undefined;
  readonly nodeId: string;
  readonly priority?: NodeTexturePriority | undefined;
  readonly zoom: number;
};

export type MarkNodeTextureDirtyInput = Pick<
  DirtyNodeMark,
  "content" | "frame" | "priority" | "reason" | "resolution"
> & {
  readonly nodeId: string;
  readonly requestPaint?: boolean | undefined;
};

export type UploadDirtyNodeTexturesOptions = {
  readonly frame: number;
  readonly maxDurationMs?: number | undefined;
  readonly maxUploads?: number | undefined;
  readonly now?: (() => number) | undefined;
};

export type UploadDirtyNodeTexturesResult = {
  readonly budgetExhausted: boolean;
  readonly remainingDirtyNodeIds: readonly string[];
  readonly skippedNodeIds: readonly string[];
  readonly uploaded: readonly NodeTextureRecord[];
};

export type NodeTextureManagerOptions = {
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
      record.dirtyResolution =
        record.dirtyResolution || dirtyFlags.resolution;
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
    if (resolutionChanged) {
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
    frame,
    maxDurationMs = Number.POSITIVE_INFINITY,
    maxUploads = Number.POSITIVE_INFINITY,
    now = getNow,
  }: UploadDirtyNodeTexturesOptions): UploadDirtyNodeTexturesResult {
    const startedAt = now();
    const uploaded: NodeTextureRecord[] = [];
    const skippedNodeIds: string[] = [];

    for (const dirtyNode of this.dirtyQueue.orderedDirtyNodes()) {
      if (uploaded.length >= maxUploads) {
        break;
      }
      if (uploaded.length > 0 && now() - startedAt >= maxDurationMs) {
        break;
      }

      const record = this.records.get(dirtyNode.nodeId);
      if (!record) {
        skippedNodeIds.push(dirtyNode.nodeId);
        this.dirtyQueue.clear(dirtyNode.nodeId);
        continue;
      }

      this.uploadRecord(record, frame);
      this.dirtyQueue.clear(record.nodeId);
      uploaded.push(record);
    }

    const remainingDirtyNodeIds = this.dirtyQueue
      .orderedDirtyNodes()
      .map((node) => node.nodeId);

    return {
      budgetExhausted: remainingDirtyNodeIds.length > 0,
      remainingDirtyNodeIds,
      skippedNodeIds,
      uploaded,
    };
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
