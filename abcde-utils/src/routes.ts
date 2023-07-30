import { ProjectAddressType } from "./types/project";

export const LOGIN = "/auth/login";
export const REGISTER = "/auth/register";
export const LOGOUT = "/auth/logout";
export const PROJECTS = "/projects";
export function LOAD_PROJECT({
  username,
  projectName,
  configName,
}: ProjectAddressType) {
  return `/projects/load/${username}/${projectName}/${configName}`;
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
export const SET_DARK_MODE = "/auth/setDarkMode"