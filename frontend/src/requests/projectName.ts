import { useProjectState } from "state/definitions";
import { RouteEnum } from "utils/generatedTypes";
import { post } from "./utils";

export async function dbSetProjectConfigName(newName: string) {
  return await post({
    body: {
      projectConfigId: useProjectState.getState().projectConfig.id,
      newName,
    },
    address: RouteEnum.SET_PROJECT_CONFIG_NAME,
  });
}
