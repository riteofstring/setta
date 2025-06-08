import { addTemporaryNotification } from "state/actions/notifications";
import { RouteEnum } from "utils/generatedTypes";
import { post } from "./utils";

export async function dbGetExistingTerminals(projectConfigId) {
  return await post({
    body: {},
    address: RouteEnum.GET_EXISTING_TERMINALS,
    addressParams: { projectConfigId },
  });
}

export async function dbDeleteTerminals(sectionIds) {
  return await post({
    body: { sectionIds },
    address: RouteEnum.DELETE_TERMINALS,
  });
}

export async function dbRunCode(
  projectConfigId: string,
  sectionId: string | null,
) {
  addTemporaryNotification("Sending Run Request");
  return await post({
    body: { projectConfigId, sectionId, cliId: null },
    address: RouteEnum.RUN_CODE,
  });
}
