import {
  CREATE_PROJECT,
  LOAD_PROJECT,
  PROJECTS,
  SAVE_AS_EXISTING_PROJECT_CONFIG,
  SAVE_AS_NEW_PROJECT_CONFIG,
  SAVE_PROJECT,
} from "abcde-utils/src/routes";
import { post } from "./utils";

export async function dbGetProjectsForFileMenu({ projectId = undefined }) {
  return await post({
    body: { projectId, format: "fileMenu" },
    address: PROJECTS,
    withCredentials: true,
  });
}

export async function dbGetProjectsForHomePage() {
  return await post({
    body: { format: "homePage" },
    address: PROJECTS,
    withCredentials: true,
  });
}

export async function dbLoadProject({ username, projectName, configName }) {
  return await post({
    body: {},
    address: LOAD_PROJECT({ username, projectName, configName }),
    withCredentials: true,
  });
}

export async function dbCreateProject({ name }) {
  return await post({
    address: CREATE_PROJECT,
    body: { name },
    withCredentials: true,
  });
}

export async function dbSaveProject({ project }) {
  return await post({
    address: SAVE_PROJECT,
    body: { project },
    withCredentials: true,
  });
}

export async function dbSaveAsNewProjectConfig({ project, newConfigName }) {
  return await post({
    address: SAVE_AS_NEW_PROJECT_CONFIG,
    body: { project, newConfigName },
    withCredentials: true,
  });
}

export async function dbSaveAsExistingProjectConfig({ project, configName }) {
  return await post({
    address: SAVE_AS_EXISTING_PROJECT_CONFIG,
    body: { project, configName },
    withCredentials: true,
  });
}
