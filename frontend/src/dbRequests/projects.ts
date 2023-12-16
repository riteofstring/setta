import {
  CREATE_PROJECT,
  LOAD_PROJECT,
  PROJECTS,
  SAVE_AS_EXISTING_PROJECT_CONFIG,
  SAVE_AS_NEW_PROJECT_CONFIG,
  SAVE_PROJECT,
} from "z_utils/routes";
import { post } from "./utils";

export async function dbGetProjectsForFileMenu({ projectId = undefined }) {
  return await post({
    body: { projectId, format: "fileMenu" },
    address: PROJECTS,
  });
}

export async function dbGetProjectsForHomePage() {
  return await post({
    body: { format: "homePage" },
    address: PROJECTS,
  });
}

export async function dbLoadProject({ projectName, configName }) {
  return await post({
    body: {},
    address: LOAD_PROJECT({ projectName, configName }),
  });
}

export async function dbLoadFullProject({ projectName }) {
  return await post({
    body: {},
    address: `/projects/load/${projectName}`,
  });
}

export async function dbCreateProject({ name }) {
  return await post({
    address: CREATE_PROJECT,
    body: { name },
  });
}

export async function dbSaveProject({ project }) {
  return await post({
    address: SAVE_PROJECT,
    body: { project },
  });
}

export async function dbSaveAsNewProjectConfig({ project, newConfigName }) {
  return await post({
    address: SAVE_AS_NEW_PROJECT_CONFIG,
    body: { project, newConfigName },
  });
}

export async function dbSaveAsExistingProjectConfig({ project, configName }) {
  return await post({
    address: SAVE_AS_EXISTING_PROJECT_CONFIG,
    body: { project, configName },
  });
}

export async function dbDeleteProjects({ ids }) {
  return await post({
    address: "/projects/deleteProjects",
    body: { ids },
  });
}
