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
  deleteChild,
  initializeParam,
  initializeChild,
  saveProject,
  addKwarg,
  deleteKwarg,
  setParamChildId,
  setParamEnteredValue,
  saveKwargsAsCollection,
  saveAsNewProjectConfig,
  saveAsExistingProjectConfig,
  loadProject,
  loadProjectIntoState,
  generateCode,
  createProject,
  getProjects,
};
