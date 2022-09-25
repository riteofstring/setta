import { immerable } from "immer";
import { maybeNewId } from "utils/utils";

import { ObjInfo } from "./immutableInfo";

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

function initName(name, parentName) {
  return name ? name : parentName;
}

export class SectionInfo extends MutableInfo {
  constructor({
    id,
    name,
    uiTypeId,
    paramCollectionId,
    kwargCollectionId,
    paramInfoId,
    selectedItem = null,
    isTopLevel = false,
    initialPosition = { x: 0, y: 0 },
    parentId = null,
    parentName = "",
  }) {
    super();
    this.id = maybeNewId(id);
    this.uiTypeId = uiTypeId;
    this.name = initName(name, parentName);
    this.selectedItem = selectedItem;
    this.paramCollectionId = maybeNewId(paramCollectionId);
    this.kwargCollectionId = maybeNewId(kwargCollectionId);
    this.parentId = parentId;
    this.paramInfoId = paramInfoId;
    this.isTopLevel = isTopLevel;
    this.initialPosition = initialPosition;
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

export class KwargInfo extends ObjInfo {
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
