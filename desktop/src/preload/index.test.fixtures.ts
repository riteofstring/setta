import type {
  ChatEvent,
  TerminalEvent,
  WorkspaceActivityEvent,
  WorkflowEvent,
  WorkflowGraph,
} from "@generated/backend";

export function chatEvent(): ChatEvent {
  return {
    conversationId: "conversation_api",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: "event_stream_test:1",
    payload: {
      message: {
        conversationId: "conversation_api",
        createdAt: "2026-05-29T20:00:00Z",
        delivery: "normal",
        id: "message_user",
        ordinal: 1,
        parts: [
          {
            id: "part_user",
            image: null,
            text: { format: "plain", text: "hello" },
            type: "text",
          },
        ],
        role: "user",
        runId: "",
        schemaVersion: 1,
        status: "complete",
        updatedAt: "2026-05-29T20:00:00Z",
      },
    },
    runId: "run_api",
    schemaVersion: 1,
    sequence: 1,
    streamId: "event_stream_test",
    type: "chat.message.created",
    workspaceId: "workspace_api",
  };
}

export function terminalEvent(): TerminalEvent {
  return {
    emittedAt: "2026-06-06T12:00:00Z",
    eventId: "terminal_stream_test:1",
    paneId: "pane_terminal",
    payload: {
      byteCount: 5,
      cols: 80,
      cwd: "/tmp/workspace",
      dataBase64: "aGVsbG8=",
      droppedBytes: 0,
      droppedChunks: 0,
      exitCode: 0,
      message: "",
      rows: 24,
      status: "running",
    },
    schemaVersion: 1,
    sequence: 1,
    sessionId: "terminal_api",
    streamId: "terminal_stream_test",
    type: "terminal.output",
    workspaceId: "workspace_api",
  };
}

export function workspaceActivityEvent(): WorkspaceActivityEvent {
  return {
    delta: null,
    emittedAt: "2026-06-21T12:00:00Z",
    eventId: "workspace_activity_stream_test:12",
    resync: {
      currentRevision: 7,
      currentSequence: 12,
      currentStreamId: "workspace_activity_stream_test",
      earliestSequence: 8,
      reason: "workspace activity replay is no longer available",
      requestedSequence: 1,
      requestedStreamId: "workspace_activity_stream_old",
    },
    revision: 7,
    schemaVersion: 1,
    sequence: 12,
    streamId: "workspace_activity_stream_test",
    type: "workspace_activity.resync_required",
    workspaceId: "workspace_api",
  };
}

export function workflowEvent(): WorkflowEvent {
  return {
    createdAt: "2026-06-05T12:00:00Z",
    definitionId: "workflow_definition_api",
    definitionVersionId: "workflow_version_api",
    details: {},
    executionId: "workflow_execution_api",
    id: "workflow_event_api",
    message: "workflow started",
    nodeExecutionId: "",
    nodeId: "",
    ordinal: 1,
    runnerKind: null,
    schemaVersion: 1,
    tokenId: "",
    type: "workflow.execution.started",
    workspaceId: "workspace_api",
  };
}

export function workflowGraph(): WorkflowGraph {
  return {
    edges: [
      {
        condition: null,
        fromNodeId: "start",
        id: "start_end",
        kind: "normal",
        toNodeId: "end",
      },
    ],
    layout: { nodes: [] },
    nodes: [
      {
        action: null,
        gateway: null,
        id: "start",
        kind: "start",
        loopGuard: null,
        title: "Start",
      },
      {
        action: null,
        gateway: null,
        id: "end",
        kind: "end",
        loopGuard: null,
        title: "End",
      },
    ],
  };
}
