import type {
  EasyArtifact,
  EasyHighlight,
  EasyRun,
  EasyRunEvent,
  EasyRunSnapshot,
} from "@generated/backend";
import { create } from "zustand";

import { applyEasyRunEvent } from "./easy-run-events";

type EasyRunStoreStatus = "idle" | "loading" | "ready" | "error";

export interface EasyRunStoreData {
  artifacts: EasyArtifact[];
  error: string | null;
  highlights: EasyHighlight[];
  lastEventSequence: number;
  lastEventStreamId: string;
  latestRun: EasyRun | null;
  status: EasyRunStoreStatus;
  workspaceId: string | null;
}

interface EasyRunStoreActions {
  handleEvent: (event: EasyRunEvent) => void;
  hydrateSnapshot: (workspaceId: string, snapshot: EasyRunSnapshot) => void;
  loadSnapshot: (workspaceId: string) => Promise<void>;
  reset: () => void;
  start: (workspaceId: string, requestText: string) => Promise<EasyRun>;
  steer: (workspaceId: string, text: string) => Promise<EasyRun>;
  stop: (workspaceId: string, easyRunId: string) => Promise<EasyRun>;
}

export type EasyRunStore = EasyRunStoreData & EasyRunStoreActions;

const initialEasyRunStoreData: EasyRunStoreData = {
  artifacts: [],
  error: null,
  highlights: [],
  lastEventSequence: 0,
  lastEventStreamId: "",
  latestRun: null,
  status: "idle",
  workspaceId: null,
};

export const useEasyRunStore = create<EasyRunStore>((set, get) => {
  let snapshotRequestID = 0;

  function resyncFromEventStream() {
    const workspaceId = get().workspaceId;
    if (!workspaceId) {
      return;
    }
    void get().loadSnapshot(workspaceId);
  }

  return {
    ...initialEasyRunStoreData,
    handleEvent: (event) => {
      const state = get();
      if (isDuplicateEvent(state, event)) {
        return;
      }
      if (event.type === "easyrun.resync_required") {
        const payload = event.resyncRequired;
        if (!payload) {
          throw new Error("easyrun.resync_required is missing its generated payload branch");
        }
        set({
          lastEventSequence: payload.currentSequence,
          lastEventStreamId: payload.currentStreamId,
        });
        resyncFromEventStream();
        return;
      }
      if (isUnexpectedStream(state, event) || hasSequenceGap(state, event)) {
        set({ lastEventSequence: event.sequence, lastEventStreamId: event.streamId });
        resyncFromEventStream();
        return;
      }
      const result = applyEasyRunEvent(state, event);
      set({
        ...result.patch,
        lastEventSequence: event.sequence,
        lastEventStreamId: event.streamId,
      });
      if (result.resync) {
        resyncFromEventStream();
      }
    },
    hydrateSnapshot: (workspaceId, snapshot) => {
      set(snapshotPatch(workspaceId, snapshot));
    },
    loadSnapshot: async (workspaceId) => {
      const requestID = snapshotRequestID + 1;
      snapshotRequestID = requestID;
      set((current) => ({
        error: null,
        status: "loading",
        workspaceId,
        ...(current.workspaceId === workspaceId
          ? {}
          : {
              artifacts: [],
              highlights: [],
              lastEventSequence: 0,
              lastEventStreamId: "",
              latestRun: null,
            }),
      }));
      try {
        const snapshot = await window.setta.easyRun.snapshot(workspaceId);
        if (snapshotRequestID !== requestID) {
          return;
        }
        set(snapshotPatch(workspaceId, snapshot));
      } catch (error) {
        if (snapshotRequestID !== requestID) {
          return;
        }
        set({
          error: errorMessage(error),
          status: "error",
          workspaceId,
        });
      }
    },
    reset: () => {
      snapshotRequestID += 1;
      set(initialEasyRunStoreData);
    },
    start: async (workspaceId, requestText) => {
      set({
        error: null,
        status: "loading",
        workspaceId,
      });
      try {
        const run = await window.setta.easyRun.start({ requestText, workspaceId });
        set((state) => runPatch(state, workspaceId, run));
        return run;
      } catch (error) {
        set({
          error: errorMessage(error),
          status: "error",
          workspaceId,
        });
        throw error;
      }
    },
    steer: async (workspaceId, text) => {
      set({
        error: null,
        workspaceId,
      });
      try {
        const run = await window.setta.easyRun.steer({ text, workspaceId });
        set((state) => runPatch(state, workspaceId, run));
        return run;
      } catch (error) {
        set({
          error: errorMessage(error),
          status: "error",
          workspaceId,
        });
        throw error;
      }
    },
    stop: async (workspaceId, easyRunId) => {
      set({
        error: null,
        workspaceId,
      });
      try {
        const run = await window.setta.easyRun.stop({ easyRunId, workspaceId });
        set((state) => runPatch(state, workspaceId, run));
        return run;
      } catch (error) {
        set({
          error: errorMessage(error),
          status: "error",
          workspaceId,
        });
        throw error;
      }
    },
  };
});

function runPatch(
  state: EasyRunStoreData,
  workspaceId: string,
  run: EasyRun,
): Partial<EasyRunStoreData> {
  const sameRun = state.latestRun?.id === run.id;
  return {
    artifacts: sameRun ? state.artifacts : [],
    error: null,
    highlights: sameRun ? state.highlights : [],
    latestRun: run,
    status: "ready",
    workspaceId,
  };
}

function snapshotPatch(workspaceId: string, snapshot: EasyRunSnapshot): Partial<EasyRunStoreData> {
  return {
    artifacts: [...snapshot.artifacts],
    error: null,
    highlights: [...snapshot.highlights],
    lastEventSequence: snapshot.eventStreamCursor.sequence,
    lastEventStreamId: snapshot.eventStreamCursor.streamId,
    latestRun: snapshot.latestRun,
    status: "ready",
    workspaceId,
  };
}

function isUnexpectedStream(state: EasyRunStoreData, event: EasyRunEvent): boolean {
  return state.lastEventStreamId !== "" && event.streamId !== state.lastEventStreamId;
}

function isDuplicateEvent(state: EasyRunStoreData, event: EasyRunEvent): boolean {
  return event.streamId === state.lastEventStreamId && event.sequence <= state.lastEventSequence;
}

function hasSequenceGap(state: EasyRunStoreData, event: EasyRunEvent): boolean {
  return (
    event.streamId === state.lastEventStreamId &&
    state.lastEventSequence !== 0 &&
    event.sequence !== state.lastEventSequence + 1
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Easy-run operation failed";
}
