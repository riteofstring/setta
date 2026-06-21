import { describe, expect, test } from "vitest";

import type { WorkspaceActivityEvent, WorkspaceActivityRecord } from "@generated/backend";
import {
  applyWorkspaceActivityEvent,
  applyWorkspaceActivitySnapshot,
  createInitialWorkspaceActivityState,
  recordWorkspaceActivityBackendReadAttempt,
  recordWorkspaceActivityDeltaInstrumentation,
} from "./workspace-activity-state";

describe("workspace activity state", () => {
  test("loads bounded snapshots with Phase 2A marker counters at zero", () => {
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
      recordsRetained: 2,
      snapshotsLoaded: 1,
    });
  });

  test("applies workspace-filtered upsert deltas without marker work", () => {
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
      recordsRetained: 1,
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
});

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
