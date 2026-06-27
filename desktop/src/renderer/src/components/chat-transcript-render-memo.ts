import type { RunActivityGroupProjection, RunItemOutput } from "@generated/backend";

import type { RunItemOutputPageState } from "../stores/chat-store";

export interface MessageRunActivityMaps {
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputsById: Record<string, RunItemOutput>;
}

export function activityOutputPropsEqual(
  previous: MessageRunActivityMaps,
  next: MessageRunActivityMaps,
  activity: RunActivityGroupProjection | null | undefined,
) {
  if (!activity) {
    return true;
  }
  return activity.rows.every((row) => runItemOutputPropsEqual(previous, next, row.sourceRunItemId));
}

function runItemOutputPropsEqual(
  previous: MessageRunActivityMaps,
  next: MessageRunActivityMaps,
  itemId: string,
) {
  return (
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
