import type {
  SemanticActivityInterval,
  SemanticEvidenceAnchor,
  SemanticGraph,
  SemanticWorkingSet,
  SemanticWorkingSetLiveSourceRef,
  SemanticWorkingSetPatchPreview,
  SemanticWorkingSetStatus,
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
const semanticLiveSourcePulsePrefix = "semantic-live-source:";
const semanticPreviewNodePrefix = "semantic-preview:";
const semanticNodeHeight = 68;
const semanticNodeWidth = semanticNodeHeight;
const semanticLiveSourcePulseSize = 18;
const semanticPreviewNodeHeight = 58;
const semanticPreviewNodeWidth = semanticPreviewNodeHeight;
const semanticColumnGap = 248;
const semanticRowGap = 112;
const semanticSourceLinkColor = 0x67e8f9;
const semanticLiveSourcePulseColor = 0x22d3ee;
const semanticPreviewNodeColor = 0xf0abfc;
const activeSemanticWorkingSetStatuses = new Set<SemanticWorkingSetStatus>([
  "observing",
  "window_open",
  "queued",
  "running",
  "proposing",
  "applying",
  "pending_review",
]);
const semanticWorkingSetActivityKindByStatus = {
  applied: "validating",
  applying: "editing",
  failed: "blocked",
  noop: "validating",
  observing: "exploring",
  pending_review: "editing",
  proposing: "editing",
  queued: "exploring",
  rejected: "debugging",
  running: "exploring",
  superseded: "debugging",
  window_open: "exploring",
} as const satisfies Record<SemanticWorkingSetStatus, SemanticActivityInterval["kind"]>;

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
  semanticWorkingSet,
  workflowGraph,
}: {
  semanticActivities: SemanticActivityByNodeId;
  semanticGraph: SemanticGraph;
  semanticWorkingSet?: SemanticWorkingSet | null;
  workflowGraph: WorkflowGraphGraph | undefined;
}): WorkflowGraphGraph {
  const positions = semanticNodePositions(semanticGraph, workflowGraph);
  const semanticNodeIds = new Set(semanticGraph.nodes.map((node) => node.id));
  const workflowNodeIds = workflowGraphNodeIds(workflowGraph);
  const workflowNodeMap = workflowGraphNodeMap(workflowGraph);
  const pendingPreviewNodeIds = semanticWorkingSetPreviewNodeIds(semanticWorkingSet);
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
      ...semanticWorkingSetRendererEdges({
        pendingPreviewNodeIds,
        semanticNodeIds,
        semanticWorkingSet,
        workflowNodeIds,
      }),
    ],
    nodes: [
      ...semanticGraph.nodes.map((node, index) => {
        const position =
          positions.get(node.id) ?? defaultSemanticNodePosition(index, workflowGraph);
        return {
          activity: semanticNodeActivitySummary(
            semanticActivities.get(node.id) ?? [],
            semanticWorkingSetActivityForNode(semanticWorkingSet, node.id),
          ),
          color: semanticNodeColor(node),
          connectable: false,
          diagnostic: null,
          dismissed: semanticNodeDismissed(node),
          height: semanticNodeHeight,
          id: semanticRendererNodeId(node.id),
          layer: "semantic" as const,
          label: node.label,
          mergedIntoNodeId: semanticOptionalRendererNodeId(node.mergedIntoNodeId),
          promoted: node.promoted,
          semanticRole: "committed" as const,
          splitFromNodeId: semanticOptionalRendererNodeId(node.splitFromNodeId),
          splitIntoNodeIds: node.splitIntoNodeIds.map(semanticRendererNodeId),
          width: semanticNodeWidth,
          x: position.x,
          y: position.y,
        };
      }),
      ...semanticWorkingSetSourcePulseNodes({
        pendingPreviewNodeIds,
        positions,
        semanticNodeIds,
        semanticWorkingSet,
        workflowGraph,
        workflowNodeMap,
      }),
      ...semanticWorkingSetPreviewNodes({
        positions,
        semanticNodeIds,
        semanticWorkingSet,
        workflowGraph,
        workflowNodeMap,
      }),
    ],
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

function workflowGraphNodeMap(workflowGraph: WorkflowGraphGraph | undefined) {
  return new Map(workflowGraph?.nodes.map((node) => [node.id, node]) ?? []);
}

function semanticNodeActivitySummary(
  activity: readonly SemanticActivityInterval[],
  liveActivity: { active: boolean; count: number; kind: SemanticActivityInterval["kind"] } | null,
) {
  if (liveActivity?.active) {
    return {
      active: true,
      count: activity.length + liveActivity.count,
      kind: liveActivity.kind,
    };
  }
  if (activity.length === 0) {
    return liveActivity;
  }
  const active = activity.filter((interval) => interval.endedAt === "");
  const interval = active[0] ?? activity[0];
  return {
    active: active.length > 0,
    count: activity.length,
    kind: interval?.kind ?? "exploring",
  };
}

function semanticWorkingSetActivityForNode(
  workingSet: SemanticWorkingSet | null | undefined,
  semanticNodeId: string,
) {
  if (!workingSet) {
    return null;
  }
  const candidates = [
    ...workingSet.candidateTargets.filter((target) => target.targetEntityId === semanticNodeId),
    ...workingSet.liveSourceRefs.filter(
      (source) =>
        source.targetEntityId === semanticNodeId ||
        source.changedSemanticNodeIds.includes(semanticNodeId),
    ),
  ];
  if (candidates.length === 0) {
    return null;
  }
  const active = candidates.some((candidate) => semanticWorkingSetStatusIsActive(candidate.status));
  return {
    active,
    count: candidates.length,
    kind: semanticActivityKindForWorkingSetStatus(candidates[0]?.status ?? "observing"),
  };
}

function semanticWorkingSetSourcePulseNodes({
  pendingPreviewNodeIds,
  positions,
  semanticNodeIds,
  semanticWorkingSet,
  workflowGraph,
  workflowNodeMap,
}: {
  pendingPreviewNodeIds: ReadonlySet<string>;
  positions: ReadonlyMap<string, { x: number; y: number }>;
  semanticNodeIds: ReadonlySet<string>;
  semanticWorkingSet: SemanticWorkingSet | null | undefined;
  workflowGraph: WorkflowGraphGraph | undefined;
  workflowNodeMap: ReadonlyMap<string, WorkflowGraphGraph["nodes"][number]>;
}) {
  if (!semanticWorkingSet) {
    return [];
  }
  return semanticWorkingSet.liveSourceRefs.flatMap((source, index) => {
    if (source.targetEntityId !== "" && semanticNodeIds.has(source.targetEntityId)) {
      return [];
    }
    if (source.patchId !== "" && pendingPreviewNodeIds.has(source.patchId)) {
      return [];
    }
    const anchor = semanticWorkingSetAnchorPosition({
      fallbackIndex: index,
      positions,
      semanticNodeIds,
      source,
      workflowGraph,
      workflowNodeMap,
    });
    return [
      {
        activity: {
          active: semanticWorkingSetStatusIsActive(source.status),
          count: 1,
          kind: semanticActivityKindForWorkingSetStatus(source.status),
        },
        color: semanticLiveSourcePulseColor,
        connectable: false,
        diagnostic: null,
        height: semanticLiveSourcePulseSize,
        id: semanticLiveSourceRendererNodeId(source.id),
        layer: "semantic" as const,
        label: "",
        semanticRole: "source_pulse" as const,
        width: semanticLiveSourcePulseSize,
        x: anchor.x,
        y: anchor.y,
      },
    ];
  });
}

function semanticWorkingSetPreviewNodes({
  positions,
  semanticNodeIds,
  semanticWorkingSet,
  workflowGraph,
  workflowNodeMap,
}: {
  positions: ReadonlyMap<string, { x: number; y: number }>;
  semanticNodeIds: ReadonlySet<string>;
  semanticWorkingSet: SemanticWorkingSet | null | undefined;
  workflowGraph: WorkflowGraphGraph | undefined;
  workflowNodeMap: ReadonlyMap<string, WorkflowGraphGraph["nodes"][number]>;
}) {
  if (!semanticWorkingSet) {
    return [];
  }
  return semanticWorkingSet.pendingPatchPreviews.flatMap((preview, previewIndex) =>
    preview.newNodes.flatMap((node, nodeIndex) => {
      if (semanticNodeIds.has(node.semanticNodeId)) {
        return [];
      }
      const anchor = semanticWorkingSetPreviewPosition({
        fallbackIndex: previewIndex + nodeIndex,
        positions,
        preview,
        semanticNodeIds,
        workflowGraph,
        workflowNodeMap,
      });
      return [
        {
          activity: {
            active: semanticWorkingSetStatusIsActive(preview.status),
            count: 1,
            kind: semanticActivityKindForWorkingSetStatus(preview.status),
          },
          color: semanticNeonNodeColor({
            dismissed: false,
            kind: node.kind,
            promoted: false,
          }),
          connectable: false,
          diagnostic: null,
          height: semanticPreviewNodeHeight,
          id: semanticPreviewRendererNodeId(preview.patchId, node.semanticNodeId),
          layer: "semantic" as const,
          label: node.label,
          semanticRole: "preview" as const,
          width: semanticPreviewNodeWidth,
          x: anchor.x,
          y: anchor.y,
        },
      ];
    }),
  );
}

function semanticWorkingSetRendererEdges({
  pendingPreviewNodeIds,
  semanticNodeIds,
  semanticWorkingSet,
  workflowNodeIds,
}: {
  pendingPreviewNodeIds: ReadonlySet<string>;
  semanticNodeIds: ReadonlySet<string>;
  semanticWorkingSet: SemanticWorkingSet | null | undefined;
  workflowNodeIds: ReadonlySet<string>;
}) {
  if (!semanticWorkingSet) {
    return [];
  }
  return semanticWorkingSet.liveSourceRefs.flatMap((source) => {
    const workflowNodeId = semanticWorkingSetWorkflowNodeId(source, workflowNodeIds);
    if (workflowNodeId === "") {
      return [];
    }
    const targetNodeId = semanticWorkingSetSourceTargetRendererNodeId({
      pendingPreviewNodeIds,
      semanticNodeIds,
      semanticWorkingSet,
      source,
    });
    if (targetNodeId === "") {
      return [];
    }
    return [
      {
        alpha: semanticWorkingSetStatusIsActive(source.status) ? 0.58 : 0.34,
        color: semanticWorkingSetEdgeColor(source.status),
        diagnostic: null,
        id: `semantic-live-source:${source.id}`,
        label: source.status,
        layer: "semantic" as const,
        sourceNodeId: workflowNodeId,
        sourcePortId: "output",
        targetNodeId,
        targetPortId: "input",
        width: semanticWorkingSetStatusIsActive(source.status) ? 1.7 : 1.15,
      },
    ];
  });
}

function semanticWorkingSetSourceTargetRendererNodeId({
  pendingPreviewNodeIds,
  semanticNodeIds,
  semanticWorkingSet,
  source,
}: {
  pendingPreviewNodeIds: ReadonlySet<string>;
  semanticNodeIds: ReadonlySet<string>;
  semanticWorkingSet: SemanticWorkingSet;
  source: SemanticWorkingSetLiveSourceRef;
}) {
  if (source.targetEntityId !== "" && semanticNodeIds.has(source.targetEntityId)) {
    return semanticRendererNodeId(source.targetEntityId);
  }
  if (source.patchId !== "" && pendingPreviewNodeIds.has(source.patchId)) {
    const preview = semanticWorkingSet.pendingPatchPreviews.find(
      (candidate) => candidate.patchId === source.patchId,
    );
    const node = preview?.newNodes[0];
    if (node) {
      return semanticPreviewRendererNodeId(source.patchId, node.semanticNodeId);
    }
  }
  return semanticLiveSourceRendererNodeId(source.id);
}

function semanticWorkingSetAnchorPosition({
  fallbackIndex,
  positions,
  semanticNodeIds,
  source,
  workflowGraph,
  workflowNodeMap,
}: {
  fallbackIndex: number;
  positions: ReadonlyMap<string, { x: number; y: number }>;
  semanticNodeIds: ReadonlySet<string>;
  source: SemanticWorkingSetLiveSourceRef;
  workflowGraph: WorkflowGraphGraph | undefined;
  workflowNodeMap: ReadonlyMap<string, WorkflowGraphGraph["nodes"][number]>;
}) {
  const workflowNode = workflowNodeMap.get(source.sourceRefs.workflowNodeId);
  if (workflowNode) {
    return {
      x: workflowNode.x + workflowNode.width + 28,
      y:
        workflowNode.y +
        workflowNode.height / 2 -
        semanticLiveSourcePulseSize / 2 +
        fallbackIndex * 10,
    };
  }
  if (source.targetEntityId !== "" && semanticNodeIds.has(source.targetEntityId)) {
    const position = positions.get(source.targetEntityId);
    if (position) {
      return {
        x: position.x - semanticLiveSourcePulseSize - 22,
        y: position.y + semanticNodeHeight / 2 - semanticLiveSourcePulseSize / 2,
      };
    }
  }
  const fallback = defaultSemanticNodePosition(fallbackIndex, workflowGraph);
  return {
    x: fallback.x - 42,
    y: fallback.y,
  };
}

function semanticWorkingSetPreviewPosition({
  fallbackIndex,
  positions,
  preview,
  semanticNodeIds,
  workflowGraph,
  workflowNodeMap,
}: {
  fallbackIndex: number;
  positions: ReadonlyMap<string, { x: number; y: number }>;
  preview: SemanticWorkingSetPatchPreview;
  semanticNodeIds: ReadonlySet<string>;
  workflowGraph: WorkflowGraphGraph | undefined;
  workflowNodeMap: ReadonlyMap<string, WorkflowGraphGraph["nodes"][number]>;
}) {
  const workflowNode = workflowNodeMap.get(preview.sourceRefs.workflowNodeId);
  if (workflowNode) {
    return {
      x: workflowNode.x + workflowNode.width + 76,
      y:
        workflowNode.y +
        workflowNode.height / 2 -
        semanticPreviewNodeHeight / 2 +
        fallbackIndex * 14,
    };
  }
  if (preview.targetEntityId !== "" && semanticNodeIds.has(preview.targetEntityId)) {
    const position = positions.get(preview.targetEntityId);
    if (position) {
      return {
        x: position.x + semanticNodeWidth + 42,
        y: position.y + (semanticNodeHeight - semanticPreviewNodeHeight) / 2,
      };
    }
  }
  const fallback = defaultSemanticNodePosition(fallbackIndex, workflowGraph);
  return {
    x: fallback.x + 88,
    y: fallback.y,
  };
}

function semanticWorkingSetWorkflowNodeId(
  source: SemanticWorkingSetLiveSourceRef,
  workflowNodeIds: ReadonlySet<string>,
) {
  return firstWorkflowNodeId(workflowNodeIds, [source.sourceRefs.workflowNodeId]);
}

function semanticWorkingSetPreviewNodeIds(
  semanticWorkingSet: SemanticWorkingSet | null | undefined,
) {
  return new Set(semanticWorkingSet?.pendingPatchPreviews.map((preview) => preview.patchId) ?? []);
}

function semanticPreviewRendererNodeId(patchId: string, semanticNodeId: string) {
  return `${semanticPreviewNodePrefix}${patchId}:${semanticNodeId}`;
}

function semanticLiveSourceRendererNodeId(sourceId: string) {
  return semanticLiveSourcePulsePrefix + sourceId;
}

function semanticWorkingSetStatusIsActive(status: SemanticWorkingSetStatus) {
  return activeSemanticWorkingSetStatuses.has(status);
}

function semanticActivityKindForWorkingSetStatus(
  status: SemanticWorkingSetStatus,
): SemanticActivityInterval["kind"] {
  return semanticWorkingSetActivityKindByStatus[status];
}

function semanticWorkingSetEdgeColor(status: SemanticWorkingSetStatus) {
  switch (status) {
    case "proposing":
    case "applying":
    case "pending_review":
      return semanticPreviewNodeColor;
    case "failed":
      return workspaceNeonTheme.semantic.activity.blocked;
    default:
      return semanticSourceLinkColor;
  }
}
