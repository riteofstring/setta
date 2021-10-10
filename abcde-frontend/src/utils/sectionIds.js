import { v4 as uuidv4 } from "uuid";

import { nullOrUndefined, firstValue } from "./utils";

export const createNewId = () => {
  return uuidv4();
};

export const getPageMinMaxList = (rootSectionCount, sectionsPerPage) => {
  const numPages = Math.ceil(rootSectionCount / sectionsPerPage);
  let output = [];
  for (let x = 0; x < numPages; x++) {
    output.push({
      minIdx: x * sectionsPerPage,
      maxIdx: (x + 1) * sectionsPerPage,
    });
  }
  return output;
};

export const getOverviewListing = (pageMinMaxList, idsOverview, idNames) => {
  let outputList = [];
  for (let groupId = 0; groupId < pageMinMaxList.length; groupId++) {
    outputList.push([]);
    if (groupId in idsOverview){
      for (let sectionId of idsOverview[groupId]) {
        outputList[outputList.length - 1].push(
          ...getOverviewListingHelper(sectionId, idsOverview, idNames, 0)
        );
      }
    }
  }
  return outputList;
};

export const getOverviewListingHelper = (
  sectionId,
  idsOverview,
  idNames,
  depth
) => {
  let outputList = [];
  outputList.push({
    sectionId,
    sectionHeading: idNames[sectionId],
    depth: depth,
  });
  if (idsOverview[sectionId]) {
    for (let childId of idsOverview[sectionId]) {
      outputList.push(
        ...getOverviewListingHelper(childId, idsOverview, idNames, depth + 1)
      );
    }
  }
  return outputList;
};

const getEnteredValues = (currSection) => {
  let output = {};
  const allEntered = currSection.enteredValues;
  for (let k of Object.keys(allEntered)) {
    if (!nullOrUndefined(allEntered[k])) {
      output[k] = allEntered[k];
    }
  }
  return output;
};

const pushNestedSection = (currOutput, childSectionName, paramDict, uiType) => {
  if (uiType.requiresKeyInput) {
    currOutput[childSectionName] = paramDict;
    return;
  }
  if (!(childSectionName in currOutput)) {
    currOutput[childSectionName] = [];
  }
  currOutput[childSectionName].push(paramDict);
};

const passThroughListRoot = (
  currOutput,
  childSectionName,
  paramDict,
  uiType
) => {
  const listRootChildren = firstValue(paramDict);
  if (Array.isArray(listRootChildren)) {
    currOutput[childSectionName] = listRootChildren;
  } else if (
    nullOrUndefined(listRootChildren) ||
    Object.keys(listRootChildren).length === 0
  ) {
    currOutput[childSectionName] = uiType.isDictRoot ? {} : [];
  } else {
    currOutput[childSectionName] = firstValue(listRootChildren);
  }
};

const addChildSection = (currOutput, childSection, paramDict) => {
  const childSectionName = childSection.name;
  const uiType = childSection.uiType;
  if (uiType.isList) {
    pushNestedSection(currOutput, childSectionName, paramDict, uiType);
  } else if (uiType.isListRoot && !uiType.isDictRoot) {
    passThroughListRoot(currOutput, childSectionName, paramDict, uiType);
  } else {
    currOutput[childSectionName] = paramDict;
  }
};

const createExportableParams = ({ currSection, sections }) => {
  const enteredValues = getEnteredValues(currSection);
  const { moduleName, objName } = currSection.selected;
  for (let childId of currSection.childrenIds) {
    const childSection = sections.sections[childId];
    const paramDict = createExportableParams({
      currSection: childSection,
      sections,
    });
    addChildSection(enteredValues, childSection, paramDict);
  }
  if (!nullOrUndefined(moduleName)) {
    return { [`${moduleName}.${objName}`]: enteredValues };
  }
  return enteredValues;
};

export const createExportableObject = (sections) => {
  let output = {};
  for (let id of sections.getRootIds()) {
    const currSection = sections.sections[id];
    output[currSection.name] = createExportableParams({
      currSection,
      sections,
    });
  }
  return output;
};
