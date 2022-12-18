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
    address: "projects",
    thenFn: (res) => res.data,
    catchFn: () => [],
    withCredentials: true,
  });
}

export async function loadProject({ id, configId }) {
  if (NO_AUTH) {
    return await noAuthLoadProject({ id, configId });
  }

  return post({
    address: `projects/load/${id}/${configId}`,
    thenFn: (res) => res.data,
    catchFn: () => [],
  });
}

export async function createProject({ name }) {
  if (NO_AUTH) {
    return await noAuthCreateProject({ name });
  }

  return post({
    address: `projects/createProject`,
    body: { name },
    thenFn: (res) => res.data,
    catchFn: () => [],
  });
}

export async function saveProject({ project }) {
  if (NO_AUTH) {
    return await noAuthSaveProject();
  }

  return post({
    address: `projects/save`,
    body: { project },
    thenFn: (res) => res.data,
    catchFn: () => [],
  });
}

export async function saveAsNewProjectConfig({ project, newConfigName }) {
  if (NO_AUTH) {
    return await noAuthSaveAsNewProjectConfig();
  }

  return post({
    address: `projects/saveAsNewProjectConfig`,
    body: { project, newConfigName },
    thenFn: (res) => res.data,
    catchFn: () => [],
  });
}

export async function saveAsExistingProjectConfig({ project, configId }) {
  if (NO_AUTH) {
    return await noAuthSaveAsExistingProjectConfig();
  }

  return post({
    address: `projects/saveAsExistingProjectConfig`,
    body: { project, configId },
    thenFn: (res) => res.data,
    catchFn: () => [],
  });
}
