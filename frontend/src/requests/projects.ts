import { RouteEnum } from "utils/generatedTypes";
import { post } from "./utils";

export async function dbLoadAllProjectMetadata() {
  return await post({
    body: {},
    address: RouteEnum.LOAD_ALL_PROJECT_METADATA,
  });
}

export async function dbLoadProjectConfig(projectConfigName) {
  return await post({
    body: { projectConfigName },
    address: RouteEnum.LOAD_PROJECT_CONFIG,
  });
}

export async function dbCreateProjectConfig({ name, previewImgColor }) {
  return await post({
    address: RouteEnum.CREATE_PROJECT_CONFIG,
    body: { name, previewImgColor },
  });
}

export async function dbSaveProject({ project }) {
  return await post({
    address: RouteEnum.SAVE_PROJECT,
    body: { project },
  });
}

export async function dbSaveAsNewProjectConfig({
  project,
  newConfigName,
  withRefs,
}) {
  return await post({
    address: RouteEnum.SAVE_AS_NEW_PROJECT_CONFIG,
    body: { project, newConfigName, withRefs },
  });
}

export async function dbSaveAsExistingProjectConfig({ project, configName }) {
  return await post({
    address: RouteEnum.SAVE_AS_EXISTING_PROJECT_CONFIG,
    body: { project, configName },
  });
}

export async function dbDeleteProjectConfigs(ids) {
  return await post({
    address: RouteEnum.DELETE_PROJECT_CONFIGS,
    body: { ids },
  });
}

export async function dbGetDefaultProjectConfigName() {
  return await post({
    address: RouteEnum.GET_DEFAULT_PROJECT_CONFIG_NAME,
    body: {},
  });
}

export async function dbSetAsDefaultProject(projectId: string) {
  return await post({
    address: RouteEnum.SET_AS_DEFAULT_PROJECT,
    body: { projectId },
  });
}

export async function dbFilterDataForJSONExport(project) {
  return await post({
    address: RouteEnum.FILTER_DATA_FOR_JSON_EXPORT,
    body: { project },
  });
}

export async function dbAddDefaultDataForJSONImport(project) {
  return await post({
    address: RouteEnum.ADD_DEFAULT_DATA_FOR_JSON_IMPORT,
    body: { project },
  });
}
