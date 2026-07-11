import type { EasyArtifact, EasyRun, EasyRunEvent } from "@generated/backend";

import type { EasyRunStoreData } from "./easy-run-store";

export interface EasyRunEventApplyResult {
  patch: Partial<EasyRunStoreData>;
  resync: boolean;
  speechPlaybackIntent: EasyRunSpeechPlaybackIntent | null;
}

interface EasyRunSpeechPlaybackIntentBase {
  eventId: string;
}

interface EasyRunTerminalSummaryPlaybackIntent extends EasyRunSpeechPlaybackIntentBase {
  source: {
    easyRunId: string;
    workspaceId: string;
  };
  type: "terminal_summary";
}

interface EasyRunHighlightPlaybackIntent extends EasyRunSpeechPlaybackIntentBase {
  source: {
    easyRunId: string;
    highlightId: string;
    workspaceId: string;
  };
  type: "highlight";
}

export type EasyRunSpeechPlaybackIntent =
  | EasyRunHighlightPlaybackIntent
  | EasyRunTerminalSummaryPlaybackIntent;

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
      return applyRunUpdatedEvent(state, event);
    case "easyrun.highlight.created":
      return applyHighlightCreatedEvent(state, event);
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

function applyRunUpdatedEvent(
  state: EasyRunStoreData,
  event: EasyRunEvent,
): EasyRunEventApplyResult {
  const run = requireBranch(event.runUpdated, event.type).run;
  const sameRun = state.latestRun?.id === run.id;
  return {
    patch: {
      artifacts: sameRun ? state.artifacts : [],
      highlights: sameRun ? state.highlights : [],
      latestRun: run,
      status: "ready",
    },
    resync: false,
    speechPlaybackIntent: terminalSummaryPlaybackIntent(state.latestRun, run, event.eventId),
  };
}

function terminalSummaryPlaybackIntent(
  previousRun: EasyRun | null,
  run: EasyRun,
  eventId: string,
): EasyRunSpeechPlaybackIntent | null {
  if (previousRun?.id !== run.id || previousRun.status !== "working") {
    return null;
  }
  switch (run.status) {
    case "completed":
    case "failed":
      return {
        eventId,
        source: { easyRunId: run.id, workspaceId: run.workspaceId },
        type: "terminal_summary",
      };
    case "stopped":
    case "working":
      return null;
  }
}

function applyHighlightCreatedEvent(
  state: EasyRunStoreData,
  event: EasyRunEvent,
): EasyRunEventApplyResult {
  const highlight = requireBranch(event.highlightCreated, event.type).highlight;
  const easyRunId = event.easyRunId;
  if (state.latestRun?.id !== easyRunId || highlight.easyRunId !== easyRunId) {
    return unchangedEventResult(true);
  }
  return {
    patch: {
      highlights: upsertByOrdinal(state.highlights, highlight),
      status: "ready",
    },
    resync: false,
    speechPlaybackIntent: {
      eventId: event.eventId,
      source: {
        easyRunId,
        highlightId: highlight.id,
        workspaceId: event.workspaceId,
      },
      type: "highlight",
    },
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
    speechPlaybackIntent: null,
  };
}

function upsertByOrdinal<T extends { id: string; ordinal: number }>(items: T[], item: T): T[] {
  const next = items.filter((candidate) => candidate.id !== item.id);
  next.push(item);
  next.sort((left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id));
  return next;
}

function unchangedEventResult(resync: boolean): EasyRunEventApplyResult {
  return { patch: {}, resync, speechPlaybackIntent: null };
}

function requireBranch<T>(branch: T | null, eventType: EasyRunEvent["type"]): T {
  if (!branch) {
    throw new Error(`${eventType} is missing its generated payload branch`);
  }
  return branch;
}
