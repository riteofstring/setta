import { getFullObjPath } from "classes/immutableInfo";
import _ from "lodash";

import { OBJ, PARAM, STRING, VARIABLE } from "./codeGenConstants";
import { DECK, isRoot, LIST_ROOT } from "./constants";

function paramInfoExportSelected(sectionId, paramInfo, evColId, state) {
  const enteredValueInfo = state.paramInfos.x[evColId]?.[paramInfo.id];
  if (!enteredValueInfo) {
    return undefined;
  }
  const { enteredValueId, childId } = enteredValueInfo;
  const sectionChildren = state.sectionInfos.currChildren[sectionId];
  if (sectionChildren && sectionChildren.includes(childId)) {
    return sectionExportSelected(state.sectionInfos.x[childId], state);
  }
  return state.enteredValues.x[enteredValueId];
}

function multipleParamInfoExportSelected(
  sectionId,
  paramInfos,
  evColId,
  state
) {
  const output = {};
  for (let p of paramInfos) {
    let paramSelection = paramInfoExportSelected(sectionId, p, evColId, state);
    if (!_.isNil(paramSelection)) {
      paramSelection = maybeStringPrefix(paramSelection);
      output[paramPrefix(p.name)] = paramSelection;
    }
  }
  return output;
}

function paramCollectionExportSelected(
  sectionId,
  sectionType,
  allParamCollections,
  evColId,
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
    evColId,
    state
  );
}

function kwargsExportSelected(
  sectionId,
  objInfoId,
  evColId,
  kwargCollectionId,
  state
) {
  const kwargIds = state.objInfos.x[kwargCollectionId]?.[objInfoId]?.kwargIds;
  if (_.isNil(kwargIds)) {
    return {};
  }
  const kwargInfos = kwargIds.map((y) => state.kwargInfos.x[y]);
  return multipleParamInfoExportSelected(sectionId, kwargInfos, evColId, state);
}

function objInfoExportSelected(sectionId, objInfo, evColId, state) {
  const { path: fullObjPath } = getFullObjPath(objInfo);
  const output = multipleParamInfoExportSelected(
    sectionId,
    Object.values(objInfo.children),
    evColId,
    state
  );
  return { [objPrefix(fullObjPath)]: output };
}

function sectionExportSelected(section, state) {
  const { allObjInfo, allParamCollections } = state.master;
  const {
    id: sectionId,
    selectedItem,
    uiTypeId,
    evColId,
    kwargCollectionId,
  } = section;
  const sectionType = state.uiTypes.x[uiTypeId];

  if (isRoot(sectionType.type)) {
    const currChildren = state.sectionInfos.currChildren[section.id];
    return multipleSectionExportSelected(currChildren, sectionType, state);
  }

  const nonObjParams = paramCollectionExportSelected(
    sectionId,
    sectionType,
    allParamCollections,
    evColId,
    state
  );

  const kwargs = kwargsExportSelected(
    sectionId,
    selectedItem,
    evColId,
    kwargCollectionId,
    state
  );

  let output = { ...nonObjParams, ...kwargs };
  if (selectedItem) {
    const objParams = objInfoExportSelected(
      sectionId,
      allObjInfo[selectedItem],
      evColId,
      state
    );
    const key = Object.keys(objParams)[0];
    output = { [key]: { ...objParams[key], ...output } };
  }

  return output;
}

function processSelected(currSection, selected, sectionType, state) {
  const currSectionType = state.uiTypes.x[currSection.uiTypeId].type;
  const parentIsPane = !sectionType;
  const parentIsListRoot = sectionType?.type === LIST_ROOT;
  if (parentIsListRoot) {
    if (currSectionType === DECK) {
      return Object.values(selected);
    } else {
      return [selected];
    }
  } else {
    // the "section" is the pane, and the children are top-level sections
    if (currSectionType === DECK) {
      return parentIsPane
        ? _.mapKeys(selected, (v, k) => topLevelPrefix(k))
        : selected;
    } else {
      return parentIsPane
        ? { [topLevelPrefix(currSection.name)]: selected }
        : { [currSection.name]: selected };
    }
  }
}

function multipleSectionExportSelected(children, sectionType, state) {
  const parentIsListRoot = sectionType?.type === LIST_ROOT;
  let output = parentIsListRoot ? [] : {};
  for (let c of children) {
    const currSection = state.sectionInfos.x[c];
    let selected = sectionExportSelected(currSection, state);
    selected = processSelected(currSection, selected, sectionType, state);
    output = parentIsListRoot
      ? [...output, ...selected]
      : { ...output, ...selected };
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

function maybeStringPrefix(x) {
  return _.isString(x) ? stringPrefix(x) : x;
}

export function exportSelected(state) {
  const sections = state.sectionInfos.x;
  const topLevelSectionIds = _.filter(sections, (x) => x.isTopLevel).map(
    (x) => x.id
  );
  return multipleSectionExportSelected(topLevelSectionIds, null, state);
}

// Look at parent of deck to determine what to do with children of deck
// 1. If parent of deck is the pane, then children become top-level sections.
// 2. If parent of deck is a list root, then children become list elements.
// 3. If parent of deck is a dict root, then children become dict elements.
// 4. If parent of deck is a section, then children become nested params.
