import { addTemporaryNotification } from "state/actions/notifications";
import { C } from "utils/c";
import { post, pseudoTemplatedStr } from "./utils";

export async function dbGetExistingTerminals(projectConfigId) {
  return await post({
    body: {},
    address: pseudoTemplatedStr(C.ROUTE_GET_EXISTING_TERMINALS, {
      projectConfigId,
    }),
  });
}

export async function dbDeleteTerminals(sectionIds) {
  return await post({
    body: { sectionIds },
    address: C.ROUTE_DELETE_TERMINALS,
  });
}

export async function dbRunCode(project, entryCodeBlock) {
  addTemporaryNotification("Sending Run Request");
  return await post({
    body: { project, entryCodeBlock, cliId: null },
    address: C.ROUTE_RUN_CODE,
  });
}
