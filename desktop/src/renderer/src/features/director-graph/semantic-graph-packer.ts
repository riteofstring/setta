/**
 * Packs generated Director semantic graph contracts for the WebGL2 renderer.
 *
 * The projector owns semantic meaning. This file only maps generated contract
 * values to the renderer's packed visual vocabulary and arranges a graph into
 * turn ladders the existing canvas can draw.
 */

import type { SemanticEdge, SemanticNode, WorkstreamGraph } from "@generated/backend";

import {
  semanticEdgeChannels,
  semanticEdgeMode,
  semanticEvidenceEmphases,
  semanticNodeKindVisuals,
  semanticNodeMode,
  semanticStatusOutcomes,
} from "./semantic-graph-visual-catalog";
import {
  buildPackedGraphSnapshot,
  type PackedGraphBatch,
  type PackedGraphEdgeInput,
  type PackedGraphNodeInput,
  type PackedGraphSnapshot,
  type PackedGraphTurnInput,
} from "./packed-graph-snapshot";
import type { PackedGraphMode, PackedGraphOutcome } from "./packed-graph-vocabulary";

export interface SemanticGraphComposition {
  readonly workstreamId: string;
  readonly graphs: readonly WorkstreamGraph[];
}

const settleWindowSeconds = 1.45;
const compactDelaySeconds = 2.5;
const workstreamLaneSpacing = 0.42;

interface OrderedNode {
  readonly node: SemanticNode;
  readonly packedId: string;
  readonly graphIndex: number;
  readonly graphOrder: number;
  readonly bornAt: number;
  readonly updatedAt: number;
  readonly completedAt: number | null;
}

interface PlannedNode {
  readonly ordered: OrderedNode;
  readonly row: number;
  readonly role: "input" | "step" | "outcome";
  readonly mode: PackedGraphMode;
  readonly terminalAt: number | null;
}

function parseTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${label} timestamp is invalid: ${value}`);
  }
  return timestamp / 1000;
}

function graphNodes(graphs: readonly WorkstreamGraph[]): OrderedNode[] {
  const records: OrderedNode[] = [];
  const timestamps = graphs.flatMap((graph) =>
    graph.nodes.map((node) => parseTimestamp(node.createdAt, `semantic node ${node.id}`)),
  );
  const base = Math.min(...timestamps);
  graphs.forEach((graph, graphIndex) => {
    graph.nodes.forEach((node, graphOrder) => {
      records.push({
        node,
        packedId: `${node.workstreamId}:${node.id}`,
        graphIndex,
        graphOrder,
        bornAt: parseTimestamp(node.createdAt, `semantic node ${node.id}`) - base,
        updatedAt: parseTimestamp(node.updatedAt, `semantic node ${node.id} update`) - base,
        completedAt:
          node.completedAt === null
            ? null
            : parseTimestamp(node.completedAt, `semantic node ${node.id} completion`) - base,
      });
    });
  });
  records.sort((left, right) => {
    if (left.bornAt !== right.bornAt) {
      return left.bornAt - right.bornAt;
    }
    if (left.graphIndex !== right.graphIndex) {
      return left.graphIndex - right.graphIndex;
    }
    return left.graphOrder - right.graphOrder;
  });
  return records;
}

function graphEdges(graphs: readonly WorkstreamGraph[]): SemanticEdge[] {
  return graphs
    .flatMap((graph) => graph.edges)
    .sort((left, right) => {
      const leftTime = parseTimestamp(left.createdAt, `semantic edge ${left.id}`);
      const rightTime = parseTimestamp(right.createdAt, `semantic edge ${right.id}`);
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return left.id.localeCompare(right.id);
    });
}

function outgoingNodeIDs(edges: readonly SemanticEdge[]): ReadonlySet<string> {
  return new Set(edges.map((edge) => `${edge.fromWorkstreamId}:${edge.fromNodeId}`));
}

function terminalSeconds(ordered: OrderedNode): number {
  if (ordered.completedAt !== null) {
    return ordered.completedAt;
  }
  return Math.max(ordered.bornAt, ordered.updatedAt);
}

function outcomeNodeID(
  nodes: readonly OrderedNode[],
  outgoing: ReadonlySet<string>,
): string | null {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const ordered = nodes[index];
    if (ordered === undefined) {
      continue;
    }
    const visual = semanticNodeKindVisuals[ordered.node.kind];
    if (visual.role === "outcome" && !outgoing.has(ordered.packedId)) {
      return ordered.packedId;
    }
  }
  return null;
}

function plannedRole(
  ordered: OrderedNode,
  row: number,
  outcomeId: string | null,
): "input" | "step" | "outcome" {
  if (row === 0) {
    return "input";
  }
  if (ordered.packedId === outcomeId) {
    return "outcome";
  }
  return "step";
}

function workstreamLane(graphIndex: number, graphCount: number): number {
  return (graphIndex - (graphCount - 1) / 2) * workstreamLaneSpacing;
}

function semanticLane(node: SemanticNode): number {
  switch (node.kind) {
    case "delegation":
      return 0.28;
    case "investigation":
      return -0.2;
    case "approval_required":
    case "resource_required":
    case "blocked":
    case "retry":
      return 0.2;
    case "artifact":
    case "validation":
      return -0.16;
    default:
      return 0;
  }
}

function planNodes(nodes: readonly OrderedNode[], edges: readonly SemanticEdge[]): PlannedNode[] {
  const outgoing = outgoingNodeIDs(edges);
  const outcomeId = outcomeNodeID(nodes, outgoing);
  return nodes.map((ordered, row) => {
    const role = plannedRole(ordered, row, outcomeId);
    return {
      ordered,
      row,
      role,
      mode: semanticNodeMode(ordered.node.kind, ordered.node.status),
      terminalAt: role === "outcome" ? terminalSeconds(ordered) : null,
    };
  });
}

function packedNodeInput(planned: PlannedNode, graphCount: number): PackedGraphNodeInput {
  const visual = semanticNodeKindVisuals[planned.ordered.node.kind];
  return {
    id: planned.ordered.packedId,
    turn: 0,
    role: planned.role,
    mode: planned.mode,
    glyph: visual.glyph,
    emphasis: semanticEvidenceEmphases[planned.ordered.node.evidenceClass],
    detail: planned.ordered.node.kind === "milestone" ? "compacted" : "detailed",
    lane:
      workstreamLane(planned.ordered.graphIndex, graphCount) + semanticLane(planned.ordered.node),
    row: planned.row,
    bornAt: planned.ordered.bornAt,
    settleAt: planned.ordered.bornAt + settleWindowSeconds,
    terminalAt: planned.terminalAt,
    label: planned.ordered.node.publicSummary,
    labelPlacement: planned.role === "input" ? "below" : visual.labelPlacement,
  };
}

function graphOutcome(planned: readonly PlannedNode[]): {
  readonly outcome: PackedGraphOutcome;
  readonly outcomeNodeId: string | null;
  readonly answerAt: number | null;
} {
  for (let index = planned.length - 1; index >= 0; index -= 1) {
    const candidate = planned[index];
    if (candidate === undefined || candidate.role !== "outcome") {
      continue;
    }
    return {
      outcome: semanticStatusOutcomes[candidate.ordered.node.status],
      outcomeNodeId: candidate.ordered.packedId,
      answerAt: candidate.terminalAt ?? candidate.ordered.bornAt,
    };
  }
  return { outcome: "running", outcomeNodeId: null, answerAt: null };
}

function turnInputs(planned: readonly PlannedNode[]): PackedGraphTurnInput[] {
  const input = planned[0];
  if (input === undefined) {
    return [];
  }
  const outcome = graphOutcome(planned);
  return [
    {
      index: 0,
      inputNodeId: input.ordered.packedId,
      outcomeNodeId: outcome.outcomeNodeId,
      rowSpan: planned.length,
      outcome: outcome.outcome,
      answerAt: outcome.answerAt,
      compactAt: outcome.answerAt === null ? null : outcome.answerAt + compactDelaySeconds,
    },
  ];
}

function edgeInputs(
  edges: readonly SemanticEdge[],
  nodeIndexByID: ReadonlyMap<string, number>,
  nodeModeByID: ReadonlyMap<string, PackedGraphMode>,
  terminalByID: ReadonlyMap<string, boolean>,
): PackedGraphEdgeInput[] {
  return edges
    .map((edge) => {
      const fromNodeId = `${edge.fromWorkstreamId}:${edge.fromNodeId}`;
      const toNodeId = `${edge.toWorkstreamId}:${edge.toNodeId}`;
      const from = nodeIndexByID.get(fromNodeId);
      const to = nodeIndexByID.get(toNodeId);
      if (from === undefined || to === undefined) {
        return null;
      }
      const visualFromNodeId = from < to ? fromNodeId : toNodeId;
      const visualToNodeId = from < to ? toNodeId : fromNodeId;
      const childMode = nodeModeByID.get(visualToNodeId);
      if (childMode === undefined) {
        throw new Error(
          `semantic graph edge ${edge.id} targets an unpacked node ${visualToNodeId}`,
        );
      }
      return {
        fromNodeId: visualFromNodeId,
        toNodeId: visualToNodeId,
        mode: semanticEdgeMode(edge.kind, childMode),
        channel: semanticEdgeChannels[edge.kind],
        confidence: edge.kind === "blocked_by" || edge.kind === "recovered_by" ? 0.58 : 0.92,
        terminated: terminalByID.get(visualToNodeId) ?? false,
      };
    })
    .filter((edge): edge is PackedGraphEdgeInput => edge !== null)
    .sort((left, right) => {
      const leftTarget = nodeIndexByID.get(left.toNodeId);
      const rightTarget = nodeIndexByID.get(right.toNodeId);
      if (leftTarget === undefined || rightTarget === undefined) {
        return 0;
      }
      if (leftTarget !== rightTarget) {
        return leftTarget - rightTarget;
      }
      return left.fromNodeId.localeCompare(right.fromNodeId);
    });
}

function compileSemanticGraphComposition(
  composition: SemanticGraphComposition,
): readonly PackedGraphBatch[] {
  if (composition.graphs.length === 0) {
    return [];
  }
  const nodes = graphNodes(composition.graphs);
  if (nodes.length === 0) {
    return [];
  }
  const edges = graphEdges(composition.graphs);
  const planned = planNodes(nodes, edges);
  const packedNodes = planned.map((node) => packedNodeInput(node, composition.graphs.length));
  const nodeIndexByID = new Map(packedNodes.map((node, index) => [node.id, index]));
  const nodeModeByID = new Map(planned.map((node) => [node.ordered.packedId, node.mode]));
  const terminalByID = new Map(
    planned.map((node) => [node.ordered.packedId, node.terminalAt !== null]),
  );
  const packedEdges = edgeInputs(edges, nodeIndexByID, nodeModeByID, terminalByID);
  return [
    {
      cursorSequence: packedNodes.length + packedEdges.length,
      hasEarlier: composition.graphs.some((graph) => graph.hasEarlier),
      nodes: packedNodes,
      edges: packedEdges,
      turns: turnInputs(planned),
    },
  ];
}

export function packSemanticGraphComposition(
  composition: SemanticGraphComposition,
): PackedGraphSnapshot {
  return buildPackedGraphSnapshot(
    composition.workstreamId,
    compileSemanticGraphComposition(composition),
  );
}
