import { nullOrUndefined } from "../utils/utils";
import { Selected } from "./selected";
import { UIType } from "./uiType";
import { Section } from "./section";
import { SectionInfo } from "./jsonParser";

// start of helper functions
function _childSectionHeading(parent, paramName) {
  return !nullOrUndefined(paramName) ? paramName : parent.name;
}

function _childUITypeName(parent, uiType) {
  return !nullOrUndefined(uiType) ? uiType.name : parent.uiType.name;
}

function _childSectionInfo(parent, moduleName, objName, paramName, available) {
  if (parent.uiType.isListRoot) {
    return parent.sectionInfo;
  } else {
    let paramSpecs = parent.sectionInfo.getParamData(
      moduleName,
      objName,
      paramName,
      "specs"
    );
    paramSpecs = Array.isArray(paramSpecs) ? paramSpecs : [];
    return new SectionInfo(paramName, paramSpecs, available);
  }
}
//end of helper functions

export class Sections {
  constructor() {
    this.sections = {};
    this.available = {};
    this.allChildrenIds = [];
    this.latestId = 0;
  }

  getIdxAfterSource = (parent, sourceId) => {
    return parent.childrenIds.indexOf(sourceId) + 1;
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
      paramName,
      this.available
    );

    let children = [];
    for (let i = 0; i < numChildren; i++) {
      const child = new Section(childSectionHeading, childSectionInfo);
      child.parent = parentId;
      child.uiType = new UIType({
        name: childUITypeName,
        parentUIType: parent.uiType,
      });
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
      paramNames.push(childSection.name);
    }
    this.sections[parentId].addChildren(childIds, paramNames[0], idx);
    this.setAllChildrenIds();
    return childIds;
  };

  deleteChildren = ({ parentId, sourceId, numChildren = 1 }) => {
    const parent = this.sections[parentId];
    let childrenToDelete = parent.childrenIds;
    if (childrenToDelete.length === 0) {
      return;
    }
    if (numChildren !== "all") {
      const startIdx = this.getIdxAfterSource(parent, sourceId);
      childrenToDelete = parent.childrenIds.slice(
        startIdx,
        startIdx + numChildren
      );
    }
    const paramName = this.sections[childrenToDelete[0]].name;
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
    return this.sections[id].childrenIds;
  };

  getUIType = (id) => {
    return this.sections[id].uiType;
  };

  getSelected = (id) => {
    return this.sections[id].selected;
  };

  getSectionHeading = (id) => {
    return this.sections[id].name;
  };

  getHasNested = (id) => {
    return this.sections[id].hasNested();
  };

  getChildrenAreCollapsed = (id) => {
    return this.sections[id].childrenAreCollapsed;
  };

  getSectionInfo = (id) => {
    return this.sections[id].sectionInfo;
  };

  getEnteredValue = (id, paramName) => {
    return this.sections[id].enteredValues[paramName];
  };

  getKwargs = (id) => {
    return this.sections[id].getKwargs();
  };

  getParameters = (id) => {
    return this.sections[id].getParameters();
  };

  getParametersAndKwargs = (id) => {
    return this.sections[id].getParametersAndKwargs();
  };

  getParamUIType = (id, paramName) => {
    return this.sections[id].getParamUIType(paramName);
  };

  getChildrenIdsPerParam = (sectionId, paramName) => {
    return this.sections[sectionId].childrenIdsPerParam[paramName];
  };

  getDefaultValue = (sectionId, paramName) => {
    return this.sections[sectionId].getDefaultValue(paramName);
  };

  getParamUITypeConfig = (sectionId, paramName) => {
    return this.sections[sectionId].getParamUITypeConfig(paramName);
  };

  setSelected = ({ sectionId, moduleName, objName }) => {
    this.sections[sectionId].setSelected(moduleName, objName);
  };

  setChildrenAreCollapsed = ({ sectionId, childrenAreCollapsed }) => {
    this.sections[sectionId].childrenAreCollapsed = childrenAreCollapsed;
  };

  setChildrenIds = ({ sectionId, childrenIds }) => {
    this.sections[sectionId].childrenIds = childrenIds;
  };

  setEnteredValue = ({ sectionId, paramName, value }) => {
    this.sections[sectionId].enteredValues[paramName] = value;
  };

  setParamUIType = ({ sectionId, paramName, uiName }) => {
    this.sections[sectionId].setParamUIType(paramName, uiName);
    this.setAllChildrenIds();
  };

  setUIType = ({ sectionId, uiType }) => {
    this.sections[sectionId].uiType = uiType;
  };

  setChildrenIdsPerParam = ({ sectionId, paramName, childrenIds }) => {
    this.sections[sectionId].childrenIdsPerParam[paramName] = childrenIds;
  };

  setParamUITypeConfig = ({ sectionId, paramName, configName, value }) => {
    this.sections[sectionId].setParamUITypeConfig(paramName, configName, value);
  };

  setSectionModules = ({ sectionId, parentId, paramName, specs }) => {
    this.sections[parentId].setParamSpecs(paramName, specs);
    this.sections[sectionId].setSectionModules(specs, this.available);
  };

  setAllChildrenIds = () => {
    const listOfLists = Object.keys(this.sections).map(
      (e) => this.sections[e].childrenIds
    );
    this.allChildrenIds = [].concat.apply([], listOfLists);
  };

  numRootIds = () => {
    return this.getRootIds().length;
  };

  addKwarg = ({ sectionId, kwargName }) => {
    this.sections[sectionId].addKwarg(kwargName);
    this.setAllChildrenIds();
  };

  deleteKwarg = ({ sectionId, kwargName }) => {
    this.sections[sectionId].deleteKwarg(kwargName);
    this.setAllChildrenIds();
  };

  replaceKwarg = ({ sectionId, oldKwarg, newKwarg }) => {
    const childIds = this.sections[sectionId].replaceKwarg(oldKwarg, newKwarg);
    if (childIds) {
      childIds.forEach((x) => (this.sections[x].name = newKwarg));
    }
  };
}
