import type {
  ChatMessage,
  ConversationListItem,
  MessagePage,
  Run,
  RunItem,
  RunItemOutput,
  TranscriptTurn,
} from "@generated/backend";

export type RunningRun = Run & { status: "running" };
export type QueuedRun = Run & { status: "queued" };

export interface RunItemOutputPageState {
  error: string | null;
  hasMore: boolean;
  loadedThroughOrdinal: number;
  loading: boolean;
  nextOrdinal: number;
}

type NormalizableChatPatch = {
  messages?: ChatMessage[];
  messageIds?: string[];
  messagesById?: Record<string, ChatMessage>;
  runItemIdsByRunId?: Record<string, string[]>;
  runItemOutputIdsByRunItemId?: Record<string, string[]>;
  runItemOutputs?: RunItemOutput[];
  runItemOutputsById?: Record<string, RunItemOutput>;
  runItems?: RunItem[];
  runItemsById?: Record<string, RunItem>;
  transcript?: TranscriptTurn[];
};

export function activeRunFromCandidate(run: Run | null): RunningRun | null {
  if (run?.status === "running") {
    return run as RunningRun;
  }
  return null;
}

export function activeRunAfterOperation(
  currentActiveRun: RunningRun | null,
  returnedRun: Run,
  fallbackActiveRun: RunningRun | null,
  terminalRunIds: Set<string>,
): RunningRun | null {
  if (terminalRunIds.has(returnedRun.id)) {
    return activeRunFromCandidates(terminalRunIds, currentActiveRun);
  }
  return activeRunFromCandidates(terminalRunIds, returnedRun, currentActiveRun, fallbackActiveRun);
}

export function activeRunFromCandidates(
  terminalRunIds: Set<string>,
  ...candidates: Array<Run | null>
): RunningRun | null {
  for (const candidate of candidates) {
    if (candidate && terminalRunIds.has(candidate.id)) {
      continue;
    }
    const activeRun = activeRunFromCandidate(candidate);
    if (activeRun) {
      return activeRun;
    }
  }
  return null;
}

export function activeRunFromPage(page: MessagePage): RunningRun | null {
  for (const turn of page.transcript) {
    const activeRun = activeRunFromCandidate(turn.run);
    if (activeRun) {
      return activeRun;
    }
  }
  return null;
}

export function queuedRunsFromPage(page: MessagePage): QueuedRun[] {
  return page.queue.runs.filter((run): run is QueuedRun => run.status === "queued");
}

export function outputPageLoadedState(
  outputs: RunItemOutput[],
  afterOrdinal: number,
  hasMore: boolean,
  nextOrdinal: number,
): Partial<RunItemOutputPageState> {
  return {
    error: null,
    hasMore,
    loadedThroughOrdinal: outputs.reduce(
      (current, output) => Math.max(current, output.ordinal),
      afterOrdinal,
    ),
    loading: false,
    nextOrdinal,
  };
}

export function updateRunItemOutputPageState(
  current: Record<string, RunItemOutputPageState>,
  runItemId: string,
  patch: Partial<RunItemOutputPageState>,
) {
  return {
    ...current,
    [runItemId]: {
      error: null,
      hasMore: false,
      loadedThroughOrdinal: 0,
      loading: false,
      nextOrdinal: 0,
      ...current[runItemId],
      ...patch,
    },
  };
}

export function normalizeChatPatch<T extends object>(patch: T & NormalizableChatPatch): T {
  const next: NormalizableChatPatch = { ...patch };
  let messagesById: Record<string, ChatMessage> | undefined;
  if (patch.messages !== undefined) {
    const normalized = normalizeMessages(patch.messages);
    messagesById = normalized.messagesById;
    Object.assign(next, normalized);
  }
  if (patch.transcript !== undefined) {
    Object.assign(next, normalizeTranscript(patch.transcript, messagesById));
  }
  if (patch.runItems !== undefined) {
    Object.assign(next, normalizeRunItems(patch.runItems));
  }
  if (patch.runItemOutputs !== undefined) {
    Object.assign(next, normalizeRunItemOutputs(patch.runItemOutputs));
  }
  return next as T;
}

export function messagesFromPage(page: MessagePage): ChatMessage[] {
  const messagesById = new Map(page.messages.map((message) => [message.id, message]));
  for (const turn of page.transcript) {
    messagesById.set(turn.triggerMessage.id, turn.triggerMessage);
    if (turn.assistantMessage) {
      messagesById.set(turn.assistantMessage.id, turn.assistantMessage);
    }
    for (const message of turn.steeringMessages) {
      messagesById.set(message.id, message);
    }
  }
  return [...messagesById.values()];
}

function normalizeMessages(messages: ChatMessage[]) {
  const ordered = messages.toSorted((left, right) => left.ordinal - right.ordinal);
  const messagesById: Record<string, ChatMessage> = {};
  for (const message of ordered) {
    messagesById[message.id] = message;
  }
  return {
    messageIds: ordered.map((message) => message.id),
    messages: ordered,
    messagesById,
  };
}

function normalizeTranscript(
  transcript: TranscriptTurn[],
  messagesById: Record<string, ChatMessage> | undefined,
) {
  return {
    transcript: transcript.map((turn) => hydrateTranscriptTurn(turn, messagesById)),
  };
}

function hydrateTranscriptTurn(
  turn: TranscriptTurn,
  messagesById: Record<string, ChatMessage> | undefined,
): TranscriptTurn {
  if (!messagesById) {
    return turn;
  }
  return {
    ...turn,
    assistantMessage: turn.assistantMessage
      ? (messagesById[turn.assistantMessage.id] ?? turn.assistantMessage)
      : null,
    steeringMessages: turn.steeringMessages.map((message) => messagesById[message.id] ?? message),
    triggerMessage: messagesById[turn.triggerMessage.id] ?? turn.triggerMessage,
  };
}

function normalizeRunItems(items: RunItem[]) {
  const ordered = items.toSorted(compareRunItems);
  const runItemsById: Record<string, RunItem> = {};
  const runItemIdsByRunId: Record<string, string[]> = {};
  for (const item of ordered) {
    runItemsById[item.id] = item;
    runItemIdsByRunId[item.runId] = [...(runItemIdsByRunId[item.runId] ?? []), item.id];
  }
  return {
    runItemIdsByRunId,
    runItems: ordered,
    runItemsById,
  };
}

function normalizeRunItemOutputs(outputs: RunItemOutput[]) {
  const ordered = outputs.toSorted(compareRunItemOutputs);
  const runItemOutputsById: Record<string, RunItemOutput> = {};
  const runItemOutputIdsByRunItemId: Record<string, string[]> = {};
  for (const output of ordered) {
    runItemOutputsById[output.id] = output;
    runItemOutputIdsByRunItemId[output.runItemId] = [
      ...(runItemOutputIdsByRunItemId[output.runItemId] ?? []),
      output.id,
    ];
  }
  return {
    runItemOutputIdsByRunItemId,
    runItemOutputs: ordered,
    runItemOutputsById,
  };
}

export function prependOlderMessages(
  olderMessages: ChatMessage[],
  currentMessages: ChatMessage[],
): ChatMessage[] {
  const currentIDs = new Set(currentMessages.map((message) => message.id));
  return [...olderMessages.filter((message) => !currentIDs.has(message.id)), ...currentMessages];
}

export function prependOlderTranscript(
  olderTranscript: TranscriptTurn[],
  currentTranscript: TranscriptTurn[],
): TranscriptTurn[] {
  const currentRunIds = new Set(currentTranscript.map((turn) => turn.run.id));
  return [
    ...olderTranscript.filter((turn) => !currentRunIds.has(turn.run.id)),
    ...currentTranscript,
  ];
}

export function terminalRunIdsAfterOperation(transcript: TranscriptTurn[], returnedRun: Run) {
  const runIds = terminalRunIdsFromTranscript(transcript);
  if (isTerminalRun(returnedRun)) {
    runIds.add(returnedRun.id);
  }
  return runIds;
}

export function terminalRunIdsFromTranscript(transcript: TranscriptTurn[]) {
  const runIds = new Set<string>();
  for (const turn of transcript) {
    if (isTerminalRun(turn.run)) {
      runIds.add(turn.run.id);
    }
  }
  return runIds;
}

export function mergeOperationTranscript(
  currentTranscript: TranscriptTurn[],
  pageTranscript: TranscriptTurn[],
  terminalRunIds: Set<string>,
) {
  const currentByRunId = new Map(currentTranscript.map((turn) => [turn.run.id, turn]));
  return pageTranscript.map((pageTurn) => {
    const current = currentByRunId.get(pageTurn.run.id);
    if (current && terminalRunIds.has(pageTurn.run.id)) {
      return current;
    }
    return pageTurn;
  });
}

export function mergeOperationMessages(
  currentMessages: ChatMessage[],
  pageMessages: ChatMessage[],
  terminalRunIds: Set<string>,
) {
  const currentById = new Map(currentMessages.map((message) => [message.id, message]));
  return pageMessages.map((pageMessage) => {
    const current = currentById.get(pageMessage.id);
    if (current && terminalRunIds.has(pageMessage.runId)) {
      return current;
    }
    return pageMessage;
  });
}

export function upsertRunItems(items: RunItem[], nextItems: RunItem[]): RunItem[] {
  return nextItems.reduce(upsertRunItem, items);
}

function upsertRunItem(items: RunItem[], item: RunItem): RunItem[] {
  const index = items.findIndex((current) => current.id === item.id);
  const next = index === -1 ? [...items, item] : items.with(index, item);
  return next.toSorted(compareRunItems);
}

function compareRunItems(left: RunItem, right: RunItem) {
  if (left.createdAt === right.createdAt) {
    return left.id.localeCompare(right.id);
  }
  return left.createdAt.localeCompare(right.createdAt);
}

export function upsertRunItemOutputs(
  outputs: RunItemOutput[],
  nextOutputs: RunItemOutput[],
): RunItemOutput[] {
  return nextOutputs.reduce(upsertRunItemOutput, outputs);
}

export function upsertConversationListItem(
  conversations: ConversationListItem[],
  item: ConversationListItem,
): ConversationListItem[] {
  const index = conversations.findIndex(
    (current) => current.conversation.id === item.conversation.id,
  );
  const next = index === -1 ? [...conversations, item] : conversations.with(index, item);
  return next.toSorted(compareConversationListItems);
}

function compareConversationListItems(left: ConversationListItem, right: ConversationListItem) {
  if (left.conversation.updatedAt === right.conversation.updatedAt) {
    return left.conversation.id.localeCompare(right.conversation.id);
  }
  return right.conversation.updatedAt.localeCompare(left.conversation.updatedAt);
}

function upsertRunItemOutput(outputs: RunItemOutput[], output: RunItemOutput): RunItemOutput[] {
  const index = outputs.findIndex((current) => current.id === output.id);
  const next = index === -1 ? [...outputs, output] : outputs.with(index, output);
  return next.toSorted(compareRunItemOutputs);
}

function compareRunItemOutputs(left: RunItemOutput, right: RunItemOutput) {
  if (left.runItemId === right.runItemId) {
    return left.ordinal - right.ordinal;
  }
  return left.runItemId.localeCompare(right.runItemId);
}

function isTerminalRun(run: Run) {
  return run.status === "completed" || run.status === "cancelled" || run.status === "failed";
}
