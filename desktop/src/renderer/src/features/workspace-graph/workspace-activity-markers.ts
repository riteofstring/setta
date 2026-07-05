import type {
  WorkflowExecutionStatus,
  WorkflowGraphNodeStatus,
  WorkspaceActivityDetailKind,
  WorkspaceActivityKind,
  WorkspaceActivityRecord,
  WorkspaceActivityStatus,
} from "@generated/backend";

import type { WorkflowGraphGraph } from "./pixi-renderer";
import type { WorkflowGraphTarget } from "./workflow-graph-projection-state";

type WorkspaceActivityMarkerAnchorKind = "workflow_node";

type WorkflowGraphRunActivityTarget = Extract<WorkflowGraphTarget, { kind: "run" }>;

// Typed reference to the canonical detail row a chip click should deep-link to. It is a bounded
// subset of WorkspaceActivityDetailRef carrying only the ids the workflow node details pane can
// highlight (run item, approval, or workflow event). It is not a visual property, so it does not
// participate in marker fingerprints.
interface WorkspaceActivityMarkerDetailRef {
  approvalId: string;
  kind: WorkspaceActivityDetailKind;
  runItemId: string;
  workflowEventId: string;
}

export interface WorkspaceActivityMarker {
  activityId: string;
  active: boolean;
  anchorKind: WorkspaceActivityMarkerAnchorKind;
  detailRef: WorkspaceActivityMarkerDetailRef;
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

export interface WorkspaceActivityMarkerProjection {
  markers: WorkspaceActivityMarker[];
  suppressedUnanchoredActivityCount: number;
  suppressedUnanchoredActivityIds: string[];
}

const markerLabelLimit = 96;
const suppressedUnanchoredActivityDebugLimit = 24;
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
const activityStatusLabels = {
  answered: "answered",
  approved: "approved",
  cancelled: "cancelled",
  completed: "completed",
  denied: "denied",
  failed: "failed",
  pending: "pending",
  running: "running",
  unknown: "updated",
  waiting_approval: "waiting",
} satisfies Record<WorkspaceActivityStatus, string>;
const primaryLabelStatusPrefixes = new Set<WorkspaceActivityStatus>([
  "cancelled",
  "denied",
  "failed",
  "waiting_approval",
]);
const transientActivityStatuses = new Set<WorkspaceActivityStatus>([
  "pending",
  "running",
  "waiting_approval",
]);
const terminalExecutionStatuses = new Set<WorkflowExecutionStatus>([
  "completed",
  "failed",
  "stopped",
  "cancelled",
]);
const terminalNodeStatuses = new Set<WorkflowGraphNodeStatus>(["succeeded", "failed", "cancelled"]);

export function projectWorkspaceActivityMarkers({
  graph,
  records,
  target,
}: {
  graph: WorkflowGraphGraph | null | undefined;
  records: readonly WorkspaceActivityRecord[];
  target: WorkflowGraphTarget | null;
}): WorkspaceActivityMarker[] {
  return projectWorkspaceActivityMarkerProjection({ graph, records, target }).markers;
}

export function projectWorkspaceActivityMarkerProjection({
  graph,
  records,
  target,
}: {
  graph: WorkflowGraphGraph | null | undefined;
  records: readonly WorkspaceActivityRecord[];
  target: WorkflowGraphTarget | null;
}): WorkspaceActivityMarkerProjection {
  const runTarget = runActivityTarget(target);
  if (!graph?.workflow || runTarget === null) {
    return emptyMarkerProjection();
  }
  if (!graphMatchesRunTarget(graph.workflow, runTarget)) {
    return emptyMarkerProjection();
  }
  const workflowNodeIds = workflowRendererNodeIds(graph);
  const projection = anchoredMarkersByNode(records, graph, workflowNodeIds, runTarget);
  return {
    markers: markersWithNodeSlots(projection.markersByNode),
    suppressedUnanchoredActivityCount: projection.suppressedUnanchoredActivityCount,
    suppressedUnanchoredActivityIds: projection.suppressedUnanchoredActivityIds,
  };
}

function runActivityTarget(
  target: WorkflowGraphTarget | null,
): WorkflowGraphRunActivityTarget | null {
  return target?.kind === "run" ? target : null;
}

// Activity is anchored to the nodes currently on the canvas, so it must only be
// projected when the displayed run graph is the selected run. This keeps a run's
// activity from leaking onto another run's graph while a target switch is loading
// and the previous projection is still displayed.
function graphMatchesRunTarget(
  workflow: NonNullable<WorkflowGraphGraph["workflow"]>,
  target: WorkflowGraphRunActivityTarget,
) {
  return (
    workflow.viewMode === "run" &&
    workflow.workspaceId === target.workspaceId &&
    workflow.definitionId === target.definitionId &&
    workflow.definitionVersionId === target.versionId &&
    workflow.executionId === target.executionId
  );
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
  target: WorkflowGraphRunActivityTarget,
) {
  const markers = new Map<string, WorkspaceActivityMarker[]>();
  const nodeStatuses = workflowNodeStatuses(graph);
  let suppressedUnanchoredActivityCount = 0;
  const suppressedUnanchoredActivityIds: string[] = [];
  for (const record of sortedActivityRecords(records)) {
    if (!recordMatchesRunTarget(record, target)) {
      continue;
    }
    const nodeId = anchoredWorkflowNodeId(record, workflowNodeIds);
    if (nodeId === null) {
      suppressedUnanchoredActivityCount += 1;
      if (suppressedUnanchoredActivityIds.length < suppressedUnanchoredActivityDebugLimit) {
        suppressedUnanchoredActivityIds.push(record.activityId);
      }
      continue;
    }
    if (
      recordIsStaleTransientActivity(record, {
        nodeStatus: nodeStatuses.get(nodeId),
        workflowStatus: graph.workflow?.executionStatus ?? "",
      })
    ) {
      continue;
    }
    markers.set(nodeId, [
      ...(markers.get(nodeId) ?? []),
      markerFromRecord(record, "workflow_node", nodeId, -1, 0),
    ]);
  }
  return {
    markersByNode: markers,
    suppressedUnanchoredActivityCount,
    suppressedUnanchoredActivityIds,
  };
}

function markersWithNodeSlots(byNode: ReadonlyMap<string, WorkspaceActivityMarker[]>) {
  const result: WorkspaceActivityMarker[] = [];
  for (const [, nodeMarkers] of [...byNode.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    for (const [slotIndex, marker] of nodeMarkers.entries()) {
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
    detailRef: activityMarkerDetailRef(record),
    id: workflowNodeMarkerId(nodeId, record.activityId),
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

function activityMarkerDetailRef(
  record: WorkspaceActivityRecord,
): WorkspaceActivityMarkerDetailRef {
  return {
    approvalId: record.detailRef.approvalId,
    kind: record.detailRef.kind,
    runItemId: record.detailRef.runItemId,
    workflowEventId: record.detailRef.workflowEventId,
  };
}

function workflowRendererNodeIds(graph: WorkflowGraphGraph) {
  return new Set(graph.nodes.filter((node) => node.layer !== "semantic").map((node) => node.id));
}

function workflowNodeStatuses(graph: WorkflowGraphGraph) {
  return new Map(
    graph.nodes
      .filter((node) => node.layer !== "semantic")
      .flatMap((node) => (node.status === undefined ? [] : [[node.id, node.status]])),
  );
}

function recordIsStaleTransientActivity(
  record: WorkspaceActivityRecord,
  {
    nodeStatus,
    workflowStatus,
  }: {
    nodeStatus: WorkflowGraphNodeStatus | undefined;
    workflowStatus: string;
  },
) {
  if (!transientActivityStatuses.has(record.status)) {
    return false;
  }
  return (
    terminalExecutionStatuses.has(workflowStatus as WorkflowExecutionStatus) ||
    (nodeStatus !== undefined && terminalNodeStatuses.has(nodeStatus))
  );
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

function recordMatchesRunTarget(
  record: WorkspaceActivityRecord,
  target: WorkflowGraphRunActivityTarget,
) {
  if (target.workspaceId !== "" && record.workspaceId !== target.workspaceId) {
    return false;
  }
  const recordExecutionIds = [
    record.graphAnchor?.workflowExecutionId ?? "",
    record.provenance.workflowExecutionId,
    record.detailRef.workflowExecutionId,
  ];
  return recordExecutionIds.includes(target.executionId);
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
  const command = record.command?.commandPreview ?? "";
  return boundedMarkerLabel(
    ["Command", statusPrefixForPrimaryLabel(record.status, command), command]
      .filter(Boolean)
      .join(" "),
  );
}

function fileChangeMarkerLabel(record: WorkspaceActivityRecord) {
  const path = fileChangePathLabel(
    record.fileChange?.paths ?? [],
    record.fileChange?.pathCount ?? 0,
  );
  return boundedMarkerLabel(
    ["File", statusPrefixForPrimaryLabel(record.status, path), path].filter(Boolean).join(" "),
  );
}

function approvalMarkerLabel(record: WorkspaceActivityRecord) {
  return boundedMarkerLabel(
    [
      "Approval",
      activityStatusLabel(record.status),
      firstNonEmpty(record.approval?.title ?? "", record.approval?.targetLabel ?? ""),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function workflowStatusMarkerLabel(record: WorkspaceActivityRecord) {
  return boundedMarkerLabel(
    ["Workflow", activityStatusLabel(record.status), record.workflow?.message ?? ""]
      .filter(Boolean)
      .join(" "),
  );
}

function fileChangePathLabel(paths: readonly string[], pathCount: number) {
  const firstPath = displayPathLabel(paths[0] ?? "");
  if (firstPath === "") {
    return pathCount > 0 ? `${pathCount} paths` : "";
  }
  const remaining = Math.max(0, pathCount - 1);
  return remaining === 0 ? firstPath : `${firstPath} +${remaining}`;
}

function displayPathLabel(path: string) {
  const normalized = path.replaceAll("\\", "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? "";
}

function statusPrefixForPrimaryLabel(status: WorkspaceActivityStatus, primary: string) {
  return primary === "" || primaryLabelStatusPrefixes.has(status)
    ? activityStatusLabel(status)
    : "";
}

function activityStatusLabel(status: WorkspaceActivityStatus) {
  return activityStatusLabels[status];
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

function emptyMarkerProjection(): WorkspaceActivityMarkerProjection {
  return {
    markers: [],
    suppressedUnanchoredActivityCount: 0,
    suppressedUnanchoredActivityIds: [],
  };
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
