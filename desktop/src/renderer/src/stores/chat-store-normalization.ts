import type {
  ChatGoalState,
  ChatMessage,
  ConversationListItem,
  MessagePage,
  Run,
  RunItemOutput,
  TranscriptBlock,
} from "@generated/backend";

import { orderTranscriptBlocks } from "../lib/chat-transcript-blocks";

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
  runItemOutputIdsByRunItemId?: Record<string, string[]>;
  runItemOutputs?: RunItemOutput[];
  runItemOutputsById?: Record<string, RunItemOutput>;
  transcriptBlocks?: TranscriptBlock[];
  transcriptBlocksById?: Record<string, TranscriptBlock>;
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
  if (patch.messages !== undefined) {
    Object.assign(next, normalizeMessages(patch.messages));
  }
  if (patch.transcriptBlocks !== undefined) {
    Object.assign(next, normalizeTranscriptBlocks(patch.transcriptBlocks));
  }
  if (patch.runItemOutputs !== undefined) {
    Object.assign(next, normalizeRunItemOutputs(patch.runItemOutputs));
  }
  return next as T;
}

export function messagesFromPage(page: MessagePage): ChatMessage[] {
  return page.messages;
}

export function blocksFromPage(page: MessagePage): TranscriptBlock[] {
  return page.blocks;
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

// normalizeTranscriptBlocks sorts blocks into conversation order and indexes them
// by ID so block events upsert in place. Order is owned by the backend stream
// (see orderTranscriptBlocks); this only makes that order canonical and builds
// the ID index.
function normalizeTranscriptBlocks(blocks: TranscriptBlock[]) {
  const transcriptBlocks = orderTranscriptBlocks(blocks);
  const transcriptBlocksById: Record<string, TranscriptBlock> = {};
  for (const block of transcriptBlocks) {
    transcriptBlocksById[block.id] = block;
  }
  return { transcriptBlocks, transcriptBlocksById };
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

// prependOlderBlocks attaches a strictly older block window in front of the
// loaded blocks. The backend's olderBeforeBlockOrdinal cursor ensures the older
// page ends just before the current first block, so concatenation preserves
// conversation order; IDs already present are dropped so an overlapping boundary
// block is not duplicated.
export function prependOlderBlocks(
  olderBlocks: TranscriptBlock[],
  currentBlocks: TranscriptBlock[],
): TranscriptBlock[] {
  const currentIds = new Set(currentBlocks.map((block) => block.id));
  return [...olderBlocks.filter((block) => !currentIds.has(block.id)), ...currentBlocks];
}

// upsertTranscriptBlock applies a single block created/updated event by ID: an
// existing block is replaced in place (its ordinal is stable, so order does not
// change), and a new block is appended for re-ordering by normalizeTranscriptBlocks.
export function upsertTranscriptBlock(
  blocks: TranscriptBlock[],
  block: TranscriptBlock,
): TranscriptBlock[] {
  const index = blocks.findIndex((current) => current.id === block.id);
  return index === -1 ? [...blocks, block] : blocks.with(index, block);
}

// replaceRunTranscriptBlocks applies a per-run replaced snapshot: every existing
// block for the run is swapped for the snapshot at the run's current position, so
// a dropped block (de-dup, working indicator superseded) or a re-projected run
// keeps the run anchored where it already sits. A run with no current blocks is
// appended.
export function replaceRunTranscriptBlocks(
  blocks: TranscriptBlock[],
  runId: string,
  runBlocks: TranscriptBlock[],
): TranscriptBlock[] {
  const result: TranscriptBlock[] = [];
  let inserted = false;
  for (const block of blocks) {
    if (block.runId === runId) {
      if (!inserted) {
        result.push(...runBlocks);
        inserted = true;
      }
      continue;
    }
    result.push(block);
  }
  if (!inserted) {
    result.push(...runBlocks);
  }
  return result;
}

// appendTranscriptBlockText applies a block-keyed assistant text delta. It
// reports whether the target assistant_text block was present so the caller can
// resync when a delta arrives for a block the renderer has not loaded.
export function appendTranscriptBlockText(
  blocks: TranscriptBlock[],
  blockId: string,
  delta: string,
  updatedAt: string,
): { blocks: TranscriptBlock[]; found: boolean } {
  let found = false;
  const next = blocks.map((block) => {
    if (block.id !== blockId || !block.assistantText) {
      return block;
    }
    found = true;
    return {
      ...block,
      assistantText: { ...block.assistantText, text: block.assistantText.text + delta },
      updatedAt,
    };
  });
  return { blocks: next, found };
}

export function terminalRunIdsAfterOperation(
  currentBlocks: TranscriptBlock[],
  activeRunId: string | null,
  returnedRun: Run,
) {
  const runIds = terminalRunIdsFromBlocks(currentBlocks, activeRunId);
  if (isTerminalRun(returnedRun)) {
    runIds.add(returnedRun.id);
  }
  return runIds;
}

// terminalRunIdsFromBlocks returns the runs whose blocks should be preserved from
// the current state across a page merge. A conversation has at most one active
// run, so every run that already owns transcript blocks except the active one is
// terminal (completed, cancelled, or failed); queued runs own no blocks yet.
export function terminalRunIdsFromBlocks(blocks: TranscriptBlock[], activeRunId: string | null) {
  const runIds = new Set(blocks.map((block) => block.runId));
  if (activeRunId) {
    runIds.delete(activeRunId);
  }
  return runIds;
}

// mergeOperationBlocks reconciles the current blocks with a fresh operation/resync
// page. The current state is the fully-ordered live transcript (extended in
// conversation order by block events), so it is the ordering backbone: a run the
// stale page dropped — whether an older scrolled-out run or a queued run that was
// promoted and completed by events after the page was computed — keeps its
// current position. A run the page includes takes the fresh page blocks only while
// it is still active; terminal runs keep the current (event-fresher) snapshot,
// mirroring the message merge. Page-only runs the current state has not seen yet
// are appended in page order.
export function mergeOperationBlocks(
  currentBlocks: TranscriptBlock[],
  pageBlocks: TranscriptBlock[],
  terminalRunIds: Set<string>,
): TranscriptBlock[] {
  const current = groupBlocksByRun(currentBlocks);
  const page = groupBlocksByRun(pageBlocks);
  const emitted = new Set<string>();
  const result: TranscriptBlock[] = [];
  for (const runId of current.order) {
    emitted.add(runId);
    const useCurrent = terminalRunIds.has(runId) || !page.byRun.has(runId);
    const blocks = useCurrent ? current.byRun.get(runId) : page.byRun.get(runId);
    result.push(...(blocks ?? []));
  }
  for (const runId of page.order) {
    if (emitted.has(runId)) {
      continue;
    }
    result.push(...(page.byRun.get(runId) ?? []));
  }
  return result;
}

function groupBlocksByRun(blocks: TranscriptBlock[]) {
  const order: string[] = [];
  const byRun = new Map<string, TranscriptBlock[]>();
  for (const block of blocks) {
    let group = byRun.get(block.runId);
    if (!group) {
      group = [];
      byRun.set(block.runId, group);
      order.push(block.runId);
    }
    group.push(block);
  }
  return { byRun, order };
}

export function mergeOperationQueue(
  queue: MessagePage["queue"],
  terminalRunIds: Set<string>,
): MessagePage["queue"] {
  return {
    messages: queue.messages.filter((message) => !terminalRunIds.has(message.runId)),
    runs: queue.runs.filter((run) => !terminalRunIds.has(run.id)),
  };
}

export function mergeOperationGoal(
  currentGoal: ChatGoalState | null,
  pageGoal: ChatGoalState | null,
) {
  if (!currentGoal || !pageGoal) {
    return pageGoal;
  }
  return currentGoal.updatedAt >= pageGoal.updatedAt ? currentGoal : pageGoal;
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
  if (left.pinnedAt !== "" || right.pinnedAt !== "") {
    if (left.pinnedAt === right.pinnedAt) {
      if (left.conversation.updatedAt === right.conversation.updatedAt) {
        return left.conversation.id.localeCompare(right.conversation.id);
      }
      return right.conversation.updatedAt.localeCompare(left.conversation.updatedAt);
    }
    if (left.pinnedAt === "") {
      return 1;
    }
    if (right.pinnedAt === "") {
      return -1;
    }
    return right.pinnedAt.localeCompare(left.pinnedAt);
  }
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
