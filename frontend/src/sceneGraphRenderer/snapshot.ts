import type { Node } from "forks/xyflow/core/types";
import { makeEdgeHandleKey } from "state/actions/edgeHandles";
import type {
  SceneGraphEdgeSnapshot,
  SceneGraphRenderSnapshot,
  SceneGraphRenderSnapshotDiff,
  SceneGraphSectionShellSnapshot,
} from "./types";

type SceneGraphEdgeModel = {
  id: string;
  sourceSectionId: string;
  targetSectionId: string;
  sourcePortId: string;
  targetPortId: string;
  sourceVariantId: string;
  targetVariantId: string;
  hidden: boolean;
  zIndex: number;
};

type EdgeHandlePosition = {
  x: number;
  y: number;
};

export type SceneGraphSnapshotBuildInput = {
  nodesById: Map<string, Node>;
  edges: SceneGraphEdgeModel[];
  sectionVariantMap: Record<string, string>;
  edgeHandlePositions: Record<string, EdgeHandlePosition>;
};

const EMPTY_SECTION_LIST: SceneGraphSectionShellSnapshot[] = [];
const EMPTY_EDGE_LIST: SceneGraphEdgeSnapshot[] = [];

export function createEmptySceneGraphRenderSnapshot(): SceneGraphRenderSnapshot {
  return {
    sections: EMPTY_SECTION_LIST,
    edges: EMPTY_EDGE_LIST,
  };
}

export function buildSceneGraphRenderSnapshot(
  input: SceneGraphSnapshotBuildInput,
): SceneGraphRenderSnapshot {
  const sections = buildSectionSnapshots(input.nodesById);
  const edges = buildEdgeSnapshots({
    edges: input.edges,
    sectionVariantMap: input.sectionVariantMap,
    edgeHandlePositions: input.edgeHandlePositions,
  });

  return {
    sections,
    edges,
  };
}

export function buildSceneGraphRenderSnapshotDiff(
  previousSnapshot: SceneGraphRenderSnapshot,
  nextSnapshot: SceneGraphRenderSnapshot,
): SceneGraphRenderSnapshotDiff {
  const sectionDiff = computeEntityDiff(
    previousSnapshot.sections,
    nextSnapshot.sections,
    getSectionSignature,
  );
  const edgeDiff = computeEntityDiff(
    previousSnapshot.edges,
    nextSnapshot.edges,
    getEdgeSignature,
  );

  return {
    addedSectionIds: sectionDiff.addedIds,
    removedSectionIds: sectionDiff.removedIds,
    changedSectionIds: sectionDiff.changedIds,
    addedEdgeIds: edgeDiff.addedIds,
    removedEdgeIds: edgeDiff.removedIds,
    changedEdgeIds: edgeDiff.changedIds,
    sectionCountDelta:
      nextSnapshot.sections.length - previousSnapshot.sections.length,
    edgeCountDelta: nextSnapshot.edges.length - previousSnapshot.edges.length,
    isEmpty:
      sectionDiff.addedIds.length === 0 &&
      sectionDiff.removedIds.length === 0 &&
      sectionDiff.changedIds.length === 0 &&
      edgeDiff.addedIds.length === 0 &&
      edgeDiff.removedIds.length === 0 &&
      edgeDiff.changedIds.length === 0,
  };
}

function buildSectionSnapshots(
  nodesById: Map<string, Node>,
): SceneGraphSectionShellSnapshot[] {
  const sections: SceneGraphSectionShellSnapshot[] = [];
  for (const node of nodesById.values()) {
    if (
      typeof node.width !== "number" ||
      typeof node.height !== "number" ||
      node.width <= 0 ||
      node.height <= 0
    ) {
      continue;
    }

    sections.push({
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      width: node.width,
      height: node.height,
      zIndex: node.tempZIndex ?? node.zIndex ?? 0,
    });
  }

  sections.sort((a, b) => {
    const byZIndex = a.zIndex - b.zIndex;
    if (byZIndex !== 0) {
      return byZIndex;
    }
    return a.id.localeCompare(b.id);
  });
  return sections;
}

function buildEdgeSnapshots(input: {
  edges: SceneGraphEdgeModel[];
  sectionVariantMap: Record<string, string>;
  edgeHandlePositions: Record<string, EdgeHandlePosition>;
}): SceneGraphEdgeSnapshot[] {
  const output: SceneGraphEdgeSnapshot[] = [];
  for (const edge of input.edges) {
    if (edge.hidden) {
      continue;
    }
    if (
      input.sectionVariantMap[edge.sourceSectionId] !== edge.sourceVariantId ||
      input.sectionVariantMap[edge.targetSectionId] !== edge.targetVariantId
    ) {
      continue;
    }

    const sourceKey = makeEdgeHandleKey(
      edge.sourceSectionId,
      edge.sourcePortId,
      "source",
    );
    const targetKey = makeEdgeHandleKey(
      edge.targetSectionId,
      edge.targetPortId,
      "target",
    );
    const source = input.edgeHandlePositions[sourceKey];
    const target = input.edgeHandlePositions[targetKey];
    if (!source || !target) {
      continue;
    }

    output.push({
      id: edge.id,
      sourceX: source.x,
      sourceY: source.y,
      targetX: target.x,
      targetY: target.y,
      zIndex: edge.zIndex ?? 0,
    });
  }

  output.sort((a, b) => {
    const byZIndex = a.zIndex - b.zIndex;
    if (byZIndex !== 0) {
      return byZIndex;
    }
    return a.id.localeCompare(b.id);
  });
  return output;
}

function getSectionSignature(section: SceneGraphSectionShellSnapshot): string {
  return `${section.x}|${section.y}|${section.width}|${section.height}|${section.zIndex}`;
}

function getEdgeSignature(edge: SceneGraphEdgeSnapshot): string {
  return `${edge.sourceX}|${edge.sourceY}|${edge.targetX}|${edge.targetY}|${edge.zIndex}`;
}

function computeEntityDiff<T extends { id: string }>(
  previousItems: T[],
  nextItems: T[],
  getSignature: (item: T) => string,
): {
  addedIds: string[];
  removedIds: string[];
  changedIds: string[];
} {
  const previousSignaturesById = new Map<string, string>();
  const nextSignaturesById = new Map<string, string>();

  for (const item of previousItems) {
    previousSignaturesById.set(item.id, getSignature(item));
  }
  for (const item of nextItems) {
    nextSignaturesById.set(item.id, getSignature(item));
  }

  const addedIds: string[] = [];
  const removedIds: string[] = [];
  const changedIds: string[] = [];

  for (const [id, nextSignature] of nextSignaturesById.entries()) {
    const previousSignature = previousSignaturesById.get(id);
    if (previousSignature === undefined) {
      addedIds.push(id);
      continue;
    }
    if (previousSignature !== nextSignature) {
      changedIds.push(id);
    }
  }

  for (const id of previousSignaturesById.keys()) {
    if (!nextSignaturesById.has(id)) {
      removedIds.push(id);
    }
  }

  addedIds.sort();
  removedIds.sort();
  changedIds.sort();
  return {
    addedIds,
    removedIds,
    changedIds,
  };
}
