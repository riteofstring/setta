import type {
  WorkspaceActivityKind,
  WorkspaceActivityRecord,
  WorkspaceActivityStatus,
} from "@generated/backend";

import type { WorkflowGraphGraph } from "./pixi-renderer";

type WorkspaceActivityMarkerAnchorKind = "workflow_node" | "recent_lane";

export interface WorkspaceActivityMarker {
  activityId: string;
  active: boolean;
  anchorKind: WorkspaceActivityMarkerAnchorKind;
  id: string;
  kind: WorkspaceActivityKind;
  label: string;
  laneIndex: number;
  nodeId: string;
  revision: number;
  slotIndex: number;
  status: WorkspaceActivityStatus;
  updatedAt: string;
}

export interface WorkspaceActivityMarkerMaterialization {
  created: number;
  removed: number;
  retained: number;
  updated: number;
}

const defaultMarkerLimit = 40;
const anchoredNodeMarkerLimit = 8;
const recentLaneLimit = 8;
const markerLabelLimit = 96;
const activityStatusActive = {
  answered: false,
  approved: false,
  cancelled: false,
  completed: false,
  denied: false,
  failed: false,
  pending: true,
  running: true,
  unknown: false,
  waiting_approval: true,
} satisfies Record<WorkspaceActivityStatus, boolean>;

export function projectWorkspaceActivityMarkers({
  graph,
  limit = defaultMarkerLimit,
  records,
}: {
  graph: WorkflowGraphGraph | null | undefined;
  limit?: number;
  records: readonly WorkspaceActivityRecord[];
}): WorkspaceActivityMarker[] {
  if (!graph?.workflow) {
    return [];
  }
  const workflowNodeIds = workflowRendererNodeIds(graph);
  const nodeMarkers = anchoredMarkersByNode(records, graph, workflowNodeIds);
  const anchored = markersWithNodeSlots(nodeMarkers);
  const recentLane = unanchoredRecentLaneMarkers(records, graph, workflowNodeIds);
  return [...anchored, ...recentLane].slice(0, Math.max(1, limit));
}

export function workspaceActivityMarkerMaterializationDiff(
  previous: readonly WorkspaceActivityMarker[],
  next: readonly WorkspaceActivityMarker[],
): WorkspaceActivityMarkerMaterialization {
  const previousById = new Map(previous.map((marker) => [marker.id, marker]));
  const nextById = new Map(next.map((marker) => [marker.id, marker]));
  let created = 0;
  let removed = 0;
  let retained = 0;
  let updated = 0;
  for (const marker of next) {
    const existing = previousById.get(marker.id);
    if (!existing) {
      created += 1;
      continue;
    }
    if (
      workspaceActivityMarkerFingerprint(existing) === workspaceActivityMarkerFingerprint(marker)
    ) {
      retained += 1;
    } else {
      updated += 1;
    }
  }
  for (const marker of previous) {
    if (!nextById.has(marker.id)) {
      removed += 1;
    }
  }
  return { created, removed, retained, updated };
}

function anchoredMarkersByNode(
  records: readonly WorkspaceActivityRecord[],
  graph: WorkflowGraphGraph,
  workflowNodeIds: ReadonlySet<string>,
) {
  const markers = new Map<string, WorkspaceActivityMarker[]>();
  for (const record of sortedActivityRecords(records)) {
    if (!recordMatchesWorkflow(record, graph.workflow)) {
      continue;
    }
    const nodeId = anchoredWorkflowNodeId(record, workflowNodeIds);
    if (nodeId === null) {
      continue;
    }
    markers.set(nodeId, [
      ...(markers.get(nodeId) ?? []),
      markerFromRecord(record, "workflow_node", nodeId, -1, 0),
    ]);
  }
  return markers;
}

function unanchoredRecentLaneMarkers(
  records: readonly WorkspaceActivityRecord[],
  graph: WorkflowGraphGraph,
  workflowNodeIds: ReadonlySet<string>,
) {
  const markers: WorkspaceActivityMarker[] = [];
  for (const record of sortedActivityRecords(records)) {
    if (markers.length >= recentLaneLimit) {
      break;
    }
    if (!recordMatchesWorkflow(record, graph.workflow)) {
      continue;
    }
    if (anchoredWorkflowNodeId(record, workflowNodeIds) !== null) {
      continue;
    }
    markers.push(markerFromRecord(record, "recent_lane", "", markers.length, markers.length));
  }
  return markers;
}

function markersWithNodeSlots(byNode: ReadonlyMap<string, WorkspaceActivityMarker[]>) {
  const result: WorkspaceActivityMarker[] = [];
  for (const [, nodeMarkers] of [...byNode.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    for (const [slotIndex, marker] of nodeMarkers.slice(0, anchoredNodeMarkerLimit).entries()) {
      result.push({
        ...marker,
        slotIndex,
      });
    }
  }
  return result;
}

function markerFromRecord(
  record: WorkspaceActivityRecord,
  anchorKind: WorkspaceActivityMarkerAnchorKind,
  nodeId: string,
  laneIndex: number,
  slotIndex: number,
): WorkspaceActivityMarker {
  return {
    activityId: record.activityId,
    active: activeActivityStatus(record.status),
    anchorKind,
    id:
      anchorKind === "workflow_node"
        ? workflowNodeMarkerId(nodeId, record.activityId)
        : `workspace-activity:recent:${record.activityId}`,
    kind: record.kind,
    label: activityMarkerLabel(record),
    laneIndex,
    nodeId,
    revision: record.revision,
    slotIndex,
    status: record.status,
    updatedAt: record.updatedAt || record.occurredAt,
  };
}

function workflowRendererNodeIds(graph: WorkflowGraphGraph) {
  return new Set(graph.nodes.filter((node) => node.layer !== "semantic").map((node) => node.id));
}

function anchoredWorkflowNodeId(
  record: WorkspaceActivityRecord,
  workflowNodeIds: ReadonlySet<string>,
) {
  const graphAnchorNodeId =
    record.graphAnchor?.kind === "workflow_node" ? record.graphAnchor.workflowNodeId : "";
  const nodeId = firstNonEmpty(graphAnchorNodeId, record.provenance.workflowNodeId);
  if (nodeId === "" || !workflowNodeIds.has(nodeId)) {
    return null;
  }
  return nodeId;
}

function recordMatchesWorkflow(
  record: WorkspaceActivityRecord,
  workflow: WorkflowGraphGraph["workflow"] | undefined,
) {
  if (workflow == null) {
    return false;
  }
  if (workflow.workspaceId !== "" && record.workspaceId !== workflow.workspaceId) {
    return false;
  }
  if (workflow.executionId === "") {
    return true;
  }
  const recordExecutionIds = [
    record.graphAnchor?.workflowExecutionId ?? "",
    record.provenance.workflowExecutionId,
    record.detailRef.workflowExecutionId,
  ];
  return recordExecutionIds.includes(workflow.executionId);
}

function sortedActivityRecords(records: readonly WorkspaceActivityRecord[]) {
  return [...records].sort((left, right) => {
    const leftTime = left.updatedAt || left.occurredAt;
    const rightTime = right.updatedAt || right.occurredAt;
    if (leftTime === rightTime) {
      return right.revision - left.revision || left.activityId.localeCompare(right.activityId);
    }
    return rightTime.localeCompare(leftTime);
  });
}

function activeActivityStatus(status: WorkspaceActivityStatus) {
  return activityStatusActive[status];
}

function activityMarkerLabel(record: WorkspaceActivityRecord) {
  return activityMarkerLabelBuilders[record.kind](record);
}

const activityMarkerLabelBuilders = {
  approval: approvalMarkerLabel,
  command: commandMarkerLabel,
  file_change: fileChangeMarkerLabel,
  workflow_status: workflowStatusMarkerLabel,
} satisfies Record<WorkspaceActivityKind, (record: WorkspaceActivityRecord) => string>;

function commandMarkerLabel(record: WorkspaceActivityRecord) {
  return boundedMarkerLabel(
    ["Command", record.status, record.command?.commandPreview ?? ""].filter(Boolean).join(" "),
  );
}

function fileChangeMarkerLabel(record: WorkspaceActivityRecord) {
  return boundedMarkerLabel(
    [
      "File change",
      record.status,
      fileChangePathLabel(record.fileChange?.paths ?? [], record.fileChange?.pathCount ?? 0),
      record.fileChange?.patchStatus ?? "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function approvalMarkerLabel(record: WorkspaceActivityRecord) {
  return boundedMarkerLabel(
    ["Approval", record.status, record.approval?.title ?? "", record.approval?.targetLabel ?? ""]
      .filter(Boolean)
      .join(" "),
  );
}

function workflowStatusMarkerLabel(record: WorkspaceActivityRecord) {
  return boundedMarkerLabel(
    ["Workflow", record.status, record.workflow?.eventType ?? "", record.workflow?.message ?? ""]
      .filter(Boolean)
      .join(" "),
  );
}

function fileChangePathLabel(paths: readonly string[], pathCount: number) {
  const firstPath = paths[0] ?? "";
  if (firstPath === "") {
    return pathCount > 0 ? `${pathCount} paths` : "";
  }
  const remaining = Math.max(0, pathCount - 1);
  return remaining === 0 ? firstPath : `${firstPath} +${remaining}`;
}

function boundedMarkerLabel(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= markerLabelLimit) {
    return trimmed;
  }
  return trimmed.slice(0, markerLabelLimit).trimEnd();
}

function workflowNodeMarkerId(nodeId: string, activityId: string) {
  return `workspace-activity:node:${nodeId}:${activityId}`;
}

function workspaceActivityMarkerFingerprint(marker: WorkspaceActivityMarker) {
  return JSON.stringify({
    activityId: marker.activityId,
    active: marker.active,
    anchorKind: marker.anchorKind,
    kind: marker.kind,
    label: marker.label,
    laneIndex: marker.laneIndex,
    nodeId: marker.nodeId,
    revision: marker.revision,
    slotIndex: marker.slotIndex,
    status: marker.status,
    updatedAt: marker.updatedAt,
  });
}

function firstNonEmpty(...values: string[]) {
  return values.find((value) => value !== "") ?? "";
}
