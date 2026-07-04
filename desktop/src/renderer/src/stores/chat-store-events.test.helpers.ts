import type {
  BackgroundTerminalOutput,
  BackgroundTerminalProcess,
  ChatEvent,
  ChatMessage,
  ConversationListItem,
  MessageDelivery,
  MessageRole,
  MessageStatus,
  ReasoningBlockMode,
  Run,
  RunActivityDetailsProjection,
  RunItem,
  RunItemOutput,
  RunItemStatus,
  RunItemType,
  RunLiveness,
  RunStatusBlockMode,
  TranscriptBlock,
  TranscriptBlockStatus,
} from "@generated/backend";

const eventStreamId = "event_stream_test";
const workspaceId = "workspace_api";
const conversationId = "conversation_api";

function emptyActivityDetails(
  overrides: Partial<RunActivityDetailsProjection> = {},
): RunActivityDetailsProjection {
  return {
    command: "",
    commandExecution: null,
    cwd: "",
    details: null,
    diffSummary: "",
    durationMs: 0,
    error: "",
    exitCode: 0,
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

interface BlockBase {
  id: string;
  runId: string;
  ordinal: number;
  runAnchorOrdinal?: number;
  status?: TranscriptBlockStatus;
  conversationId?: string;
  createdAt?: string;
  updatedAt?: string;
}

function baseBlock(base: BlockBase, kind: TranscriptBlock["kind"]): TranscriptBlock {
  return {
    activity: null,
    assistantText: null,
    backgroundTerminal: null,
    conversationId: base.conversationId ?? conversationId,
    createdAt: base.createdAt ?? "2026-05-29T20:00:00Z",
    id: base.id,
    kind,
    ordinal: base.ordinal,
    reasoning: null,
    runAnchorOrdinal: base.runAnchorOrdinal ?? base.ordinal,
    runId: base.runId,
    runStatus: null,
    schemaVersion: 1,
    status: base.status ?? "complete",
    updatedAt: base.updatedAt ?? base.createdAt ?? "2026-05-29T20:00:00Z",
    userMessage: null,
  };
}

export function userMessageBlock(
  base: BlockBase & {
    messageId?: string;
    text?: string;
    role?: MessageRole;
    delivery?: MessageDelivery;
    messageStatus?: MessageStatus;
  },
): TranscriptBlock {
  const messageId = base.messageId ?? `${base.id}_message`;
  return {
    ...baseBlock(base, "user_message"),
    userMessage: {
      delivery: base.delivery ?? "normal",
      messageId,
      parts: [
        {
          id: `${messageId}_part`,
          image: null,
          text: { format: "plain", text: base.text ?? "hello" },
          type: "text",
        },
      ],
      role: base.role ?? "user",
      status: base.messageStatus ?? "complete",
    },
  };
}

export function assistantTextBlock(base: BlockBase & { text?: string }): TranscriptBlock {
  return {
    ...baseBlock({ status: "streaming", ...base }, "assistant_text"),
    assistantText: { format: "markdown", text: base.text ?? "" },
  };
}

export function reasoningBlock(
  base: BlockBase & {
    mode?: ReasoningBlockMode;
    headline?: string;
    summary?: string;
    sourceRunItemId?: string;
  },
): TranscriptBlock {
  return {
    ...baseBlock({ status: "streaming", ...base }, "reasoning"),
    reasoning: {
      headline: base.headline ?? "Mapping parser modules",
      mode: base.mode ?? "thinking",
      sourceRunItemId: base.sourceRunItemId ?? `${base.id}_item`,
      summary: base.summary ?? "",
    },
  };
}

// A command activity previews the command itself — the backend projects the
// summarized command as the title. "command execution" is only the fallback when
// there is genuinely no command.
function defaultActivityTitle(details: RunActivityDetailsProjection | undefined): string {
  return details?.command || "command execution";
}

export function activityBlock(
  base: BlockBase & {
    sourceRunItemId?: string;
    type?: RunItemType;
    title?: string;
    activityStatus?: RunItemStatus;
    hasDetails?: boolean;
    hasOutput?: boolean;
    details?: RunActivityDetailsProjection;
  },
): TranscriptBlock {
  return {
    ...baseBlock(base, "activity_item"),
    activity: {
      details: base.details ?? emptyActivityDetails(),
      hasDetails: base.hasDetails ?? false,
      hasOutput: base.hasOutput ?? false,
      sourceRunItemId: base.sourceRunItemId ?? `${base.id}_item`,
      status: base.activityStatus ?? "completed",
      title: base.title ?? defaultActivityTitle(base.details),
      type: base.type ?? "command_execution",
    },
  };
}

export function runStatusBlock(
  base: BlockBase & { mode?: RunStatusBlockMode; label?: string; error?: string },
): TranscriptBlock {
  return {
    ...baseBlock({ status: "streaming", ...base }, "run_status"),
    runStatus: {
      error: base.error ?? "",
      label: base.label ?? "Working",
      mode: base.mode ?? "working",
    },
  };
}

function transcriptBlockEvent(
  sequence: number,
  type: "chat.transcript_block.created" | "chat.transcript_block.updated",
  block: TranscriptBlock,
  streamId: string,
): ChatEvent {
  return {
    conversationId: block.conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { block },
    runId: block.runId,
    schemaVersion: 1,
    sequence,
    streamId,
    type,
    workspaceId,
  };
}

export function transcriptBlockCreatedEvent(
  sequence: number,
  block: TranscriptBlock,
  streamId = eventStreamId,
): ChatEvent {
  return transcriptBlockEvent(sequence, "chat.transcript_block.created", block, streamId);
}

export function transcriptBlockUpdatedEvent(
  sequence: number,
  block: TranscriptBlock,
  streamId = eventStreamId,
): ChatEvent {
  return transcriptBlockEvent(sequence, "chat.transcript_block.updated", block, streamId);
}

export function transcriptTextDeltaEvent(
  sequence: number,
  options: { runId: string; blockId: string; delta: string; updatedAt?: string },
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: {
      blockId: options.blockId,
      delta: options.delta,
      updatedAt: options.updatedAt ?? "2026-05-29T20:00:01Z",
    },
    runId: options.runId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.transcript_text.delta",
    workspaceId,
  };
}

export function transcriptBlocksReplacedEvent(
  sequence: number,
  options: { runId: string; blocks: TranscriptBlock[] },
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { blocks: options.blocks, runId: options.runId },
    runId: options.runId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.transcript_blocks.replaced",
    workspaceId,
  };
}

export function queueUpdatedEvent(
  sequence: number,
  runs: Run[],
  messages: ChatMessage[],
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { queue: { messages, runs } },
    runId: "",
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.queue.updated",
    workspaceId,
  };
}

export function messageCreatedEvent(
  sequence: number,
  chatMessage: ChatMessage,
  runId: string,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: chatMessage.conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: {
      message: chatMessage,
    },
    runId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.message.created",
    workspaceId: "workspace_api",
  };
}

export function runUpdatedEvent(sequence: number, run: Run, streamId = eventStreamId): ChatEvent {
  return {
    conversationId: run.conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { run },
    runId: run.id,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.run.updated",
    workspaceId: run.workspaceId,
  };
}

export function runItemCreatedEvent(
  sequence: number,
  item: RunItem,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: item.conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { item },
    runId: item.runId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.run_item.created",
    workspaceId: item.workspaceId,
  };
}

export function runItemUpdatedEvent(
  sequence: number,
  item: RunItem,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: item.conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { item },
    runId: item.runId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.run_item.updated",
    workspaceId: item.workspaceId,
  };
}

export function runItemOutputDeltaEvent(
  sequence: number,
  output: RunItemOutput,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: "conversation_api",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { output },
    runId: "run_api",
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.run_item_output.delta",
    workspaceId: "workspace_api",
  };
}

export function conversationUpdatedEvent(
  sequence: number,
  item: ConversationListItem,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: item.conversation.id,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { item },
    runId: item.activeRunId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.conversation.updated",
    workspaceId: item.conversation.workspaceId,
  };
}

export function runLiveness(overrides: Partial<RunLiveness> = {}): RunLiveness {
  const status = overrides.status ?? "attached";
  return {
    cancellable: status !== "terminal",
    conversationId,
    error: "",
    harness: "codex",
    lastProviderEventAt: "2026-05-29T20:00:00Z",
    lastReconciledAt: "",
    providerThreadId: "thread_api",
    providerTurnId: "turn_api",
    reason:
      status === "attached"
        ? "provider_turn_linked"
        : status === "terminal"
          ? "run_terminal"
          : status === "lost"
            ? "provider_unavailable"
            : "wake_recheck",
    retryable: status === "reconciling" || status === "lost",
    runId: "run_api",
    status,
    workspaceId,
    ...overrides,
  };
}

export function runLivenessUpdatedEvent(
  sequence: number,
  liveness: RunLiveness = runLiveness(),
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: liveness.conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { liveness },
    runId: liveness.runId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.run_liveness.updated",
    workspaceId: liveness.workspaceId,
  };
}

export function diagnosticCreatedEvent(sequence: number, streamId = eventStreamId): ChatEvent {
  return {
    conversationId: "conversation_api",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: {
      diagnostic: {
        code: "complete_turn_transition_failed",
        context: { error: "terminal transition failed" },
        conversationId: "conversation_api",
        id: "diagnostic_api",
        message: "terminal transition failed",
        occurredAt: "2026-05-29T20:00:00Z",
        runId: "run_api",
        schemaVersion: 1,
        severity: "critical",
        source: "chat",
        workspaceId: "workspace_api",
      },
    },
    runId: "run_api",
    schemaVersion: 1,
    sequence,
    streamId,
    type: "diagnostic.created",
    workspaceId: "workspace_api",
  };
}

export function backgroundTerminalProcess(
  id: string,
  overrides: Partial<BackgroundTerminalProcess> = {},
): BackgroundTerminalProcess {
  return {
    command: "npm run dev",
    completedAt: "",
    conversationId,
    cwd: "/tmp/workspace",
    error: "",
    exitCode: 0,
    id,
    processId: `provider_${id}`,
    providerItemId: `provider_item_${id}`,
    recentOutput: [],
    schemaVersion: 1,
    source: "unified_exec_startup",
    startedAt: "2026-05-29T20:00:00Z",
    startedRunId: "run_api",
    status: "running",
    threadId: "thread_api",
    updatedAt: "2026-05-29T20:00:00Z",
    workspaceId,
    ...overrides,
  };
}

export function backgroundTerminalOutput(
  id: string,
  processId: string,
  overrides: Partial<BackgroundTerminalOutput> = {},
): BackgroundTerminalOutput {
  return {
    createdAt: "2026-05-29T20:00:01Z",
    id,
    ordinal: 1,
    processId,
    schemaVersion: 1,
    stream: "stdout",
    text: "dev server ready\n",
    ...overrides,
  };
}

export function backgroundTerminalCreatedEvent(
  sequence: number,
  process: BackgroundTerminalProcess,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: process.conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { process },
    runId: process.startedRunId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.background_terminal.created",
    workspaceId: process.workspaceId,
  };
}

export function backgroundTerminalUpdatedEvent(
  sequence: number,
  process: BackgroundTerminalProcess,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId: process.conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { process },
    runId: process.startedRunId,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.background_terminal.updated",
    workspaceId: process.workspaceId,
  };
}

export function backgroundTerminalOutputDeltaEvent(
  sequence: number,
  output: BackgroundTerminalOutput,
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { output },
    runId: "run_api",
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.background_terminal.output_delta",
    workspaceId,
  };
}

export function backgroundTerminalsReplacedEvent(
  sequence: number,
  terminals: BackgroundTerminalProcess[],
  streamId = eventStreamId,
): ChatEvent {
  return {
    conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { terminals },
    runId: "",
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.background_terminals.replaced",
    workspaceId,
  };
}

export function resyncRequiredEvent(
  sequence: number,
  options: {
    currentSequence?: number;
    currentStreamId?: string;
    requestedSequence?: number;
    requestedStreamId?: string;
  } = {},
): ChatEvent {
  const streamId = options.currentStreamId ?? eventStreamId;
  const currentSequence = options.currentSequence ?? sequence;
  return {
    conversationId: "",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${currentSequence}`,
    payload: {
      currentSequence,
      currentStreamId: streamId,
      earliestSequence: 0,
      reason: "test resync",
      requestedSequence: options.requestedSequence ?? Math.max(0, sequence - 1),
      requestedStreamId: options.requestedStreamId ?? streamId,
    },
    runId: "",
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.resync_required",
    workspaceId: "",
  };
}
