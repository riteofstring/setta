import { immerable } from "immer";

import { ParameterInfo } from "./immutableInfo";

export class MutableParamInfo {
  [immerable] = true;
  constructor({ id, uiTypeId, enteredValue, childId }) {
    this.id = id;
    this.uiTypeId = uiTypeId;
    this.enteredValue = enteredValue;
    this.childId = childId;
  }
}

export class MutableObjInfo {
  [immerable] = true;
  constructor({ id, kwargIds = [] }) {
    this.id = id;
    this.kwargIds = kwargIds;
  }
}

export class SectionInfo {
  [immerable] = true;
  constructor({
    id,
    name,
    sectionTypeId,
    parentSectionInfo,
    isRendered = true,
    selectedItem = null,
  }) {
    this.id = id;
    this.sectionTypeId = sectionTypeId;
    this.initName(name, parentSectionInfo);
    this.isRendered = isRendered;
    this.selectedItem = selectedItem;
  }

  initName(name, parentSectionInfo) {
    if (name) {
      this.name = name;
    } else if (parentSectionInfo) {
      this.name = parentSectionInfo.name;
    }
  }
}

export class KwargInfo extends ParameterInfo {
  [immerable] = true;
}
