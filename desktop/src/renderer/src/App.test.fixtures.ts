import type { ChatMessage, MessageStatus, RunActivityDetailsProjection } from "@generated/backend";

// activityDetails builds a complete RunActivityDetailsProjection from a partial
// override so activity_item block fixtures can set just the fields a test cares
// about (command, file paths, progress, notice, ...).
export function activityDetails(
  overrides: Partial<RunActivityDetailsProjection> = {},
): RunActivityDetailsProjection {
  return {
    command: "",
    commandExecution: null,
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
    processId: "",
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
