import {
  setWorkspacePanDiagnosticLogger,
  type WorkspacePanDiagnosticEvent,
} from "@setta/workspace";

const MAX_RETAINED_EVENTS = 10_000;
const CONSOLE_PREFIX = "[setta:pan]";

type PlaygroundPanDiagnostics = {
  events: Array<WorkspacePanDiagnosticEvent>;
  clear: () => void;
};

declare global {
  interface Window {
    __SETTA_PAN_DIAGNOSTICS__: PlaygroundPanDiagnostics;
  }
}

export function installPlaygroundPanDiagnostics(): void {
  const events: Array<WorkspacePanDiagnosticEvent> = [];
  window.__SETTA_PAN_DIAGNOSTICS__ = {
    events,
    clear: () => {
      events.length = 0;
    },
  };

  setWorkspacePanDiagnosticLogger((event) => {
    if (events.length === MAX_RETAINED_EVENTS) {
      events.splice(0, MAX_RETAINED_EVENTS / 2);
    }
    events.push(event);
    console.info(CONSOLE_PREFIX, JSON.stringify(event));
  });
}
