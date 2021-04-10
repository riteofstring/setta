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

export const getPageMinMaxList = (rootSectionCount, sectionsPerPage) => {
  const numPages = Math.ceil(rootSectionCount / sectionsPerPage);
  let output = [];
  for (let x = 0; x < numPages; x++) {
    output.push({
      minId: x * sectionsPerPage,
      maxId: (x + 1) * sectionsPerPage,
    });
  }
  return output;
};

export const getRootIds = (idHierarchy, minId, maxId) => {
  return Object.keys(idHierarchy).filter(
    (e) =>
      parseInt(e) >= minId &&
      parseInt(e) <= maxId &&
      idHierarchy[e].parent === null
  );
};

export const getOverviewListing = (idHierarchy, pageMinMaxList) => {
  let outputList = [];
  for (let minMax of pageMinMaxList) {
    outputList.push([]);
    for (let sectionId of getRootIds(idHierarchy, minMax.minId, minMax.maxId)) {
      outputList[outputList.length - 1].push(
        ...getOverviewListingHelper(sectionId, idHierarchy, 0)
      );
    }
  }
  return outputList;
};

export const getOverviewListingHelper = (sectionId, idHierarchy, depth) => {
  let outputList = [];
  const currSection = idHierarchy[sectionId];
  if (currSection.isVisible) {
    outputList.push({
      sectionId,
      sectionHeading: currSection.sectionHeading,
      isList: currSection.isList,
      isListRoot: currSection.isListRoot,
      depth: depth,
    });
    for (let childId of idHierarchy[sectionId].children) {
      outputList.push(
        ...getOverviewListingHelper(childId, idHierarchy, depth + 1)
      );
    }
  }
  return outputList;
};

export const setChildrenVisibility = (
  children,
  idHierarchy,
  visibility,
  parentModuleName = null,
  parentObjName = null
) => {
  for (let x of children) {
    const child = idHierarchy[x];
    if (parentModuleName === null) {
      idHierarchy[x].isVisible = visibility;
      setChildrenVisibility(child.children, idHierarchy, visibility);
    } else if (
      child.parentModuleName === parentModuleName &&
      child.parentObjName === parentObjName
    ) {
      idHierarchy[x].isVisible = visibility;
      setChildrenVisibility(
        child.children,
        idHierarchy,
        visibility,
        child.moduleName,
        child.objName
      );
    }
  }
};

const createExportableParams = ({
  currSelected,
  idHierarchy,
  sectionIdsToSectionHeadings,
  isList,
  isListRoot,
  globalCurr,
  id,
}) => {
  let output = {};
  const { moduleName, objName, children: originalChildren } = currSelected;
  if (moduleName === null || moduleName === undefined) {
    return output;
  }
  const fullObjName = moduleName + "." + objName;
  output[fullObjName] = {};
  let params = null;
  try {
    params = globalCurr[id][moduleName][objName];
    output[fullObjName] = params;
  } catch (err) {}

  if (originalChildren) {
    let children = originalChildren.slice();
    for (let childId of originalChildren) {
      if (isListRoot[childId]) {
        children = children.filter((x) => x !== childId);
        children.push(...idHierarchy[childId].children);
      }
    }

    for (let childId of children) {
      const childSectionName = sectionIdsToSectionHeadings[childId];
      const nextSelected = idHierarchy[childId];
      const paramDict = createExportableParams({
        currSelected: nextSelected,
        idHierarchy,
        sectionIdsToSectionHeadings,
        isList,
        isListRoot,
        globalCurr,
        id: childId,
      });

      if (Object.keys(paramDict).length > 0) {
        if (isList[childId]) {
          if (childSectionName in output[fullObjName]) {
            output[fullObjName][childSectionName].push(paramDict);
          } else {
            output[fullObjName][childSectionName] = [paramDict];
          }
        } else {
          output[fullObjName][childSectionName] = paramDict;
        }
      }
    }
  }
  return output;
};

export const createExportableObject = ({
  idHierarchy,
  sectionIdsToSectionHeadings,
  isList,
  isListRoot,
  globalCurr,
}) => {
  let output = {};
  for (let id of getRootIds(idHierarchy)) {
    const sectionName = sectionIdsToSectionHeadings[id];
    const currSelected = idHierarchy[id];
    output[sectionName] = createExportableParams({
      currSelected,
      idHierarchy,
      sectionIdsToSectionHeadings,
      isList,
      isListRoot,
      globalCurr,
      id,
    });
  }
  return output;
};
