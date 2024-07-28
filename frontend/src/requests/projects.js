import C from "constants/constants.json";
import { post } from "./utils";

export async function dbGetAllProjectConfigMetadata() {
  return await post({
    body: {},
    address: C.ROUTE_ALL_PROJECT_CONFIG_METADATA,
  });
}

export async function dbLoadProjectConfig(projectConfigName) {
  return await post({
    body: { projectConfigName },
    address: C.ROUTE_LOAD_PROJECT_CONFIG,
  });
}

export async function dbLoadFullProject() {
  return await post({
    body: {},
    address: C.ROUTE_LOAD_FULL_PROJECT,
  });
}

export async function dbCreateProjectConfig({ name, previewImgColor }) {
  return await post({
    address: C.ROUTE_CREATE_PROJECT_CONFIG,
    body: { name, previewImgColor },
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

export async function dbDeleteProjectConfigs(ids) {
  return await post({
    address: C.ROUTE_DELETE_PROJECT_CONFIGS,
    body: { ids },
  });
}
