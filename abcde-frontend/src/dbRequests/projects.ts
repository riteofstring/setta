import {
  CREATE_PROJECT,
  LOAD_PROJECT,
  PROJECTS,
  SAVE_AS_EXISTING_PROJECT_CONFIG,
  SAVE_AS_NEW_PROJECT_CONFIG,
  SAVE_PROJECT,
} from "abcde-utils/src/routes";
import { ProjectLoadType } from "abcde-utils/src/types/projectSaveLoad";
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

export async function getProjects() {
  if (NO_AUTH) {
    return await noAuthGetProjects();
  }

  return post({
    body: {},
    address: PROJECTS,
    thenFn: (res) => res.data,
    catchFn: () => [],
    withCredentials: true,
  });
}

export async function loadProject({
  id,
  configId,
}): Promise<ProjectLoadType | void> {
  if (NO_AUTH) {
    return await noAuthLoadProject({ id, configId });
  }

  return post({
    body: {},
    address: LOAD_PROJECT(id, configId),
    thenFn: (res) => res.data,
    catchFn: () => undefined,
  });
}

export async function createProject({ name }) {
  if (NO_AUTH) {
    return await noAuthCreateProject({ name });
  }

  return post({
    address: CREATE_PROJECT,
    body: { name },
    thenFn: (res) => res.data,
    catchFn: () => [],
    withCredentials: true,
  });
}

export async function saveProject({ project }) {
  if (NO_AUTH) {
    return await noAuthSaveProject();
  }

  return post({
    address: SAVE_PROJECT,
    body: { project },
    thenFn: (res) => res.data,
    catchFn: () => [],
    withCredentials: true,
  });
}

export async function saveAsNewProjectConfig({ project, newConfigName }) {
  if (NO_AUTH) {
    return await noAuthSaveAsNewProjectConfig();
  }

  return post({
    address: SAVE_AS_NEW_PROJECT_CONFIG,
    body: { project, newConfigName },
    thenFn: (res) => res.data,
    catchFn: () => [],
    withCredentials: true,
  });
}

export async function saveAsExistingProjectConfig({ project, configId }) {
  if (NO_AUTH) {
    return await noAuthSaveAsExistingProjectConfig();
  }

  return post({
    address: SAVE_AS_EXISTING_PROJECT_CONFIG,
    body: { project, configId },
    thenFn: (res) => res.data,
    catchFn: () => [],
    withCredentials: true,
  });
}
