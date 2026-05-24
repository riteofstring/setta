export type NodeTexturePriority =
  | "critical"
  | "interactive"
  | "visible"
  | "prefetch";

export type DirtyNodeWorkKind =
  | "animation"
  | "content"
  | "geometry"
  | "hover"
  | "resolution"
  | "source-window";

export type DirtyNodeReason =
  | "animation"
  | "content"
  | "dimension"
  | "first-visible"
  | "focus"
  | "input"
  | "paint"
  | "pointer"
  | "resolution"
  | "scroll"
  | "selection"
  | "theme";

type DirtyNodeSourceRect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type DirtyNodeMark = {
  readonly content?: boolean | undefined;
  readonly frame?: number | undefined;
  readonly nodeId: string;
  readonly priority?: NodeTexturePriority | undefined;
  readonly reason?: DirtyNodeReason | undefined;
  readonly resolution?: boolean | undefined;
  readonly sourceRect?: DirtyNodeSourceRect | undefined;
};

export type DirtyNodeState = {
  readonly dirtyContent: boolean;
  readonly dirtyResolution: boolean;
  readonly lastDirtyFrame: number;
  readonly nodeId: string;
  readonly priority: NodeTexturePriority;
  readonly reasons: readonly DirtyNodeReason[];
  readonly sequence: number;
  readonly sourceRect?: DirtyNodeSourceRect | undefined;
  readonly workKinds: readonly DirtyNodeWorkKind[];
};

type MutableDirtyNodeState = Omit<DirtyNodeState, "reasons" | "workKinds"> & {
  readonly reasons: Set<DirtyNodeReason>;
  readonly workKinds: Set<DirtyNodeWorkKind>;
};

const PRIORITY_RANK: Record<NodeTexturePriority, number> = {
  critical: 0,
  interactive: 1,
  visible: 2,
  prefetch: 3,
};
const DIRTY_REASON_WORK_KIND: Record<DirtyNodeReason, DirtyNodeWorkKind> = {
  animation: "animation",
  content: "content",
  dimension: "geometry",
  "first-visible": "content",
  focus: "content",
  input: "content",
  paint: "content",
  pointer: "hover",
  resolution: "resolution",
  scroll: "source-window",
  selection: "content",
  theme: "content",
};

export class DirtyNodeQueue {
  private readonly states = new Map<string, MutableDirtyNodeState>();
  private sequence = 0;

  clear(nodeId: string) {
    this.states.delete(nodeId);
  }

  clearAll() {
    this.states.clear();
  }

  get(nodeId: string): DirtyNodeState | undefined {
    const state = this.states.get(nodeId);
    return state ? toPublicDirtyNodeState(state) : undefined;
  }

  markDirty(mark: DirtyNodeMark): DirtyNodeState {
    const dirtyFlags = resolveDirtyMarkFlags(mark);
    const existing = this.states.get(mark.nodeId);
    const state = existing
      ? mergeDirtyNodeState(existing, mark, dirtyFlags)
      : createDirtyNodeState(mark, dirtyFlags, this.sequence);

    if (!existing) {
      this.sequence += 1;
    }
    this.states.set(mark.nodeId, state);
    return toPublicDirtyNodeState(state);
  }

  orderedDirtyNodes(limit = Number.POSITIVE_INFINITY): DirtyNodeState[] {
    return [...this.states.values()]
      .sort(compareMutableDirtyNodeStates)
      .slice(0, limit)
      .map(toPublicDirtyNodeState);
  }

  setPriority(nodeId: string, priority: NodeTexturePriority) {
    const existing = this.states.get(nodeId);
    if (!existing) {
      return;
    }
    this.states.set(nodeId, {
      ...existing,
      priority,
    });
  }
}

function compareMutableDirtyNodeStates(
  left: MutableDirtyNodeState,
  right: MutableDirtyNodeState,
): number {
  return (
    comparePriority(left.priority, right.priority) ||
    compareDirtyKind(left, right) ||
    left.sequence - right.sequence
  );
}

function comparePriority(
  left: NodeTexturePriority,
  right: NodeTexturePriority,
): number {
  return PRIORITY_RANK[left] - PRIORITY_RANK[right];
}

export function compareNodeTexturePriority(
  left: NodeTexturePriority,
  right: NodeTexturePriority,
): number {
  return comparePriority(left, right);
}

function compareDirtyKind(
  left: Pick<DirtyNodeState, "dirtyContent">,
  right: Pick<DirtyNodeState, "dirtyContent">,
): number {
  if (left.dirtyContent === right.dirtyContent) {
    return 0;
  }
  return left.dirtyContent ? -1 : 1;
}

function higherPriority(
  left: NodeTexturePriority,
  right: NodeTexturePriority,
): NodeTexturePriority {
  return comparePriority(left, right) <= 0 ? left : right;
}

function createDirtyNodeState(
  mark: DirtyNodeMark,
  dirtyFlags: DirtyMarkFlags,
  sequence: number,
): MutableDirtyNodeState {
  return {
    dirtyContent: dirtyFlags.content,
    dirtyResolution: dirtyFlags.resolution,
    lastDirtyFrame: mark.frame ?? 0,
    nodeId: mark.nodeId,
    priority: mark.priority ?? "visible",
    reasons: new Set(mark.reason ? [mark.reason] : []),
    sequence,
    ...(mark.sourceRect ? { sourceRect: mark.sourceRect } : {}),
    workKinds: resolveDirtyNodeWorkKinds(mark, dirtyFlags),
  };
}

function mergeDirtyNodeState(
  existing: MutableDirtyNodeState,
  mark: DirtyNodeMark,
  dirtyFlags: DirtyMarkFlags,
): MutableDirtyNodeState {
  const reasons = existing.reasons;
  const sourceRect = resolveDirtyNodeSourceRect(
    existing.sourceRect,
    mark.sourceRect,
  );
  if (mark.reason) {
    reasons.add(mark.reason);
  }
  const workKinds = existing.workKinds;
  for (const workKind of resolveDirtyNodeWorkKinds(mark, dirtyFlags)) {
    workKinds.add(workKind);
  }
  return {
    dirtyContent: existing.dirtyContent || dirtyFlags.content,
    dirtyResolution: existing.dirtyResolution || dirtyFlags.resolution,
    lastDirtyFrame: mark.frame ?? existing.lastDirtyFrame,
    nodeId: existing.nodeId,
    priority: higherPriority(
      existing.priority,
      mark.priority ?? existing.priority,
    ),
    reasons,
    sequence: existing.sequence,
    ...(sourceRect ? { sourceRect } : {}),
    workKinds,
  };
}

function resolveDirtyNodeSourceRect(
  current: DirtyNodeSourceRect | undefined,
  next: DirtyNodeSourceRect | undefined,
): DirtyNodeSourceRect | undefined {
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  const left = Math.min(current.x, next.x);
  const top = Math.min(current.y, next.y);
  const right = Math.max(current.x + current.width, next.x + next.width);
  const bottom = Math.max(current.y + current.height, next.y + next.height);
  return { height: bottom - top, width: right - left, x: left, y: top };
}

type DirtyMarkFlags = {
  readonly content: boolean;
  readonly resolution: boolean;
};

function resolveDirtyMarkFlags(mark: DirtyNodeMark): DirtyMarkFlags {
  const dirtyFlags = {
    content: mark.content ?? (mark.resolution === undefined ? true : false),
    resolution: mark.resolution ?? false,
  };
  if (!dirtyFlags.content && !dirtyFlags.resolution) {
    throw new Error(
      "Setta GPU flow dirty tracking requires content or resolution dirtiness.",
    );
  }
  return dirtyFlags;
}

function resolveDirtyNodeWorkKinds(
  mark: Pick<DirtyNodeMark, "reason">,
  dirtyFlags: DirtyMarkFlags,
): Set<DirtyNodeWorkKind> {
  const workKinds = new Set<DirtyNodeWorkKind>();
  if (dirtyFlags.resolution) {
    workKinds.add("resolution");
  }
  if (mark.reason) {
    workKinds.add(workKindForDirtyReason(mark.reason));
  } else if (dirtyFlags.content) {
    workKinds.add("content");
  }
  return workKinds;
}

function workKindForDirtyReason(reason: DirtyNodeReason): DirtyNodeWorkKind {
  return DIRTY_REASON_WORK_KIND[reason];
}

function toPublicDirtyNodeState(state: MutableDirtyNodeState): DirtyNodeState {
  return {
    dirtyContent: state.dirtyContent,
    dirtyResolution: state.dirtyResolution,
    lastDirtyFrame: state.lastDirtyFrame,
    nodeId: state.nodeId,
    priority: state.priority,
    reasons: [...state.reasons],
    sequence: state.sequence,
    ...(state.sourceRect ? { sourceRect: state.sourceRect } : {}),
    workKinds: [...state.workKinds],
  };
}
