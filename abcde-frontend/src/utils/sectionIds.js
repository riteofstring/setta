const SEPARATOR = ",";
const MODULE = "M:";
const OBJ = "O:";
const PARAM = "P:";
const LIST_POSITION = "L:";

export const newIdInHierarchy = (input) => {
  return {
    parent: null,
    children: [],
    moduleName: null,
    objName: null,
    parentModuleName: null,
    parentObjName: null,
    hasNested: false,
    isList: null,
    isListRoot: false,
    listCount: 0,
    isShown: true,
    isVisible: true,
    sectionHeading: null,
    stringId: null,
    ...input,
  };
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

export const getRootIds = (idHierarchy) => {
  return Object.keys(idHierarchy).filter((e) => idHierarchy[e].parent === null);
};

export const getPositionOfSection = (
  targetSectionId,
  idHierarchy,
  isVisible,
  isShown,
  sectionSizes
) => {
  let position = 0;
  let addToPosition = 0;
  let foundTargetId = false;
  for (let sectionId of getRootIds(idHierarchy)) {
    if (sectionId === targetSectionId || foundTargetId) {
      return position;
    }

    position += sectionSizes[sectionId].height;

    ({ position: addToPosition, foundTargetId } = getPositionOfSectionHelper(
      targetSectionId,
      sectionId,
      idHierarchy,
      isVisible,
      isShown,
      sectionSizes
    ));
    if (isShown[sectionId]) {
      position += addToPosition;
    } else if (foundTargetId) {
      position -= sectionSizes[sectionId].height;
    }
  }
  return position;
};

export const getPositionOfSectionHelper = (
  targetSectionId,
  sectionId,
  idHierarchy,
  isVisible,
  isShown,
  sectionSizes
) => {
  let position = 0;
  let addToPosition = 0;
  let foundTargetId = false;
  if (isVisible[sectionId]) {
    for (let childId of idHierarchy[sectionId].children) {
      if (childId === targetSectionId || foundTargetId) {
        return { position, foundTargetId: true };
      }

      position += sectionSizes[childId].height;

      ({ position: addToPosition, foundTargetId } = getPositionOfSectionHelper(
        targetSectionId,
        childId,
        idHierarchy,
        isVisible,
        isShown,
        sectionSizes
      ));
      if (isShown[childId]) {
        position += addToPosition;
      } else if (foundTargetId) {
        position -= sectionSizes[childId].height;
      }
    }
  }
  return { position, foundTargetId };
};

export const getOverviewListing = (idHierarchy) => {
  let outputList = [];
  for (let pageNum of Object.keys(idHierarchy)) {
    outputList.push([]);
    const idHierarchyCurrPage = idHierarchy[pageNum];
    for (let sectionId of getRootIds(idHierarchyCurrPage)) {
      outputList[outputList.length - 1].push(
        ...getOverviewListingHelper(sectionId, idHierarchyCurrPage, 0)
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
