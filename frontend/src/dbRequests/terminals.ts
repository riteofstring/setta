import C from "constants/constants.json";
import { post, pseudoTemplatedStr } from "./utils";

export async function dbGetFreeTerminal(projectConfigId) {
  return await post({
    body: {},
    address: pseudoTemplatedStr(C.ROUTE_GET_FREE_TERMINAL, { projectConfigId }),
  });
}

export async function dbDeleteTerminals(ids) {
  return await post({
    body: { ids },
    address: C.ROUTE_DELETE_TERMINALS,
  });
}
