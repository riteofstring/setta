import { SettaBackendLogEvent } from "utils/generatedTypes";
import { createWithEqualityFn } from "zustand/traditional";
import { withProjectState, withResetFn } from "../utils";
import type { CustomRunItem } from "./localStorageStore";

type ZustandRunControl = {
  runMode: CustomRunItem["runMode"];
  continuousRunStarted: boolean;
  continuousRunCustomRunId: string | null;
};

export const useRunControl = withProjectState(
  createWithEqualityFn(
    withResetFn<ZustandRunControl>(() => ({
      runMode: "once",
      continuousRunStarted: false,
      continuousRunCustomRunId: null,
    })),
  ),
);

type BackendLogSeverity = SettaBackendLogEvent["severity"];

export type BackendLogEventsFilter = {
  projectConfigId: string | null;
  minSeverity: BackendLogSeverity;
  query: string;
};

export const DEFAULT_BACKEND_LOG_EVENTS_FILTER: BackendLogEventsFilter = {
  projectConfigId: null,
  minSeverity: "info",
  query: "",
};

type BackendLogEventsState = {
  events: Array<SettaBackendLogEvent>;
  filter: BackendLogEventsFilter;
  unreadHighSeverityCount: number;
};

export const useBackendLogEvents = withProjectState(
  createWithEqualityFn(
    withResetFn<BackendLogEventsState>(() => ({
      events: [],
      filter: { ...DEFAULT_BACKEND_LOG_EVENTS_FILTER },
      unreadHighSeverityCount: 0,
    })),
  ),
);
