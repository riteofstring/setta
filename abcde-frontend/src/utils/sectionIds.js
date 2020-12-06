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
  sectionName,
  moduleName,
  objName,
  paramName,
  listPosition = null
) => {
  let id =
    sectionName +
    NESTED +
    MODULE +
    moduleName +
    SEPARATOR +
    OBJ +
    objName +
    SEPARATOR +
    PARAM +
    paramName;
  if (listPosition !== null) {
    id += SEPARATOR + LIST_POSITION + listPosition;
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
  visibleSectionIds,
  sectionIdsToSectionNames,
) => {
  const x = visibleSectionIds[sectionId];
  let headOfBreadCrumbPath = [];
  let headOfIdLineage = [];
  if (x.visible) {
    headOfBreadCrumbPath = [sectionIdsToSectionNames[sectionId]];
    headOfIdLineage = [sectionId];
    const children = x.children;
    const childrenKeys = Object.keys(children);
    const nextId = childrenKeys.filter(x=>children[x].visible)[0];
    if (nextId) {
      const { breadCrumbPath, idLineage } = getBreadCrumbPath(
        nextId,
        children,
        sectionIdsToSectionNames
      );
      headOfBreadCrumbPath.push(...breadCrumbPath);
      headOfIdLineage.push(...idLineage);
    }
  }
  return { breadCrumbPath: headOfBreadCrumbPath, idLineage: headOfIdLineage };
};

export const getMaxListPosition = (sectionId, visibleSectionIds, paramName) => {
  const nested = visibleSectionIds[sectionId];
  let maxPosition = 0;
  for (let id of Object.keys(nested)) {
    const { paramName: currParamName, listPosition } = parseNestedId(id);
    if (paramName === currParamName) {
      maxPosition = Math.max(listPosition, maxPosition);
    }
  }
  return maxPosition;
};

export const getSectionOrder = (visibleSectionIds) => {
  const allIds = Object.keys(visibleSectionIds);
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

export const findId = (id, visibleSectionIds) => {
  let output = null;
  for (let x of Object.keys(visibleSectionIds)) {
    if (x === id) {
      output = visibleSectionIds[x];
    } else {
      output = findId(id, visibleSectionIds[x].children);
    }
    if (output !== null) {
      break;
    }
  }
  return output;
};

export const setChildrenVisibility = (
  children,
  visibility,
  parentModuleName = null,
  parentObjName = null
) => {
  for (let x of Object.keys(children)) {
    const child = children[x];
    if (parentModuleName === null) {
      child.visible = visibility;
      setChildrenVisibility(child.children, visibility);
    } else if (
      child.parentModuleName === parentModuleName &&
      child.parentObjName === parentObjName
    ) {
      child.visible = visibility;
      setChildrenVisibility(
        child.children,
        visibility,
        child.moduleName,
        child.objName
      );
    }
  }
};
