import type { NodeTexturePriority } from "./dirtyTracking";
import type { GpuRect } from "./viewportMath";

export type RetainedTextureWorkKind =
  | "animation-rect"
  | "content-rect"
  | "first-visible"
  | "full-content"
  | "hover-rect"
  | "lod-refinement"
  | "source-window";

export type RetainedTextureSourceWindow = GpuRect;

export type RetainedTextureWorkItemInput = {
  readonly contentVersion: number;
  readonly createdFrame?: number | undefined;
  readonly kind: RetainedTextureWorkKind;
  readonly priority?: NodeTexturePriority | undefined;
  readonly sourceRect?: GpuRect | undefined;
  readonly sourceWindow?: RetainedTextureSourceWindow | undefined;
  readonly surfaceId: string;
  readonly targetLod?: number | undefined;
};

export type RetainedTextureWorkItem = {
  readonly contentVersion: number;
  readonly createdFrame: number;
  readonly kind: RetainedTextureWorkKind;
  readonly priority: NodeTexturePriority;
  readonly sequence: number;
  readonly sourceRect?: GpuRect | undefined;
  readonly sourceWindow?: RetainedTextureSourceWindow | undefined;
  readonly surfaceId: string;
  readonly targetLod?: number | undefined;
};

export type RetainedTextureWorkQueueOptions = {
  readonly viewportInteractionActive?: boolean | undefined;
};

const PRIORITY_RANK: Record<NodeTexturePriority, number> = {
  interactive: 0,
  visible: 1,
  prefetch: 2,
};

const WORK_KIND_RANK: Record<RetainedTextureWorkKind, number> = {
  "animation-rect": 0,
  "hover-rect": 1,
  "content-rect": 2,
  "first-visible": 3,
  "full-content": 4,
  "source-window": 5,
  "lod-refinement": 6,
};

const RECT_REQUIRED_WORK_KINDS = new Set<RetainedTextureWorkKind>([
  "animation-rect",
  "content-rect",
  "hover-rect",
  "lod-refinement",
]);

export class RetainedTextureWorkQueue {
  private readonly items = new Map<string, RetainedTextureWorkItem>();
  private sequence = 0;

  clear() {
    this.items.clear();
  }

  clearSurface(surfaceId: string) {
    for (const [key, item] of this.items) {
      if (item.surfaceId === surfaceId) {
        this.items.delete(key);
      }
    }
  }

  complete(item: RetainedTextureWorkItem): boolean {
    const key = workItemCoalescingKey(item);
    const current = this.items.get(key);
    if (!current || current.sequence !== item.sequence) {
      return false;
    }
    this.items.delete(key);
    return true;
  }

  cancelLodRefinement(
    predicate: (item: RetainedTextureWorkItem) => boolean = () => true,
  ): number {
    let canceledCount = 0;
    for (const [key, item] of this.items) {
      if (item.kind !== "lod-refinement" || !predicate(item)) {
        continue;
      }
      this.items.delete(key);
      canceledCount += 1;
    }
    return canceledCount;
  }

  enqueue(input: RetainedTextureWorkItemInput): RetainedTextureWorkItem {
    const item = this.normalizeWorkItem(input);
    const key = workItemCoalescingKey(item);
    const existing = this.items.get(key);
    if (existing) {
      const coalesced = coalesceWorkItems(existing, item);
      this.items.set(key, coalesced);
      return coalesced;
    }
    this.items.set(key, item);
    return item;
  }

  hasWork(): boolean {
    return this.items.size > 0;
  }

  hasUploadableWork(options: RetainedTextureWorkQueueOptions = {}): boolean {
    return this.orderedWorkItems(options).length > 0;
  }

  orderedWorkItems(
    options: RetainedTextureWorkQueueOptions = {},
  ): readonly RetainedTextureWorkItem[] {
    return [...this.items.values()]
      .filter((item) => isWorkItemUploadable(item, options))
      .sort(compareWorkItems);
  }

  get size(): number {
    return this.items.size;
  }

  private normalizeWorkItem(
    input: RetainedTextureWorkItemInput,
  ): RetainedTextureWorkItem {
    const sourceRect = input.sourceRect
      ? normalizeRect("sourceRect", input.sourceRect)
      : undefined;
    const sourceWindow = input.sourceWindow
      ? normalizeRect("sourceWindow", input.sourceWindow)
      : undefined;
    validateWorkItemInput(input, { sourceRect, sourceWindow });
    const item: RetainedTextureWorkItem = {
      contentVersion: normalizeFiniteNumber(
        "contentVersion",
        input.contentVersion,
      ),
      createdFrame: input.createdFrame ?? 0,
      kind: input.kind,
      priority: input.priority ?? "visible",
      sequence: this.sequence,
      surfaceId: normalizeSurfaceId(input.surfaceId),
      ...(sourceRect ? { sourceRect } : {}),
      ...(sourceWindow ? { sourceWindow } : {}),
      ...(input.targetLod === undefined
        ? {}
        : {
            targetLod: normalizeFinitePositiveNumber(
              "targetLod",
              input.targetLod,
            ),
          }),
    };
    this.sequence += 1;
    return item;
  }
}

function validateWorkItemInput(
  input: RetainedTextureWorkItemInput,
  {
    sourceRect,
    sourceWindow,
  }: {
    readonly sourceRect: GpuRect | undefined;
    readonly sourceWindow: GpuRect | undefined;
  },
) {
  if (RECT_REQUIRED_WORK_KINDS.has(input.kind) && !sourceRect) {
    throw new Error(
      `Retained texture ${input.kind} work requires a sourceRect.`,
    );
  }
  if (input.kind === "source-window" && !sourceWindow) {
    throw new Error(
      "Retained texture source-window work requires sourceWindow.",
    );
  }
  if (input.kind !== "lod-refinement" && input.targetLod !== undefined) {
    throw new Error(
      `Retained texture ${input.kind} work must not specify targetLod.`,
    );
  }
}

function coalesceWorkItems(
  existing: RetainedTextureWorkItem,
  next: RetainedTextureWorkItem,
): RetainedTextureWorkItem {
  const sourceRect =
    existing.sourceRect && next.sourceRect
      ? unionRects(existing.sourceRect, next.sourceRect)
      : existing.sourceRect ?? next.sourceRect;
  return {
    ...existing,
    createdFrame: Math.min(existing.createdFrame, next.createdFrame),
    priority: higherPriority(existing.priority, next.priority),
    ...(sourceRect ? { sourceRect } : {}),
  };
}

function compareWorkItems(
  left: RetainedTextureWorkItem,
  right: RetainedTextureWorkItem,
): number {
  return (
    PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] ||
    WORK_KIND_RANK[left.kind] - WORK_KIND_RANK[right.kind] ||
    left.sequence - right.sequence
  );
}

function higherPriority(
  left: NodeTexturePriority,
  right: NodeTexturePriority,
): NodeTexturePriority {
  return PRIORITY_RANK[left] <= PRIORITY_RANK[right] ? left : right;
}

function isWorkItemUploadable(
  item: RetainedTextureWorkItem,
  options: RetainedTextureWorkQueueOptions,
): boolean {
  if (!options.viewportInteractionActive) {
    return true;
  }
  if (item.priority === "interactive") {
    return true;
  }
  if (item.kind === "lod-refinement") {
    return false;
  }
  return !(item.kind === "source-window" && item.priority === "prefetch");
}

function workItemCoalescingKey(item: RetainedTextureWorkItem): string {
  return [
    item.surfaceId,
    item.contentVersion,
    item.kind,
    item.sourceRect ? "rect" : "full",
    item.sourceWindow ? rectKey(item.sourceWindow) : "window:none",
    item.targetLod ?? "lod:none",
  ].join("|");
}

function rectKey(rect: GpuRect): string {
  return [rect.x, rect.y, rect.width, rect.height].join(":");
}

function normalizeRect(name: string, rect: GpuRect): GpuRect {
  const x = normalizeFiniteNumber(`${name}.x`, rect.x);
  const y = normalizeFiniteNumber(`${name}.y`, rect.y);
  const width = normalizeFinitePositiveNumber(`${name}.width`, rect.width);
  const height = normalizeFinitePositiveNumber(`${name}.height`, rect.height);
  return { height, width, x, y };
}

function unionRects(left: GpuRect, right: GpuRect): GpuRect {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const rightEdge = Math.max(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.max(left.y + left.height, right.y + right.height);
  return {
    height: bottomEdge - y,
    width: rightEdge - x,
    x,
    y,
  };
}

function normalizeSurfaceId(surfaceId: string): string {
  if (!surfaceId) {
    throw new Error("Retained texture work requires surfaceId.");
  }
  return surfaceId;
}

function normalizeFiniteNumber(name: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Retained texture work ${name} must be finite.`);
  }
  return value;
}

function normalizeFinitePositiveNumber(name: string, value: number): number {
  const normalized = normalizeFiniteNumber(name, value);
  if (normalized <= 0) {
    throw new Error(`Retained texture work ${name} must be greater than zero.`);
  }
  return normalized;
}
