import {
  setWorkspacePanDiagnosticLogger,
  type WorkspacePanDiagnosticEvent,
} from "@setta/workspace";

const MAX_RETAINED_EVENTS = 800;
const STORAGE_KEY = "setta:pan-diagnostics:v2";
const CONSOLE_PREFIX = "[setta:pan]";
const OUTPUT_ELEMENT_ID = "setta-pan-diagnostics";

type PlaygroundPanDiagnostics = {
  events: Array<WorkspacePanDiagnosticEvent>;
  clear: () => void;
  json: () => string;
  tail: (count?: number) => ReadonlyArray<WorkspacePanDiagnosticEvent>;
};

declare global {
  interface Window {
    __SETTA_PAN_DIAGNOSTICS__: PlaygroundPanDiagnostics;
  }
}

function readRetainedEvents(): Array<WorkspacePanDiagnosticEvent> {
  const serialized = sessionStorage.getItem(STORAGE_KEY);
  if (serialized === null) {
    return [];
  }
  const parsed: unknown = JSON.parse(serialized);
  if (!Array.isArray(parsed)) {
    throw new Error("Stored Setta pan diagnostics must be an array.");
  }
  return parsed as Array<WorkspacePanDiagnosticEvent>;
}

function persistEvents(events: ReadonlyArray<WorkspacePanDiagnosticEvent>): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function createDiagnosticOutput(events: ReadonlyArray<WorkspacePanDiagnosticEvent>): HTMLElement {
  const output = document.createElement("script");
  output.id = OUTPUT_ELEMENT_ID;
  output.dataset.settaPanDiagnostics = "retained-events";
  output.setAttribute("type", "application/json");
  output.textContent = JSON.stringify(events);
  document.head.appendChild(output);
  return output;
}

export function installPlaygroundPanDiagnostics(): void {
  const events = readRetainedEvents();
  document.getElementById(OUTPUT_ELEMENT_ID)?.remove();
  const output = createDiagnosticOutput(events);
  window.__SETTA_PAN_DIAGNOSTICS__ = {
    events,
    clear: () => {
      events.length = 0;
      sessionStorage.removeItem(STORAGE_KEY);
      output.textContent = "[]";
    },
    json: () => JSON.stringify(events),
    tail: (count = 100) => events.slice(-Math.max(0, Math.floor(count))),
  };

  setWorkspacePanDiagnosticLogger((event) => {
    if (events.length === MAX_RETAINED_EVENTS) {
      events.splice(0, MAX_RETAINED_EVENTS / 2);
    }
    events.push(event);
    persistEvents(events);
    output.textContent = JSON.stringify(events);
    console.info(CONSOLE_PREFIX, JSON.stringify(event));
  });
}
