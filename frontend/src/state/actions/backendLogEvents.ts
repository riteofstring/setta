import { useBackendLogEvents } from "state/definitions";
import { SettaBackendLogEvent } from "utils/generatedTypes";

export function addBackendLogEvent(event: SettaBackendLogEvent) {
  useBackendLogEvents.setState((state) => ({
    events: [event, ...state.events],
  }));
}

export function clearBackendLogEvents() {
  useBackendLogEvents.setState(() => ({ events: [] }));
}
