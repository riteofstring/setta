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

class ListProps {
  constructor() {
    this.isList = false;
    this.isListRoot = false;
    this.idx = null;

    this.setIdx = this.setIdx.bind(this);
  }

  setIdx(idx) {
    this.idx = idx;
    this.isList = !nullOrUndefined(idx);
    this.isListRoot = !nullOrUndefined(idx);
  }
}

export class Section {
  constructor(id, sectionInfo, sectionHeading) {
    this.id = id;
    this.sectionInfo = sectionInfo;
    this.parent = null;
    this.childrenIds = defaultDict(() => []);
    this.selected = new Selected();
    this.listProps = new ListProps();
    this.childrenAreCollapsed = {};
    this.isVisible = true;
    this.sectionHeading = sectionHeading;
    this.stringId = null;

    this.getChildrenIds = this.getChildrenIds.bind(this);
    this.addChild = this.addChild.bind(this);
    this.setListIdx = this.setListIdx.bind(this);
    this.hasNested = this.hasNested.bind(this);
    this.getChildrenAreCollapsed = this.getChildrenAreCollapsed.bind(this);
  }

  getChildrenIds() {
    return this.childrenIds[this.selected.asString()];
  }

  addChild(childId, idx = null) {
    const x = this.getChildrenIds();
    if (idx === null) {
      this.x.push(childId);
    } else {
      this.x.splice(idx, 0, childId);
    }
  }

  setListIdx(idx) {
    this.listProps.setIdx(idx);
  }

  hasNested() {
    return this.getChildrenIds().length > 0;
  }

  getChildrenAreCollapsed() {
    return this.childrenAreCollapsed[this.selected.asString()];
  }
}

export class Sections {
  constructor() {
    this.sections = {};

    this.addSection = this.addSection.bind(this);
    this.addChild = this.addChild.bind(this);
    this.getRootIds = this.getRootIds.bind(this);
    this.getChildrenIds = this.getChildrenIds.bind(this);
    this.getListProps = this.getListProps.bind(this);
    this.getSelected = this.getSelected.bind(this);
    this.getSectionHeading = this.getSectionHeading.bind(this);
    this.getHasNested = this.getHasNested.bind(this);
    this.getChildrenAreCollapsed = this.getChildrenAreCollapsed.bind(this);
    this.getSectionInfo = this.getSectionInfo.bind(this);
  }

  addSection(id, section) {
    this.sections[id] = section;
  }

  addChild(parentId, childId, childSection, idx = null) {
    this.addSection(childId, childSection);
    this.sections[childId].setListIdx(idx);
    this.sections[parentId].addChild(childId, idx);
  }

  getRootIds(minId, maxId) {
    return Object.keys(this.sections).filter(
      (e) =>
        parseInt(e) >= minId &&
        parseInt(e) <= maxId &&
        nullOrUndefined(this.sections[e].parent)
    );
  }

  getChildrenIds(id) {
    return this.sections[id].getChildrenIds();
  }

  getListProps(id) {
    return this.sections[id].listProps;
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

  setSelected({ sectionId, moduleName, objName }) {
    this.sections[sectionId].selected = new Selected(moduleName, objName);
  }
}
