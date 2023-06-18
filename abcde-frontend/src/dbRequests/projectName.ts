import {
  SET_PROJECT_CONFIG_NAME,
  SET_PROJECT_NAME,
} from "abcde-utils/src/routes";
import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import { NO_AUTH } from "utils/constants";
import {
  dbNoAuthSetProjectConfigName,
  dbNoAuthSetProjectName,
} from "./noAuth/projectName";
import { post } from "./utils";

export async function dbSetProjectName(newProjectName) {
  if (NO_AUTH) {
    return dbNoAuthSetProjectName();
  }

  return post({
    body: { currProjectName: useProject.getState().name, newProjectName },
    address: SET_PROJECT_NAME,
    thenFn: (res) => res.data,
    catchFn: () => [],
    withCredentials: true,
  });
}

export async function dbSetProjectConfigName(newProjectConfigName) {
  if (NO_AUTH) {
    return dbNoAuthSetProjectConfigName();
  }

  return post({
    body: {
      projectId: useProject.getState().id,
      currProjectConfigName: useProjectConfig.getState().name,
      newProjectConfigName,
    },
    address: SET_PROJECT_CONFIG_NAME,
    thenFn: (res) => res.data,
    catchFn: () => [],
    withCredentials: true,
  });
}
