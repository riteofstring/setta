import { immerable } from "immer";
import { maybeNewId } from "utils/utils";

import { ObjInfo } from "./immutableInfo";

export class MutableInfo {
  [immerable] = true;
}

// Entered Value
export class EVInfo extends MutableInfo {
  constructor({ id, value = "", childId }) {
    super();
    this.id = id;
    this.value = value;
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

function initName(name, parentName) {
  return name ? name : parentName;
}

export class SectionInfo extends MutableInfo {
  constructor({
    id,
    name,
    configId,
    sectionChildrenId,
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
    this.sectionChildrenId = maybeNewId(sectionChildrenId);
    this.parentId = parentId;
    this.paramInfoId = paramInfoId;
    this.isTopLevel = isTopLevel;
    this.initialPosition = initialPosition;
  }
}

export class SectionConfig extends MutableInfo {
  constructor({ id, uiTypeId, evColId, kwargColId, selectedItem = null }) {
    super();
    this.id = maybeNewId(id);
    this.uiTypeId = uiTypeId;
    this.selectedItem = selectedItem;
    this.evColId = maybeNewId(evColId);
    this.kwargColId = maybeNewId(kwargColId);
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
