import type { GitGraphRendererKind } from "./types";

export interface GitGraphLayoutRequest {
  batchSize: number;
  laneCount: number;
  nodeCount: number;
}

export interface GitGraphNode {
  id: string;
  lane: number;
  label: string;
  x: number;
  y: number;
}

export interface GitGraphEdge {
  from: string;
  lane: number;
  to: string;
}

export interface GitGraphLayoutBatch {
  done: boolean;
  edges: GitGraphEdge[];
  nodes: GitGraphNode[];
  processedNodeCount: number;
  totalNodeCount: number;
}

export type GitGraphWorkerMessage =
  | { requestId: string; type: "batch"; value: GitGraphLayoutBatch }
  | { requestId: string; type: "complete"; value: { totalNodeCount: number } };

export function buildGitGraphBatch(
  request: GitGraphLayoutRequest,
  startIndex: number,
): GitGraphLayoutBatch {
  const endIndex = Math.min(request.nodeCount, startIndex + request.batchSize);
  const nodes: GitGraphNode[] = [];
  const edges: GitGraphEdge[] = [];

  for (let index = startIndex; index < endIndex; index += 1) {
    const node = graphNodeAt(request, index);
    nodes.push(node);
    if (index > 0) {
      edges.push({
        from: graphNodeId(index - 1),
        lane: node.lane,
        to: node.id,
      });
    }
  }

  return {
    done: endIndex >= request.nodeCount,
    edges,
    nodes,
    processedNodeCount: endIndex,
    totalNodeCount: request.nodeCount,
  };
}

export function selectGitGraphRenderer({
  nodeCount,
  scale,
}: {
  nodeCount: number;
  scale: number;
}): GitGraphRendererKind {
  if (nodeCount <= 80 && scale >= 0.85) {
    return "dom";
  }
  if (nodeCount <= 1400 && scale >= 0.38) {
    return "svg";
  }
  return "canvas";
}

function graphNodeAt(request: GitGraphLayoutRequest, index: number): GitGraphNode {
  const lane = graphLaneAt(index, request.laneCount);
  return {
    id: graphNodeId(index),
    label: `commit ${index.toString(16).padStart(4, "0")}`,
    lane,
    x: 24 + lane * 28,
    y: 18 + index * 13,
  };
}

function graphLaneAt(index: number, laneCount: number): number {
  const normalizedLaneCount = Math.max(1, laneCount);
  return (index * 5 + Math.floor(index / 9)) % normalizedLaneCount;
}

function graphNodeId(index: number): string {
  return `graph-node-${index}`;
}
