export class Section {
  constructor(id, sectionInfo) {
    this.id = id;
    this.sectionInfo = sectionInfo;
    this.parent = null;
    this.childrenIds = [];
    this.selected = { moduleName: null, objName: null };
    this.isList = null;
    this.isListRoot = false;
    this.listCount = 0;
    this.childrenAreCollapsed = false;
    this.isVisible = true;
    this.sectionHeading = null;
    this.stringId = null;
  }

  addChild(childId, idx = null) {
    if (idx === null) {
      this.childrenIds.push(childId);
    } else {
      this.childrenIds.splice(idx, 0, childId);
    }
  }
}

export class Sections {
  constructor() {
    this.sections = {};

    this.addSection = this.addSection.bind(this);
    this.addChild = this.addChild.bind(this);
  }

  addSection(id, section) {
    this.sections[id] = section;
  }

  addChild(parentId, childId, childSection, idx = null) {
    this.addSection(id, childSection);
    this.sections[parentId].addChild(childId, idx)
  }
}
