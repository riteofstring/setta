import { getFullObjPath } from "classes/immutableInfo";
import _ from "lodash";

export const getOverviewListing = (groups, idsOverview, idNames) => {
  let outputList = [];
  for (let group of groups) {
    outputList.push([]);
    for (let sectionId of group) {
      outputList[outputList.length - 1].push(
        ...getOverviewListingHelper(sectionId, idsOverview, idNames, 0)
      );
    }
  }
  return outputList;
};

const getOverviewListingHelper = (sectionId, idsOverview, idNames, depth) => {
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

function paramInfoExportSelected(paramInfo, paramCollectionId, state) {
  const { enteredValueId } =
    state.paramInfos.x[paramCollectionId][paramInfo.id];
  return state.enteredValues.x[enteredValueId];
}

function multipleParamInfoExportSelected(paramInfos, paramCollectionId, state) {
  const output = {};
  for (let p of paramInfos) {
    const paramSelection = paramInfoExportSelected(p, paramCollectionId, state);
    if (!_.isNil(paramSelection)) {
      output[p.name] = paramSelection;
    }
  }
  return output;
}

function paramCollectionExportSelected(
  uiTypeId,
  allParamCollections,
  paramCollectionId,
  state
) {
  const {
    config: { parameters },
  } = state.uiTypes.x[uiTypeId];
  let currParamCollections = {};
  for (let p of parameters) {
    currParamCollections = {
      ...currParamCollections,
      ...allParamCollections.children[p].children,
    };
  }
  return multipleParamInfoExportSelected(
    Object.values(currParamCollections),
    paramCollectionId,
    state
  );
}

function objInfoExportSelected(objInfo, paramCollectionId, state) {
  const { allPackageInfo, allModuleInfo } = state.master;
  const fullObjPath = getFullObjPath(allPackageInfo, allModuleInfo, objInfo);
  const output = multipleParamInfoExportSelected(
    Object.values(objInfo.children),
    paramCollectionId,
    state
  );
  return { [fullObjPath]: output };
}

function sectionExportSelected(section, state) {
  // Confusingly, paramCollectionId is not related to allParamCollections.
  // Instead, it is used for keeping track of param ui types, entered values etc.
  const { allObjInfo, allParamCollections } = state.master;
  const { selectedItem, uiTypeId, paramCollectionId } = section;
  if (selectedItem) {
    return objInfoExportSelected(
      allObjInfo[selectedItem],
      paramCollectionId,
      state
    );
  } else {
    return paramCollectionExportSelected(
      uiTypeId,
      allParamCollections,
      paramCollectionId,
      state
    );
  }
}

export function exportSelected(state) {
  const output = {};
  const sections = state.sectionInfos.x;

  for (let s of _.filter(sections, (x) => x.isTopLevel)) {
    output[s.name] = sectionExportSelected(s, state);
  }
  return output;
}
