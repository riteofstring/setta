import {
  callOpenAPI,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import { forceRefreshListener } from "openapi/http";
import { addTemporaryNotification } from "state/actions/notifications";
import { NULL_PROJECT_CONFIG_ID } from "state/definitions";
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
  const res = (await callOpenAPI(
    forceRefreshListener({
      body: {
        projectConfigId,
      },
    } as Parameters<typeof forceRefreshListener>[0]),
  )) as ForceRefreshListenerRouteResponse;
  if (res200(res)) {
    addTemporaryNotification(
      "Listener force refresh dispatched to project listeners.",
    );
    return true;
  }
  addTemporaryNotification("Failed to dispatch listener force refresh.");
  return false;
}
