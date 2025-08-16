import { useProjectState } from "state/definitions";
import { route_redo, route_undo } from "utils/generatedEndpoints";

export function undoProjectState() {
  route_undo({
    steps: 1,
    projectConfigId: useProjectState.getState().projectConfig.id,
  });
}

export function redoProjectState() {
  route_redo({
    steps: 1,
    projectConfigId: useProjectState.getState().projectConfig.id,
  });
}
