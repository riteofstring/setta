import C from "constants/constants.json";
import { getCurrentProjectConfig } from "state/actions/project/loadProject";
import { post } from "./utils";

export async function dbSetProjectConfigName(newProjectConfigName) {
  return await post({
    body: {
      currProjectConfigName: getCurrentProjectConfig().name,
      newProjectConfigName,
    },
    address: C.ROUTE_SET_PROJECT_CONFIG_NAME,
  });
}
