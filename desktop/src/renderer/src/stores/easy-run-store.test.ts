import type {
  EasyArtifact,
  EasyHighlight,
  EasyRun,
  EasyRunEvent,
  EasyRunSnapshot,
} from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useEasyRunStore } from "./easy-run-store";

const workspaceId = "workspace_api";
const eventStreamId = "easyrun_events";

describe("easy-run store", () => {
  beforeEach(() => {
    useEasyRunStore.setState(useEasyRunStore.getInitialState(), true);
  });

  test("hydrates an empty snapshot with the event cursor", async () => {
    const snapshot = easyRunSnapshot({ sequence: 4 });
    installEasyRunAPI({
      snapshot: vi.fn<SettaAPI["easyRun"]["snapshot"]>().mockResolvedValue(snapshot),
    });

    await useEasyRunStore.getState().loadSnapshot(workspaceId);

    expect(useEasyRunStore.getState()).toMatchObject({
      artifacts: [],
      highlights: [],
      lastEventSequence: 4,
      lastEventStreamId: eventStreamId,
      latestRun: null,
      status: "ready",
      workspaceId,
    });
  });

  test("applies typed run, highlight, and artifact events without transcript input", () => {
    useEasyRunStore.getState().hydrateSnapshot(workspaceId, easyRunSnapshot({ sequence: 0 }));

    useEasyRunStore.getState().handleEvent(runUpdatedEvent(1, easyRun("easy_run_api")));
    useEasyRunStore.getState().handleEvent(highlightCreatedEvent(2, highlight(2)));
    useEasyRunStore.getState().handleEvent(highlightCreatedEvent(3, highlight(1)));
    useEasyRunStore.getState().handleEvent(artifactCreatedEvent(4, markdownArtifact(1)));

    expect(useEasyRunStore.getState().latestRun?.id).toBe("easy_run_api");
    expect(useEasyRunStore.getState().highlights.map((item) => item.ordinal)).toEqual([1, 2]);
    expect(useEasyRunStore.getState().artifacts.map((item) => item.id)).toEqual(["artifact_1"]);
    expect(useEasyRunStore.getState().lastEventSequence).toBe(4);
  });

  test("starts a run through the typed easy-run API and clears stale rails", async () => {
    const started = easyRun("easy_run_started");
    const start = vi.fn<SettaAPI["easyRun"]["start"]>().mockResolvedValue(started);
    installEasyRunAPI({ start });
    useEasyRunStore.getState().hydrateSnapshot(
      workspaceId,
      easyRunSnapshot({
        artifacts: [markdownArtifact(1)],
        highlights: [highlight(1)],
        latestRun: easyRun("easy_run_old"),
        sequence: 3,
      }),
    );

    const run = await useEasyRunStore.getState().start(workspaceId, "Do the work");

    expect(start).toHaveBeenCalledWith({ requestText: "Do the work", workspaceId });
    expect(run).toBe(started);
    expect(useEasyRunStore.getState()).toMatchObject({
      artifacts: [],
      error: null,
      highlights: [],
      latestRun: started,
      status: "ready",
      workspaceId,
    });
    expect(useEasyRunStore.getState().lastEventSequence).toBe(3);
  });

  test("stops the current run through the typed easy-run API and preserves rails", async () => {
    const current = easyRun("easy_run_current");
    const stopped: EasyRun = {
      ...current,
      activeAgentCount: 0,
      endedAt: "2026-07-08T12:00:05Z",
      status: "stopped",
      summary: "Stopped after 5s - no artifacts",
    };
    const stop = vi.fn<SettaAPI["easyRun"]["stop"]>().mockResolvedValue(stopped);
    installEasyRunAPI({ stop });
    useEasyRunStore.getState().hydrateSnapshot(
      workspaceId,
      easyRunSnapshot({
        artifacts: [markdownArtifact(1)],
        highlights: [highlight(1)],
        latestRun: current,
        sequence: 4,
      }),
    );

    const run = await useEasyRunStore.getState().stop(workspaceId, current.id);

    expect(stop).toHaveBeenCalledWith({ easyRunId: current.id, workspaceId });
    expect(run).toBe(stopped);
    expect(useEasyRunStore.getState().latestRun).toBe(stopped);
    expect(useEasyRunStore.getState().highlights.map((item) => item.id)).toEqual(["highlight_1"]);
    expect(useEasyRunStore.getState().artifacts.map((item) => item.id)).toEqual(["artifact_1"]);
    expect(useEasyRunStore.getState().lastEventSequence).toBe(4);
  });

  test("steers the current run through the typed easy-run API and preserves rails", async () => {
    const current = easyRun("easy_run_current");
    const steer = vi.fn<SettaAPI["easyRun"]["steer"]>().mockResolvedValue(current);
    installEasyRunAPI({ steer });
    useEasyRunStore.getState().hydrateSnapshot(
      workspaceId,
      easyRunSnapshot({
        artifacts: [markdownArtifact(1)],
        highlights: [highlight(1)],
        latestRun: current,
        sequence: 5,
      }),
    );

    const run = await useEasyRunStore.getState().steer(workspaceId, "keep going");

    expect(steer).toHaveBeenCalledWith({ text: "keep going", workspaceId });
    expect(run).toBe(current);
    expect(useEasyRunStore.getState().latestRun).toBe(current);
    expect(useEasyRunStore.getState().highlights.map((item) => item.id)).toEqual(["highlight_1"]);
    expect(useEasyRunStore.getState().artifacts.map((item) => item.id)).toEqual(["artifact_1"]);
    expect(useEasyRunStore.getState().lastEventSequence).toBe(5);
  });

  test("does not regress a terminal run when a same-run action response is stale", async () => {
    const working = easyRun("easy_run_current");
    const terminal = completedEasyRun(working, "Done in <1s - no artifacts");
    const steer = vi.fn<SettaAPI["easyRun"]["steer"]>().mockResolvedValue(working);
    installEasyRunAPI({ steer });
    useEasyRunStore.getState().hydrateSnapshot(
      workspaceId,
      easyRunSnapshot({
        latestRun: working,
        sequence: 5,
      }),
    );
    useEasyRunStore.getState().handleEvent(runUpdatedEvent(6, terminal));

    await useEasyRunStore.getState().steer(workspaceId, "keep going");

    expect(useEasyRunStore.getState().latestRun).toBe(terminal);
    expect(useEasyRunStore.getState().lastEventSequence).toBe(6);
  });

  test("clears rails when a new run arrives", () => {
    useEasyRunStore.getState().hydrateSnapshot(
      workspaceId,
      easyRunSnapshot({
        artifacts: [markdownArtifact(1)],
        highlights: [highlight(1)],
        latestRun: easyRun("easy_run_old"),
      }),
    );

    useEasyRunStore.getState().handleEvent(runUpdatedEvent(1, easyRun("easy_run_new")));

    expect(useEasyRunStore.getState().latestRun?.id).toBe("easy_run_new");
    expect(useEasyRunStore.getState().highlights).toEqual([]);
    expect(useEasyRunStore.getState().artifacts).toEqual([]);
  });

  test("resyncs from snapshot on sequence gaps", async () => {
    const snapshot = easyRunSnapshot({ latestRun: easyRun("easy_run_resynced"), sequence: 9 });
    const readSnapshot = vi.fn<SettaAPI["easyRun"]["snapshot"]>().mockResolvedValue(snapshot);
    installEasyRunAPI({ snapshot: readSnapshot });
    useEasyRunStore.getState().hydrateSnapshot(workspaceId, easyRunSnapshot({ sequence: 2 }));

    useEasyRunStore.getState().handleEvent(runUpdatedEvent(4, easyRun("easy_run_gap")));
    await vi.waitFor(() => expect(readSnapshot).toHaveBeenCalledWith(workspaceId));

    expect(useEasyRunStore.getState().latestRun?.id).toBe("easy_run_resynced");
    expect(useEasyRunStore.getState().lastEventSequence).toBe(9);
  });

  test("handles resync-required events before duplicate filtering", async () => {
    const snapshot = easyRunSnapshot({ latestRun: easyRun("easy_run_resynced"), sequence: 7 });
    const readSnapshot = vi.fn<SettaAPI["easyRun"]["snapshot"]>().mockResolvedValue(snapshot);
    installEasyRunAPI({ snapshot: readSnapshot });
    useEasyRunStore
      .getState()
      .hydrateSnapshot(
        workspaceId,
        easyRunSnapshot({ latestRun: easyRun("easy_run_selected"), sequence: 5 }),
      );

    useEasyRunStore.getState().handleEvent(resyncRequiredEvent(4));
    await vi.waitFor(() => expect(readSnapshot).toHaveBeenCalledWith(workspaceId));

    expect(useEasyRunStore.getState().latestRun?.id).toBe("easy_run_resynced");
    expect(useEasyRunStore.getState().lastEventSequence).toBe(7);
  });

  test("advances the cursor for other workspaces without mutating selected workspace data", () => {
    useEasyRunStore
      .getState()
      .hydrateSnapshot(
        workspaceId,
        easyRunSnapshot({ latestRun: easyRun("easy_run_selected"), sequence: 0 }),
      );

    useEasyRunStore
      .getState()
      .handleEvent(runUpdatedEvent(1, easyRun("easy_run_other", "workspace_other")));

    expect(useEasyRunStore.getState().latestRun?.id).toBe("easy_run_selected");
    expect(useEasyRunStore.getState().lastEventSequence).toBe(1);
  });
});

function installEasyRunAPI(overrides: Partial<SettaAPI["easyRun"]>) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setta: {
        easyRun: {
          onEvent: () => () => {},
          snapshot: async () => easyRunSnapshot({}),
          start: async () => easyRun("easy_run_started"),
          steer: async () => easyRun("easy_run_steered"),
          stop: async () => easyRun("easy_run_stopped"),
          ...overrides,
        },
      } as unknown as SettaAPI,
    },
  });
}

function easyRunSnapshot({
  artifacts = [],
  highlights = [],
  latestRun = null,
  sequence = 0,
}: {
  artifacts?: EasyArtifact[];
  highlights?: EasyHighlight[];
  latestRun?: EasyRun | null;
  sequence?: number;
}): EasyRunSnapshot {
  return {
    artifacts,
    eventStreamCursor: { sequence, streamId: eventStreamId },
    highlights,
    latestRun,
  };
}

function easyRun(id: string, runWorkspaceId = workspaceId): EasyRun {
  return {
    activeAgentCount: 1,
    artifactCount: 0,
    conversationId: "conversation_" + id,
    endedAt: null,
    error: null,
    highlightCount: 0,
    id,
    narratorStatus: "ok",
    requestText: "Do the work",
    startedAt: "2026-07-08T12:00:00Z",
    status: "working",
    summary: null,
    workspaceId: runWorkspaceId,
  };
}

function completedEasyRun(run: EasyRun, summary: string): EasyRun {
  return {
    ...run,
    activeAgentCount: 0,
    endedAt: "2026-07-08T12:00:01Z",
    status: "completed",
    summary,
  };
}

function highlight(ordinal: number): EasyHighlight {
  return {
    at: "2026-07-08T12:00:0" + ordinal + "Z",
    easyRunId: "easy_run_api",
    id: "highlight_" + ordinal,
    ordinal,
    text: "Phase " + ordinal,
  };
}

function markdownArtifact(ordinal: number): EasyArtifact {
  return {
    barChart: null,
    createdAt: "2026-07-08T12:01:00Z",
    easyRunId: "easy_run_api",
    file: null,
    id: "artifact_" + ordinal,
    kind: "markdown",
    kicker: null,
    markdown: { markdown: "Report" },
    ordinal,
    table: null,
    title: "Report",
  };
}

function runUpdatedEvent(sequence: number, run: EasyRun): EasyRunEvent {
  return {
    artifactCreated: null,
    easyRunId: run.id,
    emittedAt: "2026-07-08T12:00:00Z",
    eventId: `${eventStreamId}:${sequence}`,
    highlightCreated: null,
    resyncRequired: null,
    runUpdated: { run },
    schemaVersion: 1,
    sequence,
    streamId: eventStreamId,
    type: "easyrun.run.updated",
    workspaceId: run.workspaceId,
  };
}

function highlightCreatedEvent(sequence: number, item: EasyHighlight): EasyRunEvent {
  return {
    artifactCreated: null,
    easyRunId: item.easyRunId,
    emittedAt: "2026-07-08T12:00:00Z",
    eventId: `${eventStreamId}:${sequence}`,
    highlightCreated: { highlight: item },
    resyncRequired: null,
    runUpdated: null,
    schemaVersion: 1,
    sequence,
    streamId: eventStreamId,
    type: "easyrun.highlight.created",
    workspaceId,
  };
}

function artifactCreatedEvent(sequence: number, artifact: EasyArtifact): EasyRunEvent {
  return {
    artifactCreated: { artifact },
    easyRunId: artifact.easyRunId,
    emittedAt: "2026-07-08T12:00:00Z",
    eventId: `${eventStreamId}:${sequence}`,
    highlightCreated: null,
    resyncRequired: null,
    runUpdated: null,
    schemaVersion: 1,
    sequence,
    streamId: eventStreamId,
    type: "easyrun.artifact.created",
    workspaceId,
  };
}

function resyncRequiredEvent(sequence: number): EasyRunEvent {
  return {
    artifactCreated: null,
    easyRunId: "easy_run_selected",
    emittedAt: "2026-07-08T12:00:00Z",
    eventId: `${eventStreamId}:${sequence}`,
    highlightCreated: null,
    resyncRequired: {
      currentSequence: sequence,
      currentStreamId: eventStreamId,
      earliestSequence: sequence,
      reason: "event replay is no longer available",
      requestedSequence: 5,
      requestedStreamId: eventStreamId,
    },
    runUpdated: null,
    schemaVersion: 1,
    sequence,
    streamId: eventStreamId,
    type: "easyrun.resync_required",
    workspaceId,
  };
}
