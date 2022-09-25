import { immerable } from "immer";
import { maybeNewId } from "utils/utils";

import { ObjInfo } from "./immutableInfo";

export class MutableInfo {
  [immerable] = true;
}

export class MutableParamInfo extends MutableInfo {
  constructor({ id, enteredValueId, childId }) {
    super();
    this.id = id;
    this.enteredValueId = enteredValueId;
    this.childId = childId;
  }
}

export class MutableParamUITypeInfo extends MutableInfo {
  constructor({ id, uiTypeId }) {
    super();
    this.id = id;
    this.uiTypeId = uiTypeId;
  }
}

export class MutableObjInfo extends MutableInfo {
  constructor({ id, kwargIds = [] }) {
    super();
    this.id = id;
    this.kwargIds = kwargIds;
  }
}

function initName(name, parentName) {
  return name ? name : parentName;
}

export class SectionInfo extends MutableInfo {
  constructor({
    id,
    name,
    configId,
    paramInfoId,
    isTopLevel = false,
    initialPosition = { x: 0, y: 0 },
    parentId = null,
    parentName = "",
  }) {
    super();
    this.id = maybeNewId(id);
    this.name = initName(name, parentName);
    this.configId = maybeNewId(configId);
    this.parentId = parentId;
    this.paramInfoId = paramInfoId;
    this.isTopLevel = isTopLevel;
    this.initialPosition = initialPosition;
  }
}

export class SectionConfig extends MutableInfo {
  constructor({
    id,
    uiTypeId,
    paramCollectionId,
    kwargCollectionId,
    selectedItem = null,
  }) {
    super();
    this.id = maybeNewId(id);
    this.uiTypeId = uiTypeId;
    this.selectedItem = selectedItem;
    this.paramCollectionId = maybeNewId(paramCollectionId);
    this.kwargCollectionId = maybeNewId(kwargCollectionId);
  }
}

export class KwargInfo extends ObjInfo {
  [immerable] = true;
}

export class ParamTypeInfo extends MutableInfo {
  constructor({ type, uiTypeId }) {
    super();
    this.type = type;
    this.uiTypeId = uiTypeId;
  }
}
