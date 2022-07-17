import { getFullObjPath } from "classes/immutableInfo";
import _ from "lodash";

import { VARIABLE, OBJ, PARAM, STRING } from "./codeGenConstants";
import { DECK, isRoot } from "./constants";

function paramInfoExportSelected(
  sectionId,
  paramInfo,
  paramCollectionId,
  state
) {
  const { enteredValueId, childId } =
    state.paramInfos.x[paramCollectionId][paramInfo.id];
  if (state.sectionInfos.currChildren[sectionId].includes(childId)) {
    return sectionExportSelected(state.sectionInfos.x[childId], state);
  }
  return state.enteredValues.x[enteredValueId];
}

function multipleParamInfoExportSelected(
  sectionId,
  paramInfos,
  paramCollectionId,
  state
) {
  const output = {};
  for (let p of paramInfos) {
    let paramSelection = paramInfoExportSelected(
      sectionId,
      p,
      paramCollectionId,
      state
    );
    if (!_.isNil(paramSelection)) {
      if (_.isString(paramSelection)) {
        paramSelection = stringPrefix(paramSelection);
      }
      output[paramPrefix(p.name)] = paramSelection;
    }
  }
  return output;
}

function paramCollectionExportSelected(
  sectionId,
  sectionType,
  allParamCollections,
  paramCollectionId,
  state
) {
  const {
    config: { parameters },
  } = sectionType;
  let currParamCollections = {};
  for (let p of parameters) {
    currParamCollections = {
      ...currParamCollections,
      ...allParamCollections.children[p].children,
    };
  }
  return multipleParamInfoExportSelected(
    sectionId,
    Object.values(currParamCollections),
    paramCollectionId,
    state
  );
}

function kwargsExportSelected(
  sectionId,
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
  return multipleParamInfoExportSelected(
    sectionId,
    kwargInfos,
    paramCollectionId,
    state
  );
}

function objInfoExportSelected(sectionId, objInfo, paramCollectionId, state) {
  const { allPackageInfo, allModuleInfo } = state.master;
  const fullObjPath = getFullObjPath(allPackageInfo, allModuleInfo, objInfo);
  const output = multipleParamInfoExportSelected(
    sectionId,
    Object.values(objInfo.children),
    paramCollectionId,
    state
  );
  return { [objPrefix(fullObjPath)]: output };
}

function rootChildrenExportSelected(section, sectionType, state) {
  const currChildren = state.sectionInfos.currChildren[section.id];
  const childSelections = [];
  for (let c of currChildren) {
    const currSection = state.sectionInfos.x[c];
    childSelections.push([
      currSection.name,
      sectionExportSelected(currSection, state),
    ]);
  }
  if (sectionType.type === "LIST_ROOT") {
    return childSelections.map((x) => x[1]);
  }
  return Object.fromEntries(childSelections);
}

function sectionExportSelected(section, state) {
  // Confusingly, paramCollectionId is not related to allParamCollections.
  // Instead, it is used for keeping track of param ui types, entered values etc.
  const { allObjInfo, allParamCollections } = state.master;
  const {
    id: sectionId,
    selectedItem,
    uiTypeId,
    paramCollectionId,
    kwargCollectionId,
  } = section;
  const sectionType = state.uiTypes.x[uiTypeId];

  if (isRoot(sectionType.type)) {
    return rootChildrenExportSelected(section, sectionType, state);
  }

  const nonObjParams = paramCollectionExportSelected(
    sectionId,
    sectionType,
    allParamCollections,
    paramCollectionId,
    state
  );

  const kwargs = kwargsExportSelected(
    sectionId,
    selectedItem,
    paramCollectionId,
    kwargCollectionId,
    state
  );

  let output = { ...nonObjParams, ...kwargs };
  if (selectedItem) {
    const objParams = objInfoExportSelected(
      sectionId,
      allObjInfo[selectedItem],
      paramCollectionId,
      state
    );
    const key = Object.keys(objParams)[0];
    output = { [key]: { ...objParams[key], ...output } };
  }

  return output;
}

function topLevelPrefix(key) {
  return `${VARIABLE}${key}`;
}

function objPrefix(key) {
  return `${OBJ}${key}`;
}

function paramPrefix(key) {
  return `${PARAM}${key}`;
}

function stringPrefix(x) {
  return `${STRING}${x}`;
}

export function exportSelected(state) {
  let output = {};
  const sections = state.sectionInfos.x;
  const topLevelSections = _.filter(sections, (x) => x.isTopLevel);
  for (let s of topLevelSections) {
    const selected = sectionExportSelected(s, state);
    const sectionType = state.uiTypes.x[s.uiTypeId];
    if (sectionType.type === DECK) {
      output = { ...output, ...selected };
    } else {
      output[topLevelPrefix(s.name)] = selected;
    }
  }
  return output;
}
