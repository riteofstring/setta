import C from "constants/constants.json";
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
