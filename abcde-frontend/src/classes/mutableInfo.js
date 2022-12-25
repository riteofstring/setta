import { maybeNewId } from "utils/utils";

// Entered Value
export function newEVInfo({ id, value = "", childId }) {
  return { id, value, childId };
}

export function newMutableParamUITypeInfo({ id, uiTypeId }) {
  return { id, uiTypeId };
}

function initName(name, parentName) {
  return name ? name : parentName;
}

export function newSectionInfo({
  id,
  name,
  configId,
  sectionChildrenId,
  paramInfoId,
  initialPosition = { x: 0, y: 0 },
  parentId = null,
  parentName = "",
}) {
  return {
    id: maybeNewId(id),
    name: initName(name, parentName),
    configId: maybeNewId(configId),
    sectionChildrenId: maybeNewId(sectionChildrenId),
    parentId,
    paramInfoId,
    initialPosition,
  };
}

export function newSectionConfig({
  id,
  uiTypeId,
  evColId,
  kwargColId,
  selectedItem = null,
}) {
  return {
    id: maybeNewId(id),
    uiTypeId,
    selectedItem,
    evColId: maybeNewId(evColId),
    kwargColId: maybeNewId(kwargColId),
  };
}

export function newParamTypeInfo({ type, uiTypeId }) {
  return { type, uiTypeId };
}
