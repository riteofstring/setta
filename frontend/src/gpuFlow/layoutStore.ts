import { subscribeWithSelector } from "zustand/middleware";
import { createStore, type StoreApi } from "zustand/vanilla";

import type { GpuNodeLayout } from "./htmlSurfaces/frame";
import { getBoundsOfGpuRects } from "./nodeBounds";
import { resolveGpuNodeZIndex } from "./nodeZIndex";
import type { GpuPoint, GpuRect } from "./viewportMath";

export const GPU_FLOW_LAYOUT_DIRTY_FLAGS = [
  "node-geometry",
  "edge-geometry",
  "selection-bounds",
  "visible-set",
  "texture-size",
  "source-size",
] as const;

export type GpuFlowLayoutDirtyFlag =
  (typeof GPU_FLOW_LAYOUT_DIRTY_FLAGS)[number];

export type GpuFlowLayoutChangePhase = "cancel" | "change" | "commit" | "start";

export type GpuFlowLayoutChangeReason =
  | "drag"
  | "intrinsic-size"
  | "keyboard"
  | "load"
  | "project-sync"
  | "resize";

export type GpuFlowLayoutInteractionFlags = {
  readonly dragging?: boolean | undefined;
  readonly resizing?: boolean | undefined;
  readonly selected?: boolean | undefined;
};

export type GpuFlowLayoutTextureInvalidation = {
  readonly contentDirty?: boolean | undefined;
  readonly sizeDirty?: boolean | undefined;
};

export type GpuFlowLayoutDropMarker = {
  readonly axis: "x" | "y";
  readonly childNodeId: string;
  readonly index: number;
  readonly parentNodeId: string;
  readonly rect: GpuRect;
};

export type GpuFlowLayoutDragPreview = {
  readonly draggedNodeIds: readonly string[];
  readonly dropMarker: GpuFlowLayoutDropMarker | null;
};

export type GpuFlowLayoutNode = GpuNodeLayout & {
  readonly interactionFlags?: GpuFlowLayoutInteractionFlags | undefined;
  readonly sourceElement?: HTMLElement | null | undefined;
  readonly sourceLocalBounds?: GpuRect | null | undefined;
  readonly textureInvalidation?: GpuFlowLayoutTextureInvalidation | undefined;
};

export type GpuFlowLayoutNodePatch = {
  readonly nodeId: string;
} & Partial<Omit<GpuFlowLayoutNode, "nodeId">>;

export type GpuFlowLayoutChange = {
  readonly changedNodeIds: readonly string[];
  readonly dirty: readonly GpuFlowLayoutDirtyFlag[];
  readonly nextNodes: readonly GpuFlowLayoutNode[];
  readonly phase: GpuFlowLayoutChangePhase;
  readonly previousNodes: readonly GpuFlowLayoutNode[];
  readonly reason: GpuFlowLayoutChangeReason;
};

export type GpuFlowLayoutMutationOptions = {
  readonly dirty?: readonly GpuFlowLayoutDirtyFlag[] | undefined;
  readonly phase?: GpuFlowLayoutChangePhase | undefined;
  readonly reason?: GpuFlowLayoutChangeReason | undefined;
};

export type GpuFlowLayoutHitTestOptions = {
  readonly nodeIds?: readonly string[] | ReadonlySet<string> | undefined;
};

type GpuFlowLayoutStoreState = {
  readonly changedNodeIds: readonly string[];
  readonly dirty: readonly GpuFlowLayoutDirtyFlag[];
  readonly dragPreview: GpuFlowLayoutDragPreview | null;
  readonly lastChange: GpuFlowLayoutChange | null;
  readonly nodeOrder: readonly string[];
  readonly nodesById: ReadonlyMap<string, GpuFlowLayoutNode>;
  readonly version: number;
};

type GpuFlowLayoutStoreActions = {
  clearDirty(flags?: readonly GpuFlowLayoutDirtyFlag[] | undefined): void;
  getNode(nodeId: string): GpuFlowLayoutNode | null;
  getNodeAtPoint(
    point: GpuPoint,
    options?: GpuFlowLayoutHitTestOptions | undefined,
  ): GpuFlowLayoutNode | null;
  getNodeRect(nodeId: string): GpuRect | null;
  getNodes(
    nodeIds?: readonly string[] | undefined,
  ): readonly GpuFlowLayoutNode[];
  getNodesBounds(nodeIds?: readonly string[] | undefined): GpuRect | null;
  getZOrderedNodes(
    nodeIds?: readonly string[] | undefined,
  ): readonly GpuFlowLayoutNode[];
  patchNodes(
    patches: readonly GpuFlowLayoutNodePatch[],
    options?: GpuFlowLayoutMutationOptions | undefined,
  ): GpuFlowLayoutChange;
  removeNodes(
    nodeIds: readonly string[],
    options?: GpuFlowLayoutMutationOptions | undefined,
  ): GpuFlowLayoutChange;
  replaceNodes(
    nodes: readonly GpuFlowLayoutNode[],
    options?: GpuFlowLayoutMutationOptions | undefined,
  ): GpuFlowLayoutChange;
  setDragPreview(preview: GpuFlowLayoutDragPreview | null): void;
  upsertNodes(
    nodes: readonly GpuFlowLayoutNode[],
    options?: GpuFlowLayoutMutationOptions | undefined,
  ): GpuFlowLayoutChange;
};

export type GpuFlowLayoutStore = GpuFlowLayoutStoreState &
  GpuFlowLayoutStoreActions;

export type GpuFlowLayoutStoreApi = StoreApi<GpuFlowLayoutStore>;

export type CreateGpuFlowLayoutStoreOptions = {
  readonly nodes?: readonly GpuFlowLayoutNode[] | undefined;
};

type NormalizedGpuFlowLayoutNodes = {
  readonly nodeOrder: readonly string[];
  readonly nodesById: ReadonlyMap<string, GpuFlowLayoutNode>;
};

const EMPTY_LAYOUT_CHANGE: GpuFlowLayoutChange = {
  changedNodeIds: [],
  dirty: [],
  nextNodes: [],
  phase: "change",
  previousNodes: [],
  reason: "project-sync",
};

export function createGpuFlowLayoutStore(
  options: CreateGpuFlowLayoutStoreOptions = {},
): GpuFlowLayoutStoreApi {
  const initialNodes = normalizeGpuFlowLayoutNodes(options.nodes ?? []);
  return createStore<GpuFlowLayoutStore>()(
    subscribeWithSelector((set, get) => ({
      changedNodeIds: [],
      dirty: [],
      dragPreview: null,
      lastChange: null,
      nodeOrder: initialNodes.nodeOrder,
      nodesById: initialNodes.nodesById,
      version: 0,
      clearDirty(flags) {
        set((state) => {
          if (!flags) {
            return state.dirty.length === 0 ? state : { dirty: [] };
          }
          const nextDirty = state.dirty.filter((flag) => !flags.includes(flag));
          return nextDirty.length === state.dirty.length
            ? state
            : { dirty: nextDirty };
        });
      },
      getNode(nodeId) {
        return get().nodesById.get(nodeId) ?? null;
      },
      getNodeAtPoint(point, options) {
        assertFiniteNumber("hit-test point x", point.x);
        assertFiniteNumber("hit-test point y", point.y);
        const candidateIds = normalizeOptionalNodeIdFilter(options?.nodeIds);
        const nodes = get().getZOrderedNodes();
        for (let index = nodes.length - 1; index >= 0; index -= 1) {
          const node = nodes[index];
          if (!node || (candidateIds && !candidateIds.has(node.nodeId))) {
            continue;
          }
          const rect = getGpuFlowLayoutNodeRect(node);
          if (rect && gpuRectContainsPoint(rect, point)) {
            return node;
          }
        }
        return null;
      },
      getNodeRect(nodeId) {
        const node = get().nodesById.get(nodeId);
        return node ? getGpuFlowLayoutNodeRect(node) : null;
      },
      getNodes(nodeIds) {
        return getGpuFlowLayoutNodesInOrder(get(), nodeIds);
      },
      getNodesBounds(nodeIds) {
        return getGpuFlowLayoutNodesBounds(get().getNodes(nodeIds));
      },
      getZOrderedNodes(nodeIds) {
        return sortGpuFlowLayoutNodesByZOrder(
          getGpuFlowLayoutNodesInOrder(get(), nodeIds),
        );
      },
      patchNodes(patches, options) {
        if (patches.length === 0) {
          return EMPTY_LAYOUT_CHANGE;
        }
        const state = get();
        const nextNodesById = new Map(state.nodesById);
        const changedNodeIds: string[] = [];
        const seenNodeIds = new Set<string>();
        for (const patch of patches) {
          assertUniqueNodeId(seenNodeIds, patch.nodeId);
          const currentNode = nextNodesById.get(patch.nodeId);
          if (!currentNode) {
            throw new Error(`Missing layout node ${patch.nodeId}.`);
          }
          const nextNode = normalizeGpuFlowLayoutNode({
            ...currentNode,
            ...patch,
            nodeId: currentNode.nodeId,
          });
          if (!areGpuFlowLayoutNodesEqual(currentNode, nextNode)) {
            nextNodesById.set(patch.nodeId, nextNode);
            changedNodeIds.push(patch.nodeId);
          }
        }
        return commitGpuFlowLayoutMutation({
          changedNodeIds,
          get,
          nextNodeOrder: state.nodeOrder,
          nextNodesById,
          options,
          set,
        });
      },
      removeNodes(nodeIds, options) {
        if (nodeIds.length === 0) {
          return EMPTY_LAYOUT_CHANGE;
        }
        const state = get();
        const nextNodesById = new Map(state.nodesById);
        const changedNodeIds: string[] = [];
        const seenNodeIds = new Set<string>();
        for (const nodeId of nodeIds) {
          assertUniqueNodeId(seenNodeIds, nodeId);
          if (nextNodesById.delete(nodeId)) {
            changedNodeIds.push(nodeId);
          }
        }
        const removedNodeIds = new Set(changedNodeIds);
        const nextNodeOrder = state.nodeOrder.filter(
          (nodeId) => !removedNodeIds.has(nodeId),
        );
        return commitGpuFlowLayoutMutation({
          changedNodeIds,
          get,
          nextNodeOrder,
          nextNodesById,
          options,
          set,
        });
      },
      replaceNodes(nodes, options) {
        const nextNodes = normalizeGpuFlowLayoutNodes(nodes);
        const changedNodeIds = collectChangedGpuFlowLayoutNodeIds({
          nextNodeOrder: nextNodes.nodeOrder,
          nextNodesById: nextNodes.nodesById,
          previousNodeOrder: get().nodeOrder,
          previousNodesById: get().nodesById,
        });
        return commitGpuFlowLayoutMutation({
          changedNodeIds,
          get,
          nextNodeOrder: nextNodes.nodeOrder,
          nextNodesById: nextNodes.nodesById,
          options,
          set,
        });
      },
      setDragPreview(preview) {
        const nextPreview = normalizeGpuFlowLayoutDragPreview(preview);
        set((state) =>
          areGpuFlowLayoutDragPreviewsEqual(state.dragPreview, nextPreview)
            ? state
            : { dragPreview: nextPreview },
        );
      },
      upsertNodes(nodes, options) {
        if (nodes.length === 0) {
          return EMPTY_LAYOUT_CHANGE;
        }
        const state = get();
        const nextNodesById = new Map(state.nodesById);
        const nextNodeOrder = [...state.nodeOrder];
        const changedNodeIds: string[] = [];
        const seenNodeIds = new Set<string>();
        for (const nodeInput of nodes) {
          const node = normalizeGpuFlowLayoutNode(nodeInput);
          assertUniqueNodeId(seenNodeIds, node.nodeId);
          const currentNode = nextNodesById.get(node.nodeId);
          if (!currentNode) {
            nextNodeOrder.push(node.nodeId);
            nextNodesById.set(node.nodeId, node);
            changedNodeIds.push(node.nodeId);
            continue;
          }
          if (!areGpuFlowLayoutNodesEqual(currentNode, node)) {
            nextNodesById.set(node.nodeId, node);
            changedNodeIds.push(node.nodeId);
          }
        }
        return commitGpuFlowLayoutMutation({
          changedNodeIds,
          get,
          nextNodeOrder,
          nextNodesById,
          options,
          set,
        });
      },
    })),
  );
}

export const gpuFlowLayoutStore = createGpuFlowLayoutStore();

export function getGpuFlowLayoutNodeRect(
  node: GpuFlowLayoutNode,
): GpuRect | null {
  if (!isMeasuredGpuFlowLayoutNode(node)) {
    return null;
  }
  return {
    height: node.height,
    width: node.width,
    x: node.x,
    y: node.y,
  };
}

export function getGpuFlowLayoutNodesBounds(
  nodes: readonly GpuFlowLayoutNode[],
): GpuRect | null {
  let bounds: GpuRect | null = null;
  for (const node of nodes) {
    const rect = getGpuFlowLayoutNodeRect(node);
    if (!rect) {
      continue;
    }
    bounds = bounds ? getBoundsOfGpuRects(bounds, rect) : rect;
  }
  return bounds;
}

export function sortGpuFlowLayoutNodesByZOrder(
  nodes: readonly GpuFlowLayoutNode[],
): readonly GpuFlowLayoutNode[] {
  return [...nodes].sort((left, right) => {
    const zIndexDiff = resolveGpuNodeZIndex(left) - resolveGpuNodeZIndex(right);
    if (zIndexDiff !== 0) {
      return zIndexDiff;
    }
    return 0;
  });
}

function commitGpuFlowLayoutMutation({
  changedNodeIds,
  get,
  nextNodeOrder,
  nextNodesById,
  options,
  set,
}: {
  readonly changedNodeIds: readonly string[];
  readonly get: () => GpuFlowLayoutStore;
  readonly nextNodeOrder: readonly string[];
  readonly nextNodesById: ReadonlyMap<string, GpuFlowLayoutNode>;
  readonly options?: GpuFlowLayoutMutationOptions | undefined;
  readonly set: StoreApi<GpuFlowLayoutStore>["setState"];
}): GpuFlowLayoutChange {
  const state = get();
  const change = createGpuFlowLayoutChange({
    changedNodeIds,
    nextNodesById,
    options,
    previousNodesById: state.nodesById,
  });
  if (change.changedNodeIds.length === 0 && change.dirty.length === 0) {
    return change;
  }
  set((currentState) => ({
    changedNodeIds: change.changedNodeIds,
    dirty: mergeGpuFlowLayoutDirtyFlags(currentState.dirty, change.dirty),
    lastChange: change,
    nodeOrder: nextNodeOrder,
    nodesById: nextNodesById,
    version: currentState.version + 1,
  }));
  return change;
}

function createGpuFlowLayoutChange({
  changedNodeIds,
  nextNodesById,
  options,
  previousNodesById,
}: {
  readonly changedNodeIds: readonly string[];
  readonly nextNodesById: ReadonlyMap<string, GpuFlowLayoutNode>;
  readonly options?: GpuFlowLayoutMutationOptions | undefined;
  readonly previousNodesById: ReadonlyMap<string, GpuFlowLayoutNode>;
}): GpuFlowLayoutChange {
  const dirty = resolveGpuFlowLayoutDirtyFlags({
    changedNodeIds,
    nextNodesById,
    options,
    previousNodesById,
  });
  return {
    changedNodeIds,
    dirty,
    nextNodes: getExistingNodesByIds(nextNodesById, changedNodeIds),
    phase: options?.phase ?? "change",
    previousNodes: getExistingNodesByIds(previousNodesById, changedNodeIds),
    reason: options?.reason ?? "project-sync",
  };
}

function resolveGpuFlowLayoutDirtyFlags({
  changedNodeIds,
  nextNodesById,
  options,
  previousNodesById,
}: {
  readonly changedNodeIds: readonly string[];
  readonly nextNodesById: ReadonlyMap<string, GpuFlowLayoutNode>;
  readonly options?: GpuFlowLayoutMutationOptions | undefined;
  readonly previousNodesById: ReadonlyMap<string, GpuFlowLayoutNode>;
}): readonly GpuFlowLayoutDirtyFlag[] {
  const dirty = new Set<GpuFlowLayoutDirtyFlag>(options?.dirty ?? []);
  for (const nodeId of changedNodeIds) {
    const previousNode = previousNodesById.get(nodeId) ?? null;
    const nextNode = nextNodesById.get(nodeId) ?? null;
    addGpuFlowLayoutDirtyFlagsForNodeChange(dirty, previousNode, nextNode);
  }
  return orderGpuFlowLayoutDirtyFlags(dirty);
}

function addGpuFlowLayoutDirtyFlagsForNodeChange(
  dirty: Set<GpuFlowLayoutDirtyFlag>,
  previousNode: GpuFlowLayoutNode | null,
  nextNode: GpuFlowLayoutNode | null,
) {
  if (!previousNode || !nextNode) {
    addGpuFlowLayoutGeometryDirtyFlags(dirty);
    dirty.add("texture-size");
    dirty.add("source-size");
    return;
  }

  if (hasGpuFlowLayoutNodeGeometryChanged(previousNode, nextNode)) {
    addGpuFlowLayoutGeometryDirtyFlags(dirty);
  }
  if (hasGpuFlowLayoutNodeSizeChanged(previousNode, nextNode)) {
    dirty.add("texture-size");
  }
  if (hasGpuFlowLayoutNodeSourceChanged(previousNode, nextNode)) {
    dirty.add("source-size");
  }
  if (nextNode.textureInvalidation?.sizeDirty) {
    dirty.add("texture-size");
  }
}

function addGpuFlowLayoutGeometryDirtyFlags(
  dirty: Set<GpuFlowLayoutDirtyFlag>,
) {
  dirty.add("node-geometry");
  dirty.add("edge-geometry");
  dirty.add("selection-bounds");
  dirty.add("visible-set");
}

function hasGpuFlowLayoutNodeGeometryChanged(
  previousNode: GpuFlowLayoutNode,
  nextNode: GpuFlowLayoutNode,
): boolean {
  return !areArraysEqual(
    getGpuFlowLayoutNodeGeometrySignature(previousNode),
    getGpuFlowLayoutNodeGeometrySignature(nextNode),
  );
}

function hasGpuFlowLayoutNodeSizeChanged(
  previousNode: GpuFlowLayoutNode,
  nextNode: GpuFlowLayoutNode,
): boolean {
  return (
    previousNode.width !== nextNode.width ||
    previousNode.height !== nextNode.height
  );
}

function hasGpuFlowLayoutNodeSourceChanged(
  previousNode: GpuFlowLayoutNode,
  nextNode: GpuFlowLayoutNode,
): boolean {
  return (
    previousNode.sourceElement !== nextNode.sourceElement ||
    !areOptionalGpuRectsEqual(
      previousNode.sourceLocalBounds,
      nextNode.sourceLocalBounds,
    )
  );
}

function getGpuFlowLayoutNodeGeometrySignature(
  node: GpuFlowLayoutNode,
): readonly (number | null | undefined)[] {
  return [
    node.height,
    node.tempZIndex,
    node.width,
    node.x,
    node.y,
    node.zIndex,
  ];
}

function collectChangedGpuFlowLayoutNodeIds({
  nextNodeOrder,
  nextNodesById,
  previousNodeOrder,
  previousNodesById,
}: {
  readonly nextNodeOrder: readonly string[];
  readonly nextNodesById: ReadonlyMap<string, GpuFlowLayoutNode>;
  readonly previousNodeOrder: readonly string[];
  readonly previousNodesById: ReadonlyMap<string, GpuFlowLayoutNode>;
}): readonly string[] {
  const changedNodeIds: string[] = [];
  const orderedNodeIds = [
    ...previousNodeOrder,
    ...nextNodeOrder.filter((nodeId) => !previousNodesById.has(nodeId)),
  ];
  const nodeOrderChanged = !areStringArraysEqual(
    previousNodeOrder,
    nextNodeOrder,
  );
  for (const nodeId of orderedNodeIds) {
    const previousNode = previousNodesById.get(nodeId);
    const nextNode = nextNodesById.get(nodeId);
    if (
      nodeOrderChanged ||
      !previousNode ||
      !nextNode ||
      !areGpuFlowLayoutNodesEqual(previousNode, nextNode)
    ) {
      changedNodeIds.push(nodeId);
    }
  }
  return changedNodeIds;
}

function normalizeGpuFlowLayoutNodes(
  nodes: readonly GpuFlowLayoutNode[],
): NormalizedGpuFlowLayoutNodes {
  const nodesById = new Map<string, GpuFlowLayoutNode>();
  const nodeOrder: string[] = [];
  for (const nodeInput of nodes) {
    const node = normalizeGpuFlowLayoutNode(nodeInput);
    if (nodesById.has(node.nodeId)) {
      throw new Error(`Duplicate layout node ${node.nodeId}.`);
    }
    nodesById.set(node.nodeId, node);
    nodeOrder.push(node.nodeId);
  }
  return { nodeOrder, nodesById };
}

function normalizeGpuFlowLayoutNode(
  node: GpuFlowLayoutNode,
): GpuFlowLayoutNode {
  if (node.nodeId.length === 0) {
    throw new Error("layout node id is required.");
  }
  assertFiniteNumber(`layout node ${node.nodeId} x`, node.x);
  assertFiniteNumber(`layout node ${node.nodeId} y`, node.y);
  return {
    ...node,
    height: normalizeOptionalNodeDimension(
      `layout node ${node.nodeId} height`,
      node.height,
    ),
    sourceLocalBounds: normalizeOptionalGpuRect(
      `layout node ${node.nodeId} source local bounds`,
      node.sourceLocalBounds,
    ),
    tempZIndex: normalizeOptionalFiniteNumber(
      `layout node ${node.nodeId} temporary z-index`,
      node.tempZIndex,
    ),
    width: normalizeOptionalNodeDimension(
      `layout node ${node.nodeId} width`,
      node.width,
    ),
    zIndex: normalizeOptionalFiniteNumber(
      `layout node ${node.nodeId} z-index`,
      node.zIndex,
    ),
  };
}

function normalizeGpuFlowLayoutDragPreview(
  preview: GpuFlowLayoutDragPreview | null,
): GpuFlowLayoutDragPreview | null {
  if (!preview) {
    return null;
  }
  return {
    draggedNodeIds: [...preview.draggedNodeIds],
    dropMarker: normalizeGpuFlowLayoutDropMarker(preview.dropMarker),
  };
}

function normalizeGpuFlowLayoutDropMarker(
  marker: GpuFlowLayoutDropMarker | null,
): GpuFlowLayoutDropMarker | null {
  if (!marker) {
    return null;
  }
  if (marker.childNodeId.length === 0) {
    throw new Error("drop marker child node id is required.");
  }
  if (marker.parentNodeId.length === 0) {
    throw new Error("drop marker parent node id is required.");
  }
  assertFiniteNonNegative("drop marker index", marker.index);
  assertFiniteNumber("drop marker rect x", marker.rect.x);
  assertFiniteNumber("drop marker rect y", marker.rect.y);
  assertFiniteNonNegative("drop marker rect width", marker.rect.width);
  assertFiniteNonNegative("drop marker rect height", marker.rect.height);
  return {
    axis: marker.axis,
    childNodeId: marker.childNodeId,
    index: marker.index,
    parentNodeId: marker.parentNodeId,
    rect: {
      height: marker.rect.height,
      width: marker.rect.width,
      x: marker.rect.x,
      y: marker.rect.y,
    },
  };
}

function getGpuFlowLayoutNodesInOrder(
  state: Pick<GpuFlowLayoutStoreState, "nodeOrder" | "nodesById">,
  nodeIds?: readonly string[] | undefined,
): readonly GpuFlowLayoutNode[] {
  const orderedIds = nodeIds ?? state.nodeOrder;
  const nodes: GpuFlowLayoutNode[] = [];
  for (const nodeId of orderedIds) {
    const node = state.nodesById.get(nodeId);
    if (node) {
      nodes.push(node);
    }
  }
  return nodes;
}

function getExistingNodesByIds(
  nodesById: ReadonlyMap<string, GpuFlowLayoutNode>,
  nodeIds: readonly string[],
): readonly GpuFlowLayoutNode[] {
  const nodes: GpuFlowLayoutNode[] = [];
  for (const nodeId of nodeIds) {
    const node = nodesById.get(nodeId);
    if (node) {
      nodes.push(node);
    }
  }
  return nodes;
}

function isMeasuredGpuFlowLayoutNode(
  node: GpuFlowLayoutNode,
): node is GpuFlowLayoutNode & {
  readonly height: number;
  readonly width: number;
} {
  return (
    typeof node.width === "number" &&
    typeof node.height === "number" &&
    Number.isFinite(node.width) &&
    Number.isFinite(node.height) &&
    node.width > 0 &&
    node.height > 0
  );
}

function gpuRectContainsPoint(rect: GpuRect, point: GpuPoint): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function normalizeOptionalNodeIdFilter(
  nodeIds: readonly string[] | ReadonlySet<string> | undefined,
): ReadonlySet<string> | null {
  if (!nodeIds) {
    return null;
  }
  return nodeIds instanceof Set ? nodeIds : new Set(nodeIds);
}

function mergeGpuFlowLayoutDirtyFlags(
  previousDirty: readonly GpuFlowLayoutDirtyFlag[],
  nextDirty: readonly GpuFlowLayoutDirtyFlag[],
): readonly GpuFlowLayoutDirtyFlag[] {
  if (nextDirty.length === 0) {
    return previousDirty;
  }
  return orderGpuFlowLayoutDirtyFlags(
    new Set([...previousDirty, ...nextDirty]),
  );
}

function orderGpuFlowLayoutDirtyFlags(
  dirty: ReadonlySet<GpuFlowLayoutDirtyFlag>,
): readonly GpuFlowLayoutDirtyFlag[] {
  return GPU_FLOW_LAYOUT_DIRTY_FLAGS.filter((flag) => dirty.has(flag));
}

function assertUniqueNodeId(seenNodeIds: Set<string>, nodeId: string) {
  if (seenNodeIds.has(nodeId)) {
    throw new Error(`Duplicate layout node ${nodeId}.`);
  }
  seenNodeIds.add(nodeId);
}

function normalizeOptionalNodeDimension(
  name: string,
  value: number | null,
): number | null {
  if (value === null) {
    return null;
  }
  assertFiniteNonNegative(name, value);
  return value;
}

function normalizeOptionalFiniteNumber(
  name: string,
  value: number | undefined,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  assertFiniteNumber(name, value);
  return value;
}

function normalizeOptionalGpuRect(
  name: string,
  rect: GpuRect | null | undefined,
): GpuRect | undefined {
  if (!rect) {
    return undefined;
  }
  assertFiniteNumber(`${name} x`, rect.x);
  assertFiniteNumber(`${name} y`, rect.y);
  assertFiniteNonNegative(`${name} width`, rect.width);
  assertFiniteNonNegative(`${name} height`, rect.height);
  return {
    height: rect.height,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  };
}

function areGpuFlowLayoutNodesEqual(
  left: GpuFlowLayoutNode,
  right: GpuFlowLayoutNode,
): boolean {
  return (
    areArraysEqual(
      getGpuFlowLayoutNodeScalarSignature(left),
      getGpuFlowLayoutNodeScalarSignature(right),
    ) &&
    areOptionalGpuFlowLayoutInteractionFlagsEqual(
      left.interactionFlags,
      right.interactionFlags,
    ) &&
    left.sourceElement === right.sourceElement &&
    areOptionalGpuRectsEqual(left.sourceLocalBounds, right.sourceLocalBounds) &&
    areOptionalGpuFlowLayoutTextureInvalidationsEqual(
      left.textureInvalidation,
      right.textureInvalidation,
    )
  );
}

function getGpuFlowLayoutNodeScalarSignature(
  node: GpuFlowLayoutNode,
): readonly (number | string | null | undefined)[] {
  return [
    node.height,
    node.nodeId,
    node.tempZIndex,
    node.width,
    node.x,
    node.y,
    node.zIndex,
  ];
}

function areGpuFlowLayoutDragPreviewsEqual(
  left: GpuFlowLayoutDragPreview | null,
  right: GpuFlowLayoutDragPreview | null,
): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    areStringArraysEqual(left.draggedNodeIds, right.draggedNodeIds) &&
    areOptionalGpuFlowLayoutDropMarkersEqual(left.dropMarker, right.dropMarker)
  );
}

function areOptionalGpuFlowLayoutDropMarkersEqual(
  left: GpuFlowLayoutDropMarker | null,
  right: GpuFlowLayoutDropMarker | null,
): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.axis === right.axis &&
    left.childNodeId === right.childNodeId &&
    left.index === right.index &&
    left.parentNodeId === right.parentNodeId &&
    areOptionalGpuRectsEqual(left.rect, right.rect)
  );
}

function areOptionalGpuFlowLayoutInteractionFlagsEqual(
  left: GpuFlowLayoutInteractionFlags | undefined,
  right: GpuFlowLayoutInteractionFlags | undefined,
): boolean {
  return areArraysEqual(
    getGpuFlowLayoutInteractionFlagSignature(left),
    getGpuFlowLayoutInteractionFlagSignature(right),
  );
}

function getGpuFlowLayoutInteractionFlagSignature(
  flags: GpuFlowLayoutInteractionFlags | undefined,
): readonly boolean[] {
  return [
    flags?.dragging === true,
    flags?.resizing === true,
    flags?.selected === true,
  ];
}

function areOptionalGpuFlowLayoutTextureInvalidationsEqual(
  left: GpuFlowLayoutTextureInvalidation | undefined,
  right: GpuFlowLayoutTextureInvalidation | undefined,
): boolean {
  return areArraysEqual(
    getGpuFlowLayoutTextureInvalidationSignature(left),
    getGpuFlowLayoutTextureInvalidationSignature(right),
  );
}

function getGpuFlowLayoutTextureInvalidationSignature(
  invalidation: GpuFlowLayoutTextureInvalidation | undefined,
): readonly boolean[] {
  return [
    invalidation?.contentDirty === true,
    invalidation?.sizeDirty === true,
  ];
}

function areOptionalGpuRectsEqual(
  left: GpuRect | null | undefined,
  right: GpuRect | null | undefined,
): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.height === right.height &&
    left.width === right.width &&
    left.x === right.x &&
    left.y === right.y
  );
}

function areStringArraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return areArraysEqual(left, right);
}

function areArraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function assertFiniteNonNegative(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
}

function assertFiniteNumber(name: string, value: number) {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
}
