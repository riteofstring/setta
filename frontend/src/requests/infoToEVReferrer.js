import C from "constants/constants.json";
import { post } from "./utils";

export async function dbMakeEVRefReplacements(
  codeAreaReplacements,
  codeInfoReplacements,
  paramEVReplacements,
) {
  return await post({
    body: { codeAreaReplacements, codeInfoReplacements, paramEVReplacements },
    address: C.ROUTE_MAKE_EV_REF_REPLACEMENTS,
  });
}
