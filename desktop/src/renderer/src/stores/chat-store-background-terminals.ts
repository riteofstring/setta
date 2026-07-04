import type { BackgroundTerminalOutput, BackgroundTerminalProcess } from "@generated/backend";

import type { ChatPatch, ChatStore } from "./chat-store-types";

export interface BackgroundTerminalOutputPageState {
  error: string | null;
  hasMore: boolean;
  loadedThroughOrdinal: number;
  loading: boolean;
  nextOrdinal: number;
}

export function backgroundTerminalsReplacedPatch(
  state: ChatStore,
  conversationId: string,
  terminals: BackgroundTerminalProcess[],
): ChatPatch {
  const backgroundTerminalsById = { ...state.backgroundTerminalsById };
  for (const terminal of terminals) {
    backgroundTerminalsById[terminal.id] = terminal;
  }
  const ids = replacementBackgroundTerminalIds(
    state,
    conversationId,
    terminals,
    backgroundTerminalsById,
  );
  return {
    backgroundTerminalIdsByConversationId: {
      ...state.backgroundTerminalIdsByConversationId,
      [conversationId]: sortedBackgroundTerminalIds(ids, backgroundTerminalsById),
    },
    backgroundTerminalsById,
  };
}

export function backgroundTerminalUpsertPatch(
  state: ChatStore,
  terminal: BackgroundTerminalProcess,
): ChatPatch {
  const backgroundTerminalsById = {
    ...state.backgroundTerminalsById,
    [terminal.id]: terminal,
  };
  const ids = new Set(state.backgroundTerminalIdsByConversationId[terminal.conversationId] ?? []);
  ids.add(terminal.id);
  return {
    backgroundTerminalIdsByConversationId: {
      ...state.backgroundTerminalIdsByConversationId,
      [terminal.conversationId]: sortedBackgroundTerminalIds([...ids], backgroundTerminalsById),
    },
    backgroundTerminalsById,
  };
}

export function backgroundTerminalOutputDeltaPatch(
  state: ChatStore,
  output: BackgroundTerminalOutput,
): ChatPatch {
  const backgroundTerminalOutputsById = {
    ...state.backgroundTerminalOutputsById,
    [output.id]: output,
  };
  const ids = new Set(state.backgroundTerminalOutputIdsByProcessId[output.processId] ?? []);
  ids.add(output.id);
  return {
    backgroundTerminalOutputIdsByProcessId: {
      ...state.backgroundTerminalOutputIdsByProcessId,
      [output.processId]: sortedBackgroundTerminalOutputIds(
        [...ids],
        backgroundTerminalOutputsById,
      ),
    },
    backgroundTerminalOutputsById,
  };
}

export function backgroundTerminalOutputLoadingPatch(
  state: ChatStore,
  processId: string,
): ChatPatch {
  return {
    backgroundTerminalOutputPagesByProcessId: updateBackgroundTerminalOutputPageState(
      state.backgroundTerminalOutputPagesByProcessId,
      processId,
      { error: null, loading: true },
    ),
  };
}

export function backgroundTerminalOutputPageLoadedPatch(
  state: ChatStore,
  page: {
    afterOrdinal: number;
    hasMore: boolean;
    nextOrdinal: number;
    output: BackgroundTerminalOutput[];
    processId: string;
  },
): ChatPatch {
  let patch: ChatPatch = {};
  for (const item of page.output) {
    patch = {
      ...patch,
      ...backgroundTerminalOutputDeltaPatch({ ...state, ...patch }, item),
    };
  }
  return {
    ...patch,
    backgroundTerminalOutputPagesByProcessId: updateBackgroundTerminalOutputPageState(
      patch.backgroundTerminalOutputPagesByProcessId ??
        state.backgroundTerminalOutputPagesByProcessId,
      page.processId,
      {
        error: null,
        hasMore: page.hasMore,
        loadedThroughOrdinal: page.output.reduce(
          (current, item) => Math.max(current, item.ordinal),
          page.afterOrdinal,
        ),
        loading: false,
        nextOrdinal: page.nextOrdinal,
      },
    ),
  };
}

export function backgroundTerminalOutputErrorPatch(
  state: ChatStore,
  processId: string,
  error: string,
): ChatPatch {
  return {
    backgroundTerminalOutputPagesByProcessId: updateBackgroundTerminalOutputPageState(
      state.backgroundTerminalOutputPagesByProcessId,
      processId,
      { error, loading: false },
    ),
  };
}

function updateBackgroundTerminalOutputPageState(
  current: Record<string, BackgroundTerminalOutputPageState>,
  processId: string,
  patch: Partial<BackgroundTerminalOutputPageState>,
) {
  return {
    ...current,
    [processId]: {
      error: null,
      hasMore: false,
      loadedThroughOrdinal: 0,
      loading: false,
      nextOrdinal: 0,
      ...current[processId],
      ...patch,
    },
  };
}

function sortedBackgroundTerminalIds(
  ids: string[],
  processes: Record<string, BackgroundTerminalProcess | undefined>,
) {
  return [...new Set(ids)]
    .filter((id) => processes[id] !== undefined)
    .toSorted((left, right) => compareBackgroundTerminals(processes[left], processes[right]));
}

function compareBackgroundTerminals(
  left: BackgroundTerminalProcess | undefined,
  right: BackgroundTerminalProcess | undefined,
) {
  if (!left || !right) {
    return left ? -1 : right ? 1 : 0;
  }
  const leftRank = backgroundTerminalStatusRank(left);
  const rightRank = backgroundTerminalStatusRank(right);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  if (left.startedAt === right.startedAt) {
    return left.id.localeCompare(right.id);
  }
  return left.startedAt.localeCompare(right.startedAt);
}

function replacementBackgroundTerminalIds(
  state: ChatStore,
  conversationId: string,
  terminals: BackgroundTerminalProcess[],
  processes: Record<string, BackgroundTerminalProcess | undefined>,
) {
  const ids = new Set(terminals.map((terminal) => terminal.id));
  for (const id of state.backgroundTerminalIdsByConversationId[conversationId] ?? []) {
    const process = processes[id];
    if (process !== undefined && backgroundTerminalStatusIsActive(process.status)) {
      ids.add(id);
    }
  }
  return [...ids];
}

function backgroundTerminalStatusRank(terminal: BackgroundTerminalProcess) {
  switch (terminal.status) {
    case "running":
      return 0;
    case "terminating":
      return 1;
    case "exited":
      return 2;
    case "lost":
      return 3;
    default:
      return assertNever(terminal.status);
  }
}

function backgroundTerminalStatusIsActive(status: BackgroundTerminalProcess["status"]) {
  switch (status) {
    case "running":
    case "terminating":
      return true;
    case "exited":
    case "lost":
      return false;
    default:
      return assertNever(status);
  }
}

function sortedBackgroundTerminalOutputIds(
  ids: string[],
  outputs: Record<string, BackgroundTerminalOutput | undefined>,
) {
  return [...new Set(ids)]
    .filter((id) => outputs[id] !== undefined)
    .toSorted((left, right) => compareBackgroundTerminalOutputs(outputs[left], outputs[right]));
}

function compareBackgroundTerminalOutputs(
  left: BackgroundTerminalOutput | undefined,
  right: BackgroundTerminalOutput | undefined,
) {
  if (!left || !right) {
    return left ? -1 : right ? 1 : 0;
  }
  if (left.ordinal === right.ordinal) {
    return left.id.localeCompare(right.id);
  }
  return left.ordinal - right.ordinal;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled background terminal value: ${JSON.stringify(value)}`);
}
