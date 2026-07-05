import type { EasyArtifact, EasyHighlight, EasyRun, EasyRunEvent } from "@generated/backend";

import type { EasyRunStoreData } from "./easy-run-store";

export interface EasyRunEventApplyResult {
  patch: Partial<EasyRunStoreData>;
  resync: boolean;
}

export function applyEasyRunEvent(
  state: EasyRunStoreData,
  event: EasyRunEvent,
): EasyRunEventApplyResult {
  if (event.type === "easyrun.resync_required") {
    return unchangedEventResult(true);
  }
  if (event.workspaceId !== state.workspaceId) {
    return unchangedEventResult(false);
  }
  switch (event.type) {
    case "easyrun.run.updated":
      return applyRunUpdatedEvent(state, requireBranch(event.runUpdated, event.type).run);
    case "easyrun.highlight.created":
      return applyHighlightCreatedEvent(
        state,
        event.easyRunId,
        requireBranch(event.highlightCreated, event.type).highlight,
      );
    case "easyrun.artifact.created":
      return applyArtifactCreatedEvent(
        state,
        event.easyRunId,
        requireBranch(event.artifactCreated, event.type).artifact,
      );
    default:
      throw new Error("Unsupported easy-run event: " + event.type);
  }
}

function applyRunUpdatedEvent(state: EasyRunStoreData, run: EasyRun): EasyRunEventApplyResult {
  const sameRun = state.latestRun?.id === run.id;
  return {
    patch: {
      artifacts: sameRun ? state.artifacts : [],
      highlights: sameRun ? state.highlights : [],
      latestRun: run,
      status: "ready",
    },
    resync: false,
  };
}

function applyHighlightCreatedEvent(
  state: EasyRunStoreData,
  easyRunId: string,
  highlight: EasyHighlight,
): EasyRunEventApplyResult {
  if (state.latestRun?.id !== easyRunId || highlight.easyRunId !== easyRunId) {
    return unchangedEventResult(true);
  }
  return {
    patch: {
      highlights: upsertByOrdinal(state.highlights, highlight),
      status: "ready",
    },
    resync: false,
  };
}

function applyArtifactCreatedEvent(
  state: EasyRunStoreData,
  easyRunId: string,
  artifact: EasyArtifact,
): EasyRunEventApplyResult {
  if (state.latestRun?.id !== easyRunId || artifact.easyRunId !== easyRunId) {
    return unchangedEventResult(true);
  }
  return {
    patch: {
      artifacts: upsertByOrdinal(state.artifacts, artifact),
      status: "ready",
    },
    resync: false,
  };
}

function upsertByOrdinal<T extends { id: string; ordinal: number }>(items: T[], item: T): T[] {
  const next = items.filter((candidate) => candidate.id !== item.id);
  next.push(item);
  next.sort((left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id));
  return next;
}

function unchangedEventResult(resync: boolean): EasyRunEventApplyResult {
  return { patch: {}, resync };
}

function requireBranch<T>(branch: T | null, eventType: EasyRunEvent["type"]): T {
  if (!branch) {
    throw new Error(`${eventType} is missing its generated payload branch`);
  }
  return branch;
}
