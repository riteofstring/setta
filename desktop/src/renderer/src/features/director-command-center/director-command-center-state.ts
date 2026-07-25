import type {
  ApprovalRequest,
  DirectorEvent,
  DirectorSnapshot,
  DirectorWorkstreamEntry,
  ResourceRequest,
  SemanticEdge,
  SemanticNode,
  WorkstreamArtifact,
  WorkstreamGraph,
} from "@generated/backend";

export function applyDirectorEvent(
  snapshot: DirectorSnapshot,
  event: DirectorEvent,
): DirectorSnapshot {
  const cursor = { sequence: event.sequence, streamId: event.streamId };
  const connection = { lastEventAt: event.emittedAt, status: "connected" as const };
  return directorEventReducers[event.kind](snapshot, event, cursor, connection);
}

export function selectedWorkstreamEntry(
  snapshot: DirectorSnapshot | null,
): DirectorWorkstreamEntry | null {
  if (snapshot === null || snapshot.selectedWorkstreamId === null) {
    return null;
  }
  return (
    snapshot.workstreams.find((entry) => entry.workstream.id === snapshot.selectedWorkstreamId) ??
    null
  );
}

export function visibleSelectedGraph(snapshot: DirectorSnapshot | null): WorkstreamGraph | null {
  const selected = selectedWorkstreamEntry(snapshot);
  if (selected === null) {
    return null;
  }
  return snapshot?.graphs.find((graph) => graph.workstreamId === selected.workstream.id) ?? null;
}

function required<T>(value: T | null, kind: DirectorEvent["kind"]): T {
  if (value === null) {
    throw new Error(`${kind} event omitted its payload`);
  }
  return value;
}

type DirectorEventCursorState = DirectorSnapshot["eventCursor"];
type DirectorConnectionSnapshot = DirectorSnapshot["connection"];
type DirectorEventReducer = (
  snapshot: DirectorSnapshot,
  event: DirectorEvent,
  cursor: DirectorEventCursorState,
  connection: DirectorConnectionSnapshot,
) => DirectorSnapshot;

const directorEventReducers = {
  "director.aggregates.updated": applyAggregatesUpdated,
  "director.approval.updated": applyApprovalUpdated,
  "director.artifact.updated": applyArtifactUpdated,
  "director.graph.updated": applyGraphUpdated,
  "director.resync_required": applyCursorOnly,
  "director.resource_request.updated": applyResourceRequestUpdated,
  "director.selection.changed": applySelectionChanged,
  "director.text.delta": applyCursorOnly,
  "director.workstream.removed": applyWorkstreamRemoved,
  "director.workstream.updated": applyWorkstreamUpdated,
} as const satisfies Record<DirectorEvent["kind"], DirectorEventReducer>;

function applyWorkstreamUpdated(
  snapshot: DirectorSnapshot,
  event: DirectorEvent,
  cursor: DirectorEventCursorState,
  connection: DirectorConnectionSnapshot,
): DirectorSnapshot {
  return {
    ...snapshot,
    connection,
    eventCursor: cursor,
    workstreams: upsertWorkstreamEntry(
      snapshot.workstreams,
      required(event.workstreamUpdated, event.kind).entry,
    ),
  };
}

function applyWorkstreamRemoved(
  snapshot: DirectorSnapshot,
  event: DirectorEvent,
  cursor: DirectorEventCursorState,
  connection: DirectorConnectionSnapshot,
): DirectorSnapshot {
  const workstreamId = required(event.workstreamRemoved, event.kind).workstreamId;
  return {
    ...snapshot,
    artifacts: snapshot.artifacts.filter((artifact) => artifact.workstreamId !== workstreamId),
    connection,
    eventCursor: cursor,
    graphs: snapshot.graphs
      .filter((graph) => graph.workstreamId !== workstreamId)
      .map((graph) => ({
        ...graph,
        edges: graph.edges.filter(
          (edge) => edge.fromWorkstreamId !== workstreamId && edge.toWorkstreamId !== workstreamId,
        ),
      })),
    selectedWorkstreamId:
      snapshot.selectedWorkstreamId === workstreamId ? null : snapshot.selectedWorkstreamId,
    unresolvedApprovals: snapshot.unresolvedApprovals.filter(
      (approval) => approval.workstreamId !== workstreamId,
    ),
    unresolvedResourceRequests: snapshot.unresolvedResourceRequests.filter(
      (request) => request.workstreamId !== workstreamId,
    ),
    workstreams: snapshot.workstreams.filter((entry) => entry.workstream.id !== workstreamId),
  };
}

function applySelectionChanged(
  snapshot: DirectorSnapshot,
  event: DirectorEvent,
  cursor: DirectorEventCursorState,
  connection: DirectorConnectionSnapshot,
): DirectorSnapshot {
  return {
    ...snapshot,
    connection,
    eventCursor: cursor,
    selectedWorkstreamId: required(event.selectionChanged, event.kind).selectedWorkstreamId,
  };
}

function applyGraphUpdated(
  snapshot: DirectorSnapshot,
  event: DirectorEvent,
  cursor: DirectorEventCursorState,
  connection: DirectorConnectionSnapshot,
): DirectorSnapshot {
  return {
    ...snapshot,
    connection,
    eventCursor: cursor,
    graphs: updateGraph(snapshot.graphs, required(event.graphUpdated, event.kind)),
  };
}

function applyApprovalUpdated(
  snapshot: DirectorSnapshot,
  event: DirectorEvent,
  cursor: DirectorEventCursorState,
  connection: DirectorConnectionSnapshot,
): DirectorSnapshot {
  return {
    ...snapshot,
    connection,
    eventCursor: cursor,
    unresolvedApprovals: updateApprovalCollection(
      snapshot.unresolvedApprovals,
      required(event.approvalUpdated, event.kind).approval,
    ),
  };
}

function applyResourceRequestUpdated(
  snapshot: DirectorSnapshot,
  event: DirectorEvent,
  cursor: DirectorEventCursorState,
  connection: DirectorConnectionSnapshot,
): DirectorSnapshot {
  return {
    ...snapshot,
    connection,
    eventCursor: cursor,
    unresolvedResourceRequests: updateResourceCollection(
      snapshot.unresolvedResourceRequests,
      required(event.resourceRequestUpdated, event.kind).resourceRequest,
    ),
  };
}

function applyArtifactUpdated(
  snapshot: DirectorSnapshot,
  event: DirectorEvent,
  cursor: DirectorEventCursorState,
  connection: DirectorConnectionSnapshot,
): DirectorSnapshot {
  return {
    ...snapshot,
    artifacts: upsertArtifact(
      snapshot.artifacts,
      required(event.artifactUpdated, event.kind).artifact,
    ),
    connection,
    eventCursor: cursor,
  };
}

function applyAggregatesUpdated(
  snapshot: DirectorSnapshot,
  event: DirectorEvent,
  cursor: DirectorEventCursorState,
  connection: DirectorConnectionSnapshot,
): DirectorSnapshot {
  return {
    ...snapshot,
    aggregates: required(event.aggregatesUpdated, event.kind).aggregates,
    connection,
    eventCursor: cursor,
  };
}

function applyCursorOnly(
  snapshot: DirectorSnapshot,
  _event: DirectorEvent,
  cursor: DirectorEventCursorState,
  connection: DirectorConnectionSnapshot,
): DirectorSnapshot {
  return { ...snapshot, connection, eventCursor: cursor };
}

function upsertWorkstreamEntry(
  entries: readonly DirectorWorkstreamEntry[],
  entry: DirectorWorkstreamEntry,
): DirectorWorkstreamEntry[] {
  const replaced = replaceBy(entries, (candidate) => candidate.workstream.id, entry);
  return replaced.sort((left, right) =>
    compareDescendingTime(left.workstream.updatedAt, right.workstream.updatedAt),
  );
}

function updateGraph(
  graphs: readonly WorkstreamGraph[],
  payload: NonNullable<DirectorEvent["graphUpdated"]>,
): WorkstreamGraph[] {
  const existing = graphs.find((graph) => graph.workstreamId === payload.workstreamId) ?? {
    detailLevel: payload.detailLevel,
    edges: [],
    hasEarlier: false,
    nodes: [],
    workstreamId: payload.workstreamId,
  };
  const removed = new Set(payload.removedNodeIds);
  const nodes = replaceManyBy(
    existing.nodes.filter((node) => !removed.has(node.id)),
    (node) => node.id,
    payload.nodes,
  ).sort(compareSemanticNodes);
  const liveNodeIds = new Set(nodes.map((node) => node.id));
  const edges = replaceManyBy(
    existing.edges.filter(
      (edge) =>
        !removed.has(edge.fromNodeId) &&
        !removed.has(edge.toNodeId) &&
        liveNodeIds.has(edge.fromNodeId) &&
        (edge.toWorkstreamId !== existing.workstreamId || liveNodeIds.has(edge.toNodeId)),
    ),
    (edge) => edge.id,
    payload.edges,
  ).sort(compareSemanticEdges);
  const next = {
    ...existing,
    detailLevel: payload.detailLevel,
    edges,
    nodes,
  };
  return replaceBy(graphs, (graph) => graph.workstreamId, next);
}

function updateApprovalCollection(
  approvals: readonly ApprovalRequest[],
  approval: ApprovalRequest,
): ApprovalRequest[] {
  if (approval.status !== "pending") {
    return approvals.filter((candidate) => candidate.id !== approval.id);
  }
  return replaceBy(approvals, (candidate) => candidate.id, approval).sort((left, right) =>
    compareAscendingTime(left.requestedAt, right.requestedAt),
  );
}

function updateResourceCollection(
  requests: readonly ResourceRequest[],
  request: ResourceRequest,
): ResourceRequest[] {
  if (request.status !== "requested") {
    return requests.filter((candidate) => candidate.id !== request.id);
  }
  return replaceBy(requests, (candidate) => candidate.id, request).sort((left, right) =>
    compareAscendingTime(left.requestedAt, right.requestedAt),
  );
}

function upsertArtifact(
  artifacts: readonly WorkstreamArtifact[],
  artifact: WorkstreamArtifact,
): WorkstreamArtifact[] {
  return replaceBy(artifacts, (candidate) => candidate.id, artifact).sort((left, right) =>
    compareDescendingTime(left.updatedAt, right.updatedAt),
  );
}

function replaceBy<T>(items: readonly T[], keyOf: (item: T) => string, item: T): T[] {
  let replaced = false;
  const key = keyOf(item);
  const next = items.map((candidate) => {
    if (keyOf(candidate) !== key) {
      return candidate;
    }
    replaced = true;
    return item;
  });
  if (!replaced) {
    next.push(item);
  }
  return next;
}

function replaceManyBy<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  replacements: readonly T[],
): T[] {
  let next = [...items];
  for (const replacement of replacements) {
    next = replaceBy(next, keyOf, replacement);
  }
  return next;
}

function compareSemanticNodes(left: SemanticNode, right: SemanticNode): number {
  return compareAscendingTime(left.createdAt, right.createdAt) || left.id.localeCompare(right.id);
}

function compareSemanticEdges(left: SemanticEdge, right: SemanticEdge): number {
  return compareAscendingTime(left.createdAt, right.createdAt) || left.id.localeCompare(right.id);
}

function compareAscendingTime(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

function compareDescendingTime(left: string, right: string): number {
  return Date.parse(right) - Date.parse(left);
}
