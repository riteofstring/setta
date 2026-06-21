import type {
  WorkspaceActivityEvent,
  WorkspaceActivityRecord,
  WorkspaceActivitySnapshot,
} from "@generated/backend";
import { useCallback, useEffect, useRef } from "react";

import {
  registerWorkspaceActivityDebugSurface,
  type WorkspaceActivityDebugSnapshot,
} from "./workspace-activity-debug-registry";
import {
  projectWorkspaceActivityMarkers,
  type WorkspaceActivityMarker,
  type WorkspaceActivityMarkerMaterialization,
} from "./workspace-activity-markers";
import type { WorkflowGraphGraph } from "./pixi-renderer";

const defaultRetainedActivityLimit = 200;
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
  applyActivityMarkers,
  limit = defaultRetainedActivityLimit,
  readGraphDebugSnapshot,
  surfaceId,
  workspaceId,
}: {
  activityGraph?: WorkflowGraphGraph | null;
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
  const activityGraphRef = useRef<WorkflowGraphGraph | null>(activityGraph ?? null);
  const applyActivityMarkersRef = useRef<typeof applyActivityMarkers>(applyActivityMarkers);
  const readGraphDebugSnapshotRef = useRef<typeof readGraphDebugSnapshot>(readGraphDebugSnapshot);
  activeWorkspaceRef.current = workspaceId;
  activityGraphRef.current = activityGraph ?? null;
  applyActivityMarkersRef.current = applyActivityMarkers;
  readGraphDebugSnapshotRef.current = readGraphDebugSnapshot;

  const syncMarkers = useCallback(() => {
    const materialize = applyActivityMarkersRef.current;
    if (!materialize) {
      return;
    }
    const markers = projectWorkspaceActivityMarkers({
      graph: activityGraphRef.current,
      records: stateRef.current.records,
    });
    const materialization = materialize(markers);
    if (materialization === null) {
      return;
    }
    stateRef.current = recordWorkspaceActivityMarkerMaterialization(
      stateRef.current,
      materialization,
      markers,
    );
  }, []);

  const loadSnapshot = useCallback(async () => {
    if (workspaceId === "") {
      stateRef.current = createInitialWorkspaceActivityState(workspaceId, limit);
      return;
    }
    try {
      stateRef.current = recordWorkspaceActivityBackendReadAttempt(
        stateRef.current,
        readGraphDebugSnapshotRef.current?.() ?? null,
      );
      const snapshot = await window.setta.workspaceActivity.snapshot(workspaceId, limit);
      if (activeWorkspaceRef.current !== workspaceId) {
        return;
      }
      stateRef.current = applyWorkspaceActivitySnapshot(stateRef.current, snapshot, limit);
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
    stateRef.current = createInitialWorkspaceActivityState(workspaceId, limit);
    syncMarkers();
    void loadSnapshot();
  }, [limit, loadSnapshot, syncMarkers, workspaceId]);

  useEffect(() => {
    return window.setta.workspaceActivity.onEvent((event) => {
      const previous = stateRef.current;
      const beforeGraph = readGraphDebugSnapshotRef.current?.() ?? null;
      const result = applyWorkspaceActivityEvent(previous, event, limit);
      stateRef.current = result.state;
      if (result.state.debug.deltasApplied > previous.debug.deltasApplied) {
        syncMarkers();
      }
      const afterGraph = readGraphDebugSnapshotRef.current?.() ?? null;
      stateRef.current = recordWorkspaceActivityDeltaInstrumentation({
        afterGraph,
        beforeGraph,
        deltaApplied: result.state.debug.deltasApplied > previous.debug.deltasApplied,
        state: stateRef.current,
      });
      if (result.needsReload) {
        void loadSnapshot();
      }
    });
  }, [limit, loadSnapshot, syncMarkers]);

  useEffect(() => {
    syncMarkers();
  }, [activityGraph, syncMarkers]);

  useEffect(() => {
    return registerWorkspaceActivityDebugSurface(surfaceId, () => stateRef.current.debug);
  }, [surfaceId]);

  return { syncMarkers };
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

export function applyWorkspaceActivityEvent(
  previous: WorkspaceActivityState,
  event: WorkspaceActivityEvent,
  limit = defaultRetainedActivityLimit,
): ApplyActivityEventResult {
  if (event.workspaceId !== "" && event.workspaceId !== previous.debug.workspaceId) {
    return { needsReload: false, state: previous };
  }
  if (event.type === "workspace_activity.resync_required") {
    return {
      needsReload: true,
      state: {
        ...previous,
        debug: {
          ...previous.debug,
          lastRevision: event.revision,
          lastSequence: event.sequence,
          lastStreamId: event.streamId,
          revisionGapReloads: previous.debug.revisionGapReloads + 1,
        },
      },
    };
  }
  if (event.delta === null || event.delta.kind !== "upsert" || event.delta.activity === null) {
    return { needsReload: false, state: previous };
  }
  if (hasRevisionGap(previous.debug.lastRevision, event.revision)) {
    return {
      needsReload: true,
      state: {
        ...previous,
        debug: {
          ...previous.debug,
          lastRevision: event.revision,
          lastSequence: event.sequence,
          lastStreamId: event.streamId,
          revisionGapReloads: previous.debug.revisionGapReloads + 1,
        },
      },
    };
  }
  const records = upsertActivityRecord(previous.records, event.delta.activity, limit);
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
    workspaceId,
  };
}

export function recordWorkspaceActivityMarkerMaterialization(
  state: WorkspaceActivityState,
  materialization: WorkspaceActivityMarkerMaterialization,
  markers: readonly WorkspaceActivityMarker[],
): WorkspaceActivityState {
  return {
    ...state,
    debug: {
      ...state.debug,
      markerCreatedCount: state.debug.markerCreatedCount + materialization.created,
      markerRemovedCount: state.debug.markerRemovedCount + materialization.removed,
      markerRetainedCount: state.debug.markerRetainedCount + materialization.retained,
      markerUpdatedCount: state.debug.markerUpdatedCount + materialization.updated,
      markers: markers.map((marker) => ({ ...marker })),
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
