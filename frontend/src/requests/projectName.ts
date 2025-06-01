import { useProjectState } from "state/definitions";
import { C } from "utils/c";
import { post } from "./utils";

export async function dbSetProjectConfigName(newName: string) {
  return await post({
    body: {
      projectConfigId: useProjectState.getState().projectConfigId,
      newName,
    },
    address: C.ROUTE_SET_PROJECT_CONFIG_NAME,
  });
}
