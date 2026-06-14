import type {
  SemanticActivityInterval,
  SemanticEvidenceAnchor,
  SemanticGraph,
  SemanticLayoutPositionInput,
  SemanticLayoutPosition,
  SemanticNode,
} from "@generated/backend";

import type { WorkflowGraphGraph } from "./pixi-renderer";
import {
  semanticNodeColor as semanticNeonNodeColor,
  workspaceNeonTheme,
} from "./workspace-neon-theme";

const semanticNodePrefix = "semantic:";
const semanticNodeHeight = 68;
const semanticNodeWidth = semanticNodeHeight;
const semanticColumnGap = 248;
const semanticRowGap = 112;
const semanticSourceLinkColor = 0x67e8f9;

export type SemanticActivityByNodeId = ReadonlyMap<string, readonly SemanticActivityInterval[]>;

interface RendererNodePosition {
  moved?: boolean;
  nodeId: string;
  x: number;
  y: number;
}

export function rendererGraphFromSemanticGraph({
  semanticActivities,
  semanticGraph,
  workflowGraph,
}: {
  semanticActivities: SemanticActivityByNodeId;
  semanticGraph: SemanticGraph;
  workflowGraph: WorkflowGraphGraph | undefined;
}): WorkflowGraphGraph {
  const positions = semanticNodePositions(semanticGraph, workflowGraph);
  const semanticNodeIds = new Set(semanticGraph.nodes.map((node) => node.id));
  const workflowNodeIds = workflowGraphNodeIds(workflowGraph);
  return {
    edges: [
      ...semanticGraph.edges
        .filter(
          (edge) => semanticNodeIds.has(edge.fromNodeId) && semanticNodeIds.has(edge.toNodeId),
        )
        .map((edge) => ({
          alpha: 0.76,
          color: workspaceNeonTheme.semantic.edgeKind[edge.kind],
          diagnostic: null,
          id: `semantic-edge:${edge.id}`,
          label: edge.label || edge.kind,
          layer: "semantic" as const,
          sourceNodeId: semanticRendererNodeId(edge.fromNodeId),
          sourcePortId: "output",
          targetNodeId: semanticRendererNodeId(edge.toNodeId),
          targetPortId: "input",
          width: 2,
        })),
      ...semanticSourceLinkRendererEdges({
        semanticNodeIds,
        sourceLinks: semanticGraph.sourceLinks,
        workflowNodeIds,
      }),
      ...semanticActivityRendererEdges({
        semanticActivities,
        semanticNodeIds,
        workflowNodeIds,
      }),
    ],
    nodes: semanticGraph.nodes.map((node, index) => {
      const position = positions.get(node.id) ?? defaultSemanticNodePosition(index, workflowGraph);
      return {
        activity: semanticNodeActivitySummary(semanticActivities.get(node.id) ?? []),
        color: semanticNodeColor(node),
        connectable: false,
        diagnostic: null,
        dismissed: semanticNodeDismissed(node),
        height: semanticNodeHeight,
        id: semanticRendererNodeId(node.id),
        layer: "semantic",
        label: node.label,
        mergedIntoNodeId: semanticOptionalRendererNodeId(node.mergedIntoNodeId),
        promoted: node.promoted,
        splitFromNodeId: semanticOptionalRendererNodeId(node.splitFromNodeId),
        splitIntoNodeIds: node.splitIntoNodeIds.map(semanticRendererNodeId),
        width: semanticNodeWidth,
        x: position.x,
        y: position.y,
      };
    }),
    workflow: workflowGraph?.workflow ?? null,
  };
}

export function mergeWorkflowAndSemanticGraphs({
  semanticGraph,
  workflowGraph,
}: {
  semanticGraph: WorkflowGraphGraph | undefined;
  workflowGraph: WorkflowGraphGraph | undefined;
}): WorkflowGraphGraph | undefined {
  if (workflowGraph === undefined) {
    return semanticGraph;
  }
  if (semanticGraph === undefined) {
    return workflowGraph;
  }
  return {
    edges: [...workflowGraph.edges, ...semanticGraph.edges],
    nodes: [...workflowGraph.nodes, ...semanticGraph.nodes],
    workflow: workflowGraph.workflow ?? null,
  };
}

export function semanticRendererNodeId(nodeId: string) {
  return semanticNodePrefix + nodeId;
}

export function semanticNodeIdFromRendererNodeId(rendererNodeId: string): string | null {
  if (!rendererNodeId.startsWith(semanticNodePrefix)) {
    return null;
  }
  return rendererNodeId.slice(semanticNodePrefix.length);
}

export function semanticLayoutPositionInputsFromRendererPositions({
  positions,
  semanticGraph,
}: {
  positions: readonly RendererNodePosition[];
  semanticGraph: SemanticGraph;
}): SemanticLayoutPositionInput[] {
  const semanticNodeIds = new Set(semanticGraph.nodes.map((node) => node.id));
  return positions.flatMap((position) => {
    if (!position.moved) {
      return [];
    }
    const semanticNodeId = semanticNodeIdFromRendererNodeId(position.nodeId);
    if (semanticNodeId === null || !semanticNodeIds.has(semanticNodeId)) {
      return [];
    }
    return [
      {
        entityId: semanticNodeId,
        pinned: true,
        x: position.x,
        y: position.y,
      },
    ];
  });
}

function semanticNodePositions(
  semanticGraph: SemanticGraph,
  workflowGraph: WorkflowGraphGraph | undefined,
) {
  const layoutPositions = semanticLayoutPositionMap(semanticGraph.layoutPositions);
  const positions = new Map<string, { x: number; y: number }>();
  for (const [index, node] of semanticGraph.nodes.entries()) {
    const layout = layoutPositions.get(node.id);
    positions.set(node.id, layout ?? defaultSemanticNodePosition(index, workflowGraph));
  }
  return positions;
}

function semanticLayoutPositionMap(layoutPositions: readonly SemanticLayoutPosition[]) {
  const positions = new Map<string, { x: number; y: number }>();
  for (const position of layoutPositions) {
    positions.set(position.entityId, { x: position.x, y: position.y });
  }
  return positions;
}

function defaultSemanticNodePosition(index: number, workflowGraph: WorkflowGraphGraph | undefined) {
  const base = semanticDefaultBase(workflowGraph);
  const column = Math.floor(index / 5);
  const row = index % 5;
  return {
    x: base.x + column * semanticColumnGap,
    y: base.y + (row - 2) * semanticRowGap,
  };
}

function semanticDefaultBase(workflowGraph: WorkflowGraphGraph | undefined) {
  if (!workflowGraph || workflowGraph.nodes.length === 0) {
    return { x: -semanticNodeWidth / 2, y: 20 };
  }
  const right = Math.max(...workflowGraph.nodes.map((node) => node.x + node.width));
  const centerY =
    workflowGraph.nodes.reduce((total, node) => total + node.y + node.height / 2, 0) /
    workflowGraph.nodes.length;
  return {
    x: right + 180,
    y: centerY,
  };
}

function semanticNodeColor(node: SemanticNode) {
  return semanticNeonNodeColor({
    dismissed: semanticNodeDismissed(node),
    kind: node.kind,
    promoted: node.promoted,
  });
}

function semanticNodeDismissed(node: SemanticNode) {
  return node.dismissed || node.mergedIntoNodeId !== "";
}

function semanticOptionalRendererNodeId(nodeId: string) {
  return nodeId === "" ? "" : semanticRendererNodeId(nodeId);
}

function semanticSourceLinkRendererEdges({
  semanticNodeIds,
  sourceLinks,
  workflowNodeIds,
}: {
  semanticNodeIds: ReadonlySet<string>;
  sourceLinks: readonly SemanticEvidenceAnchor[];
  workflowNodeIds: ReadonlySet<string>;
}) {
  return sourceLinks.flatMap((link) => {
    if (!semanticNodeIds.has(link.targetEntityId)) {
      return [];
    }
    const workflowNodeId = semanticSourceLinkWorkflowNodeId(link, workflowNodeIds);
    if (workflowNodeId === "") {
      return [];
    }
    return [
      {
        alpha: 0.42,
        color: semanticSourceLinkColor,
        diagnostic: null,
        id: `semantic-source:${link.id}`,
        label: link.sourceKind,
        layer: "semantic" as const,
        sourceNodeId: workflowNodeId,
        sourcePortId: "output",
        targetNodeId: semanticRendererNodeId(link.targetEntityId),
        targetPortId: "input",
        width: 1.35,
      },
    ];
  });
}

function semanticActivityRendererEdges({
  semanticActivities,
  semanticNodeIds,
  workflowNodeIds,
}: {
  semanticActivities: SemanticActivityByNodeId;
  semanticNodeIds: ReadonlySet<string>;
  workflowNodeIds: ReadonlySet<string>;
}) {
  const edges: WorkflowGraphGraph["edges"] = [];
  for (const [targetEntityId, intervals] of semanticActivities) {
    if (!semanticNodeIds.has(targetEntityId)) {
      continue;
    }
    for (const interval of intervals) {
      const workflowNodeId = semanticActivityWorkflowNodeId(interval, workflowNodeIds);
      if (workflowNodeId === "") {
        continue;
      }
      edges.push({
        alpha: interval.endedAt === "" ? 0.54 : 0.3,
        color:
          workspaceNeonTheme.semantic.activity[interval.kind] ??
          workspaceNeonTheme.semantic.activity.exploring,
        diagnostic: null,
        id: `semantic-activity:${interval.id}`,
        label: interval.kind,
        layer: "semantic" as const,
        sourceNodeId: workflowNodeId,
        sourcePortId: "output",
        targetNodeId: semanticRendererNodeId(targetEntityId),
        targetPortId: "input",
        width: interval.endedAt === "" ? 1.8 : 1.1,
      });
    }
  }
  return edges;
}

function semanticSourceLinkWorkflowNodeId(
  link: SemanticEvidenceAnchor,
  workflowNodeIds: ReadonlySet<string>,
) {
  return firstWorkflowNodeId(workflowNodeIds, [
    link.workflowNodeId,
    link.sourceKind === "workflow_node" ? link.sourceId : "",
  ]);
}

function semanticActivityWorkflowNodeId(
  interval: SemanticActivityInterval,
  workflowNodeIds: ReadonlySet<string>,
) {
  return firstWorkflowNodeId(workflowNodeIds, [
    interval.workflowNodeId,
    interval.sourceKind === "workflow_node" ? interval.sourceId : "",
  ]);
}

function firstWorkflowNodeId(workflowNodeIds: ReadonlySet<string>, candidates: readonly string[]) {
  for (const candidate of candidates) {
    if (candidate !== "" && workflowNodeIds.has(candidate)) {
      return candidate;
    }
  }
  return "";
}

function workflowGraphNodeIds(workflowGraph: WorkflowGraphGraph | undefined) {
  return new Set(workflowGraph?.nodes.map((node) => node.id) ?? []);
}

function semanticNodeActivitySummary(activity: readonly SemanticActivityInterval[]) {
  if (activity.length === 0) {
    return null;
  }
  const active = activity.filter((interval) => interval.endedAt === "");
  const interval = active[0] ?? activity[0];
  return {
    active: active.length > 0,
    count: activity.length,
    kind: interval?.kind ?? "exploring",
  };
}
