import { addChild } from "./addChild";
import { addToDeck } from "./addToDeck";
import { accessPage, login, logout } from "./authentication";
import { createChildSectionInfo } from "./createChildSectionInfo";
import { deleteChild } from "./deleteChild";
import { generateCode } from "./generateCode";
import { initializeChild, initializeParam } from "./initializeParam";
import { addKwarg, deleteKwarg, saveKwargsAsCollection } from "./kwargs";
import { setParamChildId, setParamEnteredValue } from "./paramInfos";
import {
  createProject,
  getProjects,
  loadProject,
  loadProjectIntoState,
} from "./projects";
import {
  saveAsExistingProjectConfig,
  saveAsNewProjectConfig,
  saveProject,
} from "./save";

export default {
  addChild,
  createChildSectionInfo,
  deleteChild,
  initializeParam,
  initializeChild,
  saveProject,
  addToDeck,
  addKwarg,
  deleteKwarg,
  setParamChildId,
  setParamEnteredValue,
  saveKwargsAsCollection,
  saveAsNewProjectConfig,
  saveAsExistingProjectConfig,
  loadProject,
  loadProjectIntoState,
  logout,
  accessPage,
  login,
  generateCode,
  createProject,
  getProjects,
};
