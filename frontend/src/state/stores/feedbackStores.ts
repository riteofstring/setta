import type { ModalInfoType } from "components/Modals/types";
import type {
  SettaBackendLogEvent,
  SettaNotification,
} from "utils/generatedTypes";
import { createWithEqualityFn } from "zustand/traditional";
import { withProjectState, withResetFn } from "../utils";

type ZustandModalState = { open: boolean; modalInfo: ModalInfoType | null };

export const useModal = withProjectState(
  createWithEqualityFn(
    withResetFn<ZustandModalState>(() => ({
      open: false,
      modalInfo: null,
    })),
  ),
);

type ZustandNotificationState = { notifications: Array<SettaNotification> };

export const useNotifications = createWithEqualityFn(
  withResetFn<ZustandNotificationState>(() => ({
    notifications: [],
  })),
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
