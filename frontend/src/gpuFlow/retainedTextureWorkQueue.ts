import type { NodeTexturePriority } from "./dirtyTracking";
import type { RetainedTexturePageDescriptor } from "./retainedTexturePages";
import type { GpuRect } from "./viewportMath";

type RetainedTextureWorkKind =
  | "animation-rect"
  | "content-rect"
  | "first-visible"
  | "full-content"
  | "hover-rect"
  | "lod-refinement"
  | "source-window";

export type RetainedTextureWorkLane =
  | "cleanup"
  | "prefetch"
  | "visible-refinement"
  | "visible-repair";

type RetainedTextureSourceWindow = GpuRect;

type RetainedTextureWorkItemInput = {
  readonly contentVersion: number;
  readonly createdFrame?: number | undefined;
  readonly kind: RetainedTextureWorkKind;
  readonly projectionHorizonGeneration?: number | undefined;
  readonly priority?: NodeTexturePriority | undefined;
  readonly refreshCommittedPage?: boolean | undefined;
  readonly sourceRect?: GpuRect | undefined;
  readonly sourceRectCoalescing?: "exact" | "union" | undefined;
  readonly sourceWindow?: RetainedTextureSourceWindow | undefined;
  readonly surfaceId: string;
  readonly targetLod?: number | undefined;
  readonly visualEpochKind?: RetainedTexturePageDescriptor["visualEpochKind"];
};

export type RetainedTextureWorkItem = {
  readonly contentVersion: number;
  readonly createdFrame: number;
  readonly kind: RetainedTextureWorkKind;
  readonly projectionHorizonGeneration?: number | undefined;
  readonly priority: NodeTexturePriority;
  readonly refreshCommittedPage: boolean;
  readonly sequence: number;
  readonly sourceRect?: GpuRect | undefined;
  readonly sourceRectCoalescing: "exact" | "union";
  readonly sourceWindow?: RetainedTextureSourceWindow | undefined;
  readonly surfaceId: string;
  readonly targetLod?: number | undefined;
  readonly visualEpochKind?: RetainedTexturePageDescriptor["visualEpochKind"];
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
  "first-visible": 1,
  "content-rect": 2,
  "hover-rect": 3,
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

  cancelFirstVisible(
    predicate: (item: RetainedTextureWorkItem) => boolean = () => true,
  ): number {
    let canceledCount = 0;
    for (const [key, item] of this.items) {
      if (item.kind !== "first-visible" || !predicate(item)) {
        continue;
      }
      this.items.delete(key);
      canceledCount += 1;
    }
    return canceledCount;
  }

  cancelWork(
    predicate: (item: RetainedTextureWorkItem) => boolean = () => true,
  ): number {
    let canceledCount = 0;
    for (const [key, item] of this.items) {
      if (!predicate(item)) {
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
    const sourceRect = normalizeOptionalRect("sourceRect", input.sourceRect);
    const sourceWindow = normalizeOptionalRect(
      "sourceWindow",
      input.sourceWindow,
    );
    validateWorkItemInput(input, { sourceRect, sourceWindow });
    const item: RetainedTextureWorkItem = {
      contentVersion: normalizeFiniteNumber(
        "contentVersion",
        input.contentVersion,
      ),
      createdFrame: input.createdFrame ?? 0,
      kind: input.kind,
      projectionHorizonGeneration: input.projectionHorizonGeneration,
      priority: input.priority ?? "visible",
      refreshCommittedPage: input.refreshCommittedPage ?? false,
      sequence: this.sequence,
      sourceRectCoalescing: input.sourceRectCoalescing ?? "union",
      surfaceId: normalizeSurfaceId(input.surfaceId),
      ...createOptionalWorkItemGeometry({
        sourceRect,
        sourceWindow,
        targetLod: input.targetLod,
      }),
      visualEpochKind: input.visualEpochKind ?? "base",
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

function normalizeOptionalRect(
  name: string,
  rect: GpuRect | undefined,
): GpuRect | undefined {
  return rect === undefined ? undefined : normalizeRect(name, rect);
}

function createOptionalWorkItemGeometry({
  sourceRect,
  sourceWindow,
  targetLod,
}: {
  readonly sourceRect: GpuRect | undefined;
  readonly sourceWindow: GpuRect | undefined;
  readonly targetLod: number | undefined;
}): Pick<RetainedTextureWorkItem, "sourceRect" | "sourceWindow" | "targetLod"> {
  return {
    ...(sourceRect === undefined ? {} : { sourceRect }),
    ...(sourceWindow === undefined ? {} : { sourceWindow }),
    ...(targetLod === undefined
      ? {}
      : { targetLod: normalizeFinitePositiveNumber("targetLod", targetLod) }),
  };
}

function coalesceWorkItems(
  existing: RetainedTextureWorkItem,
  next: RetainedTextureWorkItem,
): RetainedTextureWorkItem {
  const sourceRect =
    existing.sourceRect &&
    next.sourceRect &&
    existing.sourceRectCoalescing === "union" &&
    next.sourceRectCoalescing === "union"
      ? unionRects(existing.sourceRect, next.sourceRect)
      : existing.sourceRect ?? next.sourceRect;
  return {
    ...existing,
    createdFrame: Math.min(existing.createdFrame, next.createdFrame),
    priority: higherPriority(existing.priority, next.priority),
    refreshCommittedPage:
      existing.refreshCommittedPage || next.refreshCommittedPage,
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
  return retainedTextureWorkLaneForWorkItem(item) === "visible-repair";
}

export function retainedTextureWorkLaneForWorkItem(
  item: Pick<RetainedTextureWorkItem, "kind" | "priority">,
): RetainedTextureWorkLane {
  if (item.priority === "prefetch" || item.kind === "source-window") {
    return "prefetch";
  }
  if (item.kind === "lod-refinement") {
    return "visible-refinement";
  }
  return "visible-repair";
}

function workItemCoalescingKey(item: RetainedTextureWorkItem): string {
  return [
    item.surfaceId,
    item.contentVersion,
    item.kind,
    item.sourceRect
      ? item.sourceRectCoalescing === "exact"
        ? rectKey(item.sourceRect)
        : "rect"
      : "full",
    item.sourceWindow ? rectKey(item.sourceWindow) : "window:none",
    item.targetLod ?? "lod:none",
    item.visualEpochKind ?? "base",
    item.projectionHorizonGeneration ?? "horizon:none",
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
