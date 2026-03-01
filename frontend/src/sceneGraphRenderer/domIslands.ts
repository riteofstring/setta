import type { Node } from "forks/xyflow/core/types";

type SceneGraphDomIslandEdge = {
  sourceSectionId: string;
  targetSectionId: string;
  sourceVariantId?: string;
  targetVariantId?: string;
  hidden?: boolean;
};

type DomIslandComputationInput = {
  nodesById: Map<string, Node>;
  edges: Array<SceneGraphDomIslandEdge>;
  sectionVariantMap: Record<string, string>;
  activeSectionIds: Array<string>;
  focusedSectionId: string | null;
  domIslandRadius: number;
  viewportDomAnchorSectionIds?: ReadonlySet<string>;
};

type ViewportDomAnchorComputationInput = {
  nodesById: Map<string, Node>;
  transform: [number, number, number];
  viewportWidth: number;
  viewportHeight: number;
  marginPx: number;
};

type SceneOnlyHitTestInput = {
  flowX: number;
  flowY: number;
  nodesById: Map<string, Node>;
  domIslandSectionIds: ReadonlySet<string>;
};

type QueueEntry = {
  sectionId: string;
  distance: number;
};

type FlowViewportBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const EMPTY_SECTION_IDS: ReadonlySet<string> = new Set();

export function computeSceneGraphDomIslandSectionIds(
  input: DomIslandComputationInput,
): ReadonlySet<string> {
  const anchorSectionIds = new Set<string>();
  for (const sectionId of input.activeSectionIds) {
    if (input.nodesById.has(sectionId)) {
      anchorSectionIds.add(sectionId);
    }
  }
  if (input.focusedSectionId && input.nodesById.has(input.focusedSectionId)) {
    anchorSectionIds.add(input.focusedSectionId);
  }
  if (input.viewportDomAnchorSectionIds) {
    for (const sectionId of input.viewportDomAnchorSectionIds) {
      if (!input.nodesById.has(sectionId)) {
        continue;
      }
      anchorSectionIds.add(sectionId);
    }
  }

  const domIslandSectionIds = new Set<string>(anchorSectionIds);
  const domIslandRadius = sanitizeDomIslandRadius(input.domIslandRadius);
  if (domIslandRadius === 0 || anchorSectionIds.size === 0) {
    return domIslandSectionIds;
  }

  const adjacency = buildSectionAdjacency({
    nodesById: input.nodesById,
    edges: input.edges,
    sectionVariantMap: input.sectionVariantMap,
  });
  const queue: QueueEntry[] = [];
  for (const sectionId of anchorSectionIds) {
    queue.push({
      sectionId,
      distance: 0,
    });
  }

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const nextEntry = queue[queueIndex];
    if (!nextEntry) {
      continue;
    }
    if (nextEntry.distance >= domIslandRadius) {
      continue;
    }
    const neighbors = adjacency.get(nextEntry.sectionId);
    if (!neighbors) {
      continue;
    }
    const nextDistance = nextEntry.distance + 1;
    for (const neighborSectionId of neighbors) {
      if (domIslandSectionIds.has(neighborSectionId)) {
        continue;
      }
      domIslandSectionIds.add(neighborSectionId);
      queue.push({
        sectionId: neighborSectionId,
        distance: nextDistance,
      });
    }
  }

  return domIslandSectionIds;
}

export function computeViewportDomAnchorSectionIds(
  input: ViewportDomAnchorComputationInput,
): ReadonlySet<string> {
  const viewportBounds = resolveFlowViewportBounds(input);
  if (viewportBounds === null) {
    return EMPTY_SECTION_IDS;
  }

  const sectionIds = new Set<string>();
  for (const node of input.nodesById.values()) {
    if (!isNodeVisibleBounds(node)) {
      continue;
    }
    if (!intersectsFlowViewportBounds(node, viewportBounds)) {
      continue;
    }
    sectionIds.add(node.id);
  }
  return sectionIds;
}

export function findTopmostSceneOnlySectionAtFlowPosition(
  input: SceneOnlyHitTestInput,
): string | null {
  let topmostSectionId: string | null = null;
  let topmostZIndex = Number.NEGATIVE_INFINITY;

  for (const node of input.nodesById.values()) {
    if (input.domIslandSectionIds.has(node.id)) {
      continue;
    }
    if (!isNodeVisibleBounds(node)) {
      continue;
    }
    if (!containsFlowPosition(node, input.flowX, input.flowY)) {
      continue;
    }

    const nodeZIndex =
      typeof node.tempZIndex === "number" ? node.tempZIndex : node.zIndex;
    const shouldReplaceTopmost =
      nodeZIndex > topmostZIndex ||
      (nodeZIndex === topmostZIndex &&
        topmostSectionId !== null &&
        node.id.localeCompare(topmostSectionId) > 0) ||
      topmostSectionId === null;
    if (!shouldReplaceTopmost) {
      continue;
    }
    topmostZIndex = nodeZIndex;
    topmostSectionId = node.id;
  }

  return topmostSectionId;
}

function sanitizeDomIslandRadius(radius: number): number {
  if (!Number.isInteger(radius) || radius <= 0) {
    return 0;
  }
  return radius;
}

function sanitizeViewportMarginPx(marginPx: number): number {
  if (!Number.isFinite(marginPx) || marginPx <= 0) {
    return 0;
  }
  return marginPx;
}

function resolveFlowViewportBounds(
  input: ViewportDomAnchorComputationInput,
): FlowViewportBounds | null {
  const [translateX, translateY, zoom] = input.transform;
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return null;
  }
  if (input.viewportWidth <= 0 || input.viewportHeight <= 0) {
    return null;
  }

  const marginPx = sanitizeViewportMarginPx(input.marginPx);
  const minX = (-translateX - marginPx) / zoom;
  const minY = (-translateY - marginPx) / zoom;
  const maxX = (input.viewportWidth - translateX + marginPx) / zoom;
  const maxY = (input.viewportHeight - translateY + marginPx) / zoom;
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
  };
}

function buildSectionAdjacency(input: {
  nodesById: Map<string, Node>;
  edges: Array<SceneGraphDomIslandEdge>;
  sectionVariantMap: Record<string, string>;
}): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of input.edges) {
    if (!isEdgeActiveForCurrentVariants(edge, input.sectionVariantMap)) {
      continue;
    }
    if (
      !input.nodesById.has(edge.sourceSectionId) ||
      !input.nodesById.has(edge.targetSectionId)
    ) {
      continue;
    }
    if (edge.sourceSectionId === edge.targetSectionId) {
      continue;
    }
    addAdjacencyPair(adjacency, edge.sourceSectionId, edge.targetSectionId);
    addAdjacencyPair(adjacency, edge.targetSectionId, edge.sourceSectionId);
  }
  return adjacency;
}

function isEdgeActiveForCurrentVariants(
  edge: SceneGraphDomIslandEdge,
  sectionVariantMap: Record<string, string>,
): boolean {
  if (edge.hidden === true) {
    return false;
  }
  if (
    edge.sourceVariantId &&
    sectionVariantMap[edge.sourceSectionId] !== edge.sourceVariantId
  ) {
    return false;
  }
  if (
    edge.targetVariantId &&
    sectionVariantMap[edge.targetSectionId] !== edge.targetVariantId
  ) {
    return false;
  }
  return true;
}

function addAdjacencyPair(
  adjacency: Map<string, Set<string>>,
  sectionId: string,
  neighborSectionId: string,
) {
  const neighbors = adjacency.get(sectionId);
  if (neighbors) {
    neighbors.add(neighborSectionId);
    return;
  }
  adjacency.set(sectionId, new Set([neighborSectionId]));
}

function isNodeVisibleBounds(node: Node): node is Node & {
  width: number;
  height: number;
} {
  return (
    typeof node.width === "number" &&
    node.width > 0 &&
    typeof node.height === "number" &&
    node.height > 0
  );
}

function containsFlowPosition(node: Node, flowX: number, flowY: number) {
  if (!isNodeVisibleBounds(node)) {
    return false;
  }
  const minX = node.position.x;
  const minY = node.position.y;
  const maxX = minX + node.width;
  const maxY = minY + node.height;
  return flowX >= minX && flowX <= maxX && flowY >= minY && flowY <= maxY;
}

function intersectsFlowViewportBounds(
  node: Node & { width: number; height: number },
  viewportBounds: FlowViewportBounds,
): boolean {
  const nodeMinX = node.position.x;
  const nodeMinY = node.position.y;
  const nodeMaxX = nodeMinX + node.width;
  const nodeMaxY = nodeMinY + node.height;
  return !(
    nodeMaxX < viewportBounds.minX ||
    nodeMinX > viewportBounds.maxX ||
    nodeMaxY < viewportBounds.minY ||
    nodeMinY > viewportBounds.maxY
  );
}
