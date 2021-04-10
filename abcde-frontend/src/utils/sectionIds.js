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

export const getOverviewListing = (sections, pageMinMaxList) => {
  let outputList = [];
  for (let minMax of pageMinMaxList) {
    outputList.push([]);
    for (let sectionId of sections.getRootIds(minMax.minId, minMax.maxId)) {
      outputList[outputList.length - 1].push(
        ...getOverviewListingHelper(sectionId, sections.sections, 0)
      );
    }
  }
  return outputList;
};

export const getOverviewListingHelper = (sectionId, sections, depth) => {
  let outputList = [];
  const currSection = sections[sectionId];

  outputList.push({
    sectionId,
    sectionHeading: currSection.sectionHeading,
    isList: currSection.uiTypeProps.isList,
    isListRoot: currSection.uiTypeProps.isListRoot,
    depth: depth,
  });
  for (let childId of currSection.getChildrenIds()) {
    outputList.push(...getOverviewListingHelper(childId, sections, depth + 1));
  }
  return outputList;
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
  // let output = {};
  // for (let id of getRootIds(idHierarchy)) {
  //   const sectionName = sectionIdsToSectionHeadings[id];
  //   const currSelected = idHierarchy[id];
  //   output[sectionName] = createExportableParams({
  //     currSelected,
  //     idHierarchy,
  //     sectionIdsToSectionHeadings,
  //     isList,
  //     isListRoot,
  //     globalCurr,
  //     id,
  //   });
  // }
  // return output;
};
