import { nullOrUndefined, defaultDict, insertIntoArray } from "../utils/utils";
import { debug } from "easy-peasy";

class Selected {
  constructor(moduleName, objName) {
    this.moduleName = moduleName;
    this.objName = objName;
  }

  asString = () => {
    if (!nullOrUndefined(this.moduleName) && !nullOrUndefined(this.objName)) {
      return `${this.moduleName}~${this.objName}`;
    }
    return null;
  };
}

class UITypeProps {
  constructor(uiType, parentUITypeProps) {
    this.uiType = uiType;
    if (this.uiType === "LIST_NESTED_OBJECT") {
      this.isList = parentUITypeProps.isListRoot;
      this.isListRoot = !this.isList;
    } else {
      this.isList = false;
      this.isListRoot = false;
    }
  }
}

export class Section {
  constructor(sectionInfo, sectionHeading) {
    this.sectionInfo = sectionInfo;
    this.parent = null;
    this.childrenIds = defaultDict(() => []);
    this.selected = new Selected();
    this.uiTypeProps = new UITypeProps();
    this.hasBeenVisited = {};
    this.childrenAreCollapsed = {};
    this.sectionHeading = sectionHeading;
  }

  getChildrenIds = () => {
    const key = this.selected.asString();
    if (!nullOrUndefined(key)) {
      return this.childrenIds[key];
    }
    return [];
  };

  addChildren = (childIds, idx = null) => {
    const key = this.selected.asString();
    if (idx === null) {
      this.childrenIds[key] = [...this.childrenIds[key], ...childIds];
    } else {
      this.childrenIds[key] = insertIntoArray(
        this.childrenIds[key],
        idx,
        ...childIds
      );
    }
  };

  deleteChildren = (childIds) => {
    const key = this.selected.asString();
    this.childrenIds[key] = this.childrenIds[key].filter(
      (x) => !childIds.includes(x)
    );
  };

  hasNested = () => {
    return this.getChildrenIds().length > 0;
  };

  getChildrenAreCollapsed = () => {
    return this.childrenAreCollapsed[this.selected.asString()];
  };

  setChildrenAreCollapsed = (childrenAreCollapsed) => {
    this.childrenAreCollapsed[this.selected.asString()] = childrenAreCollapsed;
  };

  getHasBeenVisited = () => {
    return this.hasBeenVisited[this.selected.asString()];
  };

  setHasBeenVisited = (hasBeenVisited) => {
    this.hasBeenVisited[this.selected.asString()] = hasBeenVisited;
  };
}

export class Sections {
  constructor() {
    this.sections = {};
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
    const childParamName = !nullOrUndefined(paramName)
      ? paramName
      : parent.sectionHeading;
    const childUIType = !nullOrUndefined(uiType)
      ? uiType
      : parent.uiTypeProps.uiType;

    const childSectionInfo = parent.uiTypeProps.isListRoot
      ? parent.sectionInfo
      : parent.sectionInfo.moduleInfos[moduleName].objs[objName].params[
          paramName
        ].type;

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
  }

  addChildren = (parentId, childSections, idx = null) => {
    let childIds = [];
    for (let childSection of childSections) {
      childIds.push(this.addSection(childSection));
    }
    this.sections[parentId].addChildren(childIds, idx);
    console.log("this.sections", debug(this.sections));
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

  numRootIds = () => {
    return this.getRootIds().length;
  };
}
