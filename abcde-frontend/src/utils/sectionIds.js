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
  sectionIdsToSectionHeadings
) => {
  const x = findId(sectionId, idHierarchy, rootIdHierarchy);
  let headOfBreadCrumbPath = [];
  let headOfIdLineage = [];
  if (isVisible[sectionId]) {
    headOfBreadCrumbPath = [sectionIdsToSectionHeadings[sectionId]];
    headOfIdLineage = [sectionId];
    const children = x.children;
    const nextId = children.filter((x) => isVisible[x])[0];
    if (nextId) {
      const { breadCrumbPath, idLineage } = getBreadCrumbPath(
        nextId,
        idHierarchy,
        rootIdHierarchy,
        isVisible,
        sectionIdsToSectionHeadings
      );
      headOfBreadCrumbPath.push(...breadCrumbPath);
      headOfIdLineage.push(...idLineage);
    }
  }
  return { breadCrumbPath: headOfBreadCrumbPath, idLineage: headOfIdLineage };
};

export const getOverviewListing = (
  rootIdHierarchy,
  idHierarchy,
  isVisible,
  sectionIdsToSectionHeadings,
  isList,
  isListRoot
) => {
  let outputList = [];
  for (let sectionId of Object.keys(rootIdHierarchy)) {
    outputList.push(
      ...getOverviewListingHelper(
        sectionId,
        idHierarchy,
        isVisible,
        sectionIdsToSectionHeadings,
        isList,
        isListRoot,
        0,
        rootIdHierarchy
      )
    );
  }
  return outputList;
};

export const getOverviewListingHelper = (
  sectionId,
  idHierarchy,
  isVisible,
  sectionIdsToSectionHeadings,
  isList,
  isListRoot,
  depth,
  rootIdHierarchy
) => {
  let outputList = [];
  if (isVisible[sectionId]) {
    outputList.push({
      sectionId,
      sectionHeading: sectionIdsToSectionHeadings[sectionId],
      isList: isList[sectionId],
      isListRoot: isListRoot[sectionId],
      depth: depth,
    });
    const loopThrough = rootIdHierarchy ? rootIdHierarchy : idHierarchy;
    for (let childId of loopThrough[sectionId].children) {
      outputList.push(
        ...getOverviewListingHelper(
          childId,
          idHierarchy,
          isVisible,
          sectionIdsToSectionHeadings,
          isList,
          isListRoot,
          depth + 1,
          null
        )
      );
    }
  }
  return outputList;
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
  rootIdHierarchy,
  sectionIdsToSectionHeadings,
  isList,
  isListRoot,
  globalCurr,
}) => {
  let output = {};
  for (let id of Object.keys(rootIdHierarchy)) {
    const sectionName = sectionIdsToSectionHeadings[id];
    const currSelected = rootIdHierarchy[id];
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
