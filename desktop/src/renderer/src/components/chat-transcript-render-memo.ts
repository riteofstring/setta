import type { ChatMessage, RunItem, RunItemOutput } from "@generated/backend";

import type { RunItemOutputPageState } from "../stores/chat-store";

export interface MessageRunActivityMaps {
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputsById: Record<string, RunItemOutput>;
  runItemsById: Record<string, RunItem>;
}

export function messageRunActivityPropsEqual(
  previous: MessageRunActivityMaps,
  next: MessageRunActivityMaps,
  message: ChatMessage,
) {
  if (message.role === "user" || message.runId === "") {
    return true;
  }
  return runActivityPropsEqualForRun(previous, next, message.runId);
}

function runActivityPropsEqualForRun(
  previous: MessageRunActivityMaps,
  next: MessageRunActivityMaps,
  runId: string,
) {
  const previousItemIds = previous.runItemIdsByRunId[runId] ?? [];
  const nextItemIds = next.runItemIdsByRunId[runId] ?? [];
  return (
    sameStringItems(previousItemIds, nextItemIds) &&
    nextItemIds.every((itemId) => runItemActivityPropsEqual(previous, next, itemId))
  );
}

function runItemActivityPropsEqual(
  previous: MessageRunActivityMaps,
  next: MessageRunActivityMaps,
  itemId: string,
) {
  return (
    previous.runItemsById[itemId] === next.runItemsById[itemId] &&
    previous.runItemOutputPagesByRunItemId[itemId] === next.runItemOutputPagesByRunItemId[itemId] &&
    runItemOutputsEqual(previous, next, itemId)
  );
}

function runItemOutputsEqual(
  previous: MessageRunActivityMaps,
  next: MessageRunActivityMaps,
  itemId: string,
) {
  const previousOutputIds = previous.runItemOutputIdsByRunItemId[itemId] ?? [];
  const nextOutputIds = next.runItemOutputIdsByRunItemId[itemId] ?? [];
  return (
    sameStringItems(previousOutputIds, nextOutputIds) &&
    nextOutputIds.every(
      (outputId) => previous.runItemOutputsById[outputId] === next.runItemOutputsById[outputId],
    )
  );
}

function sameStringItems(previous: readonly string[], next: readonly string[]) {
  if (previous === next) {
    return true;
  }
  if (previous.length !== next.length) {
    return false;
  }
  return previous.every((item, index) => item === next[index]);
}
