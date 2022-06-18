import { getFullObjPath } from "classes/immutableInfo";
import _ from "lodash";

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

function kwargsExportSelected(
  objInfoId,
  paramCollectionId,
  kwargCollectionId,
  state
) {
  const kwargIds = state.objInfos.x[kwargCollectionId]?.[objInfoId]?.kwargIds;
  if (_.isNil(kwargIds)) {
    return {};
  }
  const kwargInfos = kwargIds.map((y) => state.kwargInfos.x[y]);
  return multipleParamInfoExportSelected(kwargInfos, paramCollectionId, state);
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
  const { selectedItem, uiTypeId, paramCollectionId, kwargCollectionId } =
    section;

  const nonObjParams = paramCollectionExportSelected(
    uiTypeId,
    allParamCollections,
    paramCollectionId,
    state
  );

  const kwargs = kwargsExportSelected(
    selectedItem,
    paramCollectionId,
    kwargCollectionId,
    state
  );

  let output = { ...nonObjParams, ...kwargs };
  if (selectedItem) {
    const objParams = objInfoExportSelected(
      allObjInfo[selectedItem],
      paramCollectionId,
      state
    );
    const key = Object.keys(objParams)[0];
    output = { [key]: { ...objParams[key], ...output } };
  }

  return output;
}

export function exportSelected(state) {
  const output = {};
  const sections = state.sectionInfos.x;

  for (let s of _.filter(sections, (x) => x.isTopLevel)) {
    output[s.name] = sectionExportSelected(s, state);
  }
  return output;
}
