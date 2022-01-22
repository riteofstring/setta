import { immerable } from "immer";

import { ParameterInfo } from "./immutableInfo";

export function exportInfo(cls) {
  const output = {};
  for (let k of cls.exportable) {
    output[k] = cls[k];
  }
  return output;
}

export class MutableInfo {
  [immerable] = true;
}

export class MutableParamInfo extends MutableInfo {
  constructor({ id, enteredValueId, childId }) {
    super();
    this.id = id;
    this.enteredValueId = enteredValueId;
    this.childId = childId;
    this.exportable = ["id", "enteredValueId", "childId"];
  }
}

export class MutableParamUITypeInfo extends MutableInfo {
  constructor({ id, uiTypeId }) {
    super();
    this.id = id;
    this.uiTypeId = uiTypeId;
    this.exportable = ["id", "uiTypeId"];
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

function initName(name, parentSectionInfo) {
  if (name) {
    return name;
  } else if (parentSectionInfo) {
    return parentSectionInfo.name;
  }
}

export class SectionInfo extends MutableInfo {
  constructor({
    id,
    name,
    uiTypeId,
    parentSectionInfo,
    paramCollectionId,
    kwargCollectionId,
    paramInfoId,
    selectedItem = null,
  }) {
    super();
    this.id = id;
    this.uiTypeId = uiTypeId;
    this.name = initName(name, parentSectionInfo);
    this.selectedItem = selectedItem;
    this.paramCollectionId = paramCollectionId;
    this.kwargCollectionId = kwargCollectionId;
    this.parentId = parentSectionInfo?.id;
    this.paramInfoId = paramInfoId;
    this.exportable = [
      "id",
      "name",
      "uiTypeId",
      "name",
      "selectedItem",
      "paramCollectionId",
      "kwargCollectionId",
    ];
  }
}

export class KwargInfo extends ParameterInfo {
  [immerable] = true;
  exportable = ["id", "name"];
}

export class ParamTypeInfo extends MutableInfo {
  constructor({ type, uiTypeId }) {
    super();
    this.type = type;
    this.uiTypeId = uiTypeId;
    this.exportable = ["type", "uiTypeId"];
  }
}
