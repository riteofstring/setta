import type {
  ChatMessage,
  Run,
  RunActivityDetailsProjection,
  RunActivityGroupProjection,
  RunItem,
  RunItemOutput,
  TranscriptTurn,
} from "@generated/backend";

export function normalizedTranscriptFixture(
  messages: ChatMessage[],
  runItems: RunItem[],
  runItemOutputs: RunItemOutput[],
) {
  const orderedMessages = messages.toSorted((left, right) => left.ordinal - right.ordinal);
  const messagesById = Object.fromEntries(orderedMessages.map((message) => [message.id, message]));
  const orderedItems = runItems.toSorted(compareRunItems);
  const runItemsById = Object.fromEntries(orderedItems.map((item) => [item.id, item]));
  const runItemIdsByRunId: Record<string, string[]> = {};
  for (const item of orderedItems) {
    runItemIdsByRunId[item.runId] = [...(runItemIdsByRunId[item.runId] ?? []), item.id];
  }
  const orderedOutputs = runItemOutputs.toSorted(compareRunItemOutputs);
  const runItemOutputsById = Object.fromEntries(
    orderedOutputs.map((output) => [output.id, output]),
  );
  const runItemOutputIdsByRunItemId: Record<string, string[]> = {};
  for (const output of orderedOutputs) {
    runItemOutputIdsByRunItemId[output.runItemId] = [
      ...(runItemOutputIdsByRunItemId[output.runItemId] ?? []),
      output.id,
    ];
  }
  return {
    messageIds: orderedMessages.map((message) => message.id),
    messagesById,
    runItemIdsByRunId,
    runItemOutputIdsByRunItemId,
    runItemOutputsById,
    runItemsById,
  };
}

function compareRunItems(left: RunItem, right: RunItem) {
  if (left.createdAt === right.createdAt) {
    return left.id.localeCompare(right.id);
  }
  return left.createdAt.localeCompare(right.createdAt);
}

function compareRunItemOutputs(left: RunItemOutput, right: RunItemOutput) {
  if (left.runItemId === right.runItemId) {
    return left.ordinal - right.ordinal;
  }
  return left.runItemId.localeCompare(right.runItemId);
}

export function transcriptFromMessages(
  messages: ChatMessage[],
  activityByRunId: Record<string, RunActivityGroupProjection | null> = {},
): TranscriptTurn[] {
  const runIds = [...new Set(messages.map((message) => message.runId).filter(Boolean))];
  return runIds.map((runId) => {
    const triggerMessage =
      messages.find((message) => message.runId === runId && message.role === "user") ??
      chatUserMessage(`message_user_${runId}`, 1, runId);
    const assistantMessage =
      messages.find((message) => message.runId === runId && message.role === "assistant") ?? null;
    return {
      activity: activityByRunId[runId] ?? null,
      assistantMessage,
      run: transcriptRun(runId, triggerMessage.id, assistantMessage?.id ?? ""),
      steeringMessages: messages.filter(
        (message) => message.runId === runId && message.delivery === "steering",
      ),
      triggerMessage,
    };
  });
}

export function projectedActivity(
  runId: string,
  rows: RunActivityGroupProjection["rows"],
  status: RunActivityGroupProjection["status"] = "completed",
): RunActivityGroupProjection {
  return { rows, runId, status };
}

export function projectedActivityRow(
  row: Omit<Partial<RunActivityGroupProjection["rows"][number]>, "details"> &
    Pick<RunActivityGroupProjection["rows"][number], "sourceRunItemId" | "title" | "type"> & {
      details?: Partial<RunActivityDetailsProjection>;
    },
): RunActivityGroupProjection["rows"][number] {
  const { details, ...rest } = row;
  return {
    details: {
      command: "",
      cwd: "",
      details: null,
      diffSummary: "",
      durationMs: 0,
      error: "",
      exitCode: 0,
      filePaths: [],
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
      ...details,
    },
    hasDetails: true,
    hasOutput: false,
    id: `activity_${row.sourceRunItemId}`,
    status: "completed",
    ...rest,
  };
}

export function transcriptRun(
  runId: string,
  triggerMessageId: string,
  assistantMessageId: string,
): Run {
  return {
    assistantMessageId,
    completedAt: assistantMessageId ? "2026-05-29T20:01:00Z" : "",
    conversationId: "conversation_api",
    error: "",
    harness: "codex",
    id: runId,
    pendingApproval: null,
    promptSummary: "test",
    schemaVersion: 1,
    startedAt: assistantMessageId ? "2026-05-29T20:00:00Z" : "",
    status: assistantMessageId ? "completed" : "queued",
    triggerMessageId,
    workspaceId: "workspace_api",
  };
}

export function chatUserMessage(id: string, ordinal: number, runId: string): ChatMessage {
  return chatUserMessageWithText(id, ordinal, runId, "normal", "prompt");
}

export function chatUserMessageWithText(
  id: string,
  ordinal: number,
  runId: string,
  delivery: ChatMessage["delivery"],
  text: string,
  status: ChatMessage["status"] = "complete",
): ChatMessage {
  return {
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    delivery,
    id,
    ordinal,
    parts: [{ format: "plain", id: `${id}_part`, text, type: "text" }],
    role: "user",
    runId,
    schemaVersion: 1,
    status,
    updatedAt: "2026-05-29T20:00:00Z",
  };
}

export function chatAssistantMessage(
  id: string,
  ordinal: number,
  runId: string,
  text: string,
  status: ChatMessage["status"] = "complete",
): ChatMessage {
  return {
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    delivery: "normal",
    id,
    ordinal,
    parts: [{ format: "markdown", id: `${id}_part`, text, type: "text" }],
    role: "assistant",
    runId,
    schemaVersion: 1,
    status,
    updatedAt: "2026-05-29T20:00:00Z",
  };
}

export function chatRunItem(
  id: string,
  runId: string,
  type: RunItem["type"],
  overrides: Partial<RunItem> = {},
): RunItem {
  return {
    command: "",
    completedAt: "2026-05-29T20:00:00Z",
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    cwd: "",
    details: null,
    diffSummary: "",
    durationMs: 0,
    error: "",
    exitCode: 0,
    filePaths: [],
    hiddenText: "",
    id,
    namespace: "",
    noticeKind: "",
    noticeMessage: "",
    patchStatus: "",
    processId: "",
    progress: "",
    providerItemId: id,
    requestId: "",
    result: "",
    reviewId: "",
    runId,
    schemaVersion: 1,
    serverName: "",
    startedAt: "2026-05-29T20:00:00Z",
    status: "completed",
    summary: "",
    title: "",
    toolName: "",
    type,
    workspaceId: "workspace_api",
    ...overrides,
  };
}
