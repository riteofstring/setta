import type {
  CanvasFlowNodeDrawRecord,
  CanvasFlowNodeTextureEntry,
  CanvasFlowWebglRenderingContext,
} from "./canvasFlowTypes";

export const CANVAS_FLOW_TEXTURE_MEMORY_LIMIT_BYTES = 96 * 1024 * 1024;

export type CanvasFlowTextureUploadStats = {
  createdEntries: number;
  dirtyVisibleEntries: number;
  entryCount: number;
  estimatedBytes: number;
  evictions: number;
  resizedEntries: number;
  uploadCount: number;
  uploadMs: number;
};

type EnsureTextureEntryResult = {
  created: boolean;
  entry: CanvasFlowNodeTextureEntry;
  resized: boolean;
};

type UploadDirtyVisibleTextureParams = {
  frameNumber: number;
  resolveElement: (nodeId: string) => HTMLElement | null;
  visibleNodes: CanvasFlowNodeDrawRecord[];
  visibleNodeIds: ReadonlySet<string>;
};

export class CanvasFlowHtmlTextureCache {
  private readonly entries = new Map<string, CanvasFlowNodeTextureEntry>();
  private readonly gl: CanvasFlowWebglRenderingContext;
  private readonly memoryLimitBytes: number;

  constructor({
    gl,
    memoryLimitBytes = CANVAS_FLOW_TEXTURE_MEMORY_LIMIT_BYTES,
  }: {
    gl: CanvasFlowWebglRenderingContext;
    memoryLimitBytes?: number;
  }) {
    this.gl = gl;
    this.memoryLimitBytes = memoryLimitBytes;
  }

  get size() {
    return this.entries.size;
  }

  get estimatedBytes() {
    return getEstimatedTextureBytes(this.entries.values());
  }

  get dirtyCount() {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.dirty) {
        count += 1;
      }
    }
    return count;
  }

  getEntry(nodeId: string) {
    return this.entries.get(nodeId) ?? null;
  }

  markDirty(nodeIds: ReadonlySet<string> | "all") {
    if (nodeIds === "all") {
      for (const entry of this.entries.values()) {
        entry.dirty = true;
      }
      return;
    }
    for (const nodeId of nodeIds) {
      const entry = this.entries.get(nodeId);
      if (entry) {
        entry.dirty = true;
      }
    }
  }

  releaseUnmounted(mountedNodeIds: ReadonlySet<string>) {
    let released = 0;
    for (const entry of Array.from(this.entries.values())) {
      if (mountedNodeIds.has(entry.nodeId)) {
        continue;
      }
      this.deleteEntry(entry);
      released += 1;
    }
    return released;
  }

  uploadDirtyVisible({
    frameNumber,
    resolveElement,
    visibleNodes,
    visibleNodeIds,
  }: UploadDirtyVisibleTextureParams): CanvasFlowTextureUploadStats {
    let createdEntries = 0;
    let dirtyVisibleEntries = 0;
    let resizedEntries = 0;
    let uploadCount = 0;
    let uploadMs = 0;

    for (const node of visibleNodes) {
      const element = resolveElement(node.id);
      if (!element) {
        continue;
      }
      const result = this.ensureEntry(node);
      createdEntries += result.created ? 1 : 0;
      resizedEntries += result.resized ? 1 : 0;
      result.entry.lastUsedFrame = frameNumber;
      if (!result.entry.dirty) {
        continue;
      }
      dirtyVisibleEntries += 1;
      const uploadStart = performance.now();
      this.uploadElement(result.entry, element);
      uploadMs += performance.now() - uploadStart;
      uploadCount += 1;
    }
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    const evictions = this.evictLeastRecentlyUsed(visibleNodeIds);
    return {
      createdEntries,
      dirtyVisibleEntries,
      entryCount: this.entries.size,
      estimatedBytes: this.estimatedBytes,
      evictions,
      resizedEntries,
      uploadCount,
      uploadMs,
    };
  }

  evictLeastRecentlyUsed(protectedNodeIds: ReadonlySet<string>) {
    let estimatedBytes = this.estimatedBytes;
    if (estimatedBytes <= this.memoryLimitBytes) {
      return 0;
    }
    const candidates = Array.from(this.entries.values())
      .filter((entry) => !protectedNodeIds.has(entry.nodeId))
      .sort((left, right) => left.lastUsedFrame - right.lastUsedFrame);
    let evictions = 0;
    for (const entry of candidates) {
      if (estimatedBytes <= this.memoryLimitBytes) {
        break;
      }
      estimatedBytes -= entry.estimatedBytes;
      this.deleteEntry(entry);
      evictions += 1;
    }
    return evictions;
  }

  handleContextLost() {
    this.entries.clear();
  }

  dispose() {
    for (const entry of this.entries.values()) {
      this.gl.deleteTexture(entry.texture);
    }
    this.entries.clear();
  }

  private ensureEntry(
    node: CanvasFlowNodeDrawRecord,
  ): EnsureTextureEntryResult {
    const existing = this.entries.get(node.id);
    const estimatedBytes = estimateCanvasFlowTextureBytes(node);
    if (
      existing &&
      existing.cssWidth === node.width &&
      existing.cssHeight === node.height
    ) {
      return {
        created: false,
        entry: existing,
        resized: false,
      };
    }
    if (existing) {
      this.deleteEntry(existing);
    }
    const texture = this.gl.createTexture();
    if (!texture) {
      throw new Error(`Failed to create CanvasFlow node texture: ${node.id}`);
    }
    this.configureTexture(texture);
    const entry: CanvasFlowNodeTextureEntry = {
      cssHeight: node.height,
      cssWidth: node.width,
      dirty: true,
      estimatedBytes,
      lastUsedFrame: 0,
      nodeId: node.id,
      texture,
      uploadCount: 0,
    };
    this.entries.set(node.id, entry);
    return {
      created: !existing,
      entry,
      resized: Boolean(existing),
    };
  }

  private configureTexture(texture: WebGLTexture) {
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_S,
      this.gl.CLAMP_TO_EDGE,
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_T,
      this.gl.CLAMP_TO_EDGE,
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.LINEAR,
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MAG_FILTER,
      this.gl.LINEAR,
    );
  }

  private uploadElement(
    entry: CanvasFlowNodeTextureEntry,
    element: HTMLElement,
  ) {
    this.gl.bindTexture(this.gl.TEXTURE_2D, entry.texture);
    this.gl.texElementImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      element,
    );
    entry.dirty = false;
    entry.uploadCount += 1;
  }

  private deleteEntry(entry: CanvasFlowNodeTextureEntry) {
    this.entries.delete(entry.nodeId);
    this.gl.deleteTexture(entry.texture);
  }
}

export function estimateCanvasFlowTextureBytes({
  height,
  width,
}: Pick<CanvasFlowNodeDrawRecord, "height" | "width">) {
  return Math.ceil(width) * Math.ceil(height) * 4;
}

function getEstimatedTextureBytes(
  entries: Iterable<CanvasFlowNodeTextureEntry>,
) {
  let estimatedBytes = 0;
  for (const entry of entries) {
    estimatedBytes += entry.estimatedBytes;
  }
  return estimatedBytes;
}
