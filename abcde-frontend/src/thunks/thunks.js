import { addChild } from "./addChild";
import { addToDeck } from "./addToDeck";
import { createChildSectionInfo } from "./createChildSectionInfo";
import { deleteChild } from "./deleteChild";
import { initializeChild, initializeParam } from "./initializeParam";
import { addKwarg, deleteKwarg, saveKwargsAsCollection } from "./kwargs";
import { loadProject } from "./load";
import { setParamChildId, setParamEnteredValue } from "./paramInfos";
import { saveAsNewProjectConfig, saveProject } from "./save";
import { createDefaultSectionInfo, setSectionConfigAttr } from "./sections";
import {
  setParamUITypeConfig,
  setParamUITypeId,
  setSectionUITypeConfig,
  setSectionUITypeId,
  setUITypeConfigAndMaybeClone,
} from "./uiTypes";

export default {
  addChild,
  createChildSectionInfo,
  deleteChild,
  initializeParam,
  initializeChild,
  saveProject,
  setParamUITypeId,
  setSectionUITypeId,
  setSectionConfigAttr,
  setSectionUITypeConfig,
  setParamUITypeConfig,
  setUITypeConfigAndMaybeClone,
  addToDeck,
  createDefaultSectionInfo,
  addKwarg,
  deleteKwarg,
  setParamChildId,
  setParamEnteredValue,
  saveKwargsAsCollection,
  saveAsNewProjectConfig,
  loadProject,
};
