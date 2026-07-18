import type {
  WorkspaceActivityEvent,
  WorkspaceActivityRecord,
  WorkspaceActivitySnapshot,
  WorkspaceActivityStatus,
} from "@generated/backend";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  registerWorkspaceActivityDebugSurface,
  type WorkspaceActivityDebugSnapshot,
} from "./workspace-activity-debug-registry";
import {
  projectWorkspaceActivityMarkerProjection,
  type WorkspaceActivityMarker,
  type WorkspaceActivityMarkerMaterialization,
  type WorkspaceActivityMarkerProjection,
} from "./workspace-activity-markers";
import type { WorkflowGraphGraph } from "./pixi-renderer";
import type { WorkflowGraphTarget } from "./workflow-graph-projection-state";

const defaultRetainedActivityLimit = 200;
const terminalReloadPollIntervalMs = 250;
const terminalReloadBackoffIntervalMs = 2000;
const terminalReloadFastAttempts = 40;
const graphSceneReplacementRenderFields = [
  "canvasCreationCount",
  "pixiAppCreationCount",
  "rendererDestroyCount",
  "rendererInstanceId",
  "rendererLayerCreationCount",
] as const;

interface WorkspaceActivityState {
  debug: WorkspaceActivityDebugSnapshot;
  records: WorkspaceActivityRecord[];
}

interface ApplyActivityEventResult {
  needsReload: boolean;
  state: WorkspaceActivityState;
}

export interface WorkflowGraphActivityProbeSnapshot {
  interaction?: {
    panningCamera?: boolean;
  };
  render?: {
    canvasCreationCount?: number;
    pixiAppCreationCount?: number;
    rendererDestroyCount?: number;
    rendererInstanceId?: string;
    rendererLayerCreationCount?: number;
  };
}

export function useWorkspaceActivityState({
  activityGraph,
  activityTarget,
  applyActivityMarkers,
  limit = defaultRetainedActivityLimit,
  readGraphDebugSnapshot,
  surfaceId,
  workspaceId,
}: {
  activityGraph?: WorkflowGraphGraph | null;
  activityTarget?: WorkflowGraphTarget | null;
  applyActivityMarkers?: (
    markers: readonly WorkspaceActivityMarker[],
  ) => WorkspaceActivityMarkerMaterialization | null;
  limit?: number;
  readGraphDebugSnapshot?: () => WorkflowGraphActivityProbeSnapshot | null;
  surfaceId: string;
  workspaceId: string;
}) {
  const stateRef = useRef(createInitialWorkspaceActivityState(workspaceId, limit));
  const activeWorkspaceRef = useRef(workspaceId);
  const loadedWorkspaceRef = useRef(workspaceId);
  const [reloadPending, setReloadPending] = useState(false);
  const activityGraphRef = useRef<WorkflowGraphGraph | null>(activityGraph ?? null);
  const activityTargetRef = useRef<WorkflowGraphTarget | null>(activityTarget ?? null);
  const applyActivityMarkersRef = useRef<typeof applyActivityMarkers>(applyActivityMarkers);
  const readGraphDebugSnapshotRef = useRef<typeof readGraphDebugSnapshot>(readGraphDebugSnapshot);
  activeWorkspaceRef.current = workspaceId;
  activityGraphRef.current = activityGraph ?? null;
  activityTargetRef.current = activityTarget ?? null;
  applyActivityMarkersRef.current = applyActivityMarkers;
  readGraphDebugSnapshotRef.current = readGraphDebugSnapshot;
  // Reload the activity record pool whenever the selected run changes so the pool holds
  // only the selected run's records (bounded by `limit`) and a different run's activity
  // can never crowd out the run the user is looking at.
  const selectedRunExecutionId = runTargetExecutionId(activityTarget ?? null);

  const syncMarkers = useCallback(() => {
    const materialize = applyActivityMarkersRef.current;
    if (!materialize) {
      return;
    }
    const projection = projectWorkspaceActivityMarkerProjection({
      graph: activityGraphRef.current,
      records: stateRef.current.records,
      target: activityTargetRef.current,
    });
    const materialization = materialize(projection.markers);
    if (materialization === null) {
      return;
    }
    stateRef.current = recordWorkspaceActivityMarkerMaterialization(
      stateRef.current,
      materialization,
      projection,
    );
  }, []);

  const loadSnapshot = useCallback(async () => {
    if (workspaceId === "") {
      stateRef.current = createInitialWorkspaceActivityState(workspaceId, limit);
      return;
    }
    // A run target reads the durable run-scoped snapshot so historical runs render
    // their persisted, run-scoped activity even after they are terminal. The
    // workspace-wide snapshot is bounded across every execution, so an older run's
    // chips can be evicted by newer activity; scoping to the selected execution keeps
    // them present. Draft (and no target) keeps the workspace-wide read.
    const executionId = runTargetExecutionId(activityTargetRef.current);
    try {
      stateRef.current = recordWorkspaceActivityBackendReadAttempt(
        stateRef.current,
        readWorkspaceActivityGraphProbe(readGraphDebugSnapshotRef.current),
      );
      const snapshot = await readActivitySnapshotForTarget(workspaceId, executionId, limit);
      if (
        activeWorkspaceRef.current !== workspaceId ||
        runTargetExecutionId(activityTargetRef.current) !== executionId
      ) {
        return;
      }
      stateRef.current = applyActivitySnapshotForTarget(
        stateRef.current,
        snapshot,
        executionId,
        limit,
      );
      syncMarkers();
    } catch (error: unknown) {
      stateRef.current = {
        ...stateRef.current,
        debug: {
          ...stateRef.current.debug,
          lastError: error instanceof Error ? error.message : "workspace activity snapshot failed",
        },
      };
    }
  }, [limit, syncMarkers, workspaceId]);

  useEffect(() => {
    if (!reloadPending) {
      return;
    }
    // A delta-driven reload is pending — either a resync/revision-gap recovery or a
    // terminal-run re-read. Re-read the snapshot, but never while the camera is moving (the
    // no-backend-reads-during-movement invariant). Camera pan-stop does not re-render this
    // hook, so poll on a timer until the camera settles instead of waiting for an unrelated
    // event. Poll quickly at first, then back off so a stuck panning flag cannot busy-spin —
    // but always keep deferring rather than forcing a read mid-movement.
    let cancelled = false;
    let timer = 0;
    let attempts = 0;
    const attempt = () => {
      if (cancelled) {
        return;
      }
      if (graphCameraMoving(readWorkspaceActivityGraphProbe(readGraphDebugSnapshotRef.current))) {
        const interval =
          attempts < terminalReloadFastAttempts
            ? terminalReloadPollIntervalMs
            : terminalReloadBackoffIntervalMs;
        attempts += 1;
        timer = window.setTimeout(attempt, interval);
        return;
      }
      setReloadPending(false);
      void loadSnapshot();
    };
    attempt();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadSnapshot, reloadPending]);

  useEffect(() => {
    // Reset only when the workspace changes. A run-selection change must NOT wipe the
    // pool: the active run is still streaming live deltas, and dropping them before the
    // durable run-scoped read returns would briefly clear its chips. The run-scoped load
    // path instead prunes the pool to the selected execution and merges the read.
    if (loadedWorkspaceRef.current !== workspaceId) {
      loadedWorkspaceRef.current = workspaceId;
      stateRef.current = createInitialWorkspaceActivityState(workspaceId, limit);
    }
    syncMarkers();
    void loadSnapshot();
  }, [limit, loadSnapshot, selectedRunExecutionId, syncMarkers, workspaceId]);

  useEffect(() => {
    return window.setta.workspaceActivity.onEvent((event) => {
      const previous = stateRef.current;
      const beforeGraph = readWorkspaceActivityGraphProbe(readGraphDebugSnapshotRef.current);
      const selectedExecutionId = runTargetExecutionId(activityTargetRef.current);
      const result = applyWorkspaceActivityEvent(previous, event, limit, selectedExecutionId);
      stateRef.current = result.state;
      const deltaApplied = result.state.debug.deltasApplied > previous.debug.deltasApplied;
      if (deltaApplied) {
        syncMarkers();
      }
      const afterGraph = readWorkspaceActivityGraphProbe(readGraphDebugSnapshotRef.current);
      stateRef.current = recordWorkspaceActivityDeltaInstrumentation({
        afterGraph,
        beforeGraph,
        deltaApplied,
        state: stateRef.current,
      });
      // Both a resync/revision-gap recovery and a terminal-run re-read need a backend
      // snapshot read. Request it through the deferred flag so neither reads while the camera
      // is moving; the deferred effect above performs the read once the camera is idle.
      const reloadRequested =
        result.needsReload ||
        (deltaApplied && selectedRunReachedTerminal(event, activityTargetRef.current));
      if (reloadRequested) {
        setReloadPending(true);
      }
    });
  }, [limit, syncMarkers]);

  useEffect(() => {
    syncMarkers();
  }, [activityGraph, activityTarget, syncMarkers]);

  useEffect(() => {
    return registerWorkspaceActivityDebugSurface(surfaceId, () => stateRef.current.debug);
  }, [surfaceId]);

  return { syncMarkers };
}

function runTargetExecutionId(target: WorkflowGraphTarget | null): string {
  return target?.kind === "run" ? target.executionId : "";
}

function readActivitySnapshotForTarget(
  workspaceId: string,
  executionId: string,
  limit: number,
): Promise<WorkspaceActivitySnapshot> {
  return executionId === ""
    ? window.setta.workspaceActivity.snapshot(workspaceId, limit)
    : window.setta.workspaceActivity.executionSnapshot(workspaceId, executionId, limit);
}

function readWorkspaceActivityGraphProbe(
  readGraphDebugSnapshot: (() => WorkflowGraphActivityProbeSnapshot | null) | undefined,
): WorkflowGraphActivityProbeSnapshot | null {
  return readGraphDebugSnapshot?.() ?? null;
}

function applyActivitySnapshotForTarget(
  state: WorkspaceActivityState,
  snapshot: WorkspaceActivitySnapshot,
  executionId: string,
  limit: number,
): WorkspaceActivityState {
  return executionId === ""
    ? applyWorkspaceActivitySnapshot(state, snapshot, limit)
    : mergeWorkspaceActivityExecutionSnapshot(state, snapshot, executionId, limit);
}

const executionTerminalActivityStatuses = new Set<WorkspaceActivityStatus>([
  "completed",
  "failed",
  "cancelled",
]);

// selectedRunReachedTerminal reports whether a live delta marks the selected run's
// execution as finished. It only fires for the execution-level terminal record (the run
// itself completing/failing/cancelling), not per-node terminal events, so a normal run
// triggers at most one durable re-read when it ends rather than one per finished node.
export function selectedRunReachedTerminal(
  event: WorkspaceActivityEvent,
  target: WorkflowGraphTarget | null,
): boolean {
  if (target?.kind !== "run") {
    return false;
  }
  const activity = executionLevelTerminalActivity(event);
  return activity !== null && activityExecutionId(activity) === target.executionId;
}

function executionLevelTerminalActivity(
  event: WorkspaceActivityEvent,
): WorkspaceActivityRecord | null {
  const activity = event.delta?.activity ?? null;
  if (activity === null || activity.kind !== "workflow_status") {
    return null;
  }
  if (!executionTerminalActivityStatuses.has(activity.status)) {
    return null;
  }
  return activity.graphAnchor?.kind === "workflow_node" ? null : activity;
}

function activityExecutionId(activity: WorkspaceActivityRecord): string {
  return (
    activity.graphAnchor?.workflowExecutionId ||
    activity.provenance.workflowExecutionId ||
    activity.detailRef.workflowExecutionId
  );
}

export function createInitialWorkspaceActivityState(
  workspaceId: string,
  limit = defaultRetainedActivityLimit,
): WorkspaceActivityState {
  return {
    debug: emptyWorkspaceActivityDebugSnapshot(workspaceId, limit),
    records: [],
  };
}

export function applyWorkspaceActivitySnapshot(
  previous: WorkspaceActivityState,
  snapshot: WorkspaceActivitySnapshot,
  limit = defaultRetainedActivityLimit,
): WorkspaceActivityState {
  const records = boundedActivityRecords(snapshot.activities, limit);
  return {
    debug: {
      ...previous.debug,
      lastError: null,
      lastRevision: snapshot.revision,
      lastSequence: snapshot.sequence,
      lastStreamId: snapshot.streamId,
      recordsRetained: records.length,
      snapshotsLoaded: previous.debug.snapshotsLoaded + 1,
      workspaceId: snapshot.workspaceId,
    },
    records,
  };
}

// mergeWorkspaceActivityExecutionSnapshot folds a durable run-scoped snapshot into the
// live pool without discarding the records the active run is still streaming. It keeps
// only the selected execution's records from the previous pool (so a different run's
// activity cannot crowd the bounded pool out from under the selected run) and upserts the
// snapshot on top, adding persisted/terminal records the workspace-wide stream may have
// evicted or suppressed.
export function mergeWorkspaceActivityExecutionSnapshot(
  previous: WorkspaceActivityState,
  snapshot: WorkspaceActivitySnapshot,
  executionId: string,
  limit = defaultRetainedActivityLimit,
): WorkspaceActivityState {
  const byId = new Map<string, WorkspaceActivityRecord>();
  for (const record of previous.records) {
    if (recordBelongsToExecution(record, executionId)) {
      byId.set(record.activityId, record);
    }
  }
  for (const record of snapshot.activities) {
    byId.set(record.activityId, record);
  }
  const records = boundedActivityRecords([...byId.values()], limit);
  return {
    debug: {
      ...previous.debug,
      lastError: null,
      lastRevision: snapshot.revision,
      lastSequence: snapshot.sequence,
      lastStreamId: snapshot.streamId,
      recordsRetained: records.length,
      snapshotsLoaded: previous.debug.snapshotsLoaded + 1,
      workspaceId: snapshot.workspaceId,
    },
    records,
  };
}

function recordBelongsToExecution(record: WorkspaceActivityRecord, executionId: string): boolean {
  return (
    record.graphAnchor?.workflowExecutionId === executionId ||
    record.provenance.workflowExecutionId === executionId ||
    record.detailRef.workflowExecutionId === executionId
  );
}

export function applyWorkspaceActivityEvent(
  previous: WorkspaceActivityState,
  event: WorkspaceActivityEvent,
  limit = defaultRetainedActivityLimit,
  selectedExecutionId = "",
): ApplyActivityEventResult {
  if (eventIsForeignWorkspace(previous, event)) {
    return { needsReload: false, state: previous };
  }
  if (event.type === "workspace_activity.resync_required") {
    return { needsReload: true, state: advanceCursorState(previous, event, true) };
  }
  const activity = upsertActivityFromEvent(event);
  if (activity === null) {
    return { needsReload: false, state: previous };
  }
  // Check for a real revision gap before dropping foreign-execution deltas. A genuine stream
  // loss must always reload (the reload re-fetches the selected run's run-scoped snapshot,
  // recovering its records) regardless of which execution's event first exposed the gap;
  // otherwise a foreign event landing first after a loss would silently advance past it.
  if (hasRevisionGap(previous.debug.lastRevision, event.revision)) {
    return { needsReload: true, state: advanceCursorState(previous, event, true) };
  }
  // While a run is selected, advance the stream cursor for contiguous deltas from other
  // executions (so normal interleaving is not later mistaken for a gap) but do not store
  // them. This keeps the bounded pool scoped to the viewed run so a chatty parallel run
  // cannot evict its persisted/terminal chips.
  if (recordIsForeignExecution(activity, selectedExecutionId)) {
    return { needsReload: false, state: advanceCursorState(previous, event, false) };
  }
  const records = upsertActivityRecord(previous.records, activity, limit);
  return {
    needsReload: false,
    state: {
      debug: {
        ...previous.debug,
        deltasApplied: previous.debug.deltasApplied + 1,
        lastError: null,
        lastRevision: event.revision,
        lastSequence: event.sequence,
        lastStreamId: event.streamId,
        recordsRetained: records.length,
      },
      records,
    },
  };
}

function eventIsForeignWorkspace(
  previous: WorkspaceActivityState,
  event: WorkspaceActivityEvent,
): boolean {
  return event.workspaceId !== "" && event.workspaceId !== previous.debug.workspaceId;
}

function recordIsForeignExecution(
  activity: WorkspaceActivityRecord,
  selectedExecutionId: string,
): boolean {
  return selectedExecutionId !== "" && !recordBelongsToExecution(activity, selectedExecutionId);
}

function upsertActivityFromEvent(event: WorkspaceActivityEvent): WorkspaceActivityRecord | null {
  if (event.delta === null || event.delta.kind !== "upsert" || event.delta.activity === null) {
    return null;
  }
  return event.delta.activity;
}

function advanceCursorState(
  previous: WorkspaceActivityState,
  event: WorkspaceActivityEvent,
  countReload: boolean,
): WorkspaceActivityState {
  return {
    ...previous,
    debug: {
      ...previous.debug,
      lastRevision: event.revision,
      lastSequence: event.sequence,
      lastStreamId: event.streamId,
      revisionGapReloads: previous.debug.revisionGapReloads + (countReload ? 1 : 0),
    },
  };
}

export function recordWorkspaceActivityBackendReadAttempt(
  state: WorkspaceActivityState,
  graphSnapshot: WorkflowGraphActivityProbeSnapshot | null,
): WorkspaceActivityState {
  return {
    ...state,
    debug: {
      ...state.debug,
      backendReadCameraMovementCheckCount: state.debug.backendReadCameraMovementCheckCount + 1,
      backendReadsDuringCameraMovement:
        state.debug.backendReadsDuringCameraMovement + (graphCameraMoving(graphSnapshot) ? 1 : 0),
    },
  };
}

export function recordWorkspaceActivityDeltaInstrumentation({
  afterGraph,
  beforeGraph,
  deltaApplied,
  state,
}: {
  afterGraph: WorkflowGraphActivityProbeSnapshot | null;
  beforeGraph: WorkflowGraphActivityProbeSnapshot | null;
  deltaApplied: boolean;
  state: WorkspaceActivityState;
}): WorkspaceActivityState {
  if (!deltaApplied) {
    return state;
  }
  const cameraMoving = graphCameraMoving(beforeGraph) || graphCameraMoving(afterGraph);
  const hasSceneProbe = beforeGraph !== null && afterGraph !== null;
  return {
    ...state,
    debug: {
      ...state.debug,
      activityDeltasDuringCameraMovement:
        state.debug.activityDeltasDuringCameraMovement + (cameraMoving ? 1 : 0),
      graphSceneReplacementCheckCount:
        state.debug.graphSceneReplacementCheckCount + (hasSceneProbe ? 1 : 0),
      graphSceneReplacementTouched:
        state.debug.graphSceneReplacementTouched ||
        (hasSceneProbe && graphSceneReplacementDetected(beforeGraph, afterGraph)),
    },
  };
}

function emptyWorkspaceActivityDebugSnapshot(
  workspaceId: string,
  limit: number,
): WorkspaceActivityDebugSnapshot {
  return {
    activityDeltasDuringCameraMovement: 0,
    backendReadCameraMovementCheckCount: 0,
    backendReadsDuringCameraMovement: 0,
    deltasApplied: 0,
    graphSceneReplacementCheckCount: 0,
    graphSceneReplacementTouched: false,
    lastError: null,
    lastRevision: 0,
    lastSequence: 0,
    lastStreamId: "",
    markerCreatedCount: 0,
    markerRemovedCount: 0,
    markerRetainedCount: 0,
    markerUpdatedCount: 0,
    markers: [],
    recordsRetained: 0,
    retainedLimit: limit,
    revisionGapReloads: 0,
    snapshotsLoaded: 0,
    suppressedUnanchoredActivityCount: 0,
    suppressedUnanchoredActivityIds: [],
    workspaceId,
  };
}

export function recordWorkspaceActivityMarkerMaterialization(
  state: WorkspaceActivityState,
  materialization: WorkspaceActivityMarkerMaterialization,
  projection: WorkspaceActivityMarkerProjection,
): WorkspaceActivityState {
  return {
    ...state,
    debug: {
      ...state.debug,
      markerCreatedCount: state.debug.markerCreatedCount + materialization.created,
      markerRemovedCount: state.debug.markerRemovedCount + materialization.removed,
      markerRetainedCount: state.debug.markerRetainedCount + materialization.retained,
      markerUpdatedCount: state.debug.markerUpdatedCount + materialization.updated,
      markers: projection.markers.map((marker) => ({ ...marker })),
      suppressedUnanchoredActivityCount: projection.suppressedUnanchoredActivityCount,
      suppressedUnanchoredActivityIds: [...projection.suppressedUnanchoredActivityIds],
    },
  };
}

function graphCameraMoving(graphSnapshot: WorkflowGraphActivityProbeSnapshot | null) {
  return graphSnapshot?.interaction?.panningCamera === true;
}

function graphSceneReplacementDetected(
  beforeGraph: WorkflowGraphActivityProbeSnapshot,
  afterGraph: WorkflowGraphActivityProbeSnapshot,
) {
  return graphSceneReplacementRenderFields.some(
    (field) => beforeGraph.render?.[field] !== afterGraph.render?.[field],
  );
}

function hasRevisionGap(previousRevision: number, nextRevision: number) {
  return previousRevision > 0 && nextRevision > previousRevision + 1;
}

function upsertActivityRecord(
  records: WorkspaceActivityRecord[],
  next: WorkspaceActivityRecord,
  limit: number,
) {
  const byId = new Map(records.map((record) => [record.activityId, record]));
  byId.set(next.activityId, next);
  return boundedActivityRecords([...byId.values()], limit);
}

function boundedActivityRecords(records: WorkspaceActivityRecord[], limit: number) {
  const normalizedLimit = Math.max(1, limit);
  return [...records]
    .sort((left, right) => compareActivityRecordsDescending(left, right))
    .slice(0, normalizedLimit);
}

function compareActivityRecordsDescending(
  left: WorkspaceActivityRecord,
  right: WorkspaceActivityRecord,
) {
  const leftTime = left.updatedAt || left.occurredAt;
  const rightTime = right.updatedAt || right.occurredAt;
  if (leftTime === rightTime) {
    return left.activityId.localeCompare(right.activityId);
  }
  return rightTime.localeCompare(leftTime);
}
