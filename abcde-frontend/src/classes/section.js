import { nullOrUndefined, defaultDict } from "../utils/utils";

class Selected {
  constructor(moduleName, objName) {
    this.moduleName = moduleName;
    this.objName = objName;
  }

  asString() {
    return `${this.moduleName}_${this.objName}`;
  }
}

class UITypeProps {
  constructor(uiType, parentUITypeProps) {
    if (uiType === "LIST_NESTED_OBJECT") {
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
    this.isVisible = true;
    this.sectionHeading = sectionHeading;

    this.getChildrenIds = this.getChildrenIds.bind(this);
    this.addChild = this.addChild.bind(this);
    this.hasNested = this.hasNested.bind(this);
    this.getChildrenAreCollapsed = this.getChildrenAreCollapsed.bind(this);
  }

  getChildrenIds() {
    return this.childrenIds[this.selected.asString()];
  }

  addChild(childId, idx = null) {
    const x = this.getChildrenIds();
    if (idx === null) {
      x.push(childId);
    } else {
      x.splice(idx, 0, childId);
    }
  }

  hasNested() {
    return this.getChildrenIds().length > 0;
  }

  getChildrenAreCollapsed() {
    return this.childrenAreCollapsed[this.selected.asString()];
  }

  setChildrenAreCollapsed(childrenAreCollapsed) {
    this.childrenAreCollapsed[this.selected.asString()] = childrenAreCollapsed;
  }
}

export class Sections {
  constructor() {
    this.sections = {};
    this.latestId = 0;

    this.addSection = this.addSection.bind(this);
    this.getRootIds = this.getRootIds.bind(this);
    this.getChildrenIds = this.getChildrenIds.bind(this);
    this.getUITypeProps = this.getUITypeProps.bind(this);
    this.getSelected = this.getSelected.bind(this);
    this.getSectionHeading = this.getSectionHeading.bind(this);
    this.getHasNested = this.getHasNested.bind(this);
    this.getChildrenAreCollapsed = this.getChildrenAreCollapsed.bind(this);
    this.getSectionInfo = this.getSectionInfo.bind(this);
  }

  createChild({ sectionId, moduleName, objName, paramName, uiType }) {
    const parent = this.sections[sectionId];
    const child = new Section(
      parent.sectionInfo.moduleInfos[moduleName].objs[objName].paramName,
      paramName
    );
    child.parent = sectionId;
    child.uiTypeProps = new UITypeProps(uiType, parent.uiTypeProps);
    return child;
  }

  addSection(section) {
    const sectionId = this.latestId;
    this.sections[sectionId] = section;
    this.latestId += 1;
    return sectionId;
  }

  addChild(childSection, idx = null) {
    const childId = this.addSection(childSection);
    this.sections[childSection.parent].addChild(childId, idx);
  }

  getRootIds(minId = null, maxId = null) {
    return Object.keys(this.sections).filter(
      (e) =>
        (nullOrUndefined(minId) || parseInt(e) >= minId) &&
        (nullOrUndefined(maxId) || parseInt(e) < maxId) &&
        nullOrUndefined(this.sections[e].parent)
    );
  }

  getChildrenIds(id) {
    return this.sections[id].getChildrenIds();
  }

  getUITypeProps(id) {
    return this.sections[id].uiTypeProps;
  }

  getSelected(id) {
    return this.sections[id].selected;
  }

  getSectionHeading(id) {
    return this.sections[id].sectionHeading;
  }

  getHasNested(id) {
    return this.sections[id].hasNested();
  }

  getChildrenAreCollapsed(id) {
    return this.sections[id].getChildrenAreCollapsed();
  }

  getSectionInfo(id) {
    return this.sections[id].sectionInfo;
  }

  getIsVisible(id) {
    return this.sections[id].isVisible;
  }

  setSelected({ sectionId, moduleName, objName }) {
    this.sections[sectionId].selected = new Selected(moduleName, objName);
  }

  setChildrenAreCollapsed({ sectionId, childrenAreCollapsed }) {
    this.sections[sectionId].setChildrenAreCollapsed(childrenAreCollapsed);
  }

  numRootIds() {
    return this.getRootIds().length;
  }
}
