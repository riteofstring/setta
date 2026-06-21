import { describe, expect, test } from "vitest";

import type {
  WorkspaceActivityFileChange,
  WorkspaceActivityKind,
  WorkspaceActivityRecord,
  WorkspaceActivityStatus,
} from "@generated/backend";
import type { WorkflowGraphGraph } from "./pixi-renderer";
import type { WorkflowGraphTarget } from "./workflow-graph-projection-state";
import {
  projectWorkspaceActivityMarkerProjection,
  projectWorkspaceActivityMarkers,
  workspaceActivityMarkerMaterializationDiff,
  type WorkspaceActivityMarker,
} from "./workspace-activity-markers";

describe("workspace activity markers", () => {
  test("projects distinct typed activity markers onto workflow nodes", () => {
    const markers = projectWorkspaceActivityMarkers({
      graph: workflowGraph(),
      records: [
        activityRecord("workflow", "workflow_status", "running", 4, "work"),
        activityRecord("command", "command", "completed", 3, "work"),
        activityRecord("file", "file_change", "completed", 2, "work"),
        activityRecord("approval", "approval", "waiting_approval", 1, "work"),
      ],
      target: runTarget(),
    });

    expect(markers.map((marker) => [marker.kind, marker.anchorKind, marker.nodeId])).toEqual([
      ["workflow_status", "workflow_node", "work"],
      ["command", "workflow_node", "work"],
      ["file_change", "workflow_node", "work"],
      ["approval", "workflow_node", "work"],
    ]);
    expect(markers.map((marker) => marker.slotIndex)).toEqual([0, 1, 2, 3]);
    expect(markers.find((marker) => marker.kind === "approval")?.active).toBe(true);
    expect(markers.find((marker) => marker.kind === "command")?.active).toBe(false);
    expect(markers.map((marker) => marker.label)).toEqual([
      "Workflow running action started",
      "Command printf scripted-activity",
      "File scripted-activity-file.txt",
      "Approval waiting Command approval",
    ]);
  });

  test("keeps distinct command records for the same node", () => {
    const markers = projectWorkspaceActivityMarkers({
      graph: workflowGraph(),
      records: [
        activityRecord("command_old", "command", "running", 1, "work"),
        activityRecord("command_new", "command", "completed", 2, "work"),
      ],
      target: runTarget(),
    });

    expect(markers.map((marker) => [marker.activityId, marker.status, marker.slotIndex])).toEqual([
      ["activity_command_new", "completed", 0],
      ["activity_command_old", "running", 1],
    ]);
  });

  test("suppresses transient active records after the workflow execution is terminal", () => {
    const markers = projectWorkspaceActivityMarkers({
      graph: workflowGraph({ executionStatus: "cancelled", nodeStatus: "cancelled" }),
      records: [
        activityRecord("workflow_running", "workflow_status", "running", 4, "work"),
        activityRecord("command_running", "command", "running", 3, "work"),
        activityRecord("approval_waiting", "approval", "waiting_approval", 2, "work"),
        activityRecord("approval_cancelled", "approval", "cancelled", 5, "work"),
      ],
      target: runTarget(),
    });

    expect(markers.map((marker) => [marker.activityId, marker.status, marker.active])).toEqual([
      ["activity_approval_cancelled", "cancelled", false],
    ]);
  });

  test("suppresses transient active records for terminal nodes while other nodes continue", () => {
    const markers = projectWorkspaceActivityMarkers({
      graph: workflowGraph({
        extraNodes: [{ id: "next", status: "running" }],
        nodeStatus: "succeeded",
      }),
      records: [
        activityRecord("work_command_running", "command", "running", 3, "work"),
        activityRecord("work_command_completed", "command", "completed", 4, "work"),
        activityRecord("next_command_running", "command", "running", 5, "next"),
      ],
      target: runTarget(),
    });

    expect(markers.map((marker) => [marker.activityId, marker.status, marker.nodeId])).toEqual([
      ["activity_next_command_running", "running", "next"],
      ["activity_work_command_completed", "completed", "work"],
    ]);
  });

  test("keeps waiting activity markers for recovery-required nodes", () => {
    const markers = projectWorkspaceActivityMarkers({
      graph: workflowGraph({ nodeStatus: "recovery_required" }),
      records: [
        activityRecord("manual_recovery", "workflow_status", "waiting_approval", 3, "work"),
      ],
      target: runTarget(),
    });

    expect(markers.map((marker) => [marker.activityId, marker.status, marker.active])).toEqual([
      ["activity_manual_recovery", "waiting_approval", true],
    ]);
  });

  test("keeps all anchored records so chip overflow counts are complete", () => {
    const records = Array.from({ length: 45 }, (_, index) =>
      activityRecord(`command_${index}`, "command", "completed", index + 1, "work"),
    );
    const markers = projectWorkspaceActivityMarkers({
      graph: workflowGraph(),
      records,
      target: runTarget(),
    });

    expect(markers).toHaveLength(records.length);
    expect(markers.map((marker) => marker.slotIndex)).toEqual(records.map((_, index) => index));
  });

  test("suppresses execution-level activity and filters other executions", () => {
    const projection = projectWorkspaceActivityMarkerProjection({
      graph: workflowGraph(),
      records: [
        activityRecord("other", "workflow_status", "running", 3, "", "execution_other"),
        activityRecord("execution", "workflow_status", "running", 2, ""),
      ],
      target: runTarget(),
    });

    expect(projection.markers).toEqual([]);
    expect(projection.suppressedUnanchoredActivityCount).toBe(1);
    expect(projection.suppressedUnanchoredActivityIds).toEqual(["activity_execution"]);
  });

  test("scopes run markers to the selected execution id", () => {
    const markers = projectWorkspaceActivityMarkers({
      graph: workflowGraph(),
      records: [
        activityRecord("selected", "command", "completed", 2, "work", "execution_a"),
        activityRecord("other_run", "command", "completed", 3, "work", "execution_other"),
      ],
      target: runTarget("execution_a"),
    });

    expect(markers.map((marker) => [marker.activityId, marker.nodeId])).toEqual([
      ["activity_selected", "work"],
    ]);
  });

  test("returns no markers for a draft target even when the graph carries run activity", () => {
    const projection = projectWorkspaceActivityMarkerProjection({
      graph: workflowGraph(),
      records: [activityRecord("command", "command", "completed", 2, "work")],
      target: draftTarget(),
    });

    expect(projection).toEqual({
      markers: [],
      suppressedUnanchoredActivityCount: 0,
      suppressedUnanchoredActivityIds: [],
    });
  });

  test("returns no markers without a selected target", () => {
    const markers = projectWorkspaceActivityMarkers({
      graph: workflowGraph(),
      records: [activityRecord("command", "command", "completed", 2, "work")],
      target: null,
    });

    expect(markers).toEqual([]);
  });

  test("returns no markers when the displayed graph is a different run than the target", () => {
    const markers = projectWorkspaceActivityMarkers({
      graph: workflowGraph({ executionId: "execution_other" }),
      records: [activityRecord("command", "command", "completed", 2, "work", "execution_a")],
      target: runTarget("execution_a"),
    });

    expect(markers).toEqual([]);
  });

  test("returns no markers when a run target is selected but a draft graph is displayed", () => {
    const markers = projectWorkspaceActivityMarkers({
      graph: workflowGraph({ executionId: "", viewMode: "draft" }),
      records: [activityRecord("command", "command", "completed", 2, "work", "execution_a")],
      target: runTarget("execution_a"),
    });

    expect(markers).toEqual([]);
  });

  test("counts marker creation, update, retention, and removal by stable marker id", () => {
    const previous: WorkspaceActivityMarker[] = [
      marker("workspace-activity:node:work:command", "command", "running"),
      marker("workspace-activity:node:work:file_change", "file_change", "completed"),
    ];
    const next: WorkspaceActivityMarker[] = [
      marker("workspace-activity:node:work:command", "command", "completed"),
      marker("workspace-activity:node:work:approval", "approval", "waiting_approval"),
      marker("workspace-activity:node:work:file_change", "file_change", "completed"),
    ];

    expect(workspaceActivityMarkerMaterializationDiff(previous, next)).toEqual({
      created: 1,
      removed: 0,
      retained: 1,
      updated: 1,
    });
  });
});

function runTarget(executionId = "execution_a"): WorkflowGraphTarget {
  return {
    definitionId: "definition_a",
    executionId,
    kind: "run",
    versionId: "version_a",
    workspaceId: "workspace_a",
  };
}

function draftTarget(): WorkflowGraphTarget {
  return {
    definitionId: "definition_a",
    kind: "draft",
    workspaceId: "workspace_a",
  };
}

function workflowGraph({
  executionId = "execution_a",
  executionStatus = "running",
  extraNodes = [],
  nodeStatus = "running",
  viewMode = "run",
}: {
  executionId?: string;
  executionStatus?: NonNullable<WorkflowGraphGraph["workflow"]>["executionStatus"];
  extraNodes?: Array<{
    id: string;
    status: NonNullable<WorkflowGraphGraph["nodes"][number]["status"]>;
  }>;
  nodeStatus?: NonNullable<WorkflowGraphGraph["nodes"][number]["status"]>;
  viewMode?: NonNullable<WorkflowGraphGraph["workflow"]>["viewMode"];
} = {}): WorkflowGraphGraph {
  return {
    edges: [],
    nodes: [
      {
        color: 0x14b8a6,
        height: 82,
        id: "work",
        label: "Work",
        status: nodeStatus,
        width: 168,
        x: 0,
        y: 0,
      },
      ...extraNodes.map((node, index) => ({
        color: 0x14b8a6,
        height: 82,
        id: node.id,
        label: node.id,
        status: node.status,
        width: 168,
        x: (index + 1) * 220,
        y: 0,
      })),
    ],
    workflow: {
      definitionId: "definition_a",
      definitionName: "Workflow",
      definitionVersionId: "version_a",
      definitionVersionNumber: 1,
      editable: false,
      executionId,
      executionStatus,
      versionMismatch: false,
      viewMode,
      workspaceId: "workspace_a",
    },
  };
}

function activityRecord(
  id: string,
  kind: WorkspaceActivityKind,
  status: WorkspaceActivityStatus,
  revision: number,
  nodeId: string,
  executionId = "execution_a",
): WorkspaceActivityRecord {
  const occurredAt = `2026-06-21T12:0${revision}:00Z`;
  return {
    activityId: `activity_${id}`,
    approval: approvalPayload(kind, status),
    command: commandPayload(kind, status),
    detailRef: detailRef(kind, id, executionId),
    fileChange: fileChangePayload(kind),
    graphAnchor: {
      kind: nodeId === "" ? "workflow_execution" : "workflow_node",
      workflowDefinitionId: "definition_a",
      workflowDefinitionVersionId: "version_a",
      workflowExecutionId: executionId,
      workflowNodeExecutionId: nodeId === "" ? "" : "node_execution_a",
      workflowNodeId: nodeId,
    },
    kind,
    occurredAt,
    provenance: {
      chatConversationId: "conversation_a",
      chatEventId: "",
      chatEventSequence: 0,
      chatEventStreamId: "",
      chatMessageId: "",
      chatRunId: "run_a",
      providerItemId: "provider_a",
      runItemId: `activity_${id}`,
      runnerEventId: "",
      runnerEventOrdinal: 0,
      runnerEventType: null,
      workflowDefinitionId: "definition_a",
      workflowDefinitionVersionId: "version_a",
      workflowEventId: kind === "workflow_status" ? `event_${id}` : "",
      workflowEventOrdinal: revision,
      workflowEventStreamId: "workflow_stream_a",
      workflowEventStreamSequence: revision,
      workflowEventType: kind === "workflow_status" ? "workflow.action.started" : null,
      workflowExecutionId: executionId,
      workflowNodeExecutionId: nodeId === "" ? "" : "node_execution_a",
      workflowNodeId: nodeId,
    },
    revision,
    schemaVersion: 1,
    status,
    updatedAt: occurredAt,
    workflow: workflowPayload(kind, id),
    workspaceId: "workspace_a",
  };
}

function approvalPayload(kind: WorkspaceActivityKind, status: WorkspaceActivityStatus) {
  if (kind !== "approval") {
    return null;
  }
  return {
    approvalId: "approval_a",
    commandPreview: "printf scripted-command",
    filePath: "",
    kind: "command",
    permission: "",
    status: status === "waiting_approval" ? "pending" : "approved",
    targetLabel: "printf scripted-command",
    title: "Command approval",
  } as const;
}

function commandPayload(kind: WorkspaceActivityKind, status: WorkspaceActivityStatus) {
  if (kind !== "command") {
    return null;
  }
  return {
    commandPreview: "printf scripted-activity",
    cwd: "/tmp/workspace",
    durationMs: null,
    exitCode: null,
    runItemStatus: status === "running" ? "running" : "completed",
  } as const;
}

function fileChangePayload(kind: WorkspaceActivityKind): WorkspaceActivityFileChange | null {
  if (kind !== "file_change") {
    return null;
  }
  return {
    pathCount: 1,
    paths: ["/tmp/workspace/scripted-activity-file.txt"],
    pathsTruncated: false,
    patchStatus: "updated",
    runItemStatus: "completed",
  };
}

function workflowPayload(kind: WorkspaceActivityKind, id: string) {
  if (kind !== "workflow_status") {
    return null;
  }
  return {
    eventId: `event_${id}`,
    eventType: "workflow.action.started",
    message: "action started",
    runnerKind: "agent.codex",
  } as const;
}

function detailRef(kind: WorkspaceActivityKind, id: string, executionId: string) {
  const chatRunItem = kind === "command" || kind === "file_change";
  const workflowEvent = kind === "workflow_status";
  return {
    approvalId: kind === "approval" ? "approval_a" : "",
    conversationId: chatRunItem ? "conversation_a" : "",
    kind: workflowEvent ? "workflow_event" : "chat_run_item",
    runId: chatRunItem ? "run_a" : "",
    runItemId: chatRunItem ? `activity_${id}` : "",
    workflowEventId: workflowEvent ? `event_${id}` : "",
    workflowExecutionId: executionId,
    workspaceId: "workspace_a",
  } as const;
}

function marker(
  id: string,
  kind: WorkspaceActivityKind,
  status: WorkspaceActivityStatus,
): WorkspaceActivityMarker {
  return {
    activityId: `activity_${kind}`,
    active: status === "running" || status === "waiting_approval",
    anchorKind: "workflow_node",
    id,
    kind,
    label: `${kind} ${status}`,
    laneIndex: -1,
    nodeId: "work",
    revision: status === "running" ? 1 : 2,
    slotIndex: kind === "command" ? 1 : 2,
    status,
    updatedAt: status === "running" ? "2026-06-21T12:00:00Z" : "2026-06-21T12:01:00Z",
  };
}
