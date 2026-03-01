import { route_redo, route_undo } from "utils/generatedEndpoints";
import { getCurrProjectConfigId } from "./sectionInfos";

function logUndoRedoEvent(event: string, payload: unknown): void {
  console.log(`[undo-redo-debug] ${event} ${JSON.stringify(payload)}`);
}

export function undoProjectState() {
  const payload = {
    steps: 1,
    projectConfigId: getCurrProjectConfigId(),
  };
  logUndoRedoEvent("undo.request", payload);
  const request = route_undo(payload);
  void Promise.resolve(request).then((response) => {
    logUndoRedoEvent("undo.response", {
      payload,
      response,
    });
  });
}

export function redoProjectState() {
  const payload = {
    steps: 1,
    projectConfigId: getCurrProjectConfigId(),
  };
  logUndoRedoEvent("redo.request", payload);
  const request = route_redo(payload);
  void Promise.resolve(request).then((response) => {
    logUndoRedoEvent("redo.response", {
      payload,
      response,
    });
  });
}
