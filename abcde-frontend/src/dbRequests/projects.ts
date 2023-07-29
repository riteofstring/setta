import {
  CREATE_PROJECT,
  LOAD_PROJECT,
  PROJECTS,
  SAVE_AS_EXISTING_PROJECT_CONFIG,
  SAVE_AS_NEW_PROJECT_CONFIG,
  SAVE_PROJECT,
} from "abcde-utils/src/routes";
import { NO_AUTH } from "utils/constants";
import {
  noAuthCreateProject,
  noAuthGetProjects,
  noAuthLoadProject,
  noAuthSaveAsExistingProjectConfig,
  noAuthSaveAsNewProjectConfig,
  noAuthSaveProject,
} from "./noAuth/projects";
import { post } from "./utils";

export async function dbGetProjects() {
  if (NO_AUTH) {
    return await noAuthGetProjects();
  }

  return await post({
    body: {},
    address: PROJECTS,
    withCredentials: true,
  });
}

export async function dbLoadProject({ username, projectName, configName }) {
  if (NO_AUTH) {
    return await noAuthLoadProject({ projectName, configName });
  }

  return await post({
    body: {},
    address: LOAD_PROJECT({ username, projectName, configName }),
  });
}

export async function dbCreateProject({ name }) {
  if (NO_AUTH) {
    return await noAuthCreateProject({ name });
  }

  return await post({
    address: CREATE_PROJECT,
    body: { name },
    withCredentials: true,
  });
}

export async function dbSaveProject({ project }) {
  if (NO_AUTH) {
    return await noAuthSaveProject();
  }

  return await post({
    address: SAVE_PROJECT,
    body: { project },
    withCredentials: true,
  });
}

export async function dbSaveAsNewProjectConfig({ project, newConfigName }) {
  if (NO_AUTH) {
    return await noAuthSaveAsNewProjectConfig();
  }

  return await post({
    address: SAVE_AS_NEW_PROJECT_CONFIG,
    body: { project, newConfigName },
    withCredentials: true,
  });
}

export async function dbSaveAsExistingProjectConfig({ project, configName }) {
  if (NO_AUTH) {
    return await noAuthSaveAsExistingProjectConfig();
  }

  return await post({
    address: SAVE_AS_EXISTING_PROJECT_CONFIG,
    body: { project, configName },
    withCredentials: true,
  });
}
