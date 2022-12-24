import { maybeNewId } from "abcde-utils/src/utils";

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

export function newParamTypeInfo({ type, uiTypeId }) {
  return { type, uiTypeId };
}
