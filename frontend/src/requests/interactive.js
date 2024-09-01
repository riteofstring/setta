import C from "constants/constants.json";
import { useProjectConfig } from "state/definitions";
import { post } from "./utils";

export async function dbUpdateInteractiveCode(codeDict) {
  const projectConfigName = useProjectConfig.getState().name;
  return await post({
    body: { codeDict, projectConfigName },
    address: C.ROUTE_UPDATE_INTERACTIVE_CODE,
  });
}
