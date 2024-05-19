import { C } from "utils/constants";
import { post, pseudoTemplatedStr } from "./utils";

export async function dbGetProjectsForFileMenu({ projectId = undefined }) {
  return await post({
    body: { projectId, format: "fileMenu" },
    address: C.ROUTE_PROJECTS,
  });
}

export async function dbGetProjectsForHomePage() {
  return await post({
    body: { format: "homePage" },
    address: C.ROUTE_PROJECTS,
  });
}

export async function dbLoadProject({ projectName, configName }) {
  return await post({
    body: {},
    address: pseudoTemplatedStr(C.LOAD_PROJECT, { projectName, configName }),
  });
}

export async function dbLoadFullProject({
  projectName,
  withBaseUITypes = false,
}) {
  return await post({
    body: { withBaseUITypes },
    address: `/projects/load/${projectName}`,
  });
}

export async function dbCreateProject({ name }) {
  return await post({
    address: C.ROUTE_CREATE_PROJECT,
    body: { name },
  });
}

export async function dbSaveProject({ project }) {
  return await post({
    address: C.ROUTE_SAVE_PROJECT,
    body: { project },
  });
}

export async function dbSaveAsNewProjectConfig({ project, newConfigName }) {
  return await post({
    address: C.ROUTE_SAVE_AS_NEW_PROJECT_CONFIG,
    body: { project, newConfigName },
  });
}

export async function dbSaveAsExistingProjectConfig({ project, configName }) {
  return await post({
    address: C.ROUTE_SAVE_AS_EXISTING_PROJECT_CONFIG,
    body: { project, configName },
  });
}

export async function dbDeleteProjects({ ids }) {
  return await post({
    address: "/projects/deleteProjects",
    body: { ids },
  });
}
