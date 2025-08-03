import _ from "lodash";
import { useSettings } from "state/definitions";
import { route_redo, route_undo } from "utils/generatedEndpoints";
import { saveProject } from "./project/saveProject";

export function undoProjectState() {
  route_undo({ steps: 1 });
}

export function redoProjectState() {
  route_redo({ steps: 1 });
}

const autoSave = _.debounce(() => {
  if (useSettings.getState().backend.autosave) {
    saveProject();
  }
}, 1000);
