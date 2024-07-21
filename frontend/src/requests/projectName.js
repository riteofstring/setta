import C from "constants/constants.json";
import { useProject } from "state/definitions";
import { useProjectConfig } from "state/definitions";
import { post } from "./utils";

export async function dbSetProjectName(newProjectName) {
  return await post({
    body: { currProjectName: useProject.getState().name, newProjectName },
    address: C.ROUTE_SET_PROJECT_NAME,
  });
}

export async function dbSetProjectConfigName(newProjectConfigName) {
  return await post({
    body: {
      projectId: useProject.getState().id,
      currProjectConfigName: useProjectConfig.getState().name,
      newProjectConfigName,
    },
    address: C.ROUTE_SET_PROJECT_CONFIG_NAME,
  });
}
