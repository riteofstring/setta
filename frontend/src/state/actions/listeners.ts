import { forceRefreshListener } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { addTemporaryNotification } from "state/actions/notifications";
import { NULL_PROJECT_CONFIG_ID } from "state/definitions";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";

import { getCurrProjectConfigId } from "./sectionInfos";

type ForceRefreshListenerRouteResponse = ResponseDataAndStatus<null>;

export async function triggerListenerForceRefresh(): Promise<boolean> {
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    addTemporaryNotification(
      "Select a project before sending a listener force refresh.",
    );
    return false;
  }

  const res: ForceRefreshListenerRouteResponse = await callOpenAPI(
    forceRefreshListener({
      body: {
        projectConfigId,
      },
    }),
  );

  if (res200(res)) {
    addTemporaryNotification(
      "Listener force refresh dispatched to project listeners.",
    );
    return true;
  }

  addTemporaryNotification("Failed to dispatch listener force refresh.");
  return false;
}
