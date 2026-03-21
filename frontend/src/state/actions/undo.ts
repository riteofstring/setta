import { useMisc } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_redo, route_undo } from "utils/generatedEndpoints";
import {
  getCurrProjectConfigId,
  processProjectStateUpdateFromBackend,
} from "./sectionInfos";

async function applyProjectHistoryMutation(
  routeFn: typeof route_undo | typeof route_redo,
) {
  const response = await routeFn({
    steps: 1,
    projectConfigId: getCurrProjectConfigId(),
  });
  if (!res200(response)) {
    return;
  }
  processProjectStateUpdateFromBackend(response.data);
  useMisc.setState({ undoOrRedoWasTriggered: true });
}

export function undoProjectState() {
  void applyProjectHistoryMutation(route_undo);
}

export function redoProjectState() {
  void applyProjectHistoryMutation(route_redo);
}
