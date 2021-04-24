import { nullOrUndefined, firstValue } from "./utils";

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
    sectionHeading: currSection.name,
    isList: currSection.uiType.isList,
    isListRoot: currSection.uiType.isListRoot,
    depth: depth,
  });
  for (let childId of currSection.childrenIds) {
    outputList.push(...getOverviewListingHelper(childId, sections, depth + 1));
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
