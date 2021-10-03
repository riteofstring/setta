import { immerable } from "immer";

export class MutableParamInfo {
  [immerable] = true;
  constructor({ id, uiTypeId, enteredValue, childId }) {
    this.id = id;
    this.uiTypeId = uiTypeId;
    this.enteredValue = enteredValue;
    this.childId = childId;
  }
}

export class SectionInfo {
  [immerable] = true;
  constructor({ id, name, sectionTypeId, parentSectionInfo }) {
    this.id = id;
    this.sectionTypeId = sectionTypeId;
    this.initName(name, parentSectionInfo);
  }

  initName(name, parentSectionInfo) {
    if (name) {
      this.name = name;
    } else if (parentSectionInfo) {
      this.name = parentSectionInfo.name;
    }
  }
}
