import type {
  ChatMessage,
  MessageStatus,
  RunActivityDetailsProjection,
  RunLiveness,
} from "@generated/backend";

// activityDetails builds a complete RunActivityDetailsProjection from a partial
// override so activity_item block fixtures can set just the fields a test cares
// about (command, file paths, progress, notice, ...).
export function activityDetails(
  overrides: Partial<RunActivityDetailsProjection> = {},
): RunActivityDetailsProjection {
  return {
    command: "",
    commandExecution: null,
    commandStartFailure: null,
    approval: null,
    cwd: "",
    details: null,
    diff: null,
    durationMs: 0,
    dynamicToolCall: null,
    error: "",
    exitCode: 0,
    fileChange: null,
    filePaths: [],
    mcpToolCall: null,
    namespace: "",
    noticeKind: "",
    noticeMessage: "",
    patchStatus: "",
    plan: null,
    processId: "",
    providerStreamLifecycle: null,
    progress: "",
    requestId: "",
    result: "",
    reviewId: "",
    serverName: "",
    summary: "",
    toolName: "",
    ...overrides,
  };
}

// queuedChatMessage builds the ChatMessage a queued run's trigger resolves to.
// Queued messages are not transcript blocks; the transcript renders them at the
// tail from the queue state.
export function queuedChatMessage(
  id: string,
  runId: string,
  text: string,
  status: MessageStatus = "pending",
): ChatMessage {
  return {
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    delivery: "queued",
    id,
    ordinal: 1,
    parts: [
      {
        id: `${id}_part`,
        image: null,
        text: { format: "plain", text },
        type: "text",
      },
    ],
    role: "user",
    runId,
    schemaVersion: 1,
    status,
    updatedAt: "2026-05-29T20:00:00Z",
  };
}

export function runLivenessActiveStatus(
  status: RunLiveness["status"],
): RunLiveness["activeStatus"] {
  return runLivenessActiveStatusByStatus[status];
}

export function runLivenessPhase(status: RunLiveness["status"]): RunLiveness["phase"] {
  return runLivenessPhaseByStatus[status];
}

const runLivenessActiveStatusByStatus = {
  attached: {
    detail: "",
    headline: "Working",
    headlineSource: "fallback",
    kind: "working",
  },
  lost: {
    detail: "",
    headline: "Connection lost",
    headlineSource: "liveness",
    kind: "connection_lost",
  },
  reconciling: {
    detail: "",
    headline: "Reconnecting",
    headlineSource: "liveness",
    kind: "reconnecting",
  },
  terminal: {
    detail: "",
    headline: "Finished",
    headlineSource: "terminal",
    kind: "finished",
  },
} satisfies Record<RunLiveness["status"], RunLiveness["activeStatus"]>;

const runLivenessPhaseByStatus = {
  attached: "attached",
  lost: "lost",
  reconciling: "reconnecting",
  terminal: "terminal",
} satisfies Record<RunLiveness["status"], RunLiveness["phase"]>;
