import {
  useLocalStorage,
} from "state/definitions";
import {
  DEFAULT_BACKEND_LOG_EVENTS_FILTER,
  useBackendLogEvents,
  type BackendLogEventsFilter,
} from "state/stores/feedbackStores";
import {
  OverviewNotificationsPaneTabEnum,
  OverviewTabNameEnum,
} from "utils/constants";
import { SettaBackendLogEvent } from "utils/generatedTypes";

const MAX_BACKEND_LOG_EVENTS = 500;

function isHighSeverity(event: SettaBackendLogEvent) {
  return event.severity === "error" || event.severity === "critical";
}

function backendLogsTabIsVisible() {
  const { overviewTab, overviewVis, overviewNotificationsPaneTab } =
    useLocalStorage.getState();
  if (!overviewVis) {
    return false;
  }
  return (
    overviewTab === OverviewTabNameEnum.Notifications &&
    overviewNotificationsPaneTab ===
      OverviewNotificationsPaneTabEnum.BackendLogs
  );
}

export function addBackendLogEvent(event: SettaBackendLogEvent) {
  const markUnread = isHighSeverity(event) && !backendLogsTabIsVisible();
  useBackendLogEvents.setState((state) => ({
    events: [event, ...state.events].slice(0, MAX_BACKEND_LOG_EVENTS),
    unreadHighSeverityCount: markUnread
      ? state.unreadHighSeverityCount + 1
      : state.unreadHighSeverityCount,
  }));
}

export function clearBackendLogEvents() {
  useBackendLogEvents.setState(() => ({
    events: [],
    unreadHighSeverityCount: 0,
  }));
}

export function markBackendLogEventsHighSeverityAsRead() {
  useBackendLogEvents.setState(() => ({ unreadHighSeverityCount: 0 }));
}

export function setBackendLogEventsFilter(
  patch: Partial<BackendLogEventsFilter>,
) {
  useBackendLogEvents.setState((state) => ({
    filter: { ...state.filter, ...patch },
  }));
}

export function resetBackendLogEventsFilter() {
  useBackendLogEvents.setState(() => ({
    filter: { ...DEFAULT_BACKEND_LOG_EVENTS_FILTER },
  }));
}
