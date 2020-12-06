const NESTED = "~";
const SEPARATOR = ",";
const MODULE = "M:";
const OBJ = "O:";
const PARAM = "P:";
const LIST_POSITION = "L:";

export const modifyId = ({
  id,
  sectionName = null,
  moduleName = null,
  objName = null,
  paramName = null,
  listPosition = null,
}) => {
  const childId = getChildId(id);
  let parentId = getParentId(id);
  let {
    moduleName: oldModuleName,
    objName: oldObjName,
    paramName: oldParamName,
    listPosition: oldListPosition,
  } = parseNestedId(childId);

  if (sectionName !== null) {
    parentId = sectionName;
  }
  if (moduleName !== null) {
    oldModuleName = moduleName;
  }
  if (objName !== null) {
    oldObjName = objName;
  }
  if (paramName !== null) {
    oldParamName = paramName;
  }
  if (listPosition !== null) {
    oldListPosition = listPosition;
  }
  return createStringId(
    parentId,
    oldModuleName,
    oldObjName,
    oldParamName,
    oldListPosition
  );
};

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

export const parseNestedId = (id) => {
  const splitId = id.split(SEPARATOR);
  const moduleName = splitId[0].split(MODULE)[1];
  const objName = splitId[1].split(OBJ)[1];
  const paramName = splitId[2].split(PARAM)[1];
  let listPosition = null;
  if (splitId.length === 4) {
    listPosition = splitId[3].split(LIST_POSITION)[1];
  }
  return { moduleName, objName, paramName, listPosition };
};

export const getSplitId = (id) => {
  return id.split(NESTED);
};

export const getTopLevelSectionId = (id) => {
  return getSplitId(id)[0];
};

export const getParentId = (id) => {
  const splitId = getSplitId(id);
  return splitId.slice(0, splitId.length - 1).join(NESTED);
};

export const getChildId = (id) => {
  return getSplitId(id).pop();
};

const parseId = (id) => {
  const splitId = getSplitId(id);
  const output = [splitId[0]];
  for (let i = 1; i < splitId.length; i++) {
    output.push(parseNestedId(splitId[i]));
  }
  return output;
};

export const getSection = (sections, id) => {
  const idParsed = parseId(id);
  const rootSectionName = idParsed[0];
  let currSection = sections[rootSectionName];
  for (let i = 1; i < idParsed.length; i++) {
    const { moduleName, objName, paramName } = idParsed[i];
    currSection =
      currSection.moduleInfos[moduleName].objs[objName].params[paramName].type;
  }
  return currSection;
};

export const combineIds = (parent, child) => {
  return parent + NESTED + child;
};

export const getVisible = (visible, sectionId) => {
  return !(sectionId in visible) | visible[sectionId];
};

const createExportableParams = (selected, globalCurr, id) => {
  let output = {};
  const currSelected = selected[id];
  let params = currSelected.params;
  if (params) {
    let moduleName = currSelected.moduleName;
    let objName = currSelected.name;
    let fullObjName = moduleName + "." + objName;
    output[fullObjName] = {};
    for (let paramName of Object.keys(params)) {
      let nextId = createStringId(id, moduleName, objName, paramName);
      if (nextId in selected) {
        output[fullObjName][paramName] = createExportableParams(
          selected,
          globalCurr,
          nextId
        );
      } else {
        try {
          output[fullObjName][paramName] =
            globalCurr[id][moduleName][objName][paramName];
        } catch (err) {}
      }
    }
  }
  return output;
};

export const createExportableObject = (selected, globalCurr) => {
  let output = {};
  for (let id of Object.keys(selected)) {
    if (id === getTopLevelSectionId(id)) {
      output[id] = createExportableParams(selected, globalCurr, id);
    }
  }
  return output;
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

export const getMaxListPosition = (sectionId, idHierarchy, paramName) => {
  const nested = idHierarchy[sectionId];
  let maxPosition = 0;
  for (let id of Object.keys(nested)) {
    const { paramName: currParamName, listPosition } = parseNestedId(id);
    if (paramName === currParamName) {
      maxPosition = Math.max(listPosition, maxPosition);
    }
  }
  return maxPosition;
};

export const getSectionOrder = (idHierarchy) => {
  const allIds = Object.keys(idHierarchy);
  let ordered = [];
  let done = {};
  for (let k of allIds) {
    if (!done[k]) {
      const listPosition = parseNestedId(k).listPosition;
      if (listPosition !== null) {
        const prefix = k.replace(/\d+$/, "");
        const subList = allIds.filter((x) => x.startsWith(prefix));
        ordered.push(...subList);
        for (let k2 of subList) {
          done[k2] = true;
        }
      } else {
        ordered.push(k);
        done[k] = true;
      }
    }
  }
  return ordered;
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

export const tryGettingLength = (maybeList) => {
  return maybeList !== undefined ? maybeList.length : 0
}
