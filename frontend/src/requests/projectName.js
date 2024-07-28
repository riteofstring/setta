import C from "constants/constants.json";
import { useProjectConfig } from "state/definitions";
import { post } from "./utils";

export async function dbSetProjectName(newProjectName) {
  return await post({
    body: { currProjectName: useProjectConfig.getState().name, newProjectName },
    address: C.ROUTE_SET_PROJECT_NAME,
  });
}
