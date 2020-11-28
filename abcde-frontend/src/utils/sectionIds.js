const NESTED = "~";
const SEPARATOR = ",";
const MODULE = "M:";
const OBJ = "O:";
const PARAM = "P:";

export const createId = (sectionName, moduleName, objName, paramName) => {
  return (
    sectionName +
    NESTED +
    MODULE +
    moduleName +
    SEPARATOR +
    OBJ +
    objName +
    SEPARATOR +
    PARAM +
    paramName
  );
};

export const parseNestedId = (id) => {
  const splitId = id.split(SEPARATOR);
  const moduleName = splitId[0].split(MODULE)[1];
  const objName = splitId[1].split(OBJ)[1];
  const paramName = splitId[2].split(PARAM)[1];
  return { moduleName, objName, paramName };
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
      let nextId = createId(id, moduleName, objName, paramName);
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
  isTopLevel = true
) => {
  let output = isTopLevel ? [sectionId] : [parseNestedId(sectionId).paramName];
  const nested = visibleSectionIds[sectionId];
  if (nested) {
    const keys = Object.keys(nested);
    if (keys.length > 0) {
      output.push(...getBreadCrumbPath(keys[0], nested, false));
    }
  }
  return output;
};
