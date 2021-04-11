import { nullOrUndefined } from "../utils/utils";
import { Selected } from "./selected";
import { UIType } from "./uiType";
import { Section } from "./section";
import { SectionInfo } from "./jsonParser";

// start of helper functions
function _childSectionHeading(parent, paramName) {
  return !nullOrUndefined(paramName) ? paramName : parent.sectionHeading;
}

function _childUITypeName(parent, uiType) {
  return !nullOrUndefined(uiType) ? uiType.name : parent.uiType.name;
}

function _childSectionInfo(parent, moduleName, objName, paramName) {
  if (parent.uiType.isListRoot) {
    return parent.sectionInfo;
  } else {
    const paramType = parent.sectionInfo.getParamData(
      moduleName,
      objName,
      paramName,
      "type"
    );
    return paramType instanceof SectionInfo
      ? paramType
      : new SectionInfo({ name: paramName, jsonInput: {} });
  }
}
//end of helper functions

export class Sections {
  constructor() {
    this.sections = {};
    this.availableModules = {};
    this.availableParameters = {};
    this.allChildrenIds = [];
    this.latestId = 0;
  }

  getIdxAfterSource = (parent, sourceId) => {
    return parent.getChildrenIds().indexOf(sourceId) + 1;
  };

  determineNewChildIdx = (parent, sourceId) => {
    if (!nullOrUndefined(sourceId)) {
      const { isList, isListRoot } = this.sections[sourceId].uiType;
      if (isList) {
        return this.getIdxAfterSource(parent, sourceId);
      } else if (isListRoot) {
        return 0;
      }
    }
    return null;
  };

  createChildren = ({
    parentId,
    sourceId,
    paramName,
    uiType,
    numChildren = 1,
  }) => {
    console.log("createChildren", parentId, sourceId, paramName, uiType);
    const parent = this.sections[parentId];
    const { moduleName, objName } = parent.selected;
    const childSectionHeading = _childSectionHeading(parent, paramName);
    const childUITypeName = _childUITypeName(parent, uiType);
    const childSectionInfo = _childSectionInfo(
      parent,
      moduleName,
      objName,
      paramName
    );

    let children = [];
    for (let i = 0; i < numChildren; i++) {
      const child = new Section(childSectionInfo, childSectionHeading);
      child.parent = parentId;
      child.uiType = new UIType(childUITypeName, parent.uiType);
      if (child.uiType.isListRoot) {
        child.selected = new Selected(moduleName, objName);
      }
      children.push(child);
    }

    const idx = this.determineNewChildIdx(parent, sourceId);
    return { children, idx };
  };

  addSection = (section) => {
    const sectionId = this.latestId;
    this.sections[sectionId] = section;
    this.latestId += 1;
    return sectionId;
  };

  deleteSections({ sectionIds, parentId, paramName }) {
    sectionIds.forEach((e) => delete this.sections[e]);
    this.sections[parentId].deleteChildren(sectionIds, paramName);
    this.setAllChildrenIds();
  }

  addChildren = (parentId, childSections, idx = null) => {
    let childIds = [];
    let paramNames = [];
    for (let childSection of childSections) {
      childIds.push(this.addSection(childSection));
      paramNames.push(childSection.sectionHeading);
    }
    this.sections[parentId].addChildren(childIds, paramNames[0], idx);
    this.setAllChildrenIds();
    return childIds;
  };

  deleteChildren = ({ parentId, sourceId, numChildren = 1 }) => {
    const parent = this.sections[parentId];
    const startIdx = this.getIdxAfterSource(parent, sourceId);
    const childrenToDelete = parent
      .getChildrenIds()
      .slice(startIdx, startIdx + numChildren);
    const paramName = this.sections[childrenToDelete[0]].sectionHeading;
    this.deleteSections({ sectionIds: childrenToDelete, parentId, paramName });
  };

  getRootIds = (minId = null, maxId = null) => {
    return Object.keys(this.sections).filter(
      (e) =>
        (nullOrUndefined(minId) || parseInt(e) >= minId) &&
        (nullOrUndefined(maxId) || parseInt(e) < maxId) &&
        nullOrUndefined(this.sections[e].parent)
    );
  };

  getChildrenIds = (id) => {
    return this.sections[id].getChildrenIds();
  };

  getUIType = (id) => {
    return this.sections[id].uiType;
  };

  getSelected = (id) => {
    return this.sections[id].selected;
  };

  getSectionHeading = (id) => {
    return this.sections[id].sectionHeading;
  };

  getHasNested = (id) => {
    return this.sections[id].hasNested();
  };

  getChildrenAreCollapsed = (id) => {
    return this.sections[id].getChildrenAreCollapsed();
  };

  getSectionInfo = (id) => {
    return this.sections[id].sectionInfo;
  };

  getHasBeenVisited = (id, paramName) => {
    return this.sections[id].getHasBeenVisited(paramName);
  };

  getEnteredValue = (id, paramName) => {
    return this.sections[id].getEnteredValue(paramName);
  };

  getKwargs = (id) => {
    return this.sections[id].getKwargs();
  };

  getParameters = (id) => {
    return this.sections[id].getParameters();
  };

  getParamUIType = (id, paramName) => {
    return this.sections[id].getParamUIType(paramName);
  };

  getNestedSectionIds = (sectionId, paramName, returnFirst = false) => {
    return this.sections[sectionId].getNestedSectionIds(paramName, returnFirst);
  };

  getDefaultValue = (sectionId, paramName) => {
    return this.sections[sectionId].getDefaultValue(paramName);
  };

  getParamUITypeConfig = (sectionId, paramName) => {
    return this.sections[sectionId].getParamUITypeConfig(paramName);
  };

  setHasBeenVisited = ({ sectionId, paramName, hasBeenVisited }) => {
    return this.sections[sectionId].setHasBeenVisited(
      paramName,
      hasBeenVisited
    );
  };

  setSelected = ({ sectionId, moduleName, objName }) => {
    this.sections[sectionId].setSelected(moduleName, objName);
  };

  setChildrenAreCollapsed = ({ sectionId, childrenAreCollapsed }) => {
    this.sections[sectionId].setChildrenAreCollapsed(childrenAreCollapsed);
  };

  setChildrenIds = ({ sectionId, childrenIds }) => {
    this.sections[sectionId].setChildrenIds(childrenIds);
  };

  setEnteredValue = ({ sectionId, paramName, value }) => {
    this.sections[sectionId].setEnteredValue(paramName, value);
  };

  setParamUIType = ({ sectionId, paramName, uiName }) => {
    this.sections[sectionId].setParamUIType(paramName, uiName);
  };

  setUIType = ({ sectionId, uiType }) => {
    this.sections[sectionId].setUIType(uiType);
  };

  setNestedSectionIds = ({ sectionId, paramName, nestedSectionIds }) => {
    this.sections[sectionId].setNestedSectionIds(paramName, nestedSectionIds);
  };

  setParamUITypeConfig = ({ sectionId, paramName, configName, value }) => {
    this.sections[sectionId].setParamUITypeConfig(paramName, configName, value);
  };

  setAllChildrenIds = () => {
    const listOfLists = Object.keys(this.sections).map((e) =>
      this.sections[e].getChildrenIds()
    );
    this.allChildrenIds = [].concat.apply([], listOfLists);
  };

  numRootIds = () => {
    return this.getRootIds().length;
  };
}
