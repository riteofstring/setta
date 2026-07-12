import { describe, expect, test } from "vitest";

import type {
  WorkspaceActivityEvent,
  WorkspaceActivityRecord,
  WorkspaceActivityStatus,
} from "@generated/backend";
import {
  applyWorkspaceActivityEvent,
  applyWorkspaceActivitySnapshot,
  createInitialWorkspaceActivityState,
  mergeWorkspaceActivityExecutionSnapshot,
  recordWorkspaceActivityMarkerMaterialization,
  recordWorkspaceActivityBackendReadAttempt,
  recordWorkspaceActivityDeltaInstrumentation,
  selectedRunReachedTerminal,
} from "./workspace-activity-state";
import type { WorkflowGraphTarget } from "./workflow-graph-projection-state";

describe("workspace activity state", () => {
  test("loads bounded snapshots with marker counters at zero before materialization", () => {
    const initial = createInitialWorkspaceActivityState("workspace_a", 2);
    const state = applyWorkspaceActivitySnapshot(
      initial,
      {
        activities: [
          activityRecord("old", 5, "2026-06-21T12:00:00Z"),
          activityRecord("new", 5, "2026-06-21T12:01:00Z"),
          activityRecord("newer", 5, "2026-06-21T12:02:00Z"),
        ],
        revision: 5,
        schemaVersion: 1,
        sequence: 9,
        streamId: "workspace_activity_stream",
        workspaceId: "workspace_a",
      },
      2,
    );

    expect(state.records.map((record) => record.activityId)).toEqual(["newer", "new"]);
    expect(state.debug).toMatchObject({
      activityDeltasDuringCameraMovement: 0,
      backendReadCameraMovementCheckCount: 0,
      backendReadsDuringCameraMovement: 0,
      deltasApplied: 0,
      graphSceneReplacementCheckCount: 0,
      graphSceneReplacementTouched: false,
      markerCreatedCount: 0,
      markerRemovedCount: 0,
      markerRetainedCount: 0,
      markerUpdatedCount: 0,
      markers: [],
      recordsRetained: 2,
      snapshotsLoaded: 1,
      suppressedUnanchoredActivityCount: 0,
      suppressedUnanchoredActivityIds: [],
    });
  });

  test("applies workspace-filtered upsert deltas without marker work before materialization", () => {
    const initial = applyWorkspaceActivitySnapshot(
      createInitialWorkspaceActivityState("workspace_a", 3),
      {
        activities: [activityRecord("command", 1, "2026-06-21T12:00:00Z")],
        revision: 1,
        schemaVersion: 1,
        sequence: 1,
        streamId: "workspace_activity_stream",
        workspaceId: "workspace_a",
      },
      3,
    );
    const ignored = applyWorkspaceActivityEvent(
      initial,
      activityEvent(activityRecord("other", 2, "2026-06-21T12:01:00Z", "workspace_b"), 2),
      3,
    );
    expect(ignored.state).toBe(initial);

    const applied = applyWorkspaceActivityEvent(
      initial,
      activityEvent(activityRecord("command", 2, "2026-06-21T12:01:00Z"), 2),
      3,
    );

    expect(applied.needsReload).toBe(false);
    expect(applied.state.records).toHaveLength(1);
    expect(applied.state.records[0]?.revision).toBe(2);
    expect(applied.state.debug).toMatchObject({
      activityDeltasDuringCameraMovement: 0,
      deltasApplied: 1,
      graphSceneReplacementCheckCount: 0,
      markerCreatedCount: 0,
      markerRemovedCount: 0,
      markerRetainedCount: 0,
      markerUpdatedCount: 0,
      markers: [],
      recordsRetained: 1,
      suppressedUnanchoredActivityCount: 0,
      suppressedUnanchoredActivityIds: [],
    });
  });

  test("records marker materialization counters and debug-readable markers", () => {
    const initial = createInitialWorkspaceActivityState("workspace_a", 3);
    const marker = {
      activityId: "activity_command",
      active: true,
      anchorKind: "workflow_node" as const,
      detailRef: {
        approvalId: "",
        kind: "chat_run_item" as const,
        runItemId: "run_item_command",
        workflowEventId: "",
      },
      id: "workspace-activity:node:work:command",
      kind: "command" as const,
      label: "Command running npm test",
      laneIndex: -1,
      nodeId: "work",
      revision: 4,
      slotIndex: 1,
      status: "running" as const,
      updatedAt: "2026-06-21T12:03:00Z",
    };

    const state = recordWorkspaceActivityMarkerMaterialization(
      initial,
      { created: 1, removed: 0, retained: 2, updated: 3 },
      {
        markers: [marker],
        suppressedUnanchoredActivityCount: 2,
        suppressedUnanchoredActivityIds: ["activity_execution", "activity_workspace"],
      },
    );

    expect(state.debug).toMatchObject({
      markerCreatedCount: 1,
      markerRemovedCount: 0,
      markerRetainedCount: 2,
      markerUpdatedCount: 3,
      markers: [marker],
      suppressedUnanchoredActivityCount: 2,
      suppressedUnanchoredActivityIds: ["activity_execution", "activity_workspace"],
    });
  });

  test("flags resync and revision gaps for snapshot reload", () => {
    const initial = applyWorkspaceActivitySnapshot(
      createInitialWorkspaceActivityState("workspace_a", 3),
      {
        activities: [],
        revision: 3,
        schemaVersion: 1,
        sequence: 3,
        streamId: "workspace_activity_stream",
        workspaceId: "workspace_a",
      },
      3,
    );

    const gap = applyWorkspaceActivityEvent(
      initial,
      activityEvent(activityRecord("later", 5, "2026-06-21T12:03:00Z"), 5),
      3,
    );
    expect(gap.needsReload).toBe(true);
    expect(gap.state.debug.revisionGapReloads).toBe(1);

    const resync = applyWorkspaceActivityEvent(initial, resyncEvent(), 3);
    expect(resync.needsReload).toBe(true);
    expect(resync.state.debug.revisionGapReloads).toBe(1);
  });

  test("records backend reads attempted while camera movement is active", () => {
    const initial = createInitialWorkspaceActivityState("workspace_a", 3);

    const unknown = recordWorkspaceActivityBackendReadAttempt(initial, null);
    expect(unknown.debug.backendReadCameraMovementCheckCount).toBe(1);
    expect(unknown.debug.backendReadsDuringCameraMovement).toBe(0);

    const idle = recordWorkspaceActivityBackendReadAttempt(unknown, graphProbe(false));
    expect(idle.debug.backendReadCameraMovementCheckCount).toBe(2);
    expect(idle.debug.backendReadsDuringCameraMovement).toBe(0);

    const moving = recordWorkspaceActivityBackendReadAttempt(idle, graphProbe(true));
    expect(moving.debug.backendReadCameraMovementCheckCount).toBe(3);
    expect(moving.debug.backendReadsDuringCameraMovement).toBe(1);
  });

  test("records camera-movement deltas and graph replacement probes", () => {
    const initial = createInitialWorkspaceActivityState("workspace_a", 3);
    const state = recordWorkspaceActivityDeltaInstrumentation({
      afterGraph: graphProbe(true),
      beforeGraph: graphProbe(true),
      deltaApplied: true,
      state: initial,
    });

    expect(state.debug.activityDeltasDuringCameraMovement).toBe(1);
    expect(state.debug.graphSceneReplacementCheckCount).toBe(1);
    expect(state.debug.graphSceneReplacementTouched).toBe(false);

    const replaced = recordWorkspaceActivityDeltaInstrumentation({
      afterGraph: graphProbe(false, { rendererInstanceId: "renderer_next" }),
      beforeGraph: graphProbe(false, { rendererInstanceId: "renderer_initial" }),
      deltaApplied: true,
      state,
    });
    expect(replaced.debug.graphSceneReplacementTouched).toBe(true);
  });

  test("merges a run-scoped snapshot, keeping the selected run's live records and dropping others", () => {
    const afterA = applyWorkspaceActivityEvent(
      createInitialWorkspaceActivityState("workspace_a", 50),
      activityEvent(executionRecord("run_a_cmd", "execution_run", 1, "2026-06-21T12:00:00Z"), 1),
      50,
    );
    const streamed = applyWorkspaceActivityEvent(
      afterA.state,
      activityEvent(executionRecord("run_b_cmd", "execution_other", 2, "2026-06-21T12:00:01Z"), 2),
      50,
    );
    expect(streamed.state.records).toHaveLength(2);

    const merged = mergeWorkspaceActivityExecutionSnapshot(
      streamed.state,
      {
        activities: [executionRecord("run_a_terminal", "execution_run", 3, "2026-06-21T12:00:05Z")],
        revision: 3,
        schemaVersion: 1,
        sequence: 3,
        streamId: "workspace_activity_stream",
        workspaceId: "workspace_a",
      },
      "execution_run",
      50,
    );

    // The selected run's streamed record survives the read (so an active run never loses
    // its live chips), the durable snapshot record is added, and the other run is pruned.
    expect(merged.records.map((record) => record.activityId).sort()).toEqual([
      "run_a_cmd",
      "run_a_terminal",
    ]);
    expect(merged.debug.snapshotsLoaded).toBe(1);
    expect(merged.debug.recordsRetained).toBe(2);
  });

  test("scopes stored deltas to the selected run while advancing the stream cursor", () => {
    const initial = applyWorkspaceActivitySnapshot(
      createInitialWorkspaceActivityState("workspace_a", 50),
      {
        activities: [executionRecord("run_a_cmd", "execution_run", 1, "2026-06-21T12:00:00Z")],
        revision: 1,
        schemaVersion: 1,
        sequence: 1,
        streamId: "workspace_activity_stream",
        workspaceId: "workspace_a",
      },
      50,
    );

    // A delta for a different execution must not enter the bounded pool (so it cannot evict
    // the viewed run's chips), but must still advance the cursor.
    const otherRun = applyWorkspaceActivityEvent(
      initial,
      activityEvent(executionRecord("run_b_cmd", "execution_other", 2, "2026-06-21T12:00:01Z"), 2),
      50,
      "execution_run",
    );
    expect(otherRun.needsReload).toBe(false);
    expect(otherRun.state.records.map((record) => record.activityId)).toEqual(["run_a_cmd"]);
    expect(otherRun.state.debug.deltasApplied).toBe(0);
    expect(otherRun.state.debug.lastRevision).toBe(2);

    // Because the cursor advanced, the next selected-run delta (revision 3) is not mistaken
    // for a revision gap and applies normally.
    const selectedRun = applyWorkspaceActivityEvent(
      otherRun.state,
      activityEvent(executionRecord("run_a_more", "execution_run", 3, "2026-06-21T12:00:02Z"), 3),
      50,
      "execution_run",
    );
    expect(selectedRun.needsReload).toBe(false);
    expect(selectedRun.state.records.map((record) => record.activityId).sort()).toEqual([
      "run_a_cmd",
      "run_a_more",
    ]);
    expect(selectedRun.state.debug.deltasApplied).toBe(1);
  });

  test("reloads on a real revision gap even when a foreign-execution delta exposes it", () => {
    const initial = applyWorkspaceActivitySnapshot(
      createInitialWorkspaceActivityState("workspace_a", 50),
      {
        activities: [executionRecord("run_a_cmd", "execution_run", 1, "2026-06-21T12:00:00Z")],
        revision: 1,
        schemaVersion: 1,
        sequence: 1,
        streamId: "workspace_activity_stream",
        workspaceId: "workspace_a",
      },
      50,
    );

    // A genuine stream loss (revision jumps 1 -> 4) whose first post-loss delta is a foreign
    // execution must still reload, so the gap check is not bypassed by foreign-delta dropping.
    const gapped = applyWorkspaceActivityEvent(
      initial,
      activityEvent(executionRecord("run_b_cmd", "execution_other", 4, "2026-06-21T12:00:04Z"), 4),
      50,
      "execution_run",
    );
    expect(gapped.needsReload).toBe(true);
    expect(gapped.state.debug.revisionGapReloads).toBe(1);
  });

  test("re-reads the durable snapshot only when the selected run's execution finishes", () => {
    const runTarget: WorkflowGraphTarget = {
      definitionId: "definition_a",
      executionId: "execution_run",
      kind: "run",
      versionId: "version_a",
      workspaceId: "workspace_a",
    };

    expect(
      selectedRunReachedTerminal(
        workflowStatusEvent("workflow_event:cancelled", "cancelled", "execution_run", "execution"),
        runTarget,
      ),
    ).toBe(true);

    // A per-node terminal event must not trigger a run-scoped reload; only the
    // execution-level terminal record does, so a normal run re-reads at most once.
    expect(
      selectedRunReachedTerminal(
        workflowStatusEvent("workflow_event:node_done", "completed", "execution_run", "node"),
        runTarget,
      ),
    ).toBe(false);

    // Still-running and other-execution deltas, plus a draft target, never reload.
    expect(
      selectedRunReachedTerminal(
        workflowStatusEvent("workflow_event:running", "running", "execution_run", "execution"),
        runTarget,
      ),
    ).toBe(false);
    expect(
      selectedRunReachedTerminal(
        workflowStatusEvent("workflow_event:other", "failed", "execution_other", "execution"),
        runTarget,
      ),
    ).toBe(false);
    expect(
      selectedRunReachedTerminal(
        workflowStatusEvent("workflow_event:cancelled", "cancelled", "execution_run", "execution"),
        { definitionId: "definition_a", kind: "draft", workspaceId: "workspace_a" },
      ),
    ).toBe(false);
  });
});

function workflowStatusEvent(
  activityId: string,
  status: WorkspaceActivityStatus,
  executionId: string,
  anchorKind: "execution" | "node",
): WorkspaceActivityEvent {
  const record = activityRecord(activityId, 5, "2026-06-21T12:05:00Z");
  return activityEvent(
    {
      ...record,
      graphAnchor: {
        kind: anchorKind === "node" ? "workflow_node" : "workflow_execution",
        workflowDefinitionId: "definition_a",
        workflowDefinitionVersionId: "version_a",
        workflowExecutionId: executionId,
        workflowNodeExecutionId: anchorKind === "node" ? "node_execution_a" : "",
        workflowNodeId: anchorKind === "node" ? "node_a" : "",
      },
      kind: "workflow_status",
      status,
      workflow: {
        eventId: activityId,
        eventType: "workflow.execution.cancelled",
        message: "",
        runnerKind: null,
      },
    },
    5,
  );
}

function activityEvent(record: WorkspaceActivityRecord, revision: number): WorkspaceActivityEvent {
  return {
    delta: {
      activity: record,
      activityId: record.activityId,
      kind: "upsert",
    },
    emittedAt: "2026-06-21T12:00:01Z",
    eventId: `workspace_activity_stream:${revision}`,
    resync: null,
    revision,
    schemaVersion: 1,
    sequence: revision,
    streamId: "workspace_activity_stream",
    type: "workspace_activity.delta",
    workspaceId: record.workspaceId,
  };
}

function resyncEvent(): WorkspaceActivityEvent {
  return {
    delta: null,
    emittedAt: "2026-06-21T12:00:02Z",
    eventId: "workspace_activity_stream:4",
    resync: {
      currentRevision: 4,
      currentSequence: 4,
      currentStreamId: "workspace_activity_stream",
      earliestSequence: 4,
      reason: "workspace activity replay is no longer available",
      requestedSequence: 1,
      requestedStreamId: "workspace_activity_stream",
    },
    revision: 4,
    schemaVersion: 1,
    sequence: 4,
    streamId: "workspace_activity_stream",
    type: "workspace_activity.resync_required",
    workspaceId: "workspace_a",
  };
}

function graphProbe(panningCamera: boolean, renderOverrides: { rendererInstanceId?: string } = {}) {
  return {
    interaction: { panningCamera },
    render: {
      canvasCreationCount: 1,
      pixiAppCreationCount: 1,
      rendererDestroyCount: 0,
      rendererInstanceId: "renderer_initial",
      rendererLayerCreationCount: 1,
      ...renderOverrides,
    },
  };
}

function executionRecord(
  activityId: string,
  executionId: string,
  revision: number,
  updatedAt: string,
): WorkspaceActivityRecord {
  const base = activityRecord(activityId, revision, updatedAt);
  return {
    ...base,
    provenance: { ...base.provenance, workflowExecutionId: executionId },
  };
}

function activityRecord(
  activityId: string,
  revision: number,
  updatedAt: string,
  workspaceId = "workspace_a",
): WorkspaceActivityRecord {
  return {
    activityId,
    approval: null,
    command: {
      commandPreview: "npm test",
      cwd: "/tmp/workspace",
      durationMs: null,
      exitCode: null,
      runItemStatus: "running",
    },
    detailRef: {
      approvalId: "",
      conversationId: "conversation_a",
      kind: "chat_run_item",
      runId: "run_a",
      runItemId: activityId,
      workflowEventId: "",
      workflowExecutionId: "",
      workspaceId,
    },
    fileChange: null,
    graphAnchor: null,
    kind: "command",
    occurredAt: "2026-06-21T12:00:00Z",
    provenance: {
      chatConversationId: "conversation_a",
      chatEventId: "",
      chatEventSequence: 0,
      chatEventStreamId: "",
      chatMessageId: "",
      chatRunId: "run_a",
      providerItemId: "provider_item_a",
      runItemId: activityId,
      runnerEventId: "",
      runnerEventOrdinal: 0,
      runnerEventType: null,
      workflowDefinitionId: "",
      workflowDefinitionVersionId: "",
      workflowEventId: "",
      workflowEventOrdinal: 0,
      workflowEventStreamId: "",
      workflowEventStreamSequence: null,
      workflowEventType: null,
      workflowExecutionId: "",
      workflowNodeExecutionId: "",
      workflowNodeId: "",
    },
    revision,
    schemaVersion: 1,
    status: "running",
    updatedAt,
    workflow: null,
    workspaceId,
  };
}
