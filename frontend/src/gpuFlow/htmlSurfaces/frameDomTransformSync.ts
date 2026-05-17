import { resolveGpuNodeZIndex } from "../nodeZIndex";
import type { GpuViewportInput } from "../viewportMath";
import {
  applyCulledNodeDomTransform,
  applyNodeDomTransformState,
  applyVisibleNodeDomTransform,
  createVisibleNodeDomTransformStateForQuad,
  isCachedNodeDomTransformState,
  mergeNodeIdSets,
  normalizeNodeIdSet,
  resolveElement,
} from "./sourceTransforms";
import type {
  GpuNodeDomTransformState,
  GpuNodeDomTransformSyncCache,
  GpuNodeLayout,
  GpuVisibleNodeQuad,
} from "./frame";

type SyncGpuNodeDomTransformsInput = {
  readonly activeNodeIds?: ReadonlySet<string> | readonly string[] | undefined;
  readonly elementByNodeId:
    | ReadonlyMap<string, HTMLElement>
    | ((nodeId: string) => HTMLElement | null | undefined);
  readonly nodes: readonly GpuNodeLayout[];
  readonly visibleNodeIds: ReadonlySet<string>;
  readonly viewport: GpuViewportInput;
};

type SyncGpuNodeDomTransformsFromQuadsInput = {
  readonly activeNodeIds?: ReadonlySet<string> | readonly string[] | undefined;
  readonly cache: GpuNodeDomTransformSyncCache;
  readonly elementByNodeId:
    | ReadonlyMap<string, HTMLElement>
    | ((nodeId: string) => HTMLElement | null | undefined);
  readonly retainNodeIds?: ReadonlySet<string> | readonly string[] | undefined;
  readonly visibleQuads: readonly GpuVisibleNodeQuad[];
  readonly viewport: GpuViewportInput;
};

type GpuNodeDomTransformSyncResult = {
  readonly parkedNodeIds: readonly string[];
  readonly skippedNodeIds: readonly string[];
  readonly updatedNodeIds: readonly string[];
  readonly visibleNodeIds: readonly string[];
};

const EMPTY_DOM_TRANSFORM_SYNC_RESULT: GpuNodeDomTransformSyncResult = {
  parkedNodeIds: [],
  skippedNodeIds: [],
  updatedNodeIds: [],
  visibleNodeIds: [],
};

export function createGpuNodeDomTransformSyncCache(): GpuNodeDomTransformSyncCache {
  return {
    previousVisibleNodeIds: new Set(),
    stateByNodeId: new Map(),
  };
}

export function clearGpuNodeDomTransformSyncCache(
  cache: GpuNodeDomTransformSyncCache,
) {
  cache.previousVisibleNodeIds.clear();
  cache.stateByNodeId.clear();
}

export function clearGpuNodeDomTransformSyncCacheNode(
  cache: GpuNodeDomTransformSyncCache,
  nodeId: string,
) {
  cache.previousVisibleNodeIds.delete(nodeId);
  cache.stateByNodeId.delete(nodeId);
}

export function syncGpuNodeDomTransformsFromQuads({
  activeNodeIds,
  cache,
  elementByNodeId,
  retainNodeIds,
  visibleQuads,
}: SyncGpuNodeDomTransformsFromQuadsInput): GpuNodeDomTransformSyncResult {
  const activeIds = normalizeNodeIdSet(activeNodeIds);
  const retainedIds = normalizeNodeIdSet(
    mergeNodeIdSets(activeIds, retainNodeIds),
  );
  const visibleResult = syncVisibleGpuNodeDomTransforms({
    activeIds,
    cache,
    elementByNodeId,
    visibleQuads,
  });
  const parkResult = parkExitedGpuNodeDomTransforms({
    cache,
    elementByNodeId,
    retainedIds,
    visibleNodeIds: visibleResult.visibleNodeIds,
  });

  cache.previousVisibleNodeIds.clear();
  for (const nodeId of visibleResult.visibleNodeIds) {
    cache.previousVisibleNodeIds.add(nodeId);
  }

  return {
    parkedNodeIds: parkResult.parkedNodeIds,
    skippedNodeIds: [
      ...visibleResult.skippedNodeIds,
      ...parkResult.skippedNodeIds,
    ],
    updatedNodeIds: visibleResult.updatedNodeIds,
    visibleNodeIds: [...visibleResult.visibleNodeIds],
  };
}

function syncVisibleGpuNodeDomTransforms({
  activeIds,
  cache,
  elementByNodeId,
  visibleQuads,
}: {
  readonly activeIds: ReadonlySet<string>;
  readonly cache: GpuNodeDomTransformSyncCache;
  readonly elementByNodeId:
    | ReadonlyMap<string, HTMLElement>
    | ((nodeId: string) => HTMLElement | null | undefined);
  readonly visibleQuads: readonly GpuVisibleNodeQuad[];
}) {
  const visibleNodeIds = new Set<string>();
  const skippedNodeIds: string[] = [];
  const updatedNodeIds: string[] = [];

  for (const quad of visibleQuads) {
    visibleNodeIds.add(quad.nodeId);
    const element = resolveElement(elementByNodeId, quad.nodeId);
    if (!element) {
      cache.stateByNodeId.delete(quad.nodeId);
      continue;
    }
    const state = createVisibleNodeDomTransformStateForQuad({
      activeIds,
      element,
      quad,
    });
    if (isCachedNodeDomTransformState(cache, quad.nodeId, state)) {
      skippedNodeIds.push(quad.nodeId);
      continue;
    }
    applyNodeDomTransformState(element, state);
    cache.stateByNodeId.set(quad.nodeId, state);
    updatedNodeIds.push(quad.nodeId);
  }

  return { skippedNodeIds, updatedNodeIds, visibleNodeIds };
}

function parkExitedGpuNodeDomTransforms({
  cache,
  elementByNodeId,
  retainedIds,
  visibleNodeIds,
}: {
  readonly cache: GpuNodeDomTransformSyncCache;
  readonly elementByNodeId:
    | ReadonlyMap<string, HTMLElement>
    | ((nodeId: string) => HTMLElement | null | undefined);
  readonly retainedIds: ReadonlySet<string>;
  readonly visibleNodeIds: Set<string>;
}) {
  const parkedNodeIds: string[] = [];
  const skippedNodeIds: string[] = [];

  for (const nodeId of cache.previousVisibleNodeIds) {
    if (visibleNodeIds.has(nodeId)) {
      continue;
    }
    if (retainedIds.has(nodeId)) {
      visibleNodeIds.add(nodeId);
      const previous = cache.stateByNodeId.get(nodeId);
      const element = resolveElement(elementByNodeId, nodeId);
      if (!previous || !element) {
        continue;
      }
      const retainedState: GpuNodeDomTransformState = {
        ...previous,
        element,
        interactive: "true",
        pointerEvents: "auto",
        transform: element.style.transform || previous.transform,
        visible: "true",
      };
      if (isCachedNodeDomTransformState(cache, nodeId, retainedState)) {
        skippedNodeIds.push(nodeId);
        continue;
      }
      applyNodeDomTransformState(element, retainedState);
      cache.stateByNodeId.set(nodeId, retainedState);
      continue;
    }
  }

  return { parkedNodeIds, skippedNodeIds };
}

export function syncGpuNodeDomTransforms({
  activeNodeIds,
  elementByNodeId,
  nodes,
  visibleNodeIds,
}: SyncGpuNodeDomTransformsInput): GpuNodeDomTransformSyncResult {
  const activeIds = normalizeNodeIdSet(activeNodeIds);
  const parkedNodeIds: string[] = [];
  const updatedNodeIds: string[] = [];
  for (const node of nodes) {
    const element = resolveElement(elementByNodeId, node.nodeId);
    if (!element) {
      continue;
    }
    const visible = visibleNodeIds.has(node.nodeId);
    if (visible) {
      applyVisibleNodeDomTransform(element, {
        height: node.height ?? 0,
        interactive: activeIds.has(node.nodeId),
        width: node.width ?? 0,
        zIndex: resolveGpuNodeZIndex(node),
      });
      updatedNodeIds.push(node.nodeId);
      continue;
    }

    applyCulledNodeDomTransform(element);
    parkedNodeIds.push(node.nodeId);
  }
  return {
    parkedNodeIds,
    skippedNodeIds: EMPTY_DOM_TRANSFORM_SYNC_RESULT.skippedNodeIds,
    updatedNodeIds,
    visibleNodeIds: [...visibleNodeIds],
  };
}
