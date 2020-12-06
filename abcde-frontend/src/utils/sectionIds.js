const SEPARATOR = ",";
const MODULE = "M:";
const OBJ = "O:";
const PARAM = "P:";
const LIST_POSITION = "L:";

export const createStringId = (
  sectionId,
  moduleName = null,
  objName = null,
  paramName = null,
  extraIdentifier = null
) => {
  let id = sectionId;
  if (moduleName != null) {
    id += SEPARATOR + MODULE + moduleName;
  }
  if (objName != null) {
    id += SEPARATOR + OBJ + objName;
  }
  if (paramName !== null) {
    id += SEPARATOR + PARAM + paramName;
  }
  if (extraIdentifier !== null) {
    id += SEPARATOR + LIST_POSITION + extraIdentifier;
  }
  return id;
};

export const getBreadCrumbPath = (
  sectionId,
  idHierarchy,
  rootIdHierarchy,
  isVisible,
  sectionIdsToSectionNames
) => {
  const x = findId(sectionId, idHierarchy, rootIdHierarchy);
  let headOfBreadCrumbPath = [];
  let headOfIdLineage = [];
  if (isVisible[sectionId]) {
    headOfBreadCrumbPath = [sectionIdsToSectionNames[sectionId]];
    headOfIdLineage = [sectionId];
    const children = x.children;
    const nextId = children.filter((x) => isVisible[x])[0];
    if (nextId) {
      const { breadCrumbPath, idLineage } = getBreadCrumbPath(
        nextId,
        idHierarchy,
        rootIdHierarchy,
        isVisible,
        sectionIdsToSectionNames
      );
      headOfBreadCrumbPath.push(...breadCrumbPath);
      headOfIdLineage.push(...idLineage);
    }
  }
  return { breadCrumbPath: headOfBreadCrumbPath, idLineage: headOfIdLineage };
};


export const findId = (id, idHierarchy, rootIdHierarchy) => {
  let idObj = rootIdHierarchy[id];
  if (!idObj) {
    idObj = idHierarchy[id];
  }
  return idObj;
};

export const setChildrenVisibility = (
  children,
  idHierarchy,
  isVisible,
  visibility,
  parentModuleName = null,
  parentObjName = null
) => {
  for (let x of children) {
    const child = idHierarchy[x];
    if (parentModuleName === null) {
      isVisible[x] = visibility;
      setChildrenVisibility(child.children, idHierarchy, isVisible, visibility);
    } else if (
      child.parentModuleName === parentModuleName &&
      child.parentObjName === parentObjName
    ) {
      isVisible[x] = visibility;
      setChildrenVisibility(
        child.children,
        idHierarchy,
        isVisible,
        visibility,
        child.moduleName,
        child.objName
      );
    }
  }
};

export const tryPushingToList = (maybeList, newItem) => {
  if (maybeList !== undefined) {
    maybeList.push(newItem);
  } else {
    maybeList = [newItem];
  }
  return maybeList
};