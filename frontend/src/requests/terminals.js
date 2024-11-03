import C from "constants/constants.json";
import { post, pseudoTemplatedStr } from "./utils";

export async function dbGetFreeTerminal(projectConfigId) {
  return await post({
    body: {},
    address: pseudoTemplatedStr(C.ROUTE_GET_FREE_TERMINAL, { projectConfigId }),
  });
}
