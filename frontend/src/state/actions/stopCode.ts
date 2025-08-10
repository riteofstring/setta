import { useProjectState } from "state/definitions";
import { route_kill_subprocesses } from "utils/generatedEndpoints";
import { addTemporaryNotification } from "./notifications";

export async function stopCode() {
  addTemporaryNotification("Stopping subprocesses");
  route_kill_subprocesses({
    projectConfigId: useProjectState.getState().projectConfig.id,
  });
}
