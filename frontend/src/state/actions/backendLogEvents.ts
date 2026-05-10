import {
  BackendLogEventsFilter,
  DEFAULT_BACKEND_LOG_EVENTS_FILTER,
  useBackendLogEvents,
  useLocalStorage,
} from "state/definitions";
import { OverviewNotificationsPaneTabEnum } from "utils/constants";
import {
  OverviewTabUIConfig,
  type BackendLogEvent,
} from "utils/generatedTypes";

const MAX_BACKEND_LOG_EVENTS = 500;

function isHighSeverity(event: BackendLogEvent) {
  return event.severity === "error" || event.severity === "critical";
}

function backendLogsTabIsVisible() {
  const { overviewTab, overviewVis, overviewNotificationsPaneTab } =
    useLocalStorage.getState();
  if (!overviewVis) {
    return false;
  }
  return (
    overviewTab === OverviewTabUIConfig.names.Notifications &&
    overviewNotificationsPaneTab ===
      OverviewNotificationsPaneTabEnum.BackendLogs
  );
}

export function addBackendLogEvent(event: BackendLogEvent) {
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
