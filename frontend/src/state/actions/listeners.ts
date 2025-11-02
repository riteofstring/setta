import { addTemporaryNotification } from "state/actions/notifications";
import { NULL_PROJECT_CONFIG_ID } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_force_refresh_project } from "utils/generatedEndpoints";

import { getCurrProjectConfigId } from "./sectionInfos";

export async function triggerListenerForceRefresh(): Promise<boolean> {
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    addTemporaryNotification("Select a project before sending a force refresh.");
    return false;
  }

  const res = await route_force_refresh_project({
    projectConfigId,
  });

  if (res200(res)) {
    addTemporaryNotification("Force refresh dispatched to project listeners.");
    return true;
  }

  addTemporaryNotification("Failed to dispatch force refresh.");
  return false;
}
