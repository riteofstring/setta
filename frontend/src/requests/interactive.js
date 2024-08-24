import C from "constants/constants.json";
import { post } from "./utils";

export async function dbUpdateInteractiveCode(codeDict) {
  return await post({
    body: { codeDict },
    address: C.ROUTE_UPDATE_INTERACTIVE_CODE,
  });
}
