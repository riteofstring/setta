import {
  BackendLogEventsFilter,
  DEFAULT_BACKEND_LOG_EVENTS_FILTER,
  useBackendLogEvents,
} from "state/definitions";
import { SettaBackendLogEvent } from "utils/generatedTypes";

const MAX_BACKEND_LOG_EVENTS = 500;

export function addBackendLogEvent(event: SettaBackendLogEvent) {
  useBackendLogEvents.setState((state) => ({
    events: [event, ...state.events].slice(0, MAX_BACKEND_LOG_EVENTS),
  }));
}

export function clearBackendLogEvents() {
  useBackendLogEvents.setState(() => ({ events: [] }));
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
