import { route_redo, route_undo } from "utils/generatedEndpoints";

export function undoProjectState() {
  route_undo({ steps: 1 });
}

export function redoProjectState() {
  route_redo({ steps: 1 });
}
