export type NodeTexturePriority = "interactive" | "visible" | "prefetch";

export type DirtyNodeReason =
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

export type DirtyNodeMark = {
  readonly content?: boolean | undefined;
  readonly frame?: number | undefined;
  readonly nodeId: string;
  readonly priority?: NodeTexturePriority | undefined;
  readonly reason?: DirtyNodeReason | undefined;
  readonly resolution?: boolean | undefined;
};

export type DirtyNodeState = {
  readonly dirtyContent: boolean;
  readonly dirtyResolution: boolean;
  readonly lastDirtyFrame: number;
  readonly nodeId: string;
  readonly priority: NodeTexturePriority;
  readonly reasons: readonly DirtyNodeReason[];
  readonly sequence: number;
};

type MutableDirtyNodeState = Omit<DirtyNodeState, "reasons"> & {
  readonly reasons: Set<DirtyNodeReason>;
};

const PRIORITY_RANK: Record<NodeTexturePriority, number> = {
  interactive: 0,
  visible: 1,
  prefetch: 2,
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

  hasDirtyNodes(): boolean {
    return this.states.size > 0;
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
  };
}

function mergeDirtyNodeState(
  existing: MutableDirtyNodeState,
  mark: DirtyNodeMark,
  dirtyFlags: DirtyMarkFlags,
): MutableDirtyNodeState {
  const reasons = existing.reasons;
  if (mark.reason) {
    reasons.add(mark.reason);
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
  };
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

function toPublicDirtyNodeState(state: MutableDirtyNodeState): DirtyNodeState {
  return {
    dirtyContent: state.dirtyContent,
    dirtyResolution: state.dirtyResolution,
    lastDirtyFrame: state.lastDirtyFrame,
    nodeId: state.nodeId,
    priority: state.priority,
    reasons: [...state.reasons],
    sequence: state.sequence,
  };
}
