import { route_redo, route_undo } from "utils/generatedEndpoints";
import { getCurrProjectConfigId } from "./sectionInfos";

export function undoProjectState() {
  route_undo({
    steps: 1,
    projectConfigId: getCurrProjectConfigId(),
  });
}

export function redoProjectState() {
  route_redo({
    steps: 1,
    projectConfigId: getCurrProjectConfigId(),
  });
}
