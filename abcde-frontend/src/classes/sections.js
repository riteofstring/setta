import { nullOrUndefined } from "../utils/utils";
import { Selected } from "./selected";
import { UITypeProps } from "./uiTypeProps";
import { Section } from "./section";
import { SectionInfo } from "./jsonParser";

// start of helper functions
function _childParamName(parent, paramName) {
  return !nullOrUndefined(paramName) ? paramName : parent.sectionHeading;
}

function _childUIType(parent, uiType) {
  return !nullOrUndefined(uiType) ? uiType : parent.uiTypeProps.uiType;
}

function _childSectionInfo(parent, moduleName, objName, paramName) {
  if (parent.uiTypeProps.isListRoot) {
    return parent.sectionInfo;
  } else {
    const paramType =
      parent.sectionInfo.moduleInfos[moduleName].objs[objName].params[paramName]
        .type;
    return paramType instanceof SectionInfo ? paramType : null;
  }
}
//end of helper functions

export class Sections {
  constructor() {
    this.sections = {};
    this.allChildrenIds = [];
    this.latestId = 0;
  }

  getIdxAfterSource = (parent, sourceId) => {
    return parent.getChildrenIds().indexOf(sourceId) + 1;
  };

  determineNewChildIdx = (parent, sourceId) => {
    if (!nullOrUndefined(sourceId)) {
      const { isList, isListRoot } = this.sections[sourceId].uiTypeProps;
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
    const parent = this.sections[parentId];
    const { moduleName, objName } = parent.selected;
    const childParamName = _childParamName(parent, paramName);
    const childUIType = _childUIType(parent, uiType);
    const childSectionInfo = _childSectionInfo(
      parent,
      moduleName,
      objName,
      paramName
    );

    let children = [];
    for (let i = 0; i < numChildren; i++) {
      const child = new Section(childSectionInfo, childParamName);
      child.parent = parentId;
      child.uiTypeProps = new UITypeProps(childUIType, parent.uiTypeProps);
      if (child.uiTypeProps.isListRoot) {
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

  deleteSections({ sectionIds, parentId }) {
    sectionIds.forEach((e) => delete this.sections[e]);
    this.sections[parentId].deleteChildren(sectionIds);
    this.setAllChildrenIds();
  }

  addChildren = (parentId, childSections, idx = null) => {
    let childIds = [];
    for (let childSection of childSections) {
      childIds.push(this.addSection(childSection));
    }
    this.sections[parentId].addChildren(childIds, idx);
    this.setAllChildrenIds();
  };

  deleteChildren = ({ parentId, sourceId, numChildren = 1 }) => {
    const parent = this.sections[parentId];
    const startIdx = this.getIdxAfterSource(parent, sourceId);
    const childrenToDelete = parent
      .getChildrenIds()
      .slice(startIdx, startIdx + numChildren);
    this.deleteSections({ sectionIds: childrenToDelete, parentId });
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

  getUITypeProps = (id) => {
    return this.sections[id].uiTypeProps;
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

  getHasBeenVisited = (id) => {
    return this.sections[id].getHasBeenVisited();
  };

  setHasBeenVisited = ({ sectionId, hasBeenVisited }) => {
    return this.sections[sectionId].setHasBeenVisited(hasBeenVisited);
  };

  setSelected = ({ sectionId, moduleName, objName }) => {
    this.sections[sectionId].selected = new Selected(moduleName, objName);
  };

  setChildrenAreCollapsed = ({ sectionId, childrenAreCollapsed }) => {
    this.sections[sectionId].setChildrenAreCollapsed(childrenAreCollapsed);
  };

  setChildrenIds = ({ sectionId, childrenIds }) => {
    this.sections[sectionId].setChildrenIds(childrenIds);
  };

  numRootIds = () => {
    return this.getRootIds().length;
  };

  setAllChildrenIds = () => {
    const listOfLists = Object.keys(this.sections).map((e) =>
      this.sections[e].getChildrenIds()
    );
    this.allChildrenIds = [].concat.apply([], listOfLists);
  };
}
