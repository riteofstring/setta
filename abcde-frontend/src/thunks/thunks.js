import { addChild } from "./addChild";
import { createChildSectionInfo } from "./createChildSectionInfo";
import { deleteChild } from "./deleteChild";
import { initializeChild, initializeParam } from "./initializeParam";
import { saveProject } from "./save";
import { setSectionConfigAttr } from "./sections";
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
};
