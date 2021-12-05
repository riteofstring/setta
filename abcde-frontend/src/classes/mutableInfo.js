import { immerable } from "immer";

import { ParameterInfo } from "./immutableInfo";

function exportInfo(cls) {
  const output = {};
  for (let k of cls.exportable) {
    output[k] = cls[k];
  }
  return output;
}

export class MutableInfo {
  [immerable] = true;
  export() {
    return exportInfo(this);
  }
}

export class MutableParamInfo extends MutableInfo {
  constructor({ id, uiTypeId, enteredValue, childId }) {
    super();
    this.id = id;
    this.uiTypeId = uiTypeId;
    this.enteredValue = enteredValue;
    this.childId = childId;
    this.exportable = ["id", "uiTypeId", "enteredValue", "childId"];
  }
}

export class MutableObjInfo extends MutableInfo {
  constructor({ id, kwargIds = [] }) {
    super();
    this.id = id;
    this.kwargIds = kwargIds;
    this.exportable = ["id", "kwargIds"];
  }
}

export class SectionInfo extends MutableInfo {
  constructor({
    id,
    name,
    sectionTypeId,
    parentSectionInfo,
    isRendered = true,
    selectedItem = null,
  }) {
    super();
    this.id = id;
    this.sectionTypeId = sectionTypeId;
    this.initName(name, parentSectionInfo);
    this.isRendered = isRendered;
    this.selectedItem = selectedItem;
    this.exportable = [
      "id",
      "name",
      "sectionTypeId",
      "name",
      "isRendered",
      "selectedItem",
    ];
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
  exportable = ["id", "name"];
  export() {
    return exportInfo(this);
  }
}
