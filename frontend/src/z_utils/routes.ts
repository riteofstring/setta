import { ProjectAddressType } from "./types/project";

export const PROJECTS = "/projects";
export function LOAD_PROJECT({ projectName, configName }: ProjectAddressType) {
  return `/projects/load/${projectName}/${configName}`;
}
export const SAVE_PROJECT = "/projects/save";
export const CREATE_PROJECT = "/projects/createProject";
export const SAVE_AS_NEW_PROJECT_CONFIG = "/projects/saveAsNewProjectConfig";
export const SAVE_AS_EXISTING_PROJECT_CONFIG =
  "/projects/saveAsExistingProjectConfig";
export const GET_COLLECTIONS_AND_MODULES = "/codeInfo/getCollectionsAndModules";
export const SAVE_COLLECTIONS = "/codeInfo/saveCollections";
export const GET_COLLECTION_DETAILS = "/codeInfo/getCollectionDetails";
export const GENERATE_CODE = "/codeGenerator/generateCode";
export const GET_CODE = "/codeGenerator/getCode";
export const SET_PROJECT_NAME = "/projects/setProjectName";
export const SET_PROJECT_CONFIG_NAME = "/projects/setProjectConfigName";
export const SECTIONS = "/sections";
export const LOAD_SETTINGS = "/settings";
