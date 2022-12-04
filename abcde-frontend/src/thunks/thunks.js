import { generateCode } from "./generateCode";
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
  saveProject,
  setParamChildId,
  setParamEnteredValue,
  saveAsNewProjectConfig,
  saveAsExistingProjectConfig,
  loadProject,
  loadProjectIntoState,
  generateCode,
  createProject,
  getProjects,
};
