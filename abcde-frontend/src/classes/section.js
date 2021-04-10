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

  addChild = (childId, idx = null) => {
    const key = this.selected.asString();
    if (idx === null) {
      this.childrenIds[key] = [...this.childrenIds[key], childId];
    } else {
      this.childrenIds[key] = insertIntoArray(
        this.childrenIds[key],
        idx,
        childId
      );
    }
  };

  deleteChild = (childId) => {
    const key = this.selected.asString();
    this.childrenIds[key] = this.childrenIds[key].filter((x) => x !== childId);
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
}

export class Sections {
  constructor() {
    this.sections = {};
    this.latestId = 0;
  }

  determineNewChildIdx = (parent, sourceId) => {
    if (!nullOrUndefined(sourceId)) {
      const { isList, isListRoot } = this.sections[sourceId].uiTypeProps;
      if (isList) {
        return parent.getChildrenIds().indexOf(sourceId) + 1;
      } else if (isListRoot) {
        return 0;
      }
    }
    return null;
  };

  createChild = ({
    parentId,
    sourceId,
    moduleName,
    objName,
    paramName,
    uiType,
  }) => {
    const parent = this.sections[parentId];
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
    const child = new Section(childSectionInfo, childParamName);
    child.parent = parentId.toString();
    child.uiTypeProps = new UITypeProps(childUIType, parent.uiTypeProps);
    if (child.uiTypeProps.isListRoot) {
      child.selected = new Selected(moduleName, objName);
    }
    const idx = this.determineNewChildIdx(parent, sourceId);
    return { child, idx };
  };

  addSection = (section) => {
    const sectionId = this.latestId;
    this.sections[sectionId] = section;
    this.latestId += 1;
    return sectionId;
  };

  deleteSection = ({ sectionId, parentId }) => {
    delete this.sections[sectionId];
    this.sections[parentId].deleteChild(sectionId);
  };

  addChild = (childSection, idx = null) => {
    const childId = this.addSection(childSection);
    this.sections[childSection.parent].addChild(childId, idx);
    console.log("this.sections", debug(this.sections));
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
